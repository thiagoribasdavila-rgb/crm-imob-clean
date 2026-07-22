/**
 * Propostas de campanha Meta — a ponta de ENTRADA da cadeia governada
 * proposta → aprovação → execução. A liderança registra uma proposta pendente
 * em approval_requests (entity_type "meta_campaign"); a decisão vive na Caixa
 * de Aprovações e a execução real na rota /api/v1/marketing/execute — nada aqui
 * cria/pausa nada na Meta.
 *
 * - POST cria a proposta pendente (nunca aprovada; validada por kind antes do
 *   insert). Sem a tabela → 503 honesto (proposta não registrável).
 * - GET lista as propostas meta_campaign da organização com status.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildCampaignProposal,
  validateProposal,
  CAMPAIGN_PROPOSAL_ENTITY_TYPE,
  type CampaignProposalInput,
  type CampaignProposalKind,
  type ControlStepInput,
  type ProposalProjection,
  type ProposalProjectionBasis,
} from "@/lib/marketing/campaign-proposals";
import { simulateMove } from "@/lib/ai/decision-simulator";
import { aggregate } from "@/lib/marketing/cost-report";
import { fetchCampaignInsights, insightsToCostRows } from "@/lib/meta/marketing/campaign-read";
import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";

export const dynamic = "force-dynamic";

/** Semanas médias por mês (52/12) — mesma constante do decision-simulator. */
const WEEKS_PER_MONTH = 4.33;
/** Mesmo gate do resto do produto: abaixo disso não se projeta nada. */
const MINIMUM_LEADS_FOR_PROJECTION = 30;

/**
 * Projeta o movimento NO SERVIDOR, no instante da proposta, e congela os
 * insumos usados. Regras (a auditoria adversarial derrubou a versão ingênua):
 *   - o decision-simulator não conhece os kinds da proposta: o mapeamento é
 *     explícito aqui (pause→pausar, set_daily_budget→escalar com o DELTA de
 *     verba). create/activate não têm histórico do destino ⇒ projeção null;
 *   - o alvo é resolvido pela chave REAL do bucket de custo (campaign_id da
 *     Meta), nunca pelo título digitado;
 *   - faixa de zeros NUNCA é persistida como projeção: sem base, grava-se null
 *     com o motivo. "+0 a 0 leads/semana" com selo de calculado seria pior que
 *     o null de hoje, porque teria cara de lastro.
 */
async function projectProposal(
  kind: CampaignProposalKind,
  payload: CampaignProposalInput["payload"],
): Promise<{ projection: ProposalProjection | null; basis: ProposalProjectionBasis }> {
  const base: ProposalProjectionBasis = {
    computedAt: new Date().toISOString(),
    source: "meta_insights",
    window: "last_30d",
    serverComputed: true,
    minimumLeadsForProjection: MINIMUM_LEADS_FOR_PROJECTION,
  };
  const noProjection = (reason: string, extra: Partial<ProposalProjectionBasis> = {}) =>
    ({ projection: null, basis: { ...base, ...extra, reason } });

  if (kind === "create" || kind === "activate") {
    return noProjection(
      "movimento sem modelo de projeção: campanha nova ou reativada não tem CPL histórico do destino nesta base",
    );
  }

  const control = payload as ControlStepInput;
  if (control.objectType !== "campaign") {
    return noProjection(
      `sem base de custo para ${control.objectType}: os agregados de investimento existem por campanha`,
    );
  }
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    return noProjection("sem base de custo: Meta não configurada (META_ADS_ACCESS_TOKEN/META_AD_ACCOUNT_ID)");
  }

  const insights = await cachedMetaRead(
    `campaign-insights:${account}:last_30d:7`,
    () => fetchCampaignInsights(account, token, { datePreset: "last_30d", timeIncrement: 7 }),
  );
  if (!Array.isArray(insights)) {
    return noProjection("sem base de custo: a Meta recusou a leitura de insights nesta janela");
  }
  const buckets = aggregate(insightsToCostRows(insights), "campaign");
  const objectId = String(control.objectId ?? "").trim();
  const bucket = buckets.find((item) => item.key === objectId);
  if (!bucket) {
    return noProjection(
      `sem CPL histórico do destino: a campanha ${objectId} não aparece nos últimos 30 dias de investimento`,
      { targetKey: objectId },
    );
  }

  const sample: Partial<ProposalProjectionBasis> = {
    targetKey: bucket.key,
    targetLabel: bucket.label,
    windowSpend: bucket.spend,
    windowLeads: bucket.leads,
    cpl: bucket.cpl,
    sampleSufficient: bucket.leads >= MINIMUM_LEADS_FOR_PROJECTION,
  };
  // cpl <= 0 significa leads sem investimento lançado: dividir verba por ele
  // devolveria leads infinitos. Sem CPL utilizável, não se projeta.
  if (bucket.cpl === null || bucket.cpl <= 0) {
    return noProjection(
      "sem CPL utilizável do destino: 0 leads ou nenhum investimento na janela de 30 dias",
      sample,
    );
  }
  if (bucket.leads < MINIMUM_LEADS_FOR_PROJECTION) {
    return noProjection(
      `amostra insuficiente para projetar: ${bucket.leads} leads na janela de 30 dias (mínimo ${MINIMUM_LEADS_FOR_PROJECTION})`,
      sample,
    );
  }

  let move: { kind: string; target: string; amount?: number };
  if (kind === "pause") {
    move = { kind: "pausar", target: bucket.key };
  } else {
    // set_daily_budget: o que se projeta é o DELTA semanal de verba, não a
    // verba total — escalar de R$ 100 para R$ 120/dia não vale por R$ 840.
    const weeklyTarget = Number(control.dailyBudgetBrl ?? 0) * 7;
    const weeklyCurrent = bucket.spend / WEEKS_PER_MONTH;
    const delta = Math.round((weeklyTarget - weeklyCurrent) * 100) / 100;
    if (delta <= 0) {
      return noProjection(
        `redução de verba sem modelo de projeção: alvo de R$ ${weeklyTarget.toFixed(2)}/semana contra R$ ${weeklyCurrent.toFixed(2)}/semana em curso`,
        sample,
      );
    }
    move = { kind: "escalar", target: bucket.key, amount: delta };
  }

  const projection = simulateMove(move, { campaigns: buckets, period: "30d" });
  const delta = projection.weeklyLeadsDelta;
  const isAllZero =
    delta.pessimista === 0 && delta.esperado === 0 && delta.otimista === 0 && projection.weeklySpendDelta === 0;
  if (isAllZero) {
    return noProjection(
      `projeção zerada pelo simulador — ${projection.assumptions.join(" ") || "sem base histórica utilizável"}`,
      sample,
    );
  }
  return { projection, basis: { ...base, ...sample, reason: null } };
}

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}
const isLeadership = (role: string) => ["director", "superintendent", "manager"].includes(role);

