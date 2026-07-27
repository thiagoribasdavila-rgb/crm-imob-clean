import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  ACOES,
  PRAZOS,
  calcularProximaAcao,
  descreverProximaAcao,
  type ChaveDeAcao,
  type ChaveDePrazo,
} from "@/lib/crm/next-action";

export const dynamic = "force-dynamic";

/**
 * MARCA A PRÓXIMA AÇÃO DE UMA LEAD — em um clique.
 *
 * Antes desta rota, `next_action_at` só era escrito ao agendar uma VISITA ou
 * pelo PATCH do lead, que exige o registro inteiro. Resultado medido: 208 de
 * 217 leads sem próxima ação. O corretor que queria apenas dizer "ligo pra ele
 * terça" não tinha onde clicar — e o que não tem onde clicar não acontece.
 *
 * Escopo estreito de propósito: grava QUANDO e O QUÊ, e nada mais. Não muda
 * status, não cria tarefa, não manda mensagem. Uma rota que faz uma coisa é uma
 * rota que o corretor usa sem medo de efeito colateral.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 60/min: é a escrita mais frequente que se espera de um corretor trabalhando
  // a fila — alto o bastante para não tropeçar, baixo o bastante para barrar
  // laço de interface.
  const rate = enforceRateLimit(request, { limit: 60, scope: "leads.next-action" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const { id } = await params;
  const organizationId = access.access.organization.id;
  const corpo = (await request.json().catch(() => null)) as
    | { prazo?: string; acao?: string; observacao?: string; limpar?: boolean }
    | null;

  const admin = getSupabaseAdmin();
  const { data: lead, error: erroDeLeitura } = await admin
    .from("leads")
    .select("id,name,assigned_user_id,assigned_to")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (erroDeLeitura || !lead) {
    return apiError("LEAD_NAO_ENCONTRADA", "Lead não encontrada nesta organização.", access.meta, { status: 404, headers: rate.headers });
  }

  // Dono ou liderança. O corretor marca a própria agenda; quem lidera pode
  // marcar a de quem lidera — as duas colunas de dono entram porque a base tem
  // histórico nas duas.
  const papel = access.access.profile.commercialRole || access.access.profile.role;
  const ehLideranca = ["director", "superintendent", "manager", "admin"].includes(papel);
  const ehDono = lead.assigned_user_id === access.access.profile.id
    || lead.assigned_to === access.access.profile.id;
  if (!ehLideranca && !ehDono) {
    return apiError("FORBIDDEN", "Você só marca a próxima ação de leads da sua carteira.", access.meta, { status: 403, headers: rate.headers });
  }

  // Limpar é caso legítimo: a lead avançou, foi perdida, ou o compromisso caiu.
  // Sem esta porta, a única saída seria marcar uma data falsa.
  if (corpo?.limpar) {
    const { error } = await admin
      .from("leads")
      .update({ next_action_at: null, next_action: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) {
      return apiError("FALHA_AO_LIMPAR", "Não foi possível limpar a próxima ação.", access.meta, { status: 500, headers: rate.headers });
    }
    structuredApiLog("info", "leads.proxima_acao_limpa", request, access.meta, { organizationId, leadId: id });
    return apiSuccess({ leadId: id, proximaAcaoEm: null }, access.meta, { headers: rate.headers });
  }

  const prazo = String(corpo?.prazo ?? "") as ChaveDePrazo;
  const acao = String(corpo?.acao ?? "") as ChaveDeAcao;
  if (!PRAZOS.some((p) => p.chave === prazo)) {
    return apiError("PRAZO_INVALIDO", `Prazo inválido. Use: ${PRAZOS.map((p) => p.chave).join(", ")}.`, access.meta, { status: 400, headers: rate.headers });
  }
  if (!ACOES.some((a) => a.chave === acao)) {
    return apiError("ACAO_INVALIDA", `Ação inválida. Use: ${ACOES.map((a) => a.chave).join(", ")}.`, access.meta, { status: 400, headers: rate.headers });
  }

  const quando = calcularProximaAcao(prazo, new Date());
  const descricao = descreverProximaAcao(acao, corpo?.observacao);

  const { error } = await admin
    .from("leads")
    .update({
      next_action_at: quando.toISOString(),
      // `next_action` guarda o QUÊ. Sem ele a agenda mostraria "Follow-up com
      // Fulano" e nada mais — a pessoa chega na hora sem lembrar o que ia fazer.
      next_action: descricao,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", organizationId);

  if (error) {
    structuredApiLog("error", "leads.proxima_acao_falhou", request, access.meta, { organizationId, leadId: id, erro: error.message });
    return apiError("FALHA_AO_MARCAR", "Não foi possível marcar a próxima ação.", access.meta, { status: 500, headers: rate.headers });
  }

  structuredApiLog("info", "leads.proxima_acao_marcada", request, access.meta, {
    organizationId, leadId: id, prazo, acao,
  });

  return apiSuccess(
    { leadId: id, proximaAcaoEm: quando.toISOString(), descricao },
    access.meta,
    { status: 201, headers: rate.headers },
  );
}
