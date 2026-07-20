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
//   bySource:       [{ source, count, share }],                     // source do LEAD (leads.source)
//   byCampaign:     [{ campaignId, campaign, count, share }],       // campaign_id/campaign do LEAD
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
  const bySource = new Map<string, number>();
  const byCampaign = new Map<string, { campaignId: string | null; campaign: string | null; count: number }>();
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
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
    const campaignId = lead?.campaign_id !== null && lead?.campaign_id !== undefined && lead?.campaign_id !== ""
      ? String(lead.campaign_id)
      : null;
    const campaignKey = campaignId ?? "sem_campanha";
    const campaignBucket = byCampaign.get(campaignKey) ?? {
      campaignId,
      campaign: typeof lead?.campaign === "string" && lead.campaign.trim() ? lead.campaign.trim() : null,
      count: 0,
    };
    campaignBucket.count += 1;
    byCampaign.set(campaignKey, campaignBucket);
  }

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
      bySource: [...bySource.entries()]
        .map(([source, count]) => ({ source, count, share: sharePct(count, discarded) }))
        .sort((left, right) => right.count - left.count),
      byCampaign: [...byCampaign.values()]
        .map((bucket) => ({ ...bucket, share: sharePct(bucket.count, discarded) }))
        .sort((left, right) => right.count - left.count),
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
