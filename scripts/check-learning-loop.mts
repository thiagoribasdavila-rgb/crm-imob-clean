import { evaluateOutcome, trustByMoveKind, correctProjection, learningSummary, type ProjectionRecord, type RealizedRecord, type CalibrationOutcome } from "../lib/ai/learning-loop.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

const proj = (moveKind: string, esperado: number, pess: number, otim: number): ProjectionRecord =>
  ({ moveKind, target: "Camp", projected: { pessimista: pess, esperado, otimista: otim }, confidenceAtDecision: "media", decidedAtWeek: "2026-W29" });
const real = (moveKind: string, realized: number): RealizedRecord =>
  ({ moveKind, target: "Camp", realizedLeadsDelta: realized, realizedAtWeek: "2026-W30" });

// 1. dentro da faixa → calibrado
{
  const o = evaluateOutcome(proj("escalar", 20, 10, 30), real("escalar", 22));
  t("realizado na faixa → calibrado", o.verdict === "calibrado" && o.withinBand);
}
// 2. projetou mais do que veio → otimista_demais, errorPct positivo
{
  const o = evaluateOutcome(proj("escalar", 20, 15, 25), real("escalar", 10));
  t("otimista demais", o.verdict === "otimista_demais" && (o.errorPct ?? 0) > 0 && !o.withinBand);
}
// 3. veio mais do que projetou → pessimista_demais, errorPct negativo
{
  const o = evaluateOutcome(proj("escalar", 20, 15, 25), real("escalar", 40));
  t("pessimista demais", o.verdict === "pessimista_demais" && (o.errorPct ?? 0) < 0);
}
// 4. esperado 0 (qualitativo) mas houve efeito
{
  const o = evaluateOutcome(proj("revisar", 0, 0, 0), real("revisar", 8));
  t("esperado 0 + efeito → pessimista", o.verdict === "pessimista_demais" && o.errorPct === null);
  const o2 = evaluateOutcome(proj("manter", 0, 0, 0), real("manter", 0));
  t("esperado 0 + nada → sem_base", o2.verdict === "sem_base");
}
// 5. trust: poucas amostras → confiança baixa (honesto)
{
  const outs = [evaluateOutcome(proj("escalar", 20, 10, 30), real("escalar", 21))];
  const trust = trustByMoveKind(outs);
  t("1 amostra → confiança baixa", trust[0].recommendedConfidence === "baixa" && trust[0].samples === 1);
}
// 6. trust: muitas amostras calibradas → confiança alta, correção ~1
{
  const outs: CalibrationOutcome[] = Array.from({ length: 6 }, () => evaluateOutcome(proj("escalar", 20, 15, 25), real("escalar", 20)));
  const trust = trustByMoveKind(outs);
  t("6 amostras acerto 100% → alta", trust[0].recommendedConfidence === "alta" && trust[0].hitRate === 1);
  t("sem viés → correção 1", trust[0].correctionFactor === 1);
}
// 7. trust: viés otimista consistente → encolhe projeção futura
{
  // esperado 20, sempre vem 10 → bias +50%
  const outs: CalibrationOutcome[] = Array.from({ length: 5 }, () => evaluateOutcome(proj("escalar", 20, 18, 22), real("escalar", 10)));
  const trust = trustByMoveKind(outs);
  t("viés otimista → correctionFactor < 1", trust[0].correctionFactor < 1 && (trust[0].meanBiasPct ?? 0) > 0);
  const corrigido = correctProjection(20, trust[0]);
  t("correctProjection encolhe o esperado", corrigido < 20);
}
// 8. correctProjection não ajusta com base fraca (<4 amostras)
{
  const outs = [evaluateOutcome(proj("escalar", 20, 10, 30), real("escalar", 5))];
  const trust = trustByMoveKind(outs);
  t("base fraca → sem correção", correctProjection(20, trust[0]) === 20);
  t("sem trust → sem correção", correctProjection(20, undefined) === 20);
}
// 9. correção clampada (nunca zera nem explode)
{
  const outs: CalibrationOutcome[] = Array.from({ length: 5 }, () => evaluateOutcome(proj("escalar", 10, 9, 11), real("escalar", 1)));
  const trust = trustByMoveKind(outs); // bias +90%
  t("correção clampada em [0.5,1.5]", trust[0].correctionFactor >= 0.5 && trust[0].correctionFactor <= 1.5);
}
// 10. agrupa por moveKind
{
  const outs = [
    evaluateOutcome(proj("escalar", 20, 15, 25), real("escalar", 20)),
    evaluateOutcome(proj("pausar", -10, -12, -8), real("pausar", -10)),
  ];
  const trust = trustByMoveKind(outs);
  t("2 tipos → 2 grupos", trust.length === 2);
}
// 11. summary honesto
{
  t("summary vazio explica início", learningSummary([]).some((l) => l.includes("começa a aprender")));
  const outs: CalibrationOutcome[] = Array.from({ length: 5 }, () => evaluateOutcome(proj("escalar", 20, 10, 30), real("escalar", 10)));
  t("summary cita otimista", learningSummary(trustByMoveKind(outs)).some((l) => l.toLowerCase().includes("otimista")));
}

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
