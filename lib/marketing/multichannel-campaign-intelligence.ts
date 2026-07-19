export const CAMPAIGN_PLATFORMS = ["meta", "google_ads", "youtube", "tiktok_ads", "portal"] as const;
export type CampaignPlatform = (typeof CAMPAIGN_PLATFORMS)[number];

export type CampaignFact = {
  platform: CampaignPlatform; account_key: string; campaign_key: string; campaign_name: string;
  currency: "BRL"; spend: number; impressions: number; clicks: number; platform_leads: number;
  crm_leads: number; qualified_leads: number; visits: number; proposals: number; wins: number; revenue: number;
};

const ratio = (numerator: number, denominator: number, multiplier = 1) => denominator > 0 ? Math.round(numerator / denominator * multiplier * 100) / 100 : null;
const sum = (facts: CampaignFact[], key: keyof CampaignFact) => facts.reduce((total, fact) => total + Number(fact[key] || 0), 0);

export function calculateCampaignPerformance(facts: CampaignFact[]) {
  const totals = {
    spend: sum(facts, "spend"), impressions: sum(facts, "impressions"), clicks: sum(facts, "clicks"),
    platformLeads: sum(facts, "platform_leads"), crmLeads: sum(facts, "crm_leads"), qualifiedLeads: sum(facts, "qualified_leads"),
    visits: sum(facts, "visits"), proposals: sum(facts, "proposals"), wins: sum(facts, "wins"), revenue: sum(facts, "revenue"),
  };
  const sampleSufficient = totals.crmLeads >= 30;
  const confidence = totals.crmLeads >= 100 ? "high" : totals.crmLeads >= 30 ? "medium" : "low";
  return {
    ...totals,
    ctr: ratio(totals.clicks, totals.impressions, 100), cpc: ratio(totals.spend, totals.clicks), cpm: ratio(totals.spend, totals.impressions, 1000),
    cpl: ratio(totals.spend, totals.crmLeads), cpql: ratio(totals.spend, totals.qualifiedLeads), costPerVisit: ratio(totals.spend, totals.visits),
    costPerProposal: ratio(totals.spend, totals.proposals), cac: ratio(totals.spend, totals.wins), roas: ratio(totals.revenue, totals.spend),
    qualificationRate: ratio(totals.qualifiedLeads, totals.crmLeads, 100), visitRate: ratio(totals.visits, totals.crmLeads, 100),
    proposalRate: ratio(totals.proposals, totals.crmLeads, 100), winRate: ratio(totals.wins, totals.crmLeads, 100),
    platformCrmLeadGap: totals.platformLeads - totals.crmLeads, sampleSufficient, confidence,
  };
}

export function rankCampaigns(facts: CampaignFact[]) {
  const groups = new Map<string, CampaignFact[]>();
  for (const fact of facts) { const key = `${fact.platform}:${fact.account_key}:${fact.campaign_key}`; groups.set(key, [...(groups.get(key) || []), fact]); }
  return [...groups.values()].map((group) => ({ platform: group[0].platform, accountKey: group[0].account_key, campaignKey: group[0].campaign_key, campaignName: group[0].campaign_name, ...calculateCampaignPerformance(group) }))
    .sort((a, b) => Number(b.sampleSufficient) - Number(a.sampleSufficient) || b.wins - a.wins || (b.roas || 0) - (a.roas || 0) || b.crmLeads - a.crmLeads);
}
