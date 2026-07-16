import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildMetaCampaignIntelligence } from "@/lib/meta/campaign-intelligence";
import { logger } from "@/lib/observability/logger";
import { generateAIText } from "@/lib/ai/provider-router";
import { fetchMetaCampaignInsights } from "@/lib/meta/insights";

export const dynamic = "force-dynamic";
function authorized(request: Request) { const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); return Boolean(process.env.ATLAS_CRON_SECRET && token === process.env.ATLAS_CRON_SECRET); }
function reportDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const admin = getSupabaseAdmin();
  const { data: organizations, error } = await admin.from("organizations").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let generated = 0;
  for (const organization of organizations ?? []) {
    try {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [{ data: leads }, { data: recentEvents }, { data: followUps }] = await Promise.all([
        admin.from("leads").select("status,score,metadata,created_at,last_interaction_at").eq("organization_id", organization.id).eq("source", "Meta Lead Ads").limit(5000),
        admin.from("meta_conversion_events").select("status,event_name").eq("organization_id", organization.id).gte("created_at", since).limit(1000),
        admin.from("campaign_events").select("payload").eq("organization_id", organization.id).in("source", ["crm-funnel", "crm-followup"]).gte("occurred_at", since).limit(1000),
      ]);
      const now = Date.now();
      const paidResults = await Promise.allSettled([fetchMetaCampaignInsights(1), fetchMetaCampaignInsights(7), fetchMetaCampaignInsights(30)]);
      const paid = paidResults.map((result) => result.status === "fulfilled" ? result.value : []);
      const period = (days: number, insights: typeof paid[number]) => buildMetaCampaignIntelligence((leads ?? []).filter((lead) => lead.created_at && new Date(lead.created_at).getTime() >= now - days * 86_400_000), insights);
      const periods = { day: period(1, paid[0]), week: period(7, paid[1]), month: period(30, paid[2]) };
      const campaigns = periods.month;
      const signalCounts: Record<string, number> = {};
      for (const event of followUps ?? []) { const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {}; for (const signal of Array.isArray(payload.decision_signals) ? payload.decision_signals : []) if (typeof signal === "string" && signal !== "motivo_nao_classificado") signalCounts[signal] = (signalCounts[signal] || 0) + 1; }
      const recommendations = campaigns.filter((campaign) => campaign.sampleStatus !== "insufficient").slice(0, 10).map((campaign) => ({ campaignId: campaign.campaignId, recommendation: campaign.recommendation, qualityRate: campaign.qualityRate, conversionRate: campaign.conversionRate, decisionRequired: true }));
      const topSignals = Object.entries(signalCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([signal, count]) => ({ signal, count }));
      const anonymousEvidence = { periods: Object.fromEntries(Object.entries(periods).map(([key, rows]) => [key, rows.slice(0, 10).map((row, index) => ({ campaign: `campaign_${index + 1}`, total: row.total, qualityRate: row.qualityRate, conversionRate: row.conversionRate, averageResponseMinutes: row.averageResponseMinutes, responseCoverage: row.responseCoverage, performanceScore: row.performanceScore, sampleStatus: row.sampleStatus }))])), topSignals };
      const aiInput = JSON.stringify(anonymousEvidence);
      const analyses = await Promise.allSettled([
        generateAIText({ task: "reasoning", organizationId: organization.id, feature: "meta_daily_director_report", system: "Você é um estrategista sênior de mídia imobiliária. Analise somente agregados. Diferencie fatos, hipóteses e testes. Não recomende mudanças automáticas e nunca invente custo, ROAS ou causalidade.", prompt: `Produza recomendações executivas curtas para decisão do diretor, comparando dia, semana e mês: ${aiInput}`, containsPersonalData: false, timeoutMs: 25_000 }),
        generateAIText({ task: "research", organizationId: organization.id, feature: "meta_daily_market_research", system: "Pesquise práticas atuais oficiais e confiáveis para Meta Advantage+, Conversions API, criativos e otimização de leads imobiliários. Use os agregados anônimos apenas para contexto. Não presuma causalidade.", prompt: `Traga até 5 sugestões atuais que possam ser testadas pelo diretor: ${aiInput}`, containsPersonalData: false, timeoutMs: 25_000 }),
      ]);
      const aiConsensus = analyses.map((result) => result.status === "fulfilled" ? { provider: result.value.provider, model: result.value.model, analysis: result.value.text, citations: result.value.citations } : { provider: "unavailable", model: "fallback", analysis: "Análise externa indisponível; usar recomendações determinísticas do cockpit.", citations: [] });
      const payload = { generatedAt: new Date().toISOString(), windowHours: 24, periods, campaigns, recommendations, topSignals, aiConsensus, delivery: (recentEvents ?? []).reduce((total, event) => ({ ...total, [event.status]: (total[event.status] || 0) + 1 }), {} as Record<string, number>), governance: { decisionRole: "director", automaticCampaignChanges: false, evidenceOnly: true } };
      const { error: upsertError } = await admin.from("meta_daily_reports").upsert({ organization_id: organization.id, report_date: reportDate(), status: "ready", payload, updated_at: new Date().toISOString() }, { onConflict: "organization_id,report_date" });
      if (upsertError) throw upsertError;
      generated += 1;
    } catch (reportError) { logger.error("meta.daily_report_failed", reportError, { organizationId: organization.id }); }
  }
  return NextResponse.json({ reportDate: reportDate(), organizations: (organizations ?? []).length, generated });
}
