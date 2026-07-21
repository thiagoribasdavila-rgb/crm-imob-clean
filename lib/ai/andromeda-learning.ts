/**
 * Andrômeda que aprende — fecha o loop do radar criativo: a IA PREVÊ fadiga
 * (andromeda-report) e PROPÕE rotação (creative-rotation), mas até aqui ninguém
 * verificava se ela ACERTOU. Este núcleo casa a previsão com o que aconteceu
 * depois e devolve precisão/recall dos sinais + um ajuste seguro do freqLimit,
 * além de medir se a rotação criativa melhora o CPL de verdade.
 *
 * Segue o estilo do learning-loop (projeção × realizado): determinístico e puro
 * — sem fetch, sem relógio, sem aleatório. A persistência (quem guarda previsão
 * e desfecho por semana) e o relógio ficam na rota; aqui só a matemática do
 * aprendizado. Honestidade antes de alarme: poucas amostras → confiança baixa e
 * nudge 0 (não se ajusta trilho com base fraca).
 */

// Trilho seguro do freqLimit (frequência semanal tolerável em público frio).
// O limiar recomendado nunca sai desta faixa, aconteça o que acontecer.
const FREQ_LIMIT_MIN = 1.5;
const FREQ_LIMIT_MAX = 6;
const DEFAULT_FREQ_LIMIT = 2.5; // mesmo default do andromeda-report

// Amostras mínimas para confiar em ajuste/veredito (abaixo disso: honesto).
const DEFAULT_MIN_SAMPLES_FATIGUE = 5;
const DEFAULT_MIN_SAMPLES_ROTATION = 3;

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Fadiga: a IA sinalizou → confirmou?
// ---------------------------------------------------------------------------

/** A fadiga que a IA sinalizou para um anúncio numa dada semana. */
export type FatiguePrediction = {
  adId: string;
  predictedAtWeek: string; // ISO week "YYYY-Www" em que o sinal foi emitido
  signals: string[]; // ex.: ["frequencia_alta", "ctr_caindo"]
};

/** O que aconteceu com o anúncio depois — realizado observado. */
export type FatigueOutcome = {
  adId: string;
  predictedFatigue: boolean; // a IA havia sinalizado fadiga?
  actualCtrDropped: boolean; // o CTR realmente caiu na janela seguinte?
  actualCpmRose: boolean; // o CPM realmente subiu?
  realizedAtWeek: string;
};

export type FatigueEval = {
  adId: string;
  hit: boolean;
  /** acertou = previsão bateu com a realidade (positivo OU negativo). */
  kind: "acertou" | "alarme_falso" | "perdeu";
};

/**
 * A fadiga prevista se confirmou? Fadiga real = CTR caiu OU CPM subiu (mesmo
 * critério do radar). A previsão conta como positiva se o outcome marca
 * predictedFatigue OU se a previsão trouxe algum sinal.
 *
 * - previu + aconteceu           → acertou (hit)
 * - previu + não aconteceu       → alarme_falso
 * - não previu + aconteceu       → perdeu
 * - não previu + não aconteceu   → acertou (verdadeiro negativo)
 */
export function evaluateFatiguePrediction(pred: FatiguePrediction, outcome: FatigueOutcome): FatigueEval {
  const predicted = outcome.predictedFatigue || pred.signals.length > 0;
  const actual = outcome.actualCtrDropped || outcome.actualCpmRose;
  const adId = pred.adId || outcome.adId;
  if (predicted === actual) return { adId, hit: true, kind: "acertou" };
  if (predicted && !actual) return { adId, hit: false, kind: "alarme_falso" };
  return { adId, hit: false, kind: "perdeu" };
}

export type FatigueAccuracy = {
  samples: number;
  /** dos sinais emitidos, quantos eram fadiga real (0-1). */
  precision: number;
  /** da fadiga real, quantos a IA pegou (0-1). */
  recall: number;
  /**
   * ajuste sugerido do freqLimit, já garantido dentro do trilho [1.5, 6]:
   * muitos alarmes falsos → sobe o limiar (menos sensível, nudge > 0);
   * fadiga real perdida → baixa o limiar (mais sensível, nudge < 0).
   */
  recommendedFreqLimitNudge: number;
};

/** Mantém o freqLimit resultante dentro do trilho seguro (ajusta o delta). */
function clampNudge(nudge: number, currentFreqLimit: number): number {
  const lo = FREQ_LIMIT_MIN - currentFreqLimit;
  const hi = FREQ_LIMIT_MAX - currentFreqLimit;
  return r2(Math.max(lo, Math.min(hi, nudge)));
}

/**
 * Precisão/recall dos sinais de fadiga + sugestão de nudge do freqLimit.
 * Poucas amostras (< minSamples) → nudge 0 (não se calibra trilho no escuro).
 * opts.currentFreqLimit permite ancorar o clamp no limiar em uso (default 2.5).
 */
