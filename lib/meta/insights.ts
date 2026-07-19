import "server-only";
import { resilientFetch } from "@/lib/http/resilient-fetch";

export type MetaPaidInsight = { campaignId: string; campaignName: string; spend: number; impressions: number; clicks: number };

export type MetaInsightPeriod = 1 | 7 | 30;

function datePreset(days: MetaInsightPeriod) {
  return days === 1 ? "today" : days === 7 ? "last_7d" : "last_30d";
}

export async function fetchMetaCampaignInsights(days: MetaInsightPeriod): Promise<MetaPaidInsight[]> {
  const accountId = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  const accessToken = process.env.META_ADS_ACCESS_TOKEN;
  if (!accountId || !accessToken) return [];
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  const params = new URLSearchParams({ level: "campaign", fields: "campaign_id,campaign_name,spend,impressions,clicks", date_preset: datePreset(days), limit: "500" });
  const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/act_${accountId}/insights?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } }, { timeoutMs: 30_000, retries: 2, operation: "Meta Insights" });
  const body = await response.json() as { data?: Array<{ campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || `Meta Insights HTTP ${response.status}`);
  return (body.data ?? []).map((row) => ({ campaignId: String(row.campaign_id || ""), campaignName: String(row.campaign_name || row.campaign_id || "Campanha Meta"), spend: Number(row.spend || 0), impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0) }));
}
