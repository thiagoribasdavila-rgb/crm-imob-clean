import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getDiscardReason } from "@/lib/atlas/discard-reasons";
import { canonicalPipelineStage, DEFAULT_PIPELINE_STAGES } from "@/lib/atlas/pipeline-stages";
import { estaNaMinhaCarteira, leSoAPropriaCarteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * A MOVIMENTAÇÃO DE UMA LEAD — a metade da história que a ficha não contava.
 *
 * ── O QUE ESTAVA ACONTECENDO ────────────────────────────────────────────────
 *
 * A "Timeline · Histórico do relacionamento" da Lead 360 lê `lead_events` e só
 * ela. Medido no banco vivo em 2026-08-02:
 *
 *   leads com movimento em pipeline_stage_moves ..... 444
 *   leads com alguma linha em lead_events ............ 38
 *   leads com movimento e NENHUM lead_event ......... 419
 *
 * Para 419 clientes a ficha exibia "Nenhuma interação · Registre o primeiro
 * contato para iniciar a memória comercial" enquanto a fonte canônica guardava
 * de onde a lead saiu, para onde foi, quem moveu e por quê — inclusive o motivo
 * do descarte que o próprio corretor foi obrigado a escolher.
 *
 * Esta rota devolve o ledger para que a linha do tempo passe a ser uma só.
 *
 * ── POR QUE `occurred_at` E POR QUE NÃO `pipeline_history` ──────────────────
 *
 * `pipeline_stage_moves` não tem `created_at`; filtrar ou ordenar por ela faz o
 * PostgREST errar e a rota degradar em silêncio. E `pipeline_history` /
 * `lead_events` não recebem uma linha por movimentação: a RPC
 * `move_pipeline_lead` escreve aqui, na mesma transação que muda
 * `leads.status`. Duas fontes para o mesmo fato é a classe de defeito que este
 * repositório mais pagou.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROTULO_DA_ETAPA = new Map(DEFAULT_PIPELINE_STAGES.map((etapa) => [etapa.key, etapa.label]));

/** Rótulo humano da etapa; chave desconhecida volta como veio, nunca em branco. */
function rotuloDaEtapa(valor: string | null): string {
  const canonica = canonicalPipelineStage(valor);
  if (canonica) return ROTULO_DA_ETAPA.get(canonica) ?? canonica;
  return String(valor || "").trim() || "etapa não registrada";
}

type LinhaDoLedger = {
  id: string;
  from_stage: string | null;
  to_stage: string | null;
  reason: string | null;
  discard_reason_key: string | null;
  discard_notes: string | null;
  reversal_of: string | null;
  actor_id: string | null;
  occurred_at: string | null;
};

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 120, windowMs: 60_000, scope: "acompanhamento.linha-do-tempo" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;

  const leadId = String(request.nextUrl.searchParams.get("leadId") || "").trim();
  if (!UUID.test(leadId)) {
    return apiError("LEAD_ID_INVALIDO", "Informe a lead pelo identificador dela.", identity.meta, {
      status: 400,
      headers: rate.headers,
    });
  }

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;

  // A fronteira de carteira é aplicada AQUI, em código, e não delegada ao RLS:
  // a política `leads_org_access` é PERMISSIVE por organização e faz OR com a
  // política por dono, então "por organização" vence e o corretor receberia a
  // lead de qualquer colega. É o mesmo caminho já documentado na rota de
  // alertas de lead.
  const { data: lead, error: erroDaLead } = await admin
    .from("leads")
    .select("id,assigned_to,assigned_user_id,created_at")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (erroDaLead) {
    return apiError("LINHA_DO_TEMPO_INDISPONIVEL", "Não foi possível ler a movimentação desta lead.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }
  if (!lead) {
    return apiError("LEAD_FORA_DO_ESCOPO", "Lead fora do seu escopo comercial.", identity.meta, {
      status: 404,
      headers: rate.headers,
    });
  }
  const perfil = { commercialRole: identity.access.profile.commercialRole, role: identity.access.profile.role };
  if (leSoAPropriaCarteira(perfil) && !estaNaMinhaCarteira(identity.access.profile.id, lead)) {
    return apiError("LEAD_FORA_DO_ESCOPO", "Lead fora do seu escopo comercial.", identity.meta, {
      status: 403,
      headers: rate.headers,
    });
  }

  const [movimentos, primeiroDoLedger] = await Promise.all([
    admin
      .from("pipeline_stage_moves")
      .select("id,from_stage,to_stage,reason,discard_reason_key,discard_notes,reversal_of,actor_id,occurred_at")
      .eq("lead_id", leadId)
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(200),
    // Desde quando existe ledger. Sem isto, "nenhuma movimentação" numa lead de
    // maio leria como "ninguém tocou nela" quando o registro só começa em 27/07.
    admin
      .from("pipeline_stage_moves")
      .select("occurred_at")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (movimentos.error) {
    // 503, nunca 200 com lista vazia: a tela precisa poder dizer "não medido" em
    // vez de afirmar "nada aconteceu com este cliente".
    return apiError("LINHA_DO_TEMPO_INDISPONIVEL", "Não foi possível ler a movimentação desta lead.", identity.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  const linhas = (movimentos.data ?? []) as LinhaDoLedger[];
  const atorIds = [...new Set(linhas.map((linha) => String(linha.actor_id || "")).filter(Boolean))];
  const { data: perfis } = atorIds.length
    ? await admin.from("profiles").select("id,name,full_name").eq("organization_id", organizationId).in("id", atorIds)
    : { data: [] as Array<{ id: string; name: string | null; full_name: string | null }> };
  const nomes = new Map(
    (perfis ?? []).map((linha) => [String(linha.id), linha.full_name || linha.name || "Equipe Atlas"]),
  );

  // Movimento desfeito continua no ledger — nada é apagado — mas precisa dizer
  // na tela que foi desfeito, senão a linha do tempo conta duas vezes a mesma
  // decisão e o corretor lê como duas idas ao mesmo lugar.
  const desfeitos = new Set(linhas.map((linha) => linha.reversal_of).filter((valor): valor is string => Boolean(valor)));

  return apiSuccess(
    {
      leadId,
      movimentos: linhas.map((linha) => {
        const motivo = getDiscardReason(linha.discard_reason_key);
        return {
          id: String(linha.id),
          quando: linha.occurred_at,
          de: rotuloDaEtapa(linha.from_stage),
          para: rotuloDaEtapa(linha.to_stage),
          deChave: canonicalPipelineStage(linha.from_stage),
          paraChave: canonicalPipelineStage(linha.to_stage),
          autor: linha.actor_id ? nomes.get(String(linha.actor_id)) || "Equipe Atlas" : "Automação Atlas",
          // Motivo gravado sem correspondência na taxonomia não vira branco: a
          // chave crua é mais honesta que o vazio, que se lê como "sem motivo".
          motivoChave: linha.discard_reason_key || null,
          motivoRotulo: motivo?.label || (linha.discard_reason_key ? String(linha.discard_reason_key) : null),
          notas: linha.discard_notes || null,
          // `reason` é a descrição do follow-up combinado, NÃO motivo de
          // descarte — o relatório de descartes já registra essa distinção.
          combinado: linha.reason || null,
          reversaoDe: linha.reversal_of || null,
          desfeito: desfeitos.has(String(linha.id)),
        };
      }),
      total: linhas.length,
      ledgerDesde: primeiroDoLedger.data?.occurred_at ?? null,
      leadCriadaEm: lead.created_at ?? null,
      medidoEm: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
