/**
 * Checagem adversarial da Andrômeda que aprende (lib/ai/andromeda-learning).
 *
 * Verifica: acerto / alarme falso / perdeu / verdadeiro negativo; precisão e
 * recall; nudge do freqLimit na direção certa e SEMPRE dentro do trilho [1.5,6];
 * rotação vale / piora / neutra; exclusão honesta de CPL ausente; resumo PT.
 */

import {
  evaluateFatiguePrediction,
  fatigueAccuracy,
  rotationEffectiveness,
  andromedaLearningSummary,
  type FatiguePrediction,
  type FatigueOutcome,
  type RotationOutcome,
} from "../lib/ai/andromeda-learning.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

const pred = (adId: string, signals: string[]): FatiguePrediction => ({ adId, predictedAtWeek: "2026-W29", signals });
const outc = (adId: string, predicted: boolean, ctrDrop: boolean, cpmRose: boolean): FatigueOutcome =>
  ({ adId, predictedFatigue: predicted, actualCtrDropped: ctrDrop, actualCpmRose: cpmRose, realizedAtWeek: "2026-W30" });
const rot = (campaignId: string, paused: number | null, repl: number | null): RotationOutcome =>
  ({ campaignId, pausedAdCpl: paused, replacementCpl: repl, realizedAtWeek: "2026-W30" });

