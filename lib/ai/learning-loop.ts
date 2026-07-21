/**
 * Loop de aprendizado — fecha o organismo: a IA projeta, o mundo realiza, e a
 * diferença calibra a confiança da próxima projeção.
 *
 * Hoje o simulador (decision-simulator) diz "+X leads/sem" e ninguém compara
 * com o que aconteceu de fato. Este núcleo puro registra a PROJEÇÃO no momento
 * da decisão e, uma semana depois, casa com o REALIZADO — produzindo o erro de
 * calibração por tipo de movimento. Esse erro vira o ajuste que torna a IA
 * honesta ao longo do tempo (projeção que erra para mais perde confiança).
 *
 * Determinístico e puro: a persistência (tabela ai_projection_ledger) e o
 * relógio ficam na rota; aqui só a matemática do aprendizado.
 */

export type ProjectionRecord = {
  moveKind: string;
  target: string;
  /** Faixa projetada de leads/semana no momento da decisão. */
  projected: { pessimista: number; esperado: number; otimista: number };
  confidenceAtDecision: "baixa" | "media" | "alta";
  decidedAtWeek: string; // ISO week "YYYY-Www" da decisão
};

export type RealizedRecord = {
  moveKind: string;
  target: string;
  realizedLeadsDelta: number; // leads/semana observados após o movimento
  realizedAtWeek: string;
};

export type CalibrationOutcome = {
  moveKind: string;
  target: string;
  projectedEsperado: number;
  realized: number;
  /** erro assinado: >0 = a IA projetou MAIS do que veio (otimista demais). */
  errorPct: number | null;
  /** o realizado caiu dentro da faixa projetada? (calibração honesta) */
  withinBand: boolean;
  verdict: "otimista_demais" | "pessimista_demais" | "calibrado" | "sem_base";
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Casa uma projeção com o realizado da mesma chave (movimento+alvo). */
export function evaluateOutcome(proj: ProjectionRecord, real: RealizedRecord): CalibrationOutcome {
  const esperado = proj.projected.esperado;
  const realized = real.realizedLeadsDelta;
  const withinBand = realized >= proj.projected.pessimista && realized <= proj.projected.otimista;
  let errorPct: number | null = null;
  let verdict: CalibrationOutcome["verdict"] = "sem_base";
  if (esperado !== 0) {
    errorPct = r2(((esperado - realized) / Math.abs(esperado)) * 100);
    if (withinBand) verdict = "calibrado";
    else if (esperado > realized) verdict = "otimista_demais";
    else verdict = "pessimista_demais";
  } else if (realized !== 0) {
    // projetou zero (qualitativo) mas houve efeito — base fraca, não calibrado
    verdict = realized > 0 ? "pessimista_demais" : "otimista_demais";
  }
  return { moveKind: proj.moveKind, target: proj.target, projectedEsperado: esperado, realized, errorPct, withinBand, verdict };
}

export type CalibrationTrust = {
  moveKind: string;
  samples: number;
  /** viés médio: >0 = tende a projetar mais do que vem (otimista). */
  meanBiasPct: number | null;
  /** taxa de acerto dentro da faixa (0-1). */
  hitRate: number;
  /** confiança RECOMENDADA para projeções futuras deste tipo. */
  recommendedConfidence: "baixa" | "media" | "alta";
  /** fator de correção a aplicar no "esperado" futuro (1 = sem ajuste). */
  correctionFactor: number;
};

/**
 * Agrega os desfechos por tipo de movimento e recomenda a confiança + o fator
 * de correção da próxima projeção. Poucos exemplos → confiança baixa (honesto).
 */
export function trustByMoveKind(outcomes: CalibrationOutcome[], opts: { minSamples?: number } = {}): CalibrationTrust[] {
  const minSamples = opts.minSamples ?? 4;
  const byKind = new Map<string, CalibrationOutcome[]>();
  for (const o of outcomes) {
    const list = byKind.get(o.moveKind) ?? [];
    list.push(o);
    byKind.set(o.moveKind, list);
  }
  const out: CalibrationTrust[] = [];
  for (const [moveKind, list] of byKind) {
    const withErr = list.filter((o) => o.errorPct != null);
    const meanBiasPct = withErr.length ? r2(withErr.reduce((s, o) => s + (o.errorPct as number), 0) / withErr.length) : null;
    const hits = list.filter((o) => o.withinBand).length;
    const hitRate = list.length ? r2(hits / list.length) : 0;
    // confiança: precisa de amostra E acerto E viés pequeno
    let recommendedConfidence: CalibrationTrust["recommendedConfidence"] = "baixa";
    if (list.length >= minSamples && hitRate >= 0.6 && (meanBiasPct == null || Math.abs(meanBiasPct) <= 25)) recommendedConfidence = "alta";
    else if (list.length >= Math.ceil(minSamples / 2) && hitRate >= 0.4) recommendedConfidence = "media";
    // correção: se projeta consistentemente MAIS (bias>0), encolhe o esperado futuro
    let correctionFactor = 1;
    if (meanBiasPct != null && list.length >= minSamples) {
      correctionFactor = r2(Math.min(1.5, Math.max(0.5, 1 - meanBiasPct / 100)));
    }
    out.push({ moveKind, samples: list.length, meanBiasPct, hitRate, recommendedConfidence, correctionFactor });
  }
  return out.sort((a, b) => b.samples - a.samples);
}

/** Aplica o fator de correção aprendido a uma projeção nova (organismo aprende). */
export function correctProjection(esperado: number, trust: CalibrationTrust | undefined): number {
  if (!trust || trust.samples < 4) return esperado;
  return r2(esperado * trust.correctionFactor);
}

/** Resumo executivo em PT do que a IA aprendeu sobre si mesma. */
export function learningSummary(trusts: CalibrationTrust[]): string[] {
  if (!trusts.length) return ["Ainda sem histórico de projeção × realizado — o organismo começa a aprender na primeira semana pós-decisão."];
  return trusts.map((t) => {
    if (t.samples < 4) return `${t.moveKind}: ${t.samples} amostra(s) — coletando base antes de confiar.`;
    const bias = t.meanBiasPct == null ? "sem viés medível" : t.meanBiasPct > 15 ? `otimista ${t.meanBiasPct}% (encolhe projeção ×${t.correctionFactor})` : t.meanBiasPct < -15 ? `pessimista ${Math.abs(t.meanBiasPct)}%` : "bem calibrado";
    return `${t.moveKind}: ${t.samples} amostras, acerto ${Math.round(t.hitRate * 100)}%, ${bias} → confiança ${t.recommendedConfidence}.`;
  });
}
