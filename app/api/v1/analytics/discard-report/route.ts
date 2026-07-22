import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { DISCARD_TAXONOMY_VERSION, getDiscardReason } from "@/lib/atlas/discard-reasons";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/analytics/discard-report?days=30
//
// Relatório de qualidade de descartes (lead_events event_type=lead_discarded)
// pronto para o loop Andromeda / Meta CRM lead status feedback.
//
// Query params:
//   days — janela em dias (default 30, mín 1, máx 365).
//
// Shape da resposta (payload do apiSuccess):
// {
//   period: { start, end, days },
//   totals: {
//     lostMoves,     // movimentações para "perdido" em pipeline_history na janela (null se indisponível)
//     discarded,     // eventos lead_discarded na janela
//     uniqueLeads,   // leads distintos com evento de descarte
//     classified,    // eventos cujo reasonKey pertence à taxonomia vigente
//     coveragePct    // classified / lostMoves * 100 (null se lostMoves ausente ou 0)
//   },
//   byReason:       [{ key, label, metaCategory, count, share }],   // share em % do total de descartes
//   byMetaCategory: [{ category, count, share }],
//   bySource:       [{ source, count, uniqueLeads, share,
//                      leadsFromSource, discardRatePct, sampleSufficient, baseUnavailableReason }],
//   byCampaign:     [{ campaignId, campaign, count, uniqueLeads, share,
//                      leadsFromCampaign, discardRatePct, sampleSufficient, baseUnavailableReason }],
//
// Denominador: "58 descartes" não decide nada sem "de quantos". leadsFromSource
// é a contagem de leads da MESMA janela com aquela origem (COUNT no servidor,
// sem trafegar linha), e discardRatePct é leads distintos descartados ÷ essa
// base. Quando a base não é apurável (origem não informada, campanha ausente),
// o campo sai null e baseUnavailableReason diz por quê — a tela nunca inventa
// uma taxa e nunca pede desculpa sem motivo apurado.
//   andromeda: {
//     policy: "negative_signals_internal_only",  // motivos ficam internos (andromeda-loop)
//     directorDecisionRequired: true,            // envio à Meta exige gate do diretor
//     readyForCrmLeadStatusSync,                 // coveragePct >= 80
//     taxonomyVersion
//   },
//   generatedAt
// }

type DiscardEventRow = {
  id: string;
  lead_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

const DAY = 86_400_000;

function clampDays(value: string | null) {
  // Number(null) e Number("") valem 0 — sem esta guarda, a chamada padrão
  // (sem ?days=) viraria janela de 1 dia em vez do default de 30.
  if (value === null || value.trim() === "") return 30;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(1, Math.round(parsed)));
}

