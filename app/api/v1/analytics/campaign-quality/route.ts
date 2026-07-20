import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  CAMPAIGN_QUALITY_GRADE_RULE,
  CAMPAIGN_QUALITY_MINIMUM_LEADS,
  CAMPAIGN_QUALITY_QUALIFIED_SCORE,
  buildCampaignQuality,
  type CampaignQualityCampaign,
  type CampaignQualityDiscardEvent,
  type CampaignQualityLead,
  type CampaignQualitySpendRow,
} from "@/lib/atlas/campaign-quality";
import { DISCARD_TAXONOMY_VERSION } from "@/lib/atlas/discard-reasons";
import { logger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export const dynamic = "force-dynamic";

// GET /api/v1/analytics/campaign-quality?days=30
//
// Qualidade de campanha para gestor+ (manager | superintendent | director;
// admin resolve para director em resolveLegacyCommercialRole — mesmo padrão
// do discard-report). Agrega SOMENTE tabelas vivas: marketing_campaigns,
// leads, lead_events (event_type=lead_discarded) e marketing_spend.
// NÃO usa campaign_events nem multichannel_* (ausentes no banco vivo).
//
// Query params:
//   days — janela em dias sobre leads.created_at / lead_events.created_at /
//          marketing_spend.spend_date (default 30, mín 1, máx 365).
//
// Shape da resposta (payload do apiSuccess):
// {
//   scope: { organizationId, readOnly: true, minimumRole: "manager" },
//   period: { start, end, days },
//   totals: {
//     campaigns,            // campanhas da organização (todas)
//     campaignsRanked,      // campanhas com leads na janela (linhas do ranking)
//     leads, qualified, sales,
//     discarded,            // eventos lead_discarded na janela
//     classifiedDiscards,   // reasonKey pertence à taxonomia vigente
//     unattributedDiscards, // descartes sem campanha resolvida (só nos totais)
//     spend                 // soma de marketing_spend.amount na janela
//   },
//   ranking: CampaignQualityRow[],  // ver lib/atlas/campaign-quality.ts:
//     { id, name, platform, status, leads, qualifiedLeads, qualificationRate,
//       avgScore, sales, conversionRate, discarded, discardRate,
//       discardsByMetaCategory: [{ category, count }],
//       topDiscardReason: { key, label, count } | null,
//       spend, costPerLead, costPerQualifiedLead,
//       qualityGrade: "A"|"B"|"C"|null, sampleSufficient }
//   policy: {
//     minimumLeadsForDecision: 30,          // mesmo gate do director-daily
//     qualifiedDefinition,                  // score_ia>=70 || temperature=quente
//     qualityGradeRule,                     // regra explicável do A/B/C
//     crmIsConversionTruth: true,
//     spendMeasured,                        // false se marketing_spend degradou
//     taxonomyVersion
//   },
//   generatedAt
// }

const DAY = 86_400_000;

function clampDays(value: string | null) {
  // Number(null) e Number("") valem 0 — sem esta guarda, a chamada padrão
  // (sem ?days=) viraria janela de 1 dia em vez do default de 30.
  if (value === null || value.trim() === "") return 30;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(1, Math.round(parsed)));
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    scope: "analytics-campaign-quality",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const days = clampDays(request.nextUrl.searchParams.get("days"));
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY);
  const since = start.toISOString();

  // Tenant scoping explícito (eq organization_id) em TODAS as queries.
  const admin = getSupabaseAdmin();
  // Paginação exaustiva (lição F1): a base viva tem 17k+ leads na janela —
  // .limit() acima de 1000 é cortado em silêncio pelo PostgREST e o agregado
  // sairia calculado sobre ~6% dos dados sem nenhum aviso.
  const [campaignResult, leadFetch, eventFetch, spendFetch] = await Promise.all([
    admin
      .from("marketing_campaigns")
      .select("id,name,platform,status,started_at,ended_at")
      .eq("organization_id", organizationId)
      .limit(1000),
    fetchAllRows<CampaignQualityLead>((from, to) =>
      admin
        .from("leads")
        .select("id,campaign_id,status,score_ia,temperature,created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<CampaignQualityDiscardEvent>((from, to) =>
      admin
        .from("lead_events")
        .select("lead_id,metadata,created_at")
        .eq("organization_id", organizationId)
        .eq("event_type", "lead_discarded")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<CampaignQualitySpendRow>((from, to) =>
      admin
        .from("marketing_spend")
        .select("campaign_id,spend_date,amount")
        .eq("organization_id", organizationId)
        .gte("spend_date", since.slice(0, 10))
        .order("spend_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  if (campaignResult.error || leadFetch.error || eventFetch.error) {
    logger.warn("analytics.campaign_quality.read_failed", {
      organizationId,
      campaignCode: campaignResult.error?.code,
      leadCode: leadFetch.error?.code,
      eventCode: eventFetch.error?.code,
    });
    return apiError(
      "CAMPAIGN_QUALITY_LOAD_FAILED",
      "A qualidade por campanha está temporariamente indisponível.",
      identity.meta,
      { status: 503 },
    );
  }
  if (spendFetch.error) {
    // Degradação graciosa: sem marketing_spend o relatório continua útil —
    // spend/CPL ficam zerados/nulos e policy.spendMeasured sinaliza o drift.
    logger.warn("analytics.campaign_quality.spend_unavailable", {
      organizationId,
      code: spendFetch.error.code,
    });
  }
  if (leadFetch.truncated || eventFetch.truncated || spendFetch.truncated) {
    // Teto de páginas atingido (30k linhas) — sinalizado no payload em vez de
    // fingir cobertura total.
    logger.warn("analytics.campaign_quality.window_truncated", {
      organizationId,
      leads: leadFetch.truncated,
      discards: eventFetch.truncated,
      spend: spendFetch.truncated,
    });
  }

  const { ranking, totals } = buildCampaignQuality({
    campaigns: (campaignResult.data ?? []) as CampaignQualityCampaign[],
    leads: leadFetch.rows,
    discardEvents: eventFetch.rows,
    spendRows: spendFetch.error ? [] : spendFetch.rows,
  });
  // Só campanhas com leads na janela entram no ranking; o restante fica nos totais.
  const rankedCampaigns = ranking.filter((row) => row.leads > 0);

  return apiSuccess(
    {
      scope: {
        organizationId,
        actorId: identity.access.profile.id,
        readOnly: true,
        minimumRole: "manager",
      },
      period: { start: since, end: end.toISOString(), days },
      totals: { ...totals, campaignsRanked: rankedCampaigns.length },
      ranking: rankedCampaigns,
      policy: {
        minimumLeadsForDecision: CAMPAIGN_QUALITY_MINIMUM_LEADS,
        qualifiedDefinition: `score_ia >= ${CAMPAIGN_QUALITY_QUALIFIED_SCORE} || temperature === "quente"`,
        qualityGradeRule: CAMPAIGN_QUALITY_GRADE_RULE,
        crmIsConversionTruth: true,
        spendMeasured: !spendFetch.error,
        // Honestidade de cobertura: true somente se nenhuma dimensão bateu o
        // teto de paginação — consumidores podem exibir aviso quando false.
        windowComplete: !leadFetch.truncated && !eventFetch.truncated && !spendFetch.truncated,
        taxonomyVersion: DISCARD_TAXONOMY_VERSION,
      },
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