const KINDS: CampaignProposalKind[] = ["create", "pause", "activate", "set_daily_budget"];

// `projection` NÃO faz parte do corpo aceito: quem projeta é o servidor, com os
// agregados do instante da proposta. Projeção enviada pelo cliente é ignorada.
type Body = {
  kind?: CampaignProposalKind;
  title?: string;
  payload?: CampaignProposalInput["payload"];
  expiresInHours?: number;
};

// POST — registra proposta de campanha pendente. Liderança comercial.
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 20, scope: "marketing-proposals" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isLeadership(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Propor campanha é decisão da liderança comercial.", identity.meta, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const kind = body?.kind;
  if (!kind || !KINDS.includes(kind)) {
    return apiError("KIND_INVALID", "Informe kind: create | pause | activate | set_daily_budget.", identity.meta, { status: 422 });
  }
  if (!body?.payload) {
    return apiError("PAYLOAD_REQUIRED", "Informe o payload (plano de publicação ou passo de controle).", identity.meta, { status: 422 });
  }

  const input: CampaignProposalInput = {
    organizationId: identity.access.organization.id,
    requestedBy: identity.access.profile.id,
    kind,
    title: String(body.title ?? "").trim(),
    payload: body.payload,
    expiresInHours: body.expiresInHours,
  };

  const problems = validateProposal(input);
  if (problems.length) {
    return apiError("PROPOSAL_INVALID", `Proposta recusada: ${problems.join("; ")}`, identity.meta, { status: 422 });
  }

  // Projeção calculada aqui, depois da validação e antes do insert: falha de
  // leitura da Meta não derruba a proposta, vira projeção null com motivo.
  const { projection, basis } = await projectProposal(kind, body.payload).catch(() => ({
    projection: null,
    basis: {
      computedAt: new Date().toISOString(),
      source: "meta_insights",
      window: "last_30d",
      serverComputed: true as const,
      minimumLeadsForProjection: MINIMUM_LEADS_FOR_PROJECTION,
      reason: "projeção não calculada: falha ao ler os agregados de investimento",
    } satisfies ProposalProjectionBasis,
  }));

  const row = buildCampaignProposal({ ...input, projection, projectionBasis: basis });
  const admin = getSupabaseAdmin();
  const { data: created, error } = await admin
    .from("approval_requests")
    .insert(row)
    .select("id,status,expires_at")
    .single();
  if (error || !created) {
    return apiError(
      "PROPOSAL_UNAVAILABLE",
      "Proposta não registrável até a ativação do banco (approval_requests).",
      identity.meta,
      { status: 503 },
    );
  }

  return apiSuccess(
    {
      id: created.id,
      status: created.status,
      kind,
      expiresAt: created.expires_at,
      // Devolvido para o proponente ver o mesmo lastro que o aprovador verá —
      // inclusive quando não houve projeção (aí vale o motivo).
      projection,
      projectionBasis: basis,
    },
    identity.meta,
    { headers: limited.headers },
  );
}

// GET — lista as propostas de campanha da organização com status. Liderança.
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 60, scope: "marketing-proposals-list" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isLeadership(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Propostas de campanha pertencem à liderança comercial.", identity.meta, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("approval_requests")
    .select("id,request_type,entity_type,status,decision_reason,expires_at,decided_at,created_at,payload")
    .eq("organization_id", identity.access.organization.id)
    .eq("entity_type", CAMPAIGN_PROPOSAL_ENTITY_TYPE)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return apiError(
      "PROPOSALS_UNAVAILABLE",
      "Propostas não consultáveis até a ativação do banco (approval_requests).",
      identity.meta,
      { status: 503 },
    );
  }

  const items = (data ?? []).map((row) => {
    const payload = (row.payload ?? {}) as {
      kind?: string;
      title?: string;
      governance?: { note?: string };
      projection?: ProposalProjection | null;
      projectionBasis?: ProposalProjectionBasis | null;
    };
    return {
      id: row.id,
      status: row.status,
      kind: payload.kind ?? "—",
      title: payload.title ?? "Campanha",
      note: payload.governance?.note ?? "",
      // A faixa projetada e os insumos congelados viajam para quem decide —
      // proposta sem projeção mostra o motivo, nunca um número.
      projection: payload.projection ?? null,
      projectionBasis: payload.projectionBasis ?? null,
      decisionReason: row.decision_reason,
      expiresAt: row.expires_at,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
    };
  });

  return apiSuccess({ items }, identity.meta, { headers: limited.headers });
}
