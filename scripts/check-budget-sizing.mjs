/**
 * Teste adversarial do recomendador de tamanho de conjunto × verba
 * (lib/meta/marketing/budget-sizing.ts) + prova de que o registro de calibração
 * (lib/ai/calibration.ts) não quebrou ao ganhar o grupo "sizing".
 *
 * Standalone, sem framework: carrega o CÓDIGO REAL com o type-stripping nativo do
 * Node. Nenhum dos dois módulos tem import de valor relativo, então basta stripar
 * e importar por file URL.
 *
 * Cobertura (≥14): piso de aprendizado exato, verba insuficiente, consolidação
 * por verba e por teto de política, pode_dividir com folga, ok no equilíbrio,
 * fallback de CPL anotado, dailyBudget correto, clamp em maxAdSets, learningEvents
 * customizado, verba inválida, CPL inválido. E os casos de calibração provando os
 * trilhos/default/flatten/summary do grupo "sizing" sem regredir os existentes.
 *
 * Rodar da raiz: node scripts/check-budget-sizing.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "budget-sizing-"));

function emit(absTsPath, outName) {
  const src = stripTypeScriptTypes(fs.readFileSync(absTsPath, "utf8"));
  const out = path.join(tmp, outName);
  fs.writeFileSync(out, src, "utf8");
  return pathToFileURL(out).href;
}

const { recommendAdSetSizing } = await import(
  emit(path.join(root, "lib", "meta", "marketing", "budget-sizing.ts"), "budget-sizing.mjs")
);
const { DEFAULT_CALIBRATION, CALIBRATION_RAILS, flattenCalibration, calibrationSummary, mergeCalibration } =
  await import(emit(path.join(root, "lib", "ai", "calibration.ts"), "calibration.mjs"));

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

// ==========================================================================
// budget-sizing
// ==========================================================================

// Caso 1: piso de aprendizado EXATO — 400/8 = 50 conversões/semana.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 400, expectedCplBrl: 8 });
  check("caso 1: piso exato → verdict ok", s.verdict === "ok", s.verdict);
  check("caso 1: 1 conjunto recomendado", s.recommendedAdSets === 1, String(s.recommendedAdSets));
  check("caso 1: maxAdSetsThatLearn = 1", s.maxAdSetsThatLearn === 1, String(s.maxAdSetsThatLearn));
  check("caso 1: sai do aprendizado", s.exitsLearning === true);
  check("caso 1: minWeekly = 400", s.minWeeklyToExitLearningBrl === 400, String(s.minWeeklyToExitLearningBrl));
  check("caso 1: expectedConv = 50", s.expectedConversionsPerWeek === 50, String(s.expectedConversionsPerWeek));
}

// Caso 2: um centavo abaixo do piso — 399/8 = 49,875 < 50.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 399, expectedCplBrl: 8 });
  check("caso 2: abaixo do piso → verba_insuficiente", s.verdict === "verba_insuficiente", s.verdict);
  check("caso 2: força 1 conjunto", s.recommendedAdSets === 1);
  check("caso 2: nenhum conjunto aprende", s.maxAdSetsThatLearn === 0, String(s.maxAdSetsThatLearn));
  check("caso 2: não sai do aprendizado", s.exitsLearning === false);
  check(
    "caso 2: reasoning cita as ~50 do aprendizado",
    s.reasoning.some((l) => l.includes("50") && l.includes("aprendizado")),
    s.reasoning.join(" | "),
  );
}

// Caso 3: verba insuficiente COM fallback de CPL anotado (sem histórico).
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 200, expectedCplBrl: null });
  check("caso 3: 200/8=25 → verba_insuficiente", s.verdict === "verba_insuficiente", s.verdict);
  check(
    "caso 3: fallback CPL anotado em assumptions",
    s.assumptions.some((a) => a.includes("Sem CPL histórico") && a.includes("8")),
    s.assumptions.join(" | "),
  );
  check("caso 3: minWeekly = 400 (50×8)", s.minWeeklyToExitLearningBrl === 400, String(s.minWeeklyToExitLearningBrl));
}

// Caso 4: pode_dividir com folga — 2000/10 = 200 conv, sustenta 4, sem splits.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 2000, expectedCplBrl: 10 });
  check("caso 4: folga → pode_dividir", s.verdict === "pode_dividir", s.verdict);
  check("caso 4: recomenda 1 (consolida)", s.recommendedAdSets === 1, String(s.recommendedAdSets));
  check("caso 4: maxAdSetsThatLearn = 4", s.maxAdSetsThatLearn === 4, String(s.maxAdSetsThatLearn));
  check(
    "caso 4: reasoning cita preferência do Andromeda por broad",
    s.reasoning.some((l) => l.includes("Andromeda") && l.includes("broad")),
    s.reasoning.join(" | "),
  );
}

// Caso 5: consolidação por VERBA — pediram 3 públicos, verba sustenta 1.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 600, expectedCplBrl: 10, audienceSplits: 3 });
  check("caso 5: splits>suporte → consolidar", s.verdict === "consolidar", s.verdict);
  check("caso 5: cortou para 1", s.recommendedAdSets === 1, String(s.recommendedAdSets));
  check(
    "caso 5: reasoning explica o corte por verba",
    s.reasoning.some((l) => l.includes("3") && l.includes("sustenta")),
    s.reasoning.join(" | "),
  );
}

// Caso 6: consolidação por TETO de política — verba rica, pediram 5, teto 3.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 5000, expectedCplBrl: 10, audienceSplits: 5 });
  check("caso 6: acima do teto → consolidar", s.verdict === "consolidar", s.verdict);
  check("caso 6: cortou para o teto 3", s.recommendedAdSets === 3, String(s.recommendedAdSets));
  check("caso 6: maxAdSetsThatLearn = 10", s.maxAdSetsThatLearn === 10, String(s.maxAdSetsThatLearn));
  check(
    "caso 6: reasoning cita o teto de consolidação",
    s.reasoning.some((l) => l.includes("teto de consolidação") && l.includes("3")),
    s.reasoning.join(" | "),
  );
}

// Caso 7: ok no equilíbrio — 1500/10 = 150 conv, sustenta 3, pediram 3.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 1500, expectedCplBrl: 10, audienceSplits: 3 });
  check("caso 7: equilíbrio → ok", s.verdict === "ok", s.verdict);
  check("caso 7: recomenda 3", s.recommendedAdSets === 3, String(s.recommendedAdSets));
  check("caso 7: sai do aprendizado", s.exitsLearning === true);
  // dailyBudget = (1500/3)/7 = 71,4285... → 71.43
  check("caso 7: dailyBudget = 71.43", s.dailyBudgetPerAdSetBrl === 71.43, String(s.dailyBudgetPerAdSetBrl));
}

// Caso 8: dailyBudget correto num único conjunto — (2000/1)/7 = 285.71.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 2000, expectedCplBrl: 10 });
  check("caso 8: dailyBudget = 285.71", s.dailyBudgetPerAdSetBrl === 285.71, String(s.dailyBudgetPerAdSetBrl));
}

// Caso 9: clamp no maxAdSets customizado (opts.maxAdSets = 2).
{
  const s = recommendAdSetSizing(
    { weeklyBudgetBrl: 5000, expectedCplBrl: 10, audienceSplits: 5 },
    { maxAdSets: 2 },
  );
  check("caso 9: clamp em maxAdSets=2", s.recommendedAdSets === 2, String(s.recommendedAdSets));
  check("caso 9: continua consolidar", s.verdict === "consolidar", s.verdict);
}

// Caso 10: learningEventsPerWeek customizado muda o piso — 20 eventos.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 400, expectedCplBrl: 8 }, { learningEventsPerWeek: 20 });
  check("caso 10: minWeekly = 160 (20×8)", s.minWeeklyToExitLearningBrl === 160, String(s.minWeeklyToExitLearningBrl));
  check("caso 10: maxAdSetsThatLearn = 2", s.maxAdSetsThatLearn === 2, String(s.maxAdSetsThatLearn));
  check("caso 10: folga → pode_dividir", s.verdict === "pode_dividir", s.verdict);
}

// Caso 11: fallback de CPL customizado anotado (opts.fallbackCplBrl = 15).
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 1500, expectedCplBrl: null }, { fallbackCplBrl: 15 });
  check(
    "caso 11: fallback 15 anotado",
    s.assumptions.some((a) => a.includes("Sem CPL histórico") && a.includes("15")),
    s.assumptions.join(" | "),
  );
  check("caso 11: minWeekly = 750 (50×15)", s.minWeeklyToExitLearningBrl === 750, String(s.minWeeklyToExitLearningBrl));
}

// Caso 12: CPL histórico presente NÃO gera suposição de fallback.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 1000, expectedCplBrl: 10 });
  check("caso 12: sem suposição de fallback", s.assumptions.length === 0, s.assumptions.join(" | "));
}

// Caso 13: arredondamento honesto das conversões — 1000/7 = 142,857 → 143.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 1000, expectedCplBrl: 7 });
  check("caso 13: expectedConv = 143", s.expectedConversionsPerWeek === 143, String(s.expectedConversionsPerWeek));
  check("caso 13: maxAdSetsThatLearn = 2", s.maxAdSetsThatLearn === 2, String(s.maxAdSetsThatLearn));
}

// Caso 14: verba inválida (0) → insuficiente, dailyBudget 0, não sai do aprendizado.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 0, expectedCplBrl: 10 });
  check("caso 14: verba 0 → verba_insuficiente", s.verdict === "verba_insuficiente", s.verdict);
  check("caso 14: dailyBudget 0", s.dailyBudgetPerAdSetBrl === 0, String(s.dailyBudgetPerAdSetBrl));
  check("caso 14: não sai do aprendizado", s.exitsLearning === false);
  check("caso 14: 1 conjunto", s.recommendedAdSets === 1);
  check(
    "caso 14: reasoning aponta verba ausente",
    s.reasoning.some((l) => l.toLowerCase().includes("verba semanal")),
    s.reasoning.join(" | "),
  );
}

// Caso 15: verba negativa tratada como inválida.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: -100, expectedCplBrl: 10 });
  check("caso 15: verba negativa → verba_insuficiente", s.verdict === "verba_insuficiente", s.verdict);
  check("caso 15: dailyBudget 0", s.dailyBudgetPerAdSetBrl === 0);
}

// Caso 16: CPL inválido (0) cai no fallback e anota a suposição.
{
  const s = recommendAdSetSizing({ weeklyBudgetBrl: 1000, expectedCplBrl: 0 });
  check(
    "caso 16: CPL 0 → fallback anotado",
    s.assumptions.some((a) => a.includes("Sem CPL histórico") && a.includes("8")),
    s.assumptions.join(" | "),
  );
  check("caso 16: minWeekly = 400", s.minWeeklyToExitLearningBrl === 400, String(s.minWeeklyToExitLearningBrl));
}

// Caso 17: determinismo — mesma entrada, mesma saída.
{
  const a = recommendAdSetSizing({ weeklyBudgetBrl: 1234, expectedCplBrl: 9, audienceSplits: 2 });
  const b = recommendAdSetSizing({ weeklyBudgetBrl: 1234, expectedCplBrl: 9, audienceSplits: 2 });
  check("caso 17: determinístico", JSON.stringify(a) === JSON.stringify(b));
}

// ==========================================================================
// calibração — o grupo "sizing" entrou sem quebrar os existentes
// ==========================================================================

// Cal-1: default do grupo sizing.
{
  const z = DEFAULT_CALIBRATION.sizing;
  check(
    "cal 1: default sizing = {50,3,8}",
    z && z.learningEventsPerWeek === 50 && z.maxAdSets === 3 && z.fallbackCplBrl === 8,
    JSON.stringify(z),
  );
}

// Cal-2: trilhos do grupo sizing.
{
  const le = CALIBRATION_RAILS["sizing.learningEventsPerWeek"];
  const ms = CALIBRATION_RAILS["sizing.maxAdSets"];
  const fc = CALIBRATION_RAILS["sizing.fallbackCplBrl"];
  check("cal 2: trilho learningEventsPerWeek 20–100", le && le.min === 20 && le.max === 100, JSON.stringify(le));
  check("cal 2: trilho maxAdSets 1–10", ms && ms.min === 1 && ms.max === 10, JSON.stringify(ms));
  check("cal 2: trilho fallbackCplBrl 1–100", fc && fc.min === 1 && fc.max === 100, JSON.stringify(fc));
}

// Cal-3: flatten inclui as 3 chaves de sizing com os valores efetivos.
{
  const flat = flattenCalibration(DEFAULT_CALIBRATION);
  const byPath = Object.fromEntries(flat.map((f) => [f.path, f]));
  check("cal 3: flatten tem learningEventsPerWeek=50", byPath["sizing.learningEventsPerWeek"]?.value === 50);
  check("cal 3: flatten tem maxAdSets=3", byPath["sizing.maxAdSets"]?.value === 3);
  check("cal 3: flatten tem fallbackCplBrl=8", byPath["sizing.fallbackCplBrl"]?.value === 8);
  // flatten cobre TODOS os trilhos, nem mais nem menos.
  check(
    "cal 3: flatten cobre exatamente os trilhos",
    flat.length === Object.keys(CALIBRATION_RAILS).length,
    `${flat.length} vs ${Object.keys(CALIBRATION_RAILS).length}`,
  );
}

// Cal-4: summary ganhou a linha de dimensionamento sem perder as existentes.
{
  const sum = calibrationSummary(DEFAULT_CALIBRATION);
  check(
    "cal 4: summary tem linha de dimensionamento",
    sum.some((l) => l.includes("Dimensionamento") && l.includes("50") && l.includes("3")),
    sum.join(" || "),
  );
  check(
    "cal 4: summary preserva marketing e público",
    sum.some((l) => l.startsWith("Marketing:")) && sum.some((l) => l.includes("HOUSING")),
  );
}

// Cal-5: merge clampa fora do trilho e registra a rejeição.
{
  const { calibration, rejected } = mergeCalibration({ sizing: { learningEventsPerWeek: 200 } });
  check("cal 5: clamp para 100", calibration.sizing.learningEventsPerWeek === 100, String(calibration.sizing.learningEventsPerWeek));
  check(
    "cal 5: rejeição registrada",
    rejected.some((r) => r.path === "sizing.learningEventsPerWeek"),
    JSON.stringify(rejected),
  );
}

// Cal-6: merge de override válido aplica sem rejeição.
{
  const { calibration, rejected } = mergeCalibration({ sizing: { maxAdSets: 5, fallbackCplBrl: 12 } });
  check("cal 6: maxAdSets aplicado", calibration.sizing.maxAdSets === 5);
  check("cal 6: fallbackCplBrl aplicado", calibration.sizing.fallbackCplBrl === 12);
  check("cal 6: sem rejeições", rejected.length === 0, JSON.stringify(rejected));
}

// Cal-7: grupos pré-existentes intactos (não regrediu nada).
{
  const c = DEFAULT_CALIBRATION;
  check(
    "cal 7: marketing/audience/creative preservados",
    c.marketing.minSpendToJudgeBrl === 300 &&
      c.audience.ageMin === 18 &&
      c.audience.ageMax === 65 &&
      c.creative.maxVariants === 5 &&
      c.briefing.maxDecisions === 6,
  );
  // trilho travado de política continua travado.
  check("cal 7: audience.ageMin ainda travado", CALIBRATION_RAILS["audience.ageMin"].locked === true);
}

// ==========================================================================
console.log(`check-budget-sizing: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
