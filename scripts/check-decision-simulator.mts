/**
 * Checagem adversarial do simulador de decisão (lib/ai/decision-simulator).
 *
 * Standalone, sem framework: node --experimental-strip-types scripts/check-decision-simulator.mts
 * Acumula falhas em pt-BR e sai com código 1 se qualquer caso reprovar.
 */

import {
  simulateMove,
  simulatePlan,
  type SimulationContext,
} from "../lib/ai/decision-simulator.ts";
import type { BudgetLine, CostBucket } from "../lib/marketing/cost-report.ts";

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed += 1;
  else failures.push(name);
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const close = (a: number, b: number) => Math.abs(a - b) < 0.005;

function bucket(key: string, spend: number, leads: number): CostBucket {
  return {
    key: key.toLowerCase(),
    label: key,
    spend,
    leads,
    sales: 0,
    cpl: leads > 0 ? r2(spend / leads) : null,
    cac: null,
    share: 0,
  };
}

const campaigns7d: CostBucket[] = [
  bucket("Spin Mood", 2000, 40),      // CPL 50, ≥30 leads → alta
  bucket("Vertice", 1500, 15),        // CPL 100, 10-29 → media
  bucket("Queimando", 800, 0),        // CPL null → baixa
  bucket("Nano", 90, 9),              // CPL 10, <10 → baixa
  bucket("Dez", 100, 10),             // 10 leads exatos → media
  bucket("VinteNove", 290, 29),       // 29 leads → media
  bucket("Trinta", 300, 30),          // 30 leads exatos → alta
];
const ctx7: SimulationContext = { campaigns: campaigns7d, period: "7d" };

// 1) pausar (base 7d): spendDelta = -gasto semanal, faixa de ±25% nos leads
const p1 = simulateMove({ kind: "pausar", target: "Spin Mood" }, ctx7);
check(
  "caso 1: pausar 7d — spendDelta -2000 e leads -50/-40/-30",
  close(p1.weeklySpendDelta, -2000) &&
  close(p1.weeklyLeadsDelta.pessimista, -50) &&
  close(p1.weeklyLeadsDelta.esperado, -40) &&
  close(p1.weeklyLeadsDelta.otimista, -30),
);

// 2) pausar com base 30d divide por 4.33 e anota a suposição
const ctx30: SimulationContext = { campaigns: [bucket("Mensal", 433, 130)], period: "30d" };
const p2 = simulateMove({ kind: "pausar", target: "Mensal" }, ctx30);
check(
  "caso 2: pausar 30d — gasto semanal = 433/4.33 = 100 e leads/semana = 130/4.33",
  close(p2.weeklySpendDelta, -100) &&
  close(p2.weeklyLeadsDelta.esperado, r2(-(130 / 4.33))) &&
  p2.assumptions.some((a) => a.includes("4.33")),
);

// 3) alvo inexistente → projeção zerada com assunção explícita, confiança baixa
const p3 = simulateMove({ kind: "pausar", target: "Fantasma" }, ctx7);
check(
  "caso 3: pausar alvo inexistente — tudo 0, confiança baixa, assunção explica",
  p3.weeklySpendDelta === 0 &&
  p3.weeklyLeadsDelta.pessimista === 0 && p3.weeklyLeadsDelta.esperado === 0 && p3.weeklyLeadsDelta.otimista === 0 &&
  p3.confidence === "baixa" &&
  p3.assumptions.some((a) => a.includes("não encontrado")),
);

// 4) escalar: leads ganhos = valor / CPL × 0.8, com faixa ±25%
const p4 = simulateMove({ kind: "escalar", target: "Spin Mood", amount: 500 }, ctx7);
check(
  "caso 4: escalar 500 em CPL 50 — spendDelta +500 e leads 6/8/10 (fator 0.8)",
  close(p4.weeklySpendDelta, 500) &&
  close(p4.weeklyLeadsDelta.esperado, 8) &&
  close(p4.weeklyLeadsDelta.pessimista, 6) &&
  close(p4.weeklyLeadsDelta.otimista, 10),
);

