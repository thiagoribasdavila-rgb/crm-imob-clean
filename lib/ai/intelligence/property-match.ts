export type PropertyMatchInput = {
  budget?: number;
  region?: string;
  bedrooms?: number;
  purpose?: "living" | "investment";
};

export type PropertyMatchResult = {
  propertyId: string;
  compatibility: number;
  reasons: string[];
};

export function calculatePropertyMatch(
  input: PropertyMatchInput,
  property: PropertyMatchInput,
): PropertyMatchResult {
  let score = 0;
  const reasons: string[] = [];

  if (input.region && input.region === property.region) {
    score += 35;
    reasons.push("Região compatível");
  }

  if (input.bedrooms && input.bedrooms === property.bedrooms) {
    score += 25;
    reasons.push("Planta compatível");
  }

  if (input.budget && property.budget && property.budget <= input.budget) {
    score += 40;
    reasons.push("Dentro do orçamento");
  }

  return {
    propertyId: "pending",
    compatibility: Math.min(score, 100),
    reasons,
  };
}
