/**
 * Teste adversarial da análise preditiva do Meta
 * (lib/meta/marketing/forecast.ts) + prova de que a calibração central
 * (lib/ai/calibration.ts) não quebrou ao ganhar o grupo "forecast".
 *
 * Standalone, sem framework: carrega o CÓDIGO REAL com o type-stripping nativo do
 * Node (nenhum dos módulos tem import de valor relativo, então basta stripar e
 * importar por file URL).
 *
 * Cobertura (≥14): pace nos 3 sentidos, tendência a partir do zero, sem histórico
 * → projeção 0 honesta, CPL null sem leads, confiança por semanas/volume, burn
 * projetando certo por dia da semana (abaixo/no_ritmo/vai_estourar/estourando +
 * verba ausente + clamp de dia), ETA de aprendizado (sai/não sai/sem conversão),
 * anomalia detectada e NÃO detectada + limiares calibráveis. E os casos de
 * calibração provando trilhos/default/flatten/summary/merge do grupo "forecast"
 * sem regredir os existentes.
 *
 * Rodar da raiz: node scripts/check-meta-forecast.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "meta-forecast-"));

function emit(absTsPath, outName) {
  const src = stripTypeScriptTypes(fs.readFileSync(absTsPath, "utf8"));
  const out = path.join(tmp, outName);
  fs.writeFileSync(out, src, "utf8");
  return pathToFileURL(out).href;
}

const { forecastCampaign, budgetBurnForecast, learningPhaseEta, anomalyForecast } = await import(
  emit(path.join(root, "lib", "meta", "marketing", "forecast.ts"), "forecast.mjs")
);
const { DEFAULT_CALIBRATION, CALIBRATION_RAILS, flattenCalibration, calibrationSummary, mergeCalibration } =
  await import(emit(path.join(root, "lib", "ai", "calibration.ts"), "calibration.mjs"));

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

// helper p/ montar semanas
const wk = (weekStart, spend, leads) => ({ weekStart, spend, leads });

// ==========================================================================
// forecastCampaign
// ==========================================================================

// Caso 1: pace ACELERANDO — leads saltam na última semana.
{
  const f = forecastCampaign([
    wk("2026-W01", 100, 10),
    wk("2026-W02", 100, 10),
    wk("2026-W03", 100, 10),
    wk("2026-W04", 100, 20),
  ]);
  check("caso 1: pace acelerando", f.pace === "acelerando", f.pace);
  check("caso 1: trendPct = 100", f.trendPct === 100, String(f.trendPct));
  check("caso 1: esperado = 20 (regressão)", f.projectedWeeklyLeads.esperado === 20, String(f.projectedWeeklyLeads.esperado));
  check("caso 1: confiança alta (4 semanas, 50 leads)", f.confidence === "alta", f.confidence);
  check("caso 1: projectedCpl = 5 (100/20)", f.projectedCpl === 5, String(f.projectedCpl));
  check("caso 1: pessimista ≥ 0", f.projectedWeeklyLeads.pessimista >= 0, String(f.projectedWeeklyLeads.pessimista));
  check("caso 1: otimista ≥ esperado", f.projectedWeeklyLeads.otimista >= f.projectedWeeklyLeads.esperado);
}

// Caso 2: pace DESACELERANDO — leads despencam na última semana.
{
  const f = forecastCampaign([
    wk("2026-W01", 100, 20),
    wk("2026-W02", 100, 20),
    wk("2026-W03", 100, 20),
    wk("2026-W04", 100, 10),
  ]);
  check("caso 2: pace desacelerando", f.pace === "desacelerando", f.pace);
  check("caso 2: trendPct = -50", f.trendPct === -50, String(f.trendPct));
  check("caso 2: esperado = 10 (regressão)", f.projectedWeeklyLeads.esperado === 10, String(f.projectedWeeklyLeads.esperado));
}

// Caso 3: pace ESTÁVEL — leads planos.
{
  const f = forecastCampaign([
    wk("2026-W01", 100, 10),
    wk("2026-W02", 100, 10),
    wk("2026-W03", 100, 10),
    wk("2026-W04", 100, 10),
  ]);
  check("caso 3: pace estavel", f.pace === "estavel", f.pace);
  check("caso 3: trendPct = 0", f.trendPct === 0, String(f.trendPct));
  check("caso 3: esperado = 10", f.projectedWeeklyLeads.esperado === 10, String(f.projectedWeeklyLeads.esperado));
}

// Caso 4: SEM HISTÓRICO → projeção 0 honesta (nunca chute).
{
  const f = forecastCampaign([]);
  check("caso 4: esperado 0", f.projectedWeeklyLeads.esperado === 0);
  check("caso 4: pessimista/otimista 0", f.projectedWeeklyLeads.pessimista === 0 && f.projectedWeeklyLeads.otimista === 0);
  check("caso 4: cpl null", f.projectedCpl === null);
  check("caso 4: pace estavel, trend 0", f.pace === "estavel" && f.trendPct === 0);
  check("caso 4: confiança baixa", f.confidence === "baixa");
  check(
    "caso 4: assumption cita sem histórico",
    f.assumptions.some((a) => a.toLowerCase().includes("sem histórico")),
    f.assumptions.join(" | "),
  );
}

// Caso 5: UMA semana só — confiança baixa, projeta o próprio ponto, sem tendência.
{
  const f = forecastCampaign([wk("2026-W01", 75, 15)]);
  check("caso 5: confiança baixa (1 semana)", f.confidence === "baixa", f.confidence);
  check("caso 5: esperado = 15", f.projectedWeeklyLeads.esperado === 15, String(f.projectedWeeklyLeads.esperado));
  check("caso 5: trendPct 0 (sem base)", f.trendPct === 0);
  check("caso 5: pace estavel", f.pace === "estavel");
  check("caso 5: cpl = 5 (75/15)", f.projectedCpl === 5, String(f.projectedCpl));
  check(
    "caso 5: assumption alerta poucas semanas",
    f.assumptions.some((a) => a.includes("Menos de")),
    f.assumptions.join(" | "),
  );
}

// Caso 6: tendência a partir do ZERO — cresceu de base nula, anota crescimento.
{
  const f = forecastCampaign([wk("2026-W01", 50, 0), wk("2026-W02", 50, 0), wk("2026-W03", 50, 5)]);
  check("caso 6: trendPct = 100 (saiu do zero)", f.trendPct === 100, String(f.trendPct));
  check("caso 6: pace acelerando", f.pace === "acelerando", f.pace);
}

// Caso 7: projeta 0 leads → CPL não estimável (null), sem inventar.
{
  const f = forecastCampaign([wk("2026-W01", 50, 0), wk("2026-W02", 50, 0), wk("2026-W03", 50, 0)]);
  check("caso 7: esperado 0", f.projectedWeeklyLeads.esperado === 0, String(f.projectedWeeklyLeads.esperado));
  check("caso 7: cpl null", f.projectedCpl === null, String(f.projectedCpl));
  check("caso 7: confiança baixa (0 leads)", f.confidence === "baixa", f.confidence);
  check(
    "caso 7: assumption diz CPL não estimável",
    f.assumptions.some((a) => a.toLowerCase().includes("não estimável") || a.includes("não inventamos")),
    f.assumptions.join(" | "),
  );
}

// Caso 8: confiança MEDIA — 2 semanas, volume baixo (< 30), abaixo de minWeeks.
{
  const f = forecastCampaign([wk("2026-W01", 100, 10), wk("2026-W02", 100, 10)]);
  check("caso 8: confiança media", f.confidence === "media", f.confidence);
}

// Caso 9: determinismo — mesma entrada, mesma saída.
{
  const inp = [wk("2026-W01", 120, 12), wk("2026-W02", 130, 9), wk("2026-W03", 140, 7)];
  const a = forecastCampaign(inp);
  const b = forecastCampaign(inp);
  check("caso 9: determinístico", JSON.stringify(a) === JSON.stringify(b));
}

// Caso 10: ordena por weekStart mesmo fora de ordem (última semana = a maior).
{
  const f = forecastCampaign([wk("2026-W04", 100, 20), wk("2026-W01", 100, 10), wk("2026-W03", 100, 10), wk("2026-W02", 100, 10)]);
  check("caso 10: reordena → pace acelerando", f.pace === "acelerando", f.pace);
  check("caso 10: trendPct = 100 após ordenar", f.trendPct === 100, String(f.trendPct));
}

// ==========================================================================
// budgetBurnForecast (dayOfWeek 1-7 vem do chamador — não usa Date)
// ==========================================================================

// Caso 11: no ritmo — 300 no dia 3 → projeta exatamente a verba.
{
  const b = budgetBurnForecast(700, 300, 3);
  check("caso 11: projeta 700", b.projectedWeekSpend === 700, String(b.projectedWeekSpend));
  check("caso 11: pacing no_ritmo", b.pacing === "no_ritmo", b.pacing);
}

// Caso 12: vai estourar — 400 no dia 3 → projeta acima da verba.
{
  const b = budgetBurnForecast(700, 400, 3);
  check("caso 12: projeta 933.33", b.projectedWeekSpend === 933.33, String(b.projectedWeekSpend));
  check("caso 12: pacing vai_estourar", b.pacing === "vai_estourar", b.pacing);
}

// Caso 13: abaixo — 100 no dia 3 → folga.
{
  const b = budgetBurnForecast(700, 100, 3);
  check("caso 13: projeta 233.33", b.projectedWeekSpend === 233.33, String(b.projectedWeekSpend));
  check("caso 13: pacing abaixo", b.pacing === "abaixo", b.pacing);
}

// Caso 14: estourando — gasto atual JÁ passou da verba (fato, não previsão).
{
  const b = budgetBurnForecast(700, 800, 6);
  check("caso 14: pacing estourando", b.pacing === "estourando", b.pacing);
  check("caso 14: projeta 933.33", b.projectedWeekSpend === 933.33, String(b.projectedWeekSpend));
}

// Caso 15: verba ausente (0) com gasto → alerta honesto sem régua.
{
  const b = budgetBurnForecast(0, 100, 2);
  check("caso 15: pacing estourando (sem verba)", b.pacing === "estourando", b.pacing);
  check("caso 15: projeta 350", b.projectedWeekSpend === 350, String(b.projectedWeekSpend));
  check(
    "caso 15: recomendação pede definir verba",
    b.recommendation.toLowerCase().includes("verba"),
    b.recommendation,
  );
}

// Caso 16: dia fora da faixa (0) faz clamp para 1 — não usa relógio, não quebra.
{
  const b = budgetBurnForecast(700, 100, 0);
  check("caso 16: clamp dia → projeta 700", b.projectedWeekSpend === 700, String(b.projectedWeekSpend));
  check("caso 16: pacing no_ritmo", b.pacing === "no_ritmo", b.pacing);
}

// ==========================================================================
// learningPhaseEta
// ==========================================================================

// Caso 17: sai do aprendizado — ritmo acima do piso.
{
  const e = learningPhaseEta(60, 50);
  check("caso 17: willExit true", e.willExit === true);
  check("caso 17: etaWeeks 1", e.etaWeeks === 1, String(e.etaWeeks));
}

// Caso 18: NÃO sai — ritmo abaixo do piso (aprendizado limitado).
{
  const e = learningPhaseEta(30, 50);
  check("caso 18: willExit false", e.willExit === false);
  check("caso 18: eta null", e.etaWeeks === null, String(e.etaWeeks));
  check("caso 18: nota cita aprendizado limitado", e.note.toLowerCase().includes("limitado"), e.note);
}

// Caso 19: sem conversões — não sai, nota honesta.
{
  const e = learningPhaseEta(0, 50);
  check("caso 19: willExit false", e.willExit === false);
  check("caso 19: eta null", e.etaWeeks === null);
  check("caso 19: nota cita sem conversões", e.note.toLowerCase().includes("sem conversões"), e.note);
}

// Caso 20: piso exatamente atingido → sai.
{
  const e = learningPhaseEta(50, 50);
  check("caso 20: piso exato → willExit true", e.willExit === true);
  check("caso 20: etaWeeks 1", e.etaWeeks === 1, String(e.etaWeeks));
}

// Caso 21: piso inválido cai no fallback ~50.
{
  const e = learningPhaseEta(100, 0);
  check("caso 21: fallback piso → willExit true", e.willExit === true);
  check("caso 21: etaWeeks 1", e.etaWeeks === 1, String(e.etaWeeks));
}

// ==========================================================================
// anomalyForecast
// ==========================================================================

// Caso 22: DETECTADA — gasto subindo e leads caindo 3 semanas.
{
  const alerts = anomalyForecast([
    wk("2026-W01", 100, 20),
    wk("2026-W02", 120, 15),
    wk("2026-W03", 140, 10),
  ]);
  check(
    "caso 22: alerta de gasto↑ leads↓",
    alerts.some((a) => a.includes("Gasto subindo e leads caindo")),
    alerts.join(" | "),
  );
}

// Caso 23: NÃO detectada — série saudável devolve [].
{
  const alerts = anomalyForecast([
    wk("2026-W01", 100, 20),
    wk("2026-W02", 100, 22),
    wk("2026-W03", 100, 21),
  ]);
  check("caso 23: série saudável → sem alertas", alerts.length === 0, alerts.join(" | "));
}

// Caso 24: última semana gastou sem lead nenhum.
{
  const alerts = anomalyForecast([wk("2026-W01", 100, 10), wk("2026-W02", 100, 0)]);
  check(
    "caso 24: alerta de gasto sem lead",
    alerts.some((a) => a.includes("sem nenhum lead")),
    alerts.join(" | "),
  );
}

// Caso 25: queda de leads calibrável — limiar padrão dispara, limiar 50% não.
{
  const weeks = [wk("2026-W01", 100, 20), wk("2026-W02", 100, 15)]; // queda de 25%
  const dflt = anomalyForecast(weeks);
  const strict = anomalyForecast(weeks, { anomalyLeadDropPct: 50 });
  check(
    "caso 25: 25% dispara no limiar padrão (20%)",
    dflt.some((a) => a.includes("Leads caíram")),
    dflt.join(" | "),
  );
  check(
    "caso 25: 25% NÃO dispara no limiar 50%",
    !strict.some((a) => a.includes("Leads caíram")),
    strict.join(" | "),
  );
}

// Caso 26: minWeeksForTrend calibra o gatilho de gasto↑ leads↓.
{
  const weeks = [wk("2026-W01", 100, 20), wk("2026-W02", 120, 10)]; // só 2 semanas
  const dflt = anomalyForecast(weeks); // minWeeks 3 → precisa de 3 semanas → não dispara
  const loose = anomalyForecast(weeks, { minWeeksForTrend: 2 }); // 2 semanas basta
  check(
    "caso 26: padrão (3 semanas) não dispara com 2 semanas",
    !dflt.some((a) => a.includes("Gasto subindo e leads caindo")),
    dflt.join(" | "),
  );
  check(
    "caso 26: minWeeksForTrend=2 dispara",
    loose.some((a) => a.includes("Gasto subindo e leads caindo")),
    loose.join(" | "),
  );
}

// ==========================================================================
// calibração — grupo "forecast" entrou sem quebrar os existentes
// ==========================================================================

// Cal-1: default do grupo forecast.
{
  const z = DEFAULT_CALIBRATION.forecast;
  check(
    "cal 1: default forecast = {3,20}",
    z && z.minWeeksForTrend === 3 && z.anomalyLeadDropPct === 20,
    JSON.stringify(z),
  );
}

// Cal-2: trilhos do grupo forecast.
{
  const mw = CALIBRATION_RAILS["forecast.minWeeksForTrend"];
  const ad = CALIBRATION_RAILS["forecast.anomalyLeadDropPct"];
  check("cal 2: trilho minWeeksForTrend 2–8", mw && mw.min === 2 && mw.max === 8, JSON.stringify(mw));
  check("cal 2: trilho anomalyLeadDropPct 5–60", ad && ad.min === 5 && ad.max === 60, JSON.stringify(ad));
}

// Cal-3: flatten inclui as chaves de forecast e cobre exatamente os trilhos.
{
  const flat = flattenCalibration(DEFAULT_CALIBRATION);
  const byPath = Object.fromEntries(flat.map((f) => [f.path, f]));
  check("cal 3: flatten tem minWeeksForTrend=3", byPath["forecast.minWeeksForTrend"]?.value === 3);
  check("cal 3: flatten tem anomalyLeadDropPct=20", byPath["forecast.anomalyLeadDropPct"]?.value === 20);
  check(
    "cal 3: flatten cobre exatamente os trilhos",
    flat.length === Object.keys(CALIBRATION_RAILS).length,
    `${flat.length} vs ${Object.keys(CALIBRATION_RAILS).length}`,
  );
}

// Cal-4: summary ganhou a linha de previsão sem perder as existentes.
{
  const sum = calibrationSummary(DEFAULT_CALIBRATION);
  check(
    "cal 4: summary tem linha de previsão",
    sum.some((l) => l.startsWith("Previsão:") && l.includes("3") && l.includes("20")),
    sum.join(" || "),
  );
  check(
    "cal 4: summary preserva dimensionamento e público",
    sum.some((l) => l.startsWith("Dimensionamento:")) && sum.some((l) => l.includes("HOUSING")),
  );
}

// Cal-5: merge clampa fora do trilho e registra a rejeição.
{
  const { calibration, rejected } = mergeCalibration({ forecast: { anomalyLeadDropPct: 200 } });
  check("cal 5: clamp para 60", calibration.forecast.anomalyLeadDropPct === 60, String(calibration.forecast.anomalyLeadDropPct));
  check(
    "cal 5: rejeição registrada",
    rejected.some((r) => r.path === "forecast.anomalyLeadDropPct"),
    JSON.stringify(rejected),
  );
}

// Cal-6: merge de override válido aplica sem rejeição.
{
  const { calibration, rejected } = mergeCalibration({ forecast: { minWeeksForTrend: 4 } });
  check("cal 6: minWeeksForTrend aplicado", calibration.forecast.minWeeksForTrend === 4);
  check("cal 6: sem rejeições", rejected.length === 0, JSON.stringify(rejected));
}

// Cal-7: grupos pré-existentes intactos (não regrediu nada).
{
  const c = DEFAULT_CALIBRATION;
  check(
    "cal 7: sizing/marketing/audience preservados",
    c.sizing.learningEventsPerWeek === 50 &&
      c.marketing.minSpendToJudgeBrl === 300 &&
      c.audience.ageMin === 18 &&
      c.audience.ageMax === 65,
  );
  check("cal 7: audience.ageMin ainda travado", CALIBRATION_RAILS["audience.ageMin"].locked === true);
}

// ==========================================================================
console.log(`check-meta-forecast: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