// 5) escalar destino sem CPL → esperado 0 com assunção "sem base histórica", baixa
const p5 = simulateMove({ kind: "escalar", target: "Queimando", amount: 400 }, ctx7);
check(
  "caso 5: escalar sem CPL — leads 0/0/0, confiança baixa, assunção de falta de base",
  close(p5.weeklySpendDelta, 400) &&
  p5.weeklyLeadsDelta.esperado === 0 && p5.weeklyLeadsDelta.pessimista === 0 && p5.weeklyLeadsDelta.otimista === 0 &&
  p5.confidence === "baixa" &&
  p5.assumptions.some((a) => a.toLowerCase().includes("sem base histórica")),
);

// 6) realocar: fator 0.8 SÓ no destino; origem perde valor/CPL cheio; spendDelta 0
// destino Spin Mood (CPL 50): ganho 400/50×0.8 = 6.4; origem Vertice (CPL 100): perda 400/100 = 4
const p6 = simulateMove({ kind: "realocar", target: "Spin Mood", from: "Vertice", to: "Spin Mood", amount: 400 }, ctx7);
check(
  "caso 6: realocar — esperado 6.4-4 = 2.4, faixa 0.8..4, spendDelta 0",
  p6.weeklySpendDelta === 0 &&
  close(p6.weeklyLeadsDelta.esperado, 2.4) &&
  close(p6.weeklyLeadsDelta.pessimista, 0.8) &&
  close(p6.weeklyLeadsDelta.otimista, 4),
);

// 7) se o fator 0.8 fosse aplicado na origem, o esperado seria 6.4-3.2=3.2 — não pode
check(
  "caso 7: retorno decrescente NÃO aplicado na origem (esperado ≠ 3.2)",
  !close(p6.weeklyLeadsDelta.esperado, 3.2) &&
  p6.assumptions.some((a) => a.includes("sem fator")),
);

// 8) degraus de confiança exatos: 9 → baixa, 10 → media, 29 → media, 30 → alta
const conf = (target: string) => simulateMove({ kind: "escalar", target, amount: 100 }, ctx7).confidence;
check(
  "caso 8: confiança nos degraus 9/10/29/30 leads",
  conf("Nano") === "baixa" && conf("Dez") === "media" && conf("VinteNove") === "media" && conf("Trinta") === "alta",
);

// 9) movimentos qualitativos: revisar/definir_meta/manter → delta 0 com assunção qualitativa
const quals = ["revisar", "definir_meta", "manter"].map((kind) => simulateMove({ kind, target: "Spin Mood" }, ctx7));
check(
  "caso 9: qualitativos zerados com assunção explicando",
  quals.every((q) =>
    q.weeklySpendDelta === 0 &&
    q.weeklyLeadsDelta.esperado === 0 && q.weeklyLeadsDelta.pessimista === 0 && q.weeklyLeadsDelta.otimista === 0 &&
    q.assumptions.some((a) => a.includes("qualitativo"))),
);

// 10) pausar alvo com CPL null (gasto sem leads): corta gasto, leads 0, confiança baixa
const p10 = simulateMove({ kind: "pausar", target: "Queimando" }, ctx7);
check(
  "caso 10: pausar sem leads — spendDelta -800, leads 0/0/0, confiança baixa",
  close(p10.weeklySpendDelta, -800) &&
  p10.weeklyLeadsDelta.esperado === 0 && p10.weeklyLeadsDelta.pessimista === 0 && p10.weeklyLeadsDelta.otimista === 0 &&
  p10.confidence === "baixa",
);

// 11) escalar sem amount → projeção zerada com assunção (nunca inventa número)
const p11 = simulateMove({ kind: "escalar", target: "Spin Mood" }, ctx7);
check(
  "caso 11: escalar sem amount — 0 com assunção, sem chute",
  p11.weeklySpendDelta === 0 && p11.weeklyLeadsDelta.esperado === 0 &&
  p11.assumptions.some((a) => a.includes("amount")),
);

// 12) realocar sem origem → perda 0 com assunção; ganho normal no destino
const p12 = simulateMove({ kind: "realocar", target: "Spin Mood", amount: 400 }, ctx7);
check(
  "caso 12: realocar sem from — esperado 6.4 (só ganho) e assunção sobre a origem",
  close(p12.weeklyLeadsDelta.esperado, 6.4) &&
  p12.assumptions.some((a) => a.includes("Origem")),
);

