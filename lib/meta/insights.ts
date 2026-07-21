import "server-only";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { metaGraphVersion, describeMetaGraphFailure } from "@/lib/meta/graph";

export type MetaPaidInsight = { campaignId: string; campaignName: string; spend: number; impressions: number; clicks: number };

export type MetaInsightPeriod = 1 | 7 | 30;

function datePreset(days: MetaInsightPeriod) {
  return days === 1 ? "today" : days === 7 ? "last_7d" : "last_30d";
}

export async function fetchMetaCampaignInsights(days: MetaInsightPeriod): Promise<MetaPaidInsight[]> {
  const accountId = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  const accessToken = process.env.META_ADS_ACCESS_TOKEN;
  if (!accountId || !accessToken) return [];
  const apiVersion = metaGraphVersion();
  const params = new URLSearchParams({ level: "campaign", fields: "campaign_id,campaign_name,spend,impressions,clicks", date_preset: datePreset(days), limit: "500" });

  // SEGUE a paginação por cursor (não trunca em 500) — este dado alimenta
  // relatórios financeiros; teto de segurança de páginas evita loop infinito.
  const rows: MetaPaidInsight[] = [];
  let url: string | null = `https://graph.facebook.com/${apiVersion}/act_${accountId}/insights?${params}`;
  const MAX_PAGES = 20;
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response = await resilientFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }, { timeoutMs: 30_000, retries: 2, operation: "Meta Insights" });
    const body = await response.json() as {
      data?: Array<{ campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; clicks?: string }>;
      paging?: { next?: string; cursors?: { after?: string } };
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, body));
    for (const row of body.data ?? []) {
      rows.push({ campaignId: String(row.campaign_id || ""), campaignName: String(row.campaign_name || row.campaign_id || "Campanha Meta"), spend: Number(row.spend || 0), impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0) });
    }
    // usa paging.next (URL completa) quando presente; senão monta pelo cursor
    const after = body.paging?.cursors?.after;
    url = body.paging?.next ?? (after ? `https://graph.facebook.com/${apiVersion}/act_${accountId}/insights?${params}&after=${encodeURIComponent(after)}` : null);
  }
  return rows;
}
