import type { AtlasLead, AtlasProperty } from "@/types/atlas";
import { AVAILABLE_STATUSES, BLOCKED_STATUSES, normalizePropertyStatus } from "@/lib/atlas/property-availability";

export type MatchConfidence = "alta" | "média" | "baixa";

export interface MatchDimension {
  key: "availability" | "budget" | "location" | "typology" | "profile" | "feedback";
  label: string;
  score: number;
  maximum: number;
  detail: string;
}

export interface MatchResult {
  propertyId: string;
  score: number;
  confidence: MatchConfidence;
  reasons: string[];
  risks: string[];
  dimensions: MatchDimension[];
  recommendation: "priorizar" | "avaliar" | "não recomendar";
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function dimension(key: MatchDimension["key"], label: string, score: number, maximum: number, detail: string): MatchDimension {
  return { key, label, score, maximum, detail };
}

export function matchLeadToProperty(lead: Partial<AtlasLead>, property: AtlasProperty, feedback?: "interested" | "rejected" | null): MatchResult {
  const reasons: string[] = [];
  const risks: string[] = [];
  const dimensions: MatchDimension[] = [];
  let knownSignals = 0;

  const rawStatus = normalizePropertyStatus(property.status);
  const isAvailable = AVAILABLE_STATUSES.has(rawStatus);
  const isBlocked = BLOCKED_STATUSES.has(rawStatus);
  if (isAvailable) {
    dimensions.push(dimension("availability", "Disponibilidade", 15, 15, "Unidade indicada como disponível no estoque."));
    reasons.push("Unidade indicada como disponível");
    knownSignals += 1;
  } else {
    dimensions.push(dimension("availability", "Disponibilidade", 0, 15, isBlocked ? "Unidade indisponível no estoque." : "Status precisa ser confirmado."));
    risks.push(isBlocked ? "Unidade indisponível; não apresentar ao cliente." : "Confirme a disponibilidade antes de apresentar.");
    if (property.status) knownSignals += 1;
  }

  const maxBudget = lead.budgetMax ?? null;
  const minBudget = lead.budgetMin ?? null;
  if (maxBudget && property.price) {
    const ratio = property.price / maxBudget;
    if (ratio <= 1) {
      const budgetScore = minBudget && property.price < minBudget * 0.7 ? 25 : 35;
      dimensions.push(dimension("budget", "Orçamento", budgetScore, 35, `Preço dentro do teto de ${maxBudget.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}.`));
      reasons.push("Preço dentro do orçamento informado");
    } else if (ratio <= 1.1) {
      dimensions.push(dimension("budget", "Orçamento", 18, 35, `${Math.round((ratio - 1) * 100)}% acima do teto informado.`));
      risks.push("Preço até 10% acima do orçamento; validar flexibilidade.");
    } else {
      dimensions.push(dimension("budget", "Orçamento", 0, 35, `${Math.round((ratio - 1) * 100)}% acima do teto informado.`));
      risks.push("Preço incompatível com o orçamento atual.");
    }
    knownSignals += 1;
  } else {
    dimensions.push(dimension("budget", "Orçamento", 8, 35, "Preço ou orçamento ainda não informado."));
    risks.push("Complete preço e orçamento para validar a capacidade de compra.");
  }

  const regions = (lead.preferredRegions ?? []).map(normalize).filter(Boolean);
  const propertyLocation = normalize([property.city, property.state].filter(Boolean).join(" "));
  if (regions.length && propertyLocation) {
    const propertyCity = normalize(property.city);
    const matchedRegion = regions.find((region) => propertyLocation.includes(region) || (propertyCity && region.includes(propertyCity)));
    const locationScore = matchedRegion ? 25 : 0;
    dimensions.push(dimension("location", "Localização", locationScore, 25, matchedRegion ? "Região alinhada à preferência do cliente." : "Fora das regiões preferidas."));
    if (matchedRegion) reasons.push("Localização alinhada à preferência");
    else risks.push("Localização fora das preferências registradas.");
    knownSignals += 1;
  } else {
    dimensions.push(dimension("location", "Localização", 8, 25, "Preferência ou endereço incompleto."));
    risks.push("Registre a região desejada para melhorar o matching.");
  }

  if (lead.bedrooms && property.bedrooms) {
    const difference = property.bedrooms - lead.bedrooms;
    const typologyScore = difference === 0 ? 20 : difference === 1 ? 14 : difference > 1 ? 8 : 0;
    dimensions.push(dimension("typology", "Tipologia", typologyScore, 20, difference === 0 ? "Dormitórios exatamente como solicitado." : difference > 0 ? "Possui mais dormitórios que o solicitado." : "Possui menos dormitórios que o solicitado."));
    if (difference === 0) reasons.push("Tipologia exata para o perfil");
    else if (difference > 0) reasons.push("Quantidade de dormitórios atende ao perfil");
    else risks.push("Quantidade de dormitórios abaixo do solicitado.");
    knownSignals += 1;
  } else {
    dimensions.push(dimension("typology", "Tipologia", 5, 20, "Dormitórios não informados em um dos registros."));
  }

  const profileScore = property.area && property.area > 0 ? 5 : 0;
  dimensions.push(dimension("profile", "Qualidade dos dados", profileScore, 5, profileScore ? "Área útil disponível para comparação." : "Área útil não informada."));
  if (!profileScore) risks.push("Cadastre a área útil para uma comparação completa.");
  else knownSignals += 1;

  if (feedback === "interested") {
    dimensions.push(dimension("feedback", "Retorno do cliente", 5, 5, "Cliente demonstrou interesse nesta opção."));
    reasons.unshift("Cliente já demonstrou interesse");
    knownSignals += 1;
  } else if (feedback === "rejected") {
    dimensions.push(dimension("feedback", "Retorno do cliente", 0, 5, "Cliente informou que esta opção não aderiu ao perfil."));
    risks.unshift("Cliente já recusou esta opção; não reapresentar sem novo contexto.");
    knownSignals += 1;
  }

  const rawScore = dimensions.reduce((total, item) => total + item.score, 0);
  const score = isBlocked || feedback === "rejected" ? 0 : Math.min(rawScore, 100);
  const confidence: MatchConfidence = knownSignals >= 5 ? "alta" : knownSignals >= 3 ? "média" : "baixa";
  const recommendation = !isAvailable || feedback === "rejected" || score < 45 ? "não recomendar" : score >= 75 ? "priorizar" : "avaliar";

  return { propertyId: property.id, score, confidence, reasons, risks, dimensions, recommendation };
}
