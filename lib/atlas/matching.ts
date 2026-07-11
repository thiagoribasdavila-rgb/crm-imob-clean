import type { AtlasLead, AtlasProperty } from "@/types/atlas";

export interface MatchResult {
  propertyId: string;
  score: number;
  reasons: string[];
}

export function matchLeadToProperty(lead: Partial<AtlasLead>, property: AtlasProperty): MatchResult {
  let score = 0;
  const reasons: string[] = [];

  const maxBudget = lead.budgetMax ?? null;
  if (maxBudget && property.price && property.price <= maxBudget) {
    score += 35;
    reasons.push("Dentro do orçamento máximo");
  }

  if (lead.bedrooms && property.bedrooms && property.bedrooms >= lead.bedrooms) {
    score += 20;
    reasons.push("Quantidade de dormitórios compatível");
  }

  const regions = lead.preferredRegions ?? [];
  if (property.city && regions.some((region) => property.city?.toLowerCase().includes(region.toLowerCase()))) {
    score += 25;
    reasons.push("Localização compatível");
  }

  if (property.status === "ativo" || property.status === "available") {
    score += 10;
    reasons.push("Imóvel disponível");
  }

  if (property.area && property.area >= 30) {
    score += 10;
    reasons.push("Área útil relevante");
  }

  return { propertyId: property.id, score: Math.min(score, 100), reasons };
}