// 1. previu + aconteceu (CTR caiu) → acertou
{
  const e = evaluateFatiguePrediction(pred("a1", ["ctr_caindo"]), outc("a1", true, true, false));
  t("previu + aconteceu → acertou", e.kind === "acertou" && e.hit && e.adId === "a1");
}
// 2. previu + não aconteceu → alarme_falso
{
  const e = evaluateFatiguePrediction(pred("a2", ["frequencia_alta"]), outc("a2", true, false, false));
  t("previu + nada → alarme_falso", e.kind === "alarme_falso" && !e.hit);
}
// 3. não previu + aconteceu → perdeu
{
  const e = evaluateFatiguePrediction(pred("a3", []), outc("a3", false, false, true));
  t("não previu + CPM subiu → perdeu", e.kind === "perdeu" && !e.hit);
}
// 4. verdadeiro negativo → acertou (hit)
{
  const e = evaluateFatiguePrediction(pred("a4", []), outc("a4", false, false, false));
  t("não previu + nada → acertou (VN)", e.kind === "acertou" && e.hit);
}
// 5. sinais na previsão contam mesmo com predictedFatigue=false no outcome
{
  const e = evaluateFatiguePrediction(pred("a5", ["cpm_subindo"]), outc("a5", false, true, false));
  t("signals[] força previsto → acertou", e.kind === "acertou" && e.hit);
}
// 6. precision: 2 previstos, 1 real → 0.5
{
  const outs = [outc("x", true, true, false), outc("y", true, false, false)];
  const fa = fatigueAccuracy(outs);
  t("precision 0.5", fa.precision === 0.5, `precision=${fa.precision}`);
}
// 7. recall: 2 reais, 1 pego → 0.5
{
  const outs = [outc("x", true, true, false), outc("y", false, true, false)];
  const fa = fatigueAccuracy(outs);
  t("recall 0.5", fa.recall === 0.5, `recall=${fa.recall}`);
}
// 8. vazio → tudo 0 e nudge 0 (honesto)
{
  const fa = fatigueAccuracy([]);
  t("vazio → 0/0/0 nudge 0", fa.samples === 0 && fa.precision === 0 && fa.recall === 0 && fa.recommendedFreqLimitNudge === 0);
}
// 9. poucas amostras (mesmo ruins) → nudge 0
{
  const outs = [outc("x", true, false, false), outc("y", true, false, false)]; // 2 alarmes falsos
  const fa = fatigueAccuracy(outs);
  t("base fraca → nudge 0", fa.recommendedFreqLimitNudge === 0 && fa.precision === 0);
}
// 10. muitos alarmes falsos (>=5) → nudge POSITIVO (sobe o limiar)
{
  const outs = [
    outc("x", true, false, false), outc("y", true, false, false), outc("z", true, false, false),
    outc("w", true, false, false), outc("v", true, true, false), // 4 falsos, 1 certo
  ];
  const fa = fatigueAccuracy(outs);
  t("alarmes falsos → nudge > 0", fa.recommendedFreqLimitNudge > 0, `nudge=${fa.recommendedFreqLimitNudge}`);
}
// 11. muita fadiga perdida (>=5) → nudge NEGATIVO (baixa o limiar)
{
  const outs = [
    outc("x", false, true, false), outc("y", false, true, false), outc("z", false, false, true),
    outc("w", false, true, false), outc("v", true, true, false), // 4 perdidos, 1 certo
  ];
  const fa = fatigueAccuracy(outs);
  t("fadiga perdida → nudge < 0", fa.recommendedFreqLimitNudge < 0, `nudge=${fa.recommendedFreqLimitNudge}`);
}
// 12. nudge SEMPRE dentro do trilho: limiar já no piso, quer baixar → clampa a 0
{
  const outs = [
    outc("x", false, true, false), outc("y", false, true, false), outc("z", false, true, false),
    outc("w", false, true, false), outc("v", false, true, false), // tudo perdido
  ];
  const fa = fatigueAccuracy(outs, { currentFreqLimit: 1.5 });
  const resulting = 1.5 + fa.recommendedFreqLimitNudge;
  t("clamp no piso 1.5 → nudge não desce", fa.recommendedFreqLimitNudge === 0 && resulting >= 1.5, `nudge=${fa.recommendedFreqLimitNudge}`);
}
// 13. nudge dentro do trilho: limiar no teto, quer subir → clampa a 0
{
  const outs = [
    outc("x", true, false, false), outc("y", true, false, false), outc("z", true, false, false),
    outc("w", true, false, false), outc("v", true, false, false), // tudo falso
  ];
  const fa = fatigueAccuracy(outs, { currentFreqLimit: 6 });
  const resulting = 6 + fa.recommendedFreqLimitNudge;
  t("clamp no teto 6 → nudge não sobe", resulting <= 6 && resulting >= 1.5, `resulting=${resulting}`);
}
// 14. rotação vale: substituto mais barato em quase todas (>= minSamples)
{
  const outs = [rot("c1", 100, 60), rot("c2", 100, 70), rot("c3", 100, 80)];
  const re = rotationEffectiveness(outs);
  t("rotação vale", re.verdict === "rotacao_vale" && re.winRate === 1 && (re.avgCplImprovementPct ?? 0) > 5);
}
// 15. rotação piora: substituto mais caro
{
  const outs = [rot("c1", 60, 100), rot("c2", 70, 110), rot("c3", 80, 120)];
  const re = rotationEffectiveness(outs);
  t("rotação piora", re.verdict === "rotacao_piora" && (re.avgCplImprovementPct ?? 0) < 0);
}
// 16. poucas amostras → neutra (honesto) mesmo com melhora
{
  const re = rotationEffectiveness([rot("c1", 100, 50)]);
  t("1 amostra ótima → neutra", re.verdict === "rotacao_neutra" && re.samples === 1);
}
// 17. CPL ausente é excluído da conta (honestidade)
{
  const outs = [rot("c1", null, 50), rot("c2", 100, null), rot("c3", 0, 50), rot("c4", 100, 60)];
  const re = rotationEffectiveness(outs);
  t("só 1 desfecho contável", re.samples === 1, `samples=${re.samples}`);
}
// 18. sem amostra contável → avgCplImprovementPct null
{
  const re = rotationEffectiveness([rot("c1", null, null)]);
  t("sem base → improvement null e neutra", re.avgCplImprovementPct === null && re.verdict === "rotacao_neutra" && re.samples === 0);
}
// 19. resumo PT: vazio é honesto nos dois eixos
{
  const lines = andromedaLearningSummary(fatigueAccuracy([]), rotationEffectiveness([]));
  t("resumo vazio honesto", lines.length === 2 && lines[0].includes("Fadiga") && lines[1].includes("Rotação") && lines.some((l) => l.includes("ainda")));
}
// 20. resumo PT cita veredito da rotação e nudge
{
  const fa = fatigueAccuracy([
    outc("x", true, false, false), outc("y", true, false, false), outc("z", true, false, false),
    outc("w", true, false, false), outc("v", true, true, false),
  ]);
  const re = rotationEffectiveness([rot("c1", 100, 60), rot("c2", 100, 70), rot("c3", 100, 80)]);
  const lines = andromedaLearningSummary(fa, re);
  t("resumo cita nudge e veredito", lines[0].includes("freqLimit") && lines[1].includes("vale a pena"));
}
// 21. avgCplImprovementPct calculado corretamente (100→50 = +50%)
{
  const re = rotationEffectiveness([rot("c1", 100, 50), rot("c2", 100, 50), rot("c3", 100, 50)]);
  t("melhora média = 50%", re.avgCplImprovementPct === 50, `imp=${re.avgCplImprovementPct}`);
}

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
