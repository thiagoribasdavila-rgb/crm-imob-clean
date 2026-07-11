import type { Recommendation } from "@/lib/atlas2030/contracts";

type Buyer = Record<string, unknown>;
type Property = Record<string, unknown>;
type Campaign = Record<string, unknown>;

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.toLowerCase());
  if (typeof value === "string") return value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return [];
}

export function recommendProperties(buyer: Buyer, properties: Property[], limit = 5): Recommendation[] {
  const buyerId = String(buyer.id ?? "");
  const budgetMax = numeric(buyer.budget_max);
  const bedrooms = numeric(buyer.bedrooms);
  const preferredRegions = normalizeList(buyer.preferred_regions);

  return properties
    .map((property) => {
      const propertyId = String(property.id ?? "");
      const price = numeric(property.price);
      const propertyBedrooms = numeric(property.bedrooms);
      const location = String(property.neighborhood ?? property.city ?? "").toLowerCase();
      const budgetFit = budgetMax > 0 && price > 0 ? Math.max(0, 1 - Math.abs(budgetMax - price) / budgetMax) : 0.4;
      const bedroomFit = bedrooms > 0 ? Math.max(0, 1 - Math.abs(bedrooms - propertyBedrooms) / Math.max(1, bedrooms)) : 0.6;
      const regionFit = preferredRegions.length === 0 ? 0.5 : preferredRegions.some((region) => location.includes(region)) ? 1 : 0;
      const confidence = Math.round((budgetFit * 0.45 + bedroomFit * 0.25 + regionFit * 0.3) * 100);
      return { property, propertyId, price, confidence, budgetFit, bedroomFit, regionFit };
    })
    .filter((item) => item.propertyId && item.confidence >= 45)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit)
    .map((item) => ({
      type: "buyer_property_match",
      subjectType: "buyer",
      subjectId: buyerId || undefined,
      title: `Recomendar ${String(item.property.title ?? "imóvel")}`,
      rationale: `Compatibilidade calculada por orçamento, tipologia e localização, com confiança de ${item.confidence}%.`,
      recommendation: { propertyId: item.propertyId, action: "present_property", priority: item.confidence >= 80 ? "high" : "medium" },
      evidence: [
        { metric: "budget_fit", value: item.budgetFit },
        { metric: "bedroom_fit", value: item.bedroomFit },
        { metric: "region_fit", value: item.regionFit },
        { metric: "price", value: item.price },
      ],
      expectedImpact: { conversionLiftPercent: Math.max(3, Math.round(item.confidence / 8)), responseTimeReductionPercent: 20 },
      confidence: item.confidence,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }));
}

export function recommendCampaignAction(campaign: Campaign, targetCpl = 50): Recommendation | null {
  const spend = numeric(campaign.spend);
  const leads = numeric(campaign.leads_count);
  const revenue = numeric(campaign.revenue);
  const cpl = leads > 0 ? spend / leads : spend;
  const roi = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;
  if (!String(campaign.id ?? "") || spend <= 0) return null;

  const action = cpl > targetCpl * 1.25 ? "reallocate_budget" : roi > 150 ? "scale_budget" : "monitor";
  const confidence = action === "monitor" ? 68 : 90;
  return {
    type: "campaign_optimization",
    subjectType: "campaign",
    subjectId: String(campaign.id),
    title: action === "scale_budget" ? "Escalar campanha eficiente" : action === "reallocate_budget" ? "Realocar verba da campanha" : "Manter campanha sob observação",
    rationale: `CPL de R$ ${cpl.toFixed(2)} e ROI de ${roi.toFixed(1)}% comparados à meta operacional.`,
    recommendation: { action, currentCpl: cpl, targetCpl, roi, humanApprovalRequired: action !== "monitor" },
    evidence: [{ metric: "spend", value: spend }, { metric: "leads", value: leads }, { metric: "cpl", value: cpl }, { metric: "roi", value: roi }],
    expectedImpact: { estimatedCplReductionPercent: action === "reallocate_budget" ? 15 : 0, estimatedLeadGrowthPercent: action === "scale_budget" ? 20 : 0 },
    confidence,
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  };
}
