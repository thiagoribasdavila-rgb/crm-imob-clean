/**
 * Saúde criativa pós-Andromeda — lê anúncios reais da Meta (Insights API,
 * últimos 30 dias, nível ad) e devolve o relatório de fadiga/diversidade
 * criativa por campanha + a recomendação de consolidação da conta, com os
 * limiares vindos da calibração central da organização.
 *
 * Fonte VIVA obrigatória: sem META_ADS_ACCESS_TOKEN/META_AD_ACCOUNT_ID a rota
 * responde 503 honesto (nada de dado sintético). Leitura read-only na Meta;
 * qualquer ação derivada daqui é proposta com aprovação humana.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAdInsights, fetchBreakdownInsights } from "@/lib/meta/marketing/campaign-read";
import { analyzeCreativeHealth, accountConsolidation } from "@/lib/meta/marketing/andromeda-report";
import { placementReport, geoReport, demoReport, anglePerformance } from "@/lib/meta/marketing/audience-finder";
import { forecastCampaign, anomalyForecast, type ForecastWeek } from "@/lib/meta/marketing/forecast";
import { proposeRotations, rotationSummary } from "@/lib/ai/creative-rotation";
import { briefsForRotation } from "@/lib/atlas/developer-portfolio";
import { proposePolicies, policySummary } from "@/lib/meta/marketing/policy-engine";
import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";
import { loadOrgCalibration } from "@/lib/ai/calibration-server";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

// GET — saúde criativa (fadiga, diversidade, score Andromeda) por campanha e
// recomendação de consolidação da conta. Liderança comercial.
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 30, scope: "marketing-andromeda" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = roleOf(identity.access);
  if (!["director", "superintendent", "manager"].includes(role)) {
    return apiError("FORBIDDEN", "Saúde criativa pertence à liderança.", identity.meta, { status: 403 });
  }

  const token = process.env.META_ADS_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    return apiError("META_NOT_CONFIGURED", "Meta não configurada: defina META_ADS_ACCESS_TOKEN e META_AD_ACCOUNT_ID.", identity.meta, { status: 503 });
  }

  // leituras cacheadas (TTL 5 min) + calibração — tudo em paralelo
  const [rows, cal, placementRows, regionRows, demoRows] = await Promise.all([
    cachedMetaRead(`ad-insights:${account}:last_30d`, () => fetchAdInsights(account, token, { datePreset: "last_30d" })),
    loadOrgCalibration(getSupabaseAdmin(), identity.access.organization.id),
    cachedMetaRead(`bd-placement:${account}:last_30d`, () => fetchBreakdownInsights(account, token, { breakdowns: ["publisher_platform", "platform_position"] })),
    cachedMetaRead(`bd-region:${account}:last_30d`, () => fetchBreakdownInsights(account, token, { breakdowns: ["region"], level: "account" })),
    cachedMetaRead(`bd-demo:${account}:last_30d`, () => fetchBreakdownInsights(account, token, { breakdowns: ["age", "gender"], level: "account" })),
  ]);
  if (!Array.isArray(rows)) {
    // MetaReadError estruturado — repassa a mensagem, nunca o token
    return apiError("META_READ_FAILED", `Meta recusou a leitura: ${rows.message}`, identity.meta, { status: 502 });
  }

  // consolidação: só campanhas VIVAS (última janela) contam — o período de
  // 30 dias inclui campanhas pausadas antigas, que não fragmentam nada hoje.
  const lastWindow = rows.reduce((max, r) => (r.dateStart > max ? r.dateStart : max), "");
  const liveCampaigns = new Set(rows.filter((r) => r.dateStart === lastWindow).map((r) => r.campaignId)).size;
  const monthlySpend = rows.reduce((sum, r) => sum + r.spend, 0);

  // ANÁLISE PREDITIVA: agrega os anúncios em série semanal (spend+leads) e
  // projeta para onde a conta caminha + alertas preditivos.
  const weekMap = new Map<string, { spend: number; leads: number }>();
  for (const r of rows) {
    const cur = weekMap.get(r.dateStart) ?? { spend: 0, leads: 0 };
    cur.spend += r.spend; cur.leads += r.leads;
    weekMap.set(r.dateStart, cur);
  }
  const weeks: ForecastWeek[] = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, v]) => ({ weekStart, spend: v.spend, leads: v.leads }));
  const forecast = {
    campaign: forecastCampaign(weeks, { minWeeksForTrend: cal.forecast.minWeeksForTrend }),
    anomalies: anomalyForecast(weeks, { anomalyLeadDropPct: cal.forecast.anomalyLeadDropPct }),
  };

  const health = analyzeCreativeHealth(rows, {
    freqLimit: cal.fatigue.freqLimit,
    ctrDropPct: cal.fatigue.ctrDropPct,
    cpmRisePct: cal.fatigue.cpmRisePct,
    diversityTarget: cal.diversity.targetAdsPerCampaign,
    maxActiveCampaignsSmall: cal.consolidation.maxActiveCampaignsSmall,
  });
  // ROTAÇÃO CRIATIVA: fadiga detectada → substituto já redigido (IAs conversando).
  // Só para campanhas com brief conhecido no rol de incorporadoras.
  const rotations = proposeRotations(health, briefsForRotation());

  const placements = Array.isArray(placementRows) ? placementReport(placementRows) : null;
  const geo = Array.isArray(regionRows) ? geoReport(regionRows) : null;
  const consolidation = accountConsolidation(liveCampaigns, monthlySpend);

  // MOTOR DE POLÍTICA (prescritivo): os veredictos viram propostas de 1 clique,
  // só reversíveis e confiantes — prontas para a Caixa de Aprovações.
  const prescriptions = proposePolicies({
    placements: placements ?? undefined,
    creativeHealth: health,
    anomalies: forecast.anomalies,
    consolidation,
    geo: geo ? { verdict: geo.verdict, leak: { sharePct: geo.leak.sharePct } } : undefined,
  });

  return apiSuccess({
    source: "meta_live",
    health,
    rotations: { proposals: rotations, summary: rotationSummary(rotations) },
    consolidation,
    forecast, // análise preditiva: pace, projeção de leads/CPL, anomalias
    // PRESCRIÇÕES governadas: verdicts → propostas reversíveis de 1 clique
    prescriptions: { proposals: prescriptions, summary: policySummary(prescriptions) },
    // Localizador de Público: onde responde, onde vaza, quem responde
    // (demografia = observação de entrega; segmentar por ela é proibido) e
    // CPL por ângulo criativo (anúncios na convenção [Atlas]).
    audience: {
      placements,
      geo,
      demo: Array.isArray(demoRows) ? demoReport(demoRows) : null,
      angles: anglePerformance(rows.map((r) => ({ adName: r.adName, spend: r.spend, leads: r.leads }))),
    },
  }, identity.meta, { headers: limited.headers });
}