function sharePct(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

/**
 * Amostra mínima para a taxa autorizar decisão de corte, alinhada ao
 * minimumLeadsForDecision do painel executivo. Abaixo disto a taxa é exibida,
 * mas marcada — 3 descartes em 4 leads dá 75% e não decide nada.
 */
const MINIMUM_BASE_FOR_DECISION = 30;

/**
 * Teto de denominadores apurados por chamada. Cada um é um COUNT no servidor
 * (head: true, zero linha trafegada), mas contagem é custo: as caudas longas
 * ficam sem base declarada em vez de multiplicar consultas.
 */
const MAX_BASE_LOOKUPS = 12;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    scope: "analytics-discard-report",
  });
  if (!rate.ok) return rate.response;

  // "Gerente para cima": a opção roles compara com o commercialRole efetivo
  // (director | superintendent | manager | broker). Perfis admin resolvem para
  // "director" em resolveLegacyCommercialRole, então admin também passa —
  // mesmo padrão de broker-daily/team-sla.
  const identity = await requireAccessContext(request, {
    roles: ["director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const days = clampDays(request.nextUrl.searchParams.get("days"));
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY);
  const since = start.toISOString();

  const [eventResult, lostMovesResult] = await Promise.all([
    identity.supabase
      .from("lead_events")
      .select("id,lead_id,metadata,created_at")
      .eq("organization_id", organizationId)
      .eq("event_type", "lead_discarded")
      .gte("created_at", since)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(2000),
    identity.supabase
      .from("pipeline_history")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("new_status", "perdido")
      .gte("created_at", since),
  ]);

  if (eventResult.error) {
    logger.warn("analytics.discard_report.read_failed", {
      organizationId,
      code: eventResult.error.code,
      message: eventResult.error.message,
    });
    return apiError(
      "DISCARD_REPORT_LOAD_FAILED",
      "O relatório de descartes está temporariamente indisponível.",
      identity.meta,
      { status: 503 },
    );
  }
  if (lostMovesResult.error) {
    // Degradação graciosa: sem o denominador de cobertura o relatório continua
    // útil — apenas coveragePct fica null. Logado para o drift não ser silencioso.
    logger.warn("analytics.discard_report.lost_moves_unavailable", {
      organizationId,
      code: lostMovesResult.error.code,
      message: lostMovesResult.error.message,
    });
  }

  const rows = (eventResult.data ?? []) as DiscardEventRow[];
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter((value): value is string => Boolean(value)))];
  const leadResult = leadIds.length
    ? await identity.supabase
        .from("leads")
        .select("id,source,campaign,campaign_id")
        .eq("organization_id", organizationId)
        .in("id", leadIds)
    : { data: [] as Record<string, unknown>[], error: null };
  if (leadResult.error) {
    logger.warn("analytics.discard_report.lead_enrichment_degraded", {
      organizationId,
      code: leadResult.error.code,
    });
  }
  const leads = new Map(
    ((leadResult.data ?? []) as Record<string, unknown>[]).map((lead) => [String(lead.id), lead]),
  );

  const byReason = new Map<string, { key: string; label: string; metaCategory: string; count: number }>();
  const byMetaCategory = new Map<string, number>();
  // Leads DISTINTOS por bucket entram junto da contagem de eventos: o mesmo
  // lead descartado duas vezes é um lead perdido, não dois — e é o lead que a
  // taxa compara com a base.
  const bySource = new Map<string, { count: number; leads: Set<string> }>();
  const byCampaign = new Map<string, { campaignId: string | null; campaign: string | null; count: number; leads: Set<string> }>();
  let classified = 0;

  for (const row of rows) {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const reasonKey = String(metadata.reasonKey ?? "").trim().toLowerCase();
    const reason = getDiscardReason(reasonKey);
    if (reason) classified += 1;
    const key = reasonKey || "motivo_ausente";
    const label = reason?.label
      ?? (typeof metadata.reasonLabel === "string" && metadata.reasonLabel ? metadata.reasonLabel : key);
    const metaCategory = reason?.metaCategory
      ?? (typeof metadata.metaCategory === "string" && metadata.metaCategory ? metadata.metaCategory : "other");
    const reasonBucket = byReason.get(key) ?? { key, label, metaCategory, count: 0 };
    reasonBucket.count += 1;
    byReason.set(key, reasonBucket);
    byMetaCategory.set(metaCategory, (byMetaCategory.get(metaCategory) ?? 0) + 1);

    const lead = row.lead_id ? leads.get(row.lead_id) : null;
    const source = typeof lead?.source === "string" && lead.source.trim() ? lead.source.trim() : "desconhecido";
    const sourceBucket = bySource.get(source) ?? { count: 0, leads: new Set<string>() };
    sourceBucket.count += 1;
    if (row.lead_id) sourceBucket.leads.add(row.lead_id);
    bySource.set(source, sourceBucket);
    const campaignId = lead?.campaign_id !== null && lead?.campaign_id !== undefined && lead?.campaign_id !== ""
      ? String(lead.campaign_id)
      : null;
    const campaignKey = campaignId ?? "sem_campanha";
    const campaignBucket = byCampaign.get(campaignKey) ?? {
      campaignId,
      campaign: typeof lead?.campaign === "string" && lead.campaign.trim() ? lead.campaign.trim() : null,
      count: 0,
      leads: new Set<string>(),
    };
    campaignBucket.count += 1;
    if (row.lead_id) campaignBucket.leads.add(row.lead_id);
    byCampaign.set(campaignKey, campaignBucket);
  }

  // --- Denominador da taxa de descarte -------------------------------------
  // Um COUNT por bucket, com head: true — o servidor conta e não devolve linha.
  // Sem isto a tela mostrava "58 descartes" sem dizer de quantos, que é o
  // número que decide se a origem é cortada.
  const sourceEntries = [...bySource.entries()].sort((left, right) => right[1].count - left[1].count);
  const campaignEntries = [...byCampaign.values()].sort((left, right) => right.count - left.count);
  const countLeadsBy = async (column: "source" | "campaign_id", value: string) => {
    const result = await identity.supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .eq(column, value);
    if (result.error) {
      logger.warn("analytics.discard_report.base_unavailable", { organizationId, column, code: result.error.code });
      return null;
    }
    return result.count ?? 0;
  };
  const sourceBase = new Map<string, number | null>();
  await Promise.all(
    sourceEntries.slice(0, MAX_BASE_LOOKUPS).map(async ([source]) => {
      // "desconhecido" é rótulo nosso para origem ausente, não um valor do
      // banco: contar leads com origem nula devolveria uma base que não
      // corresponde a origem nenhuma.
      if (source === "desconhecido") return;
      sourceBase.set(source, await countLeadsBy("source", source));
    }),
  );
  const campaignBase = new Map<string, number | null>();
  await Promise.all(
    campaignEntries.slice(0, MAX_BASE_LOOKUPS).map(async (bucket) => {
      if (!bucket.campaignId) return;
      campaignBase.set(bucket.campaignId, await countLeadsBy("campaign_id", bucket.campaignId));
    }),
  );
  /** Base ausente sempre vem com motivo apurado — a tela não inventa o dela. */
  const baseFields = (unique: number, base: number | null | undefined, missingReason: string) => {
    if (base === null || base === undefined) return { discardRatePct: null, sampleSufficient: null, baseUnavailableReason: missingReason };
    return {
      discardRatePct: base > 0 ? Math.round((unique / base) * 1000) / 10 : null,
      sampleSufficient: base >= MINIMUM_BASE_FOR_DECISION,
      baseUnavailableReason: base > 0 ? null : "nenhum lead desta chave foi criado na janela",
    };
  };

  const discarded = rows.length;
  const lostMoves = lostMovesResult.error ? null : lostMovesResult.count ?? 0;
  const coveragePct = lostMoves !== null && lostMoves > 0
    ? Math.round((classified / lostMoves) * 1000) / 10
    : null;

  return apiSuccess(
    {
      scope: {
        organizationId,
        actorId: identity.access.profile.id,
        readOnly: true,
        minimumRole: "manager",
      },
      period: {
        start: since,
        end: end.toISOString(),
        days,
      },
      totals: {
        lostMoves,
        discarded,
        uniqueLeads: leadIds.length,
        classified,
        coveragePct,
      },
      byReason: [...byReason.values()]
        .map((bucket) => ({ ...bucket, share: sharePct(bucket.count, discarded) }))
        .sort((left, right) => right.count - left.count),
      byMetaCategory: [...byMetaCategory.entries()]
        .map(([category, count]) => ({ category, count, share: sharePct(count, discarded) }))
        .sort((left, right) => right.count - left.count),
      bySource: sourceEntries.map(([source, bucket]) => ({
        source,
        count: bucket.count,
        uniqueLeads: bucket.leads.size,
        share: sharePct(bucket.count, discarded),
        leadsFromSource: sourceBase.get(source) ?? null,
        ...baseFields(
          bucket.leads.size,
          sourceBase.get(source),
          source === "desconhecido"
            ? "origem não informada nesses leads — não há base comparável"
            : "base desta origem não apurada nesta janela",
        ),
      })),
      byCampaign: campaignEntries.map((bucket) => ({
        campaignId: bucket.campaignId,
        campaign: bucket.campaign,
        count: bucket.count,
        uniqueLeads: bucket.leads.size,
        share: sharePct(bucket.count, discarded),
        leadsFromCampaign: bucket.campaignId ? campaignBase.get(bucket.campaignId) ?? null : null,
        ...baseFields(
          bucket.leads.size,
          bucket.campaignId ? campaignBase.get(bucket.campaignId) : null,
          bucket.campaignId
            ? "base desta campanha não apurada nesta janela"
            : "esses leads não têm campanha vinculada — a ingestão ainda não grava campaign_id, então não há base por campanha",
        ),
      })),
      andromeda: {
        policy: "negative_signals_internal_only",
        directorDecisionRequired: true,
        readyForCrmLeadStatusSync: coveragePct !== null && coveragePct >= 80,
        taxonomyVersion: DISCARD_TAXONOMY_VERSION,
      },
      compatibility: leadResult.error ? "safe-base-report" : "canonical-report",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