// 13) fallback de verba: pausar produto só presente no budget usa o gasto semanal da linha
const budget: BudgetLine[] = [{
  product: "Orfao", developer: null,
  weeklyBudget: 700, spent: 650, remaining: 50, pctUsed: 92.86,
  cac: null, targetCac: null, pacing: "estourando", verdict: "sem_dados",
  recommendation: "",
}];
const p13 = simulateMove({ kind: "pausar", target: "Orfao" }, { campaigns: campaigns7d, budget });
check(
  "caso 13: pausar via budget — spendDelta -650, leads 0 com assunção de falta de base",
  close(p13.weeklySpendDelta, -650) &&
  p13.weeklyLeadsDelta.esperado === 0 &&
  p13.confidence === "baixa" &&
  p13.assumptions.some((a) => a.toLowerCase().includes("sem base histórica")),
);

// 14) tipo desconhecido → zerado por precaução, confiança baixa
const p14 = simulateMove({ kind: "explodir", target: "Spin Mood" }, ctx7);
check(
  "caso 14: tipo desconhecido — 0/0/0 baixa com assunção",
  p14.weeklySpendDelta === 0 && p14.weeklyLeadsDelta.esperado === 0 && p14.confidence === "baixa" &&
  p14.assumptions.some((a) => a.includes("desconhecido")),
);

// 15) simulatePlan: totais somam exatamente as projeções
const plan = {
  moves: [
    { kind: "pausar", target: "Spin Mood" },
    { kind: "escalar", target: "Vertice", amount: 500 },
    { kind: "realocar", target: "Spin Mood", from: "Vertice", to: "Spin Mood", amount: 400 },
    { kind: "revisar", target: "Nano" },
  ],
};
const sim = simulatePlan(plan, ctx7);
const sum = (f: (p: (typeof sim.projections)[number]) => number) => r2(sim.projections.reduce((acc, p) => acc + f(p), 0));
check(
  "caso 15: totais do plano = soma das projeções (gasto e 3 faixas de leads)",
  sim.projections.length === 4 &&
  close(sim.totals.weeklySpendDelta, sum((p) => p.weeklySpendDelta)) &&
  close(sim.totals.weeklyLeadsDelta.pessimista, sum((p) => p.weeklyLeadsDelta.pessimista)) &&
  close(sim.totals.weeklyLeadsDelta.esperado, sum((p) => p.weeklyLeadsDelta.esperado)) &&
  close(sim.totals.weeklyLeadsDelta.otimista, sum((p) => p.weeklyLeadsDelta.otimista)),
);

// 16) invariante global: pessimista ≤ esperado ≤ otimista em TODA projeção (inclusive totais)
const all = [
  p1, p2, p3, p4, p5, p6, p10, p11, p12, p13, p14, ...quals, ...sim.projections,
].map((p) => p.weeklyLeadsDelta).concat([sim.totals.weeklyLeadsDelta]);
check(
  "caso 16: faixa pessimista ≤ esperado ≤ otimista sempre",
  all.every((d) => d.pessimista <= d.esperado + 1e-9 && d.esperado <= d.otimista + 1e-9),
);

// 17) determinismo: mesma entrada → mesma saída (serialização idêntica)
check(
  "caso 17: determinístico — duas execuções idênticas",
  JSON.stringify(simulatePlan(plan, ctx7)) === JSON.stringify(simulatePlan(plan, ctx7)),
);

// 18) horizon fixo de 1 semana e moveKind preservado em todas as projeções
check(
  "caso 18: horizon '1 semana' e moveKind ecoado",
  sim.projections.every((p) => p.horizon === "1 semana") &&
  sim.projections.map((p) => p.moveKind).join(",") === "pausar,escalar,realocar,revisar",
);

if (failures.length) {
  console.error(`REPROVADO: ${failures.length} caso(s) falharam (${passed} passaram):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK: ${passed} casos passaram (check-decision-simulator).`);
