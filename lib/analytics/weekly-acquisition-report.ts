type LeadRow = { id: string; campaign_id?: string | null; development_id?: string | null; status?: string | null; score?: number | null; metadata?: unknown };
type DevelopmentRow = { id: string; name: string; developer_name?: string | null };
type PaidInsight = { campaignId: string; campaignName?: string; spend: number; impressions?: number; clicks?: number };

function meta(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return {} as Record<string, unknown>;
  const value = (metadata as Record<string, unknown>).meta;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function buildWeeklyAcquisitionReport(leads: LeadRow[], developments: DevelopmentRow[], paid: PaidInsight[]) {
  const projects = new Map(developments.map((item) => [item.id, item]));
  const campaigns = new Map<string, { campaignId: string; campaignName: string; leads: LeadRow[] }>();
  for (const lead of leads) {
    const leadMeta = meta(lead.metadata);
    const campaignId = String(leadMeta.campaignId || lead.campaign_id || "sem-campanha");
    const paidRow = paid.find((item) => item.campaignId === campaignId);
    const campaignName = paidRow?.campaignName || String(leadMeta.campaignName || (campaignId === "sem-campanha" ? "Sem campanha atribuída" : campaignId));
    const current = campaigns.get(campaignId) || { campaignId, campaignName, leads: [] };
    current.leads.push(lead); campaigns.set(campaignId, current);
  }
  for (const insight of paid) if (!campaigns.has(insight.campaignId)) campaigns.set(insight.campaignId, { campaignId: insight.campaignId, campaignName: insight.campaignName || insight.campaignId, leads: [] });

  const campaignRows = [...campaigns.values()].map((campaign) => {
    const insight = paid.find((item) => item.campaignId === campaign.campaignId);
    const spend = insight?.spend ?? null; const leadCount = campaign.leads.length;
    const developerCounts = new Map<string, number>();
    for (const lead of campaign.leads) {
      const project = lead.development_id ? projects.get(lead.development_id) : null;
      const developer = project?.developer_name?.trim() || "Sem incorporadora atribuída";
      developerCounts.set(developer, (developerCounts.get(developer) || 0) + 1);
    }
    return {
      campaignId: campaign.campaignId, campaignName: campaign.campaignName, leads: leadCount, spend,
      cpl: spend !== null && leadCount > 0 ? Math.round(spend / leadCount * 100) / 100 : null,
      qualified: campaign.leads.filter((lead) => Number(lead.score || meta(lead.metadata).qualificationScore || 0) >= 60 || ["qualificacao","visita","proposta","contrato","ganho"].includes(String(lead.status || "").toLowerCase())).length,
      developers: [...developerCounts.entries()].map(([developer, count]) => ({ developer, leads: count })),
      costSource: insight ? "meta_ads_7d" : "unavailable",
    };
  }).sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1) || b.leads - a.leads);

  const developerMap = new Map<string, { developer: string; leads: number; allocatedSpend: number; campaigns: Set<string>; exactSpend: boolean }>();
  for (const campaign of campaignRows) for (const split of campaign.developers.length ? campaign.developers : [{ developer: "Sem incorporadora atribuída", leads: 0 }]) {
    const row = developerMap.get(split.developer) || { developer: split.developer, leads: 0, allocatedSpend: 0, campaigns: new Set<string>(), exactSpend: true };
    row.leads += split.leads; row.campaigns.add(campaign.campaignId);
    if (campaign.spend !== null && campaign.leads > 0) { row.allocatedSpend += campaign.spend * split.leads / campaign.leads; if (campaign.developers.length > 1) row.exactSpend = false; }
    developerMap.set(split.developer, row);
  }
  const developers = [...developerMap.values()].map((row) => ({ developer: row.developer, leads: row.leads, spend: Math.round(row.allocatedSpend * 100) / 100, cpl: row.leads && row.allocatedSpend ? Math.round(row.allocatedSpend / row.leads * 100) / 100 : null, campaigns: row.campaigns.size, allocation: row.exactSpend ? "direct" : "proportional_by_leads" })).sort((a, b) => b.spend - a.spend || b.leads - a.leads);
  const totalSpend = paid.reduce((sum, item) => sum + item.spend, 0);
  return { totals: { leads: leads.length, spend: Math.round(totalSpend * 100) / 100, cpl: leads.length && totalSpend ? Math.round(totalSpend / leads.length * 100) / 100 : null, campaigns: campaignRows.length, developers: developers.length }, campaigns: campaignRows, developers, governance: { window: "last_7d", spendSource: paid.length ? "Meta Ads Insights" : "Não disponível", mixedCampaignAllocation: "Custo dividido proporcionalmente às leads quando uma campanha atende mais de uma incorporadora.", automaticDecisions: false } };
}
