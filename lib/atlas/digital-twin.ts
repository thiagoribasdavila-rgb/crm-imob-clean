export type TwinSignal = { key: string; value: string | number | boolean | null; weight: number };

export type TwinSnapshot = {
  twinType: "buyer" | "property" | "development" | "investor" | "market" | "campaign" | "broker";
  entityId: string | null;
  state: Record<string, unknown>;
  signals: TwinSignal[];
  qualityScore: number;
  expiresAt: string;
};

function quality(values: unknown[]): number {
  const filled = values.filter((value) => value !== null && value !== undefined && value !== "").length;
  return Math.round((filled / Math.max(1, values.length)) * 100);
}

export function buildBuyerTwin(lead: Record<string, unknown>): TwinSnapshot {
  const state = {
    name: lead.name,
    score: Number(lead.score ?? 0),
    temperature: lead.temperature,
    budgetMin: Number(lead.budget_min ?? 0),
    budgetMax: Number(lead.budget_max ?? 0),
    bedrooms: Number(lead.bedrooms ?? 0),
    preferredRegions: lead.preferred_regions ?? [],
    stage: lead.status,
    source: lead.source,
  };
  return {
    twinType: "buyer",
    entityId: String(lead.id),
    state,
    signals: [
      { key: "score", value: state.score, weight: 0.35 },
      { key: "temperature", value: String(state.temperature ?? "unknown"), weight: 0.25 },
      { key: "budget_max", value: state.budgetMax, weight: 0.2 },
      { key: "stage", value: String(state.stage ?? "novo"), weight: 0.2 },
    ],
    qualityScore: quality(Object.values(state)),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function buildPropertyTwin(property: Record<string, unknown>): TwinSnapshot {
  const price = Number(property.price ?? 0);
  const area = Number(property.area ?? 0);
  const state = {
    title: property.title,
    status: property.status,
    price,
    area,
    pricePerSquareMeter: area > 0 ? Math.round(price / area) : 0,
    bedrooms: Number(property.bedrooms ?? 0),
    neighborhood: property.neighborhood,
    city: property.city,
    developmentId: property.development_id,
  };
  return {
    twinType: "property",
    entityId: String(property.id),
    state,
    signals: [
      { key: "availability", value: state.status === "available" || state.status === "disponivel", weight: 0.4 },
      { key: "price", value: state.price, weight: 0.25 },
      { key: "price_per_sqm", value: state.pricePerSquareMeter, weight: 0.2 },
      { key: "location", value: String(state.neighborhood ?? state.city ?? "unknown"), weight: 0.15 },
    ],
    qualityScore: quality(Object.values(state)),
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  };
}

export function buildCampaignTwin(campaign: Record<string, unknown>): TwinSnapshot {
  const spend = Number(campaign.spend ?? 0);
  const leads = Number(campaign.leads_count ?? 0);
  const sales = Number(campaign.sales_count ?? 0);
  const revenue = Number(campaign.revenue ?? 0);
  const state = {
    name: campaign.name,
    channel: campaign.channel,
    status: campaign.status,
    spend,
    leads,
    sales,
    revenue,
    cpl: leads > 0 ? spend / leads : 0,
    conversionRate: leads > 0 ? (sales / leads) * 100 : 0,
    roi: spend > 0 ? ((revenue - spend) / spend) * 100 : 0,
  };
  return {
    twinType: "campaign",
    entityId: String(campaign.id),
    state,
    signals: [
      { key: "cpl", value: state.cpl, weight: 0.3 },
      { key: "conversion", value: state.conversionRate, weight: 0.3 },
      { key: "roi", value: state.roi, weight: 0.3 },
      { key: "status", value: String(state.status ?? "unknown"), weight: 0.1 },
    ],
    qualityScore: quality(Object.values(state)),
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  };
}
