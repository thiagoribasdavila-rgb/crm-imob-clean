import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordLiveLeadEvent } from "@/lib/compat/live-writes";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * REGISTRO DE PRIMEIRO CONTATO — o elo que faltava.
 *
 * O relógio de SLA já roda: o trigger `apply_first_contact_sla` carimba
 * `first_contact_due_at` em toda lead nova (5 min para origem Meta, 15 min para
 * as demais). O que não existia era quem PARASSE o relógio.
 *
 * Os dois gatilhos de fechamento do banco observam `activities` e `messages` —
 * tabelas com 0 linhas, herdadas do V1. O CRM real escreve a linha do tempo em
 * `lead_events`, que não tem gatilho nenhum. Resultado medido em 2026-07-26:
 * 210 leads ativas, 210 com SLA vencido, 0 contatos registrados. Não era a
 * equipe que não atendia — era o sistema que não tinha como registrar.
 *
 * Esta rota fecha o ciclo pelo caminho explícito: grava o evento na linha do
 * tempo E chama a RPC `complete_first_contact_sla`, que calcula
 * `first_response_minutes` e `first_contact_sla_met` numa transação.
 */

const CANAIS = new Set(["call", "whatsapp", "email", "message", "visit", "meeting", "contact"]);
const RESULTADOS = new Set(["falou", "sem_resposta", "numero_invalido", "agendou"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  // Limite alto: registrar contato é a ação mais repetida do corretor, e
  // dificultá-la mata justamente a métrica que se quer medir.
  const rate = enforceRateLimit(request, { limit: 120, windowMs: 60_000, scope: "lead.first-contact" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const { id: leadId } = await context.params;
  if (!UUID.test(leadId)) return apiError("LEAD_INVALID", "Lead inválida.", access.meta, { status: 400, headers: rate.headers });

  let body: { canal?: unknown; resultado?: unknown; observacao?: unknown };
  try { body = await request.json(); }
  catch { return apiError("INVALID_JSON", "Dados inválidos.", access.meta, { status: 400, headers: rate.headers }); }

  const canal = String(body.canal ?? "").toLowerCase();
  const resultado = String(body.resultado ?? "falou").toLowerCase();
  const observacao = String(body.observacao ?? "").trim().slice(0, 2000);
  if (!CANAIS.has(canal)) return apiError("CHANNEL_INVALID", `Canal inválido. Use: ${[...CANAIS].join(", ")}.`, access.meta, { status: 400, headers: rate.headers });
  if (!RESULTADOS.has(resultado)) return apiError("OUTCOME_INVALID", `Resultado inválido. Use: ${[...RESULTADOS].join(", ")}.`, access.meta, { status: 400, headers: rate.headers });

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();

  // Escopo: o corretor só registra contato de lead que enxerga.
  const lead = await access.supabase
    .from("leads").select("id,name,assigned_user_id,first_contacted_at,first_contact_due_at,created_at")
    .eq("id", leadId).eq("organization_id", organizationId).maybeSingle();
  if (lead.error || !lead.data) return apiError("LEAD_NOT_VISIBLE", "Lead não encontrada no seu escopo.", access.meta, { status: 404, headers: rate.headers });

  const jaContatada = Boolean(lead.data.first_contacted_at);
  const agora = new Date().toISOString();

  // A linha do tempo recebe o registro mesmo em recontato: o histórico de
  // tentativas é informação comercial, não só insumo de métrica.
  const evento = await recordLiveLeadEvent(admin, {
    organizationId, leadId, actorId: access.access.profile.id,
    type: canal,
    title: jaContatada ? "Novo contato registrado" : "Primeiro contato registrado",
    description: observacao || undefined,
    metadata: { canal, resultado, primeiroContato: !jaContatada },
  });

  // Fecha o SLA só na primeira vez. A RPC também protege por conta própria
  // (`where first_contacted_at is null`), mas evitar a chamada deixa o log limpo.
  let slaFechado = false;
  let slaIndisponivel = false;
  if (!jaContatada) {
    const fechamento = await admin.rpc("complete_first_contact_sla", {
      p_organization_id: organizationId,
      p_lead_id: leadId,
      p_occurred_at: agora,
    });
    if (fechamento.error) {
      // Banco sem a fase 34: o contato fica registrado na linha do tempo e a
      // medição não acontece. Melhor perder a métrica do que perder o registro.
      slaIndisponivel = fechamento.error.code === "42883" || fechamento.error.code === "PGRST202";
      structuredApiLog("warn", "lead.first_contact.sla_nao_fechado", request, access.meta, {
        organizationId, leadId, code: fechamento.error.code, indisponivel: slaIndisponivel,
      });
    } else {
      slaFechado = true;
    }
  }

  // O MESMO registro fecha o ciclo de follow-up, quando há um aberto.
  //
  // `complete_follow_up_sla` tem dois gatilhos no banco: um em `activities` e
  // outro em `messages` — as duas tabelas legadas com ZERO linhas. O CRM escreve
  // em `lead_events`, que não dispara nenhum dos dois. Resultado medido em
  // 2026-07-26: 6 ciclos de follow-up agendados, 0 concluídos. É a mesma falha
  // do primeiro contato, um andar acima: a função existe, está correta e ninguém
  // a chama.
  //
  // A RPC já protege por conta própria (só age sobre ciclo `scheduled`), então
  // chamá-la em todo registro é seguro: sem ciclo aberto, ela retorna sem efeito.
  let followUpFechado = false;
  const followUp = await admin.rpc("complete_follow_up_sla", {
    p_organization_id: organizationId,
    p_lead_id: leadId,
    p_occurred_at: agora,
    p_source: `lead_event:${canal}`,
  });
  if (followUp.error) {
    structuredApiLog("warn", "lead.first_contact.follow_up_nao_fechado", request, access.meta, {
      organizationId, leadId, code: followUp.error.code,
    });
  } else {
    followUpFechado = true;
  }

  const medicao = slaFechado
    ? await admin.from("leads").select("first_response_minutes,first_contact_sla_met,first_contact_due_at")
        .eq("id", leadId).eq("organization_id", organizationId).maybeSingle()
    : null;

  structuredApiLog("info", "lead.first_contact.registrado", request, access.meta, {
    organizationId, leadId, canal, resultado,
    primeiroContato: !jaContatada,
    minutosDeResposta: medicao?.data?.first_response_minutes ?? null,
    dentroDoSla: medicao?.data?.first_contact_sla_met ?? null,
  });

  return apiSuccess({
    leadId,
    primeiroContato: !jaContatada,
    eventoRegistrado: !evento.error,
    slaFechado,
    // Distinto do SLA de primeiro contato: aqui "fechado" significa que a RPC
    // rodou, e ela pode não ter tido ciclo aberto para fechar.
    cicloDeFollowUpProcessado: followUpFechado,
    medicao: medicao?.data
      ? {
          minutosDeResposta: medicao.data.first_response_minutes,
          dentroDoSla: medicao.data.first_contact_sla_met,
          prazoEra: medicao.data.first_contact_due_at,
        }
      : null,
    // Nunca silenciar a diferença entre "não mediu" e "não dá para medir".
    aviso: slaIndisponivel
      ? "O contato foi registrado, mas este banco não tem a medição de SLA (migration da fase 34 não aplicada)."
      : jaContatada
        ? "A lead já tinha primeiro contato; este ficou registrado como recontato e não altera a medição original."
        : null,
  }, access.meta, { status: 201, headers: rate.headers });
}
