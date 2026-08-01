import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CAMPAIGN_PLATFORMS, calculateCampaignPerformance, rankCampaigns, type CampaignFact } from "@/lib/marketing/multichannel-campaign-intelligence";

export const dynamic = "force-dynamic";
const roles = ["director", "superintendent", "manager"];
const number = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const text = (value: unknown, max = 180) => typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "campaign-intelligence.read" }); if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles }); if (!access.ok) return access.response;
  const days = Math.min(365, Math.max(7, Number(request.nextUrl.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getSupabaseAdmin().from("multichannel_campaign_daily_facts").select("platform,account_key,campaign_key,campaign_name,currency,spend,impressions,clicks,platform_leads,crm_leads,qualified_leads,visits,proposals,wins,revenue,reference_date,attribution_model,snapshot_version").eq("organization_id", access.access.organization.id).eq("is_current", true).gte("reference_date", since).limit(20000);
  if (error) return apiError("CAMPAIGN_INTELLIGENCE_UNAVAILABLE", "Aplique a migration da Fase 91 para liberar o painel.", access.meta, { status: 503 });
  const facts = (data || []) as CampaignFact[];
  const platforms = CAMPAIGN_PLATFORMS.map((platform) => { const selected = facts.filter((fact) => fact.platform === platform); return { platform, campaigns: new Set(selected.map((fact) => fact.campaign_key)).size, ...calculateCampaignPerformance(selected) }; });
  return apiSuccess({ periodDays: days, summary: calculateCampaignPerformance(facts), platforms, ranking: rankCampaigns(facts), policy: { crmIsConversionTruth: true, platformReportedSeparated: true, attributionModelsSeparated: true, currency: "BRL", minimumCrmLeadsForRanking: 30, noPersonalData: true, appendOnlyVersions: true, automaticBudgetChanges: false } }, access.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "campaign-intelligence.ingest" }); if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["director", "superintendent"] }); if (!access.ok) return access.response;
  let body: Record<string, unknown>; try { body = await request.json(); } catch { return apiError("INVALID_JSON", "Envie JSON válido.", access.meta, { status: 400 }); }
  const platform = text(body.platform, 30); const accountKey = text(body.accountKey); const campaignKey = text(body.campaignKey); const campaignName = text(body.campaignName);
  const referenceDate = text(body.referenceDate, 10); const attributionModel = text(body.attributionModel, 30); const sourceHash = text(body.sourceHash, 64);
  const metricNames = ["spend", "impressions", "clicks", "platformLeads", "crmLeads", "qualifiedLeads", "visits", "proposals", "wins", "revenue"] as const;
  const metrics = Object.fromEntries(metricNames.map((key) => [key, number(body[key])]));
  if (!platform || !CAMPAIGN_PLATFORMS.includes(platform as never) || !accountKey || !campaignKey || !campaignName || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate || "") || !["platform_reported", "first_touch", "last_touch", "crm_outcome"].includes(attributionModel || "") || !/^[a-f0-9]{64}$/.test(sourceHash || "") || Object.values(metrics).some((value) => value === null)) return apiError("INVALID_CAMPAIGN_FACT", "Revise plataforma, identificação, data, atribuição, hash e métricas não negativas.", access.meta, { status: 422 });
  const { data, error } = await getSupabaseAdmin().rpc("ingest_multichannel_campaign_fact", { p_actor_id: access.access.profile.id, p_organization_id: access.access.organization.id, p_platform: platform, p_account_key: accountKey, p_campaign_key: campaignKey, p_campaign_name: campaignName, p_reference_date: referenceDate, p_development_id: body.developmentId || null, p_spend: metrics.spend, p_impressions: metrics.impressions, p_clicks: metrics.clicks, p_platform_leads: metrics.platformLeads, p_crm_leads: metrics.crmLeads, p_qualified_leads: metrics.qualifiedLeads, p_visits: metrics.visits, p_proposals: metrics.proposals, p_wins: metrics.wins, p_revenue: metrics.revenue, p_attribution_model: attributionModel, p_source_hash: sourceHash });
  if (error) return apiError("CAMPAIGN_FACT_REJECTED", "O snapshot não passou pela governança de campanhas.", access.meta, { status: 409 });
  return apiSuccess({ id: data, versioned: true, currentSnapshotReplaced: true }, access.meta, { status: 201, headers: rate.headers });
}
