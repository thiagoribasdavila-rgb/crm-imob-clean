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
  // Uma incorporadora só recebe valor de gasto quando ALGUMA campanha dela teve
  // custo lido. `allocatedSpend` começa em zero e nada o alimenta quando a Meta
  // não responde — publicar esse zero diria "esta parceira não custou nada",
  // que é diferente de "não sabemos quanto custou".
  const developers = [...developerMap.values()].map((row) => {
    const temGasto = row.campaigns.size > 0 && campaignRows.some(
      (campaign) => campaign.spend !== null && row.campaigns.has(campaign.campaignId),
    );
    const spend = temGasto ? Math.round(row.allocatedSpend * 100) / 100 : null;
    return {
      developer: row.developer,
      leads: row.leads,
      spend,
      cpl: spend !== null && row.leads > 0 ? Math.round(spend / row.leads * 100) / 100 : null,
      campaigns: row.campaigns.size,
      allocation: row.exactSpend ? "direct" : "proportional_by_leads",
    };
  }).sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1) || b.leads - a.leads);

  // O TOTAL seguia a mesma armadilha, e era a mais visível: com a Meta fora do
  // ar `paid` vem vazio, o reduce devolve 0, e o relatório do diretor anunciava
  // "gasto na semana: R$ 0,00" enquanto TODA campanha logo abaixo dizia
  // "não medido". A soma transformava "não sei" em "nada".
  const gastoConhecido = paid.length > 0;
  const totalSpend = gastoConhecido
    ? Math.round(paid.reduce((sum, item) => sum + item.spend, 0) * 100) / 100
    : null;
  // Cobertura declarada: somar 2 de 7 campanhas e chamar de "gasto da semana"
  // continua sendo meia verdade se ninguém disser que são 2 de 7.
  const campanhasComGasto = campaignRows.filter((campaign) => campaign.spend !== null).length;

  return {
    totals: {
      leads: leads.length,
      spend: totalSpend,
      cpl: totalSpend !== null && leads.length > 0
        ? Math.round(totalSpend / leads.length * 100) / 100
        : null,
      campaigns: campaignRows.length,
      developers: developers.length,
      campanhasComGastoMedido: campanhasComGasto,
    },
    campaigns: campaignRows,
    developers,
    governance: {
      window: "last_7d",
      spendSource: gastoConhecido ? "Meta Ads Insights" : "Não disponível",
      mixedCampaignAllocation: "Custo dividido proporcionalmente às leads quando uma campanha atende mais de uma incorporadora.",
      // Dito no payload para quem lê a API sem abrir a tela: ausência de custo é
      // ausência, nunca zero.
      spendOmittedWhenUnknown: true,
      automaticDecisions: false,
    },
  };
}
