import type { NextRequest } from "next/server";
import {
  CAMPAIGN_ANALYST_THRESHOLDS,
  buildAnalystNarrative,
  detectCampaignAnomalies,
} from "@/lib/ai/campaign-analyst";
import {
  buildCampaignQuality,
  type CampaignQualityDiscardEvent,
  type CampaignQualityLead,
  type CampaignQualitySpendRow,
} from "@/lib/atlas/campaign-quality";
import { fetchCampaignQualitySource } from "@/lib/atlas/campaign-quality-data";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/ai/campaign-analyst?days=30
//
// Analista Andromeda para gestor+ (manager | superintendent | director —
// mesmo padrão do andromeda-advisor). O Analista NARRA: detecta anomalias
// entre a janela atual e a anterior de mesmo tamanho (determinístico, em
// lib/ai/campaign-analyst.ts) e produz uma narrativa executiva com fallback
// determinístico. Ele não recomenda ação — isso é papel do conselheiro.
//
// Janela dupla: o loader compartilhado (fetchCampaignQualitySource) aceita
// só `since`, então buscamos UMA janela dupla (since = now - 2*days) e
// particionamos em memória pelos created_at (leads e lead_events) e
// spend_date (marketing_spend) — janela atual = timestamps >= now - days;
// janela anterior = o restante. Mesmas queries do campaign-quality, zero
// duplicação de leitura.
//
// Shape da resposta (payload do apiSuccess):
// {
//   narrative,                    // narrativa executiva pt-BR (3-5 frases)
//   engine: "generative" | "deterministic",
//   anomalies: [{ campaignId, campaignName, kind, direction, magnitude, evidence }],
//   period: { current: { start, end, days }, previous: { start, end, days } },
//   windowComplete,               // false se alguma paginação truncou
//   thresholds,                   // regras do detector (explicabilidade)
//   explainable: true,
//   humanApprovalRequired: true,  // narrativa é leitura, nunca ação
//   generatedAt
// }
//
// PII zero: prompt, resposta e logs carregam SOMENTE agregados de campanha
// (volumes, taxas, custos e nomes de campanha) — nunca dados de lead.

const DAY = 86_400_000;

function clampDays(value: string | null) {
  // Number(null) e Number("") valem 0 — sem esta guarda, a chamada padrão
  // (sem ?days=) viraria janela de 1 dia em vez do default de 30.
  if (value === null || value.trim() === "") return 30;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(180, Math.max(1, Math.round(parsed)));
}

// As queries do loader selecionam created_at/spend_date, mas os shapes puros
// do campaign-quality não carregam esses campos — tipos locais só para o
// particionamento em memória.
type Stamped<T> = T & { created_at?: string };
type StampedSpend = CampaignQualitySpendRow & { spend_date?: string };

function partitionByTimestamp<T>(rows: Stamped<T>[], boundaryIso: string) {
  const current: Stamped<T>[] = [];
  const previous: Stamped<T>[] = [];
  for (const row of rows) {
    // Sem created_at (não deveria acontecer: a query ordena por ele), a linha
    // fica na janela atual — nunca inflar a janela anterior por palpite.
    if (typeof row.created_at === "string" && row.created_at < boundaryIso) {
      previous.push(row);
    } else {
      current.push(row);
    }
  }
  return { current, previous };
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 30,
    scope: "ai-campaign-analyst",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const days = clampDays(request.nextUrl.searchParams.get("days"));
  const end = new Date();
  const boundary = new Date(end.getTime() - days * DAY); // início da janela atual
  const doubleStart = new Date(end.getTime() - 2 * days * DAY); // início da anterior
  const boundaryIso = boundary.toISOString();

  // UMA leitura da janela dupla com o loader compartilhado; partição em memória.
  const { campaignResult, leadFetch, eventFetch, spendFetch } =
    await fetchCampaignQualitySource({ organizationId, since: doubleStart.toISOString() });

  if (campaignResult.error || leadFetch.error || eventFetch.error) {
    logger.warn("ai.campaign_analyst.read_failed", {
      organizationId,
      campaignCode: campaignResult.error?.code,
      leadCode: leadFetch.error?.code,
      eventCode: eventFetch.error?.code,
    });
    return apiError(
      "CAMPAIGN_ANALYST_LOAD_FAILED",
      "O analista Andromeda está temporariamente indisponível.",
      identity.meta,
      { status: 503 },
    );
  }
  if (spendFetch.error) {
    // Degradação graciosa idêntica ao campaign-quality/advisor: sem
    // marketing_spend a narrativa continua útil, só perde CPL (nulo => o
    // detector não gera anomalia de CPL por construção).
    logger.warn("ai.campaign_analyst.spend_unavailable", {
      organizationId,
      code: spendFetch.error.code,
    });
  }

  const leads = partitionByTimestamp<CampaignQualityLead>(leadFetch.rows, boundaryIso);
  const events = partitionByTimestamp<CampaignQualityDiscardEvent>(eventFetch.rows, boundaryIso);
  const boundaryDate = boundaryIso.slice(0, 10);
  const spendRows = spendFetch.error ? [] : (spendFetch.rows as StampedSpend[]);
  const currentSpend = spendRows.filter((row) =>
    typeof row.spend_date !== "string" || row.spend_date >= boundaryDate);
  const previousSpend = spendRows.filter((row) =>
    typeof row.spend_date === "string" && row.spend_date < boundaryDate);

  const campaigns = campaignResult.data ?? [];
  const currentQuality = buildCampaignQuality({
    campaigns,
    leads: leads.current,
    discardEvents: events.current,
    spendRows: currentSpend,
  });
  const previousQuality = buildCampaignQuality({
    campaigns,
    leads: leads.previous,
    discardEvents: events.previous,
    spendRows: previousSpend,
  });

  // Mesmo recorte do campaign-quality: só campanhas com leads na janela.
  // Presença em uma única janela nunca gera delta (gate do detector).
  const currentRanking = currentQuality.ranking.filter((row) => row.leads > 0);
  const previousRanking = previousQuality.ranking.filter((row) => row.leads > 0);

  const anomalies = detectCampaignAnomalies(currentRanking, previousRanking);
  const { narrative, engine } = await buildAnalystNarrative({
    totals: currentQuality.totals,
    ranking: currentRanking,
    anomalies,
    organizationId,
    userId: identity.access.profile.id,
  });

  return apiSuccess(
    {
      narrative,
      engine,
      anomalies,
      period: {
        current: { start: boundaryIso, end: end.toISOString(), days },
        previous: { start: doubleStart.toISOString(), end: boundaryIso, days },
      },
      windowComplete:
        !leadFetch.truncated && !eventFetch.truncated && !spendFetch.truncated,
      thresholds: CAMPAIGN_ANALYST_THRESHOLDS,
      explainable: true,
      humanApprovalRequired: true,
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
