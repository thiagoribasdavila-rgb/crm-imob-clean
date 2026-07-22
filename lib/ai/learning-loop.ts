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

import { DEFAULT_PIPELINE_STAGES, canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";

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

/* ===========================================================================
 * Memória de operação — o fato comercial vira contagem.
 *
 * O bloco acima aprende sobre a PROJEÇÃO da IA (projetado × realizado). Este
 * aprende sobre o MUNDO: cada ganho, cada perda com motivo e cada avanço de
 * etapa vira uma linha determinística de ai_learning_events. Sem esse registro,
 * "qual origem converte" continua sendo opinião defendida com verba.
 *
 * Continua puro por decisão: nenhum I/O, nenhum relógio, nenhuma chamada de
 * modelo. Quem grava é lib/compat/live-writes.ts — aqui só o vocabulário do
 * fato e a aritmética do desfecho.
 * ===========================================================================
 */

/**
 * provider 'LOCAL' é a declaração, na própria linha gravada, de que este
 * aprendizado nasce determinístico: nenhuma linha escrita por este caminho
 * consumiu token de LLM. Auditar a tabela por provider distingue, sem ambiguidade,
 * o que a operação observou do que um modelo opinou.
 */
export const LEARNING_EVENT_PROVIDER = "LOCAL";
export const LEARNING_EVENT_MODEL = "atlas-deterministic-v1";
export const LEARNING_EVENT_AGENT = "ATLAS_COMMERCIAL_LOOP";
export const LEARNING_EVENT_TASK_KIND = "commercial_outcome";

/** Desfechos que o funil comercial sabe declarar sem inferência. */
export type CommercialOutcomeKind = "ganho" | "perdido" | "comprou_outro" | "avanco_etapa";

export type CommercialFact = {
  organizationId: string;
  leadId: string;
  /** quem moveu o lead; null quando a movimentação veio de automação. */
  actorId?: string | null;
  outcome: CommercialOutcomeKind;
  fromStage?: string | null;
  toStage: string;
  /**
   * chave da taxonomia de descarte, quando o desfecho é perda classificada.
   * null tem dois sentidos, separados por `writePath`: em "pipeline" é motivo
   * não informado (a rota exige motivo, então é caso raro); em "lead_360" é
   * motivo NÃO COLETADO — aquela tela não pede taxonomia. Quem agregar precisa
   * manter os dois separados, senão a ausência de coleta vira "motivo
   * desconhecido" e some do radar de instrumentação.
   */
  reasonKey?: string | null;
  source?: string | null;
  campaignId?: string | null;
  /**
   * id da movimentação de pipeline que ORIGINOU este fato. É a chave que torna
   * o par desfecho/desfazer casável na leitura — e, de quebra, o que permite
   * colapsar linha duplicada sem depender de índice único no banco.
   */
  moveId?: string | null;
  /**
   * id da movimentação que este fato COMPENSA. Presente só na linha de
   * reversão: ela não é desfecho novo, é o cancelamento auditável de um.
   */
  reversalOf?: string | null;
  /** por onde o fato entrou: Kanban do pipeline ou ficha do Lead 360. */
  writePath: "pipeline" | "lead_360";
};

/** Linha de ai_learning_events já no shape das constraints vivas da tabela. */
export type LearningEventRow = {
  organization_id: string;
  lead_id: string;
  user_id: string | null;
  provider: string;
  model: string;
  agent_id: string;
  task_kind: string;
  event_type: "CONVERSION" | "STAGE_ADVANCED";
  converted: boolean | null;
  conversion_stage: string;
  metadata: Record<string, unknown>;
};

const OUTCOME_EVENT_TYPE: Record<CommercialOutcomeKind, LearningEventRow["event_type"]> = {
  ganho: "CONVERSION",
  perdido: "CONVERSION",
  comprou_outro: "CONVERSION",
  avanco_etapa: "STAGE_ADVANCED",
};

const STAGE_POSITION = new Map(DEFAULT_PIPELINE_STAGES.map((stage) => [stage.key, stage.position]));
const STAGE_RESULT = new Map(DEFAULT_PIPELINE_STAGES.map((stage) => [stage.key, stage.outcome]));

/**
 * Classifica uma movimentação de etapa como fato comercial — ou como nada.
 *
 * Devolver null é resposta legítima e frequente: retrocesso de etapa (voltar de
 * proposta para qualificação) costuma ser correção de cadastro, e contá-lo como
 * avanço inverteria o sinal que a liderança vai ler depois. Etapa fora da
 * taxonomia canônica (arquivado, por exemplo) também não ensina desfecho.
 */
export function commercialOutcomeFromStages(fromStage: unknown, toStage: unknown): CommercialOutcomeKind | null {
  const from = canonicalPipelineStage(fromStage);
  const to = canonicalPipelineStage(toStage);
  if (!to || (from && from === to)) return null;
  const result = STAGE_RESULT.get(to);
  if (result === "won") return "ganho";
  if (result === "lost") return "perdido";
  if (result === "buyer_profile") return "comprou_outro";
  const fromPosition = from ? STAGE_POSITION.get(from) ?? null : null;
  const toPosition = STAGE_POSITION.get(to) ?? null;
  if (fromPosition === null || toPosition === null || toPosition <= fromPosition) return null;
  return "avanco_etapa";
}

/**
 * Traduz o fato comercial para a linha da tabela viva.
 *
 * A reversão TAMBÉM vira linha, ao contrário do que esta função fazia antes.
 * Descartar o desfazer guardava só o lado errado do par: a perda (ou a vitória)
 * registrada por engano ficava na tabela para sempre e a correção que a
 * operação fez no Kanban não chegava à contagem. A linha de compensação carrega
 * `metadata.reverses` com o id da movimentação anulada — quem lê casa o par e
 * abate os dois, em vez de acreditar no primeiro.
 */
export function toLearningEventRow(fact: CommercialFact): LearningEventRow | null {
  if (!fact.organizationId || !fact.leadId) return null;
  const stage = canonicalPipelineStage(fact.toStage);
  const eventType = OUTCOME_EVENT_TYPE[fact.outcome];
  if (!stage || !eventType) return null;
  return {
    organization_id: fact.organizationId,
    lead_id: fact.leadId,
    user_id: fact.actorId ?? null,
    provider: LEARNING_EVENT_PROVIDER,
    model: LEARNING_EVENT_MODEL,
    agent_id: LEARNING_EVENT_AGENT,
    task_kind: LEARNING_EVENT_TASK_KIND,
    event_type: eventType,
    // converted só é booleano quando o desfecho já aconteceu. Avanço de etapa
    // não é conversão nem não-conversão: o lead segue em aberto, e null é a
    // única resposta honesta — false ali contaria uma perda que não houve.
    // Na linha de compensação, converted também é null: ela não afirma desfecho
    // nenhum, ela cancela um.
    converted: fact.reversalOf ? null : eventType === "CONVERSION" ? fact.outcome === "ganho" : null,
    conversion_stage: stage,
    metadata: {
      outcome: fact.outcome,
      fromStage: canonicalPipelineStage(fact.fromStage),
      toStage: stage,
      reasonKey: fact.reasonKey ?? null,
      source: fact.source ?? null,
      campaignId: fact.campaignId ?? null,
      writePath: fact.writePath,
      // Identidade da movimentação: chave de casamento do par e, na leitura,
      // o que permite colapsar linha repetida (o mesmo movimento gravado duas
      // vezes tem o mesmo moveId) sem depender de constraint no banco.
      moveId: fact.moveId ?? null,
      reverses: fact.reversalOf ?? null,
      compensation: Boolean(fact.reversalOf),
    },
  };
}

/*
 * A agregação de desfecho por origem/motivo (outcomeRateBy) foi retirada deste
 * lote e volta no commit da tela que a consumir. Motivo, medido nesta base:
 * nenhuma tela a chamava; a dimensão de campanha era natimorta (campaign_id é
 * NULL nos 17.151 leads vivos, então todo bucket cairia em "nao_informado"); e
 * a de motivo só é preenchida pelo caminho do Kanban, porque a ficha do Lead
 * 360 não coleta motivo estruturado. Publicar taxa sobre isso seria oferecer
 * um corte que a base não sustenta.
 *
 * Quando voltar, três regras que este lote já deixa preparadas na gravação:
 *   1. contar LEADS DISTINTOS por bucket, não linhas — a operação faz descarte
 *      em massa e o mesmo lead arrastado duas vezes inflaria o denominador;
 *   2. casar `metadata.reverses` com `metadata.moveId` e abater o par, para o
 *      desfazer do corretor chegar à contagem;
 *   3. declarar junto do resultado quais `writePath` a amostra cobre — hoje
 *      pipeline e lead_360; aprovação, importação e venda externa ainda não
 *      gravam, e omitir isso seria apresentar série parcial como completa.
 */
