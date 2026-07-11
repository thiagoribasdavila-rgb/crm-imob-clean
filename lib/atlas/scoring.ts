import type { AtlasLead } from "@/types/atlas";

export interface LeadScoreResult {
  score: number;
  temperature: "frio" | "morno" | "quente";
  reasons: string[];
}

export function calculateLeadScore(lead: Partial<AtlasLead>): LeadScoreResult {
  let score = 0;
  const reasons: string[] = [];

  if (lead.email) { score += 10; reasons.push("E-mail informado"); }
  if (lead.phone) { score += 15; reasons.push("Telefone informado"); }
  if (lead.budgetMax && lead.budgetMax > 0) { score += 20; reasons.push("Orçamento definido"); }
  if (lead.preferredRegions?.length) { score += 10; reasons.push("Região de interesse definida"); }
  if (lead.bedrooms) { score += 5; reasons.push("Tipologia definida"); }
  if (lead.purpose) { score += 10; reasons.push("Objetivo de compra definido"); }
  if (lead.lastInteractionAt) { score += 15; reasons.push("Já houve interação"); }
  if (lead.nextActionAt) { score += 5; reasons.push("Próxima ação agendada"); }
  if (["visita", "proposta", "contrato"].includes(String(lead.status))) {
    score += 20;
    reasons.push("Lead avançado no funil");
  }

  score = Math.min(100, score);
  const temperature = score >= 70 ? "quente" : score >= 35 ? "morno" : "frio";
  return { score, temperature, reasons };
}
