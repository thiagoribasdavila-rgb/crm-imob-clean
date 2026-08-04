// Import RELATIVO com extensao .ts: `lib/atlas/temperatura-do-lead.ts` é módulo
// puro e precisa continuar carregável por `node --test`, que não conhece os
// `paths` do tsconfig.
import { HOT_SCORE_THRESHOLD, WARM_SCORE_THRESHOLD } from "./temperatura-do-lead.ts";
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
  // ── A FRONTEIRA DE "QUENTE" NÃO É DESTE ARQUIVO ────────────────────────────
  //
  // Era `score >= 70` aqui, e OUTRO `70` em campaign-quality.ts, e OUTRO em
  // attention-signals.ts, e OUTRO em lead-qualification.ts. Quatro literais
  // para a mesma fronteira: enquanto os quatro forem iguais por coincidência,
  // `score_ia >= 70 OU temperature === "quente"` é `X OU X` — e no dia em que
  // um deles se mexer, os dois lados do OU passam a falar de coisas diferentes
  // com o mesmo nome, sem erro nenhum na tela.
  const temperature = score >= HOT_SCORE_THRESHOLD
    ? "quente"
    : score >= WARM_SCORE_THRESHOLD ? "morno" : "frio";
  return { score, temperature, reasons };
}