export function fatigueAccuracy(
  outcomes: FatigueOutcome[],
  opts: { minSamples?: number; currentFreqLimit?: number; step?: number } = {},
): FatigueAccuracy {
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES_FATIGUE;
  const current = opts.currentFreqLimit ?? DEFAULT_FREQ_LIMIT;
  const step = opts.step ?? 0.5;

  let tp = 0, fp = 0, fn = 0; // tn não entra em precision/recall
  for (const o of outcomes) {
    const predicted = o.predictedFatigue;
    const actual = o.actualCtrDropped || o.actualCpmRose;
    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && actual) fn++;
  }
  const samples = outcomes.length;
  const precision = tp + fp > 0 ? r2(tp / (tp + fp)) : 0;
  const recall = tp + fn > 0 ? r2(tp / (tp + fn)) : 0;

  let nudge = 0;
  if (samples >= minSamples) {
    const falseAlarmRate = tp + fp > 0 ? fp / (tp + fp) : 0; // = 1 - precision
    const missRate = tp + fn > 0 ? fn / (tp + fn) : 0; // = 1 - recall
    // Erro dominante decide a direção; empate favorece subir o limiar (menos ruído).
    if (falseAlarmRate > 0.5 && falseAlarmRate >= missRate) nudge = step;
    else if (missRate > 0.5 && missRate > falseAlarmRate) nudge = -step;
    nudge = clampNudge(nudge, current);
  }

  return { samples, precision, recall, recommendedFreqLimitNudge: nudge };
}

// ---------------------------------------------------------------------------
// Rotação: o substituto bateu o criativo pausado?
// ---------------------------------------------------------------------------

/**
 * Desfecho de uma rotação proposta: CPL (custo por lead) do criativo pausado
 * vs. o do substituto na janela seguinte. null quando não há base (sem leads /
 * sem gasto conhecido) — não se inventa CPL.
 */
export type RotationOutcome = {
  campaignId: string;
  pausedAdCpl: number | null;
  replacementCpl: number | null;
  realizedAtWeek: string;
};

export type RotationEffectiveness = {
  samples: number; // só desfechos com os dois CPLs conhecidos e paused > 0
  /** fração de rotações em que o substituto ficou mais barato (0-1). */
  winRate: number;
  /** melhora média do CPL em % (>0 = ficou mais barato); null sem amostra. */
  avgCplImprovementPct: number | null;
  verdict: "rotacao_vale" | "rotacao_neutra" | "rotacao_piora";
};

/**
 * A rotação criativa melhora o CPL de verdade? Compara substituto × pausado.
 * Desfechos sem os dois CPLs (ou com paused <= 0) ficam FORA da conta — honesto.
 * Poucas amostras (< minSamples) → veredito neutro (confiança baixa).
 */
export function rotationEffectiveness(
  outcomes: RotationOutcome[],
  opts: { minSamples?: number } = {},
): RotationEffectiveness {
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES_ROTATION;

  const evaluable = outcomes.filter(
    (o) => o.pausedAdCpl != null && o.replacementCpl != null && (o.pausedAdCpl as number) > 0,
  );
  const samples = evaluable.length;
  if (samples === 0) {
    return { samples: 0, winRate: 0, avgCplImprovementPct: null, verdict: "rotacao_neutra" };
  }

  let wins = 0;
  let improvementSum = 0;
  for (const o of evaluable) {
    const paused = o.pausedAdCpl as number;
    const repl = o.replacementCpl as number;
    if (repl < paused) wins++;
    improvementSum += ((paused - repl) / paused) * 100;
  }
  const winRate = r2(wins / samples);
  const avgCplImprovementPct = r2(improvementSum / samples);

  let verdict: RotationEffectiveness["verdict"] = "rotacao_neutra";
  if (samples >= minSamples) {
    if (avgCplImprovementPct > 5 && winRate >= 0.5) verdict = "rotacao_vale";
    else if (avgCplImprovementPct < -5) verdict = "rotacao_piora";
  }

  return { samples, winRate, avgCplImprovementPct, verdict };
}

// ---------------------------------------------------------------------------
// Resumo executivo em PT
// ---------------------------------------------------------------------------

/** O que a Andrômeda aprendeu sobre si mesma — uma linha por eixo. */
export function andromedaLearningSummary(fa: FatigueAccuracy, re: RotationEffectiveness): string[] {
  const lines: string[] = [];

  if (fa.samples === 0) {
    lines.push("Fadiga: ainda sem desfechos — a Andrômeda começa a se avaliar na primeira janela pós-sinal.");
  } else {
    const p = Math.round(fa.precision * 100);
    const r = Math.round(fa.recall * 100);
    let nudgeMsg: string;
    if (fa.recommendedFreqLimitNudge > 0) nudgeMsg = `muitos alarmes falsos → sobe o freqLimit em ${fa.recommendedFreqLimitNudge}`;
    else if (fa.recommendedFreqLimitNudge < 0) nudgeMsg = `fadiga real escapando → baixa o freqLimit em ${Math.abs(fa.recommendedFreqLimitNudge)}`;
    else nudgeMsg = "freqLimit mantido (sem base para ajustar)";
    lines.push(`Fadiga: ${fa.samples} amostra(s), precisão ${p}%, recall ${r}% → ${nudgeMsg}.`);
  }

  if (re.samples === 0) {
    lines.push("Rotação: sem desfechos comparáveis (CPL de pausado e substituto) — nada a concluir ainda.");
  } else {
    const imp = re.avgCplImprovementPct;
    const impMsg = imp == null ? "sem melhora medível" : imp > 0 ? `CPL ${imp}% mais barato` : imp < 0 ? `CPL ${Math.abs(imp)}% mais caro` : "CPL estável";
    const verdictMsg =
      re.verdict === "rotacao_vale" ? "a rotação vale a pena" : re.verdict === "rotacao_piora" ? "a rotação está piorando o CPL" : "efeito neutro/inconclusivo";
    lines.push(`Rotação: ${re.samples} amostra(s), ${Math.round(re.winRate * 100)}% de vitórias, ${impMsg} → ${verdictMsg}.`);
  }

  return lines;
}
