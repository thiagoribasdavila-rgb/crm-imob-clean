import type { NextRequest } from "next/server";
import {
  ANDROMEDA_ADVISOR_RULES,
  adviseAndromedaPipeline,
  type AndromedaDiscardCategory,
  type AndromedaFunnelStage,
  type AndromedaSpendCoverage,
} from "@/lib/ai/andromeda-pipeline-advisor";
import {
  CAMPAIGN_QUALITY_DEFINITIONS,
  CAMPAIGN_QUALITY_GRADE_RULE,
  CAMPAIGN_QUALITY_GRADE_VERSION,
  CAMPAIGN_QUALITY_MINIMUM_LEADS,
  buildCampaignQuality,
} from "@/lib/atlas/campaign-quality";
import { fetchCampaignQualitySource } from "@/lib/atlas/campaign-quality-data";
import { DISCARD_TAXONOMY_VERSION } from "@/lib/atlas/discard-reasons";
import { DEFAULT_PIPELINE_STAGES, canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/ai/andromeda-advisor?days=30
//
// Conselheiro Pipeline × Andromeda para gestor+ (manager | superintendent |
// director — mesmo padrão do campaign-quality/director-daily). Reusa o loader
// compartilhado de lib/atlas/campaign-quality-data.ts (mesmas queries, zero
// duplicação) e envia à IA SOMENTE agregados: linhas do ranking, distribuição
// do funil e quebra de descartes por metaCategory — nunca nome/telefone/e-mail
// de lead (containsPersonalData: false por construção).
//
// Shape da resposta (payload do apiSuccess):
// {
//   scope: { organizationId, actorId, readOnly: true, minimumRole: "manager" },
//   period: { start, end, days },
//   engine: "generative" | "deterministic",   // qual via gerou o conselho
//   model,                                     // modelo quando generativa
//   recommendations: [{ campaignId, campaignName,
//     action: scale|scale_por_proxy|adjust_targeting|fix_form|pause_review|
//             investigate_attribution|keep,
//     rationale, confidence: alta|media|baixa, metaFeedbackHint }],
//   aggregates: { campaignsRanked, leads, funnel, discardsByMetaCategory,
//                 unattributedDiscards },      // o que a IA viu (auditável)
//   explainable: true,
//   humanApprovalRequired: true,               // NADA é aplicado na Meta
//   policy: { ...campos negativos explícitos + rules do fallback },
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
    limit: 30,
    scope: "ai-andromeda-advisor",
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

  // Mesmas fontes (e mesmas queries) do campaign-quality — loader compartilhado.
  const { campaignResult, leadFetch, eventFetch, spendFetch } =
    await fetchCampaignQualitySource({ organizationId, since });

  if (campaignResult.error || leadFetch.error || eventFetch.error) {
    logger.warn("ai.andromeda_advisor.read_failed", {
      organizationId,
      campaignCode: campaignResult.error?.code,
      leadCode: leadFetch.error?.code,
      eventCode: eventFetch.error?.code,
    });
    return apiError(
      "ANDROMEDA_ADVISOR_LOAD_FAILED",
      "O conselheiro Andromeda está temporariamente indisponível.",
      identity.meta,
      { status: 503 },
    );
  }
  if (spendFetch.error) {
    // Degradação graciosa idêntica ao campaign-quality: sem marketing_spend o
    // conselho continua útil, só perde a dimensão de custo (CPL nulo).
    logger.warn("ai.andromeda_advisor.spend_unavailable", {
      organizationId,
      code: spendFetch.error.code,
    });
  }

  // Três estados do gasto: "medido" exige linha lida na janela. Sem esta
  // distinção, marketing_spend vazia (que é o estado padrão: nenhum escritor no
  // repositório) publicava spendMeasured=true ao lado de spend 0 — "o gasto foi
  // medido" sobre tabela que ninguém alimenta.
  const spendCoverage: AndromedaSpendCoverage = spendFetch.error
    ? "indisponivel"
    : spendFetch.rows.length > 0
      ? "medido"
      : "sem_lancamento";
  const spendMeasured = spendCoverage === "medido";

  const { ranking, totals } = buildCampaignQuality({
    campaigns: campaignResult.data ?? [],
    leads: leadFetch.rows,
    discardEvents: eventFetch.rows,
    spendRows: spendFetch.error ? [] : spendFetch.rows,
  });
  // Campanha com gasto lançado e ZERO lead atribuído é o pior gasto possível —
  // era justamente o que o filtro por leads > 0 escondia do conselho.
  const rankedCampaigns = ranking.filter((row) => row.leads > 0 || row.spend > 0);

  // Distribuição do funil — SOMENTE contagens por etapa canônica (zero PII).
  const stageCounts = new Map<string, number>();
  for (const lead of leadFetch.rows) {
    const stage = canonicalPipelineStage(lead.status) ?? "outros";
    stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
  }
  const funnel: AndromedaFunnelStage[] = [
    ...DEFAULT_PIPELINE_STAGES.map((stage) => ({
      stage: stage.key,
      label: stage.label,
      count: stageCounts.get(stage.key) ?? 0,
    })).filter((item) => item.count > 0),
    ...(stageCounts.has("outros")
      ? [{ stage: "outros", label: "Sem etapa canônica", count: stageCounts.get("outros") ?? 0 }]
      : []),
  ];

  // Quebra org-wide de descartes por metaCategory — soma das linhas do ranking
  // (descartes sem campanha resolvida ficam em unattributedDiscards, à parte).
  const categoryCounts = new Map<string, number>();
  for (const row of rankedCampaigns) {
    for (const item of row.discardsByMetaCategory) {
      categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + item.count);
    }
  }
  const discardsByMetaCategory: AndromedaDiscardCategory[] = [...categoryCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count);

  const period = { start: since, end: end.toISOString(), days };
  const advice = await adviseAndromedaPipeline({
    organizationId,
    userId: identity.access.profile.id,
    aggregates: {
      period,
      ranking: rankedCampaigns,
      funnel,
      discardsByMetaCategory,
      unattributedDiscards: totals.unattributedDiscards,
      spendMeasured,
      spendCoverage,
    },
  });

  return apiSuccess(
    {
      scope: {
        organizationId,
        actorId: identity.access.profile.id,
        readOnly: true,
        minimumRole: "manager",
      },
      period,
      engine: advice.engine,
      model: advice.model,
      recommendations: advice.recommendations,
      aggregates: {
        campaignsRanked: rankedCampaigns.length,
        leads: totals.leads,
        funnel,
        discardsByMetaCategory,
        unattributedDiscards: totals.unattributedDiscards,
      },
      explainable: true,
      humanApprovalRequired: true,
      policy: {
        explainable: true,
        humanApprovalRequired: true,
        readOnly: true,
        advisoryOnly: true,
        // Campos negativos explícitos (padrão director-daily): o conselheiro
        // NUNCA executa nada — não muda verba, não pausa campanha e não envia
        // nada à Meta. O envio de disqualified segue sob o gate do diretor do
        // andromeda-loop (negativeSignalsInternalOnly).
        noAutomaticMetaAction: true,
        noAutomaticBudgetChange: true,
        noAutomaticCampaignPause: true,
        personalDataUsed: false,
        aggregatesOnly: true,
        deterministicFallback: true,
        rules: ANDROMEDA_ADVISOR_RULES,
        qualificationDefinitions: CAMPAIGN_QUALITY_DEFINITIONS,
        qualityGradeRule: CAMPAIGN_QUALITY_GRADE_RULE,
        // A nota decide verba: quem lê a recomendação precisa saber por qual
        // régua ela foi produzida.
        qualityGradeVersion: CAMPAIGN_QUALITY_GRADE_VERSION,
        minimumLeadsForDecision: CAMPAIGN_QUALITY_MINIMUM_LEADS,
        spendMeasured,
        spendCoverage,
        spendCoverageMeaning:
          "medido = há lançamento de gasto lido na janela; sem_lancamento = marketing_spend legível e sem linha na janela (não é o mesmo que não gastar); indisponivel = leitura falhou",
        windowComplete:
          !leadFetch.truncated
          && !eventFetch.truncated
          && !spendFetch.truncated
          && !campaignResult.truncated,
        taxonomyVersion: DISCARD_TAXONOMY_VERSION,
      },
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
