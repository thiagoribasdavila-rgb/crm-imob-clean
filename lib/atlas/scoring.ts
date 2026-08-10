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

/**
 * Entrada do score. Além do lead canônico, aceita dois sinais CATEGÓRICOS de
 * comprador que o formulário do anúncio captura e o produto exibia sem pontuar:
 *
 * - paymentMethod: forma de pagamento declarada. "a_vista" é o sinal mais forte
 *   de comprador (dinheiro na mão, pronto para fechar); qualquer forma declarada
 *   já indica alguém que pensou em COMO vai comprar.
 * - declaredBudgetRange: a faixa como o cliente a escolheu ("R$ 400 a 600 mil").
 *   NÃO vira número — converter inventaria precisão que a resposta não tem, a
 *   mesma recusa de qualificacao-canonica.ts. Pontuamos a PRESENÇA do sinal, e
 *   ela vale menos que um orçamento numérico exato (10 contra 20).
 *
 * Ambos são estritamente ADITIVOS: um lead sem esses campos pontua exatamente
 * como antes desta mudança.
 */
type LeadScoreInput = Partial<AtlasLead> & {
  paymentMethod?: string | null;
  declaredBudgetRange?: string | null;
};

export function calculateLeadScore(lead: LeadScoreInput): LeadScoreResult {
  let score = 0;
  const reasons: string[] = [];

  if (lead.email) { score += 10; reasons.push("E-mail informado"); }
  if (lead.phone) { score += 15; reasons.push("Telefone informado"); }
  // Orçamento: o número exato vale mais que a faixa declarada, mas nunca os dois
  // ao mesmo tempo — senão o mesmo sinal contaria em dobro.
  if (lead.budgetMax && lead.budgetMax > 0) {
    score += 20; reasons.push("Orçamento definido");
  } else if (lead.declaredBudgetRange && lead.declaredBudgetRange.trim()) {
    score += 10; reasons.push("Faixa de investimento declarada");
  }
  // Forma de pagamento: à vista é o comprador mais quente; as demais formas
  // (financiamento, FGTS, consórcio) ainda são intenção real de compra.
  if (lead.paymentMethod) {
    if (lead.paymentMethod === "a_vista") { score += 15; reasons.push("Compra à vista"); }
    else { score += 8; reasons.push("Forma de pagamento declarada"); }
  }
  if (lead.preferredRegions?.length) { score += 10; reasons.push("Região de interesse definida"); }
  if (lead.bedrooms) { score += 5; reasons.push("Tipologia definida"); }
  if (lead.purpose) { score += 10; reasons.push("Objetivo de compra definido"); }
  if (lead.lastInteractionAt) { score += 15; reasons.push("Já houve interação"); }
  if (lead.nextActionAt) { score += 5; reasons.push("Próxima ação agendada"); }
  // Etapa avançada = as MESMAS quatro etapas comerciais canônicas
  // (CAMPAIGN_QUALITY_COMMERCIAL_STAGES: visita/proposta/contrato/ganho). 'ganho'
  // faltava: um lead GANHO — a etapa TERMINAL — pontuava 0 de funil e caía ABAIXO
  // de um em 'contrato'. Afeta a importação de planilha com negócio fechado e o
  // recompute do PATCH de um lead já ganho. O literal é espelhado no script
  // paralelo scripts/recalcula-score-das-importadas.mjs; o contrato
  // score-nas-tres-portas policia a paridade motor↔script (inclusive 'ganho').
  if (["visita", "proposta", "contrato", "ganho"].includes(String(lead.status))) {
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
