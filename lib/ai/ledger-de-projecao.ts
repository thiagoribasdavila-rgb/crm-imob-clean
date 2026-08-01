/**
 * LEDGER DE PROJEÇÃO — liga a tabela `ai_projection_ledger`, que estava órfã.
 *
 * ── O estado medido antes desta entrega ─────────────────────────────────────
 *
 * A tabela existe no banco canônico desde a migration 20260722160000 e tinha
 * ZERO linhas em 2026-07-30. Nenhum arquivo do repositório a escrevia; nenhum a
 * lia. `lib/ai/learning-loop.ts` a citava só num comentário.
 *
 * O efeito prático disso: o simulador (`lib/ai/decision-simulator`) diz
 * "+X leads/semana", a decisão é tomada, a semana passa — e ninguém compara. A
 * IA erra para mais e continua projetando com a MESMA confiança, para sempre.
 * Não é um bug de cálculo, é a ausência do único mecanismo que faria o cálculo
 * melhorar.
 *
 * ── O que este arquivo é ────────────────────────────────────────────────────
 *
 * A tradução, determinística e pura, entre três coisas que já existem:
 *
 *   MoveProjection (decision-simulator)  →  linha de ai_projection_ledger
 *   linha + realizado                    →  CalibrationOutcome (learning-loop)
 *   linhas fechadas                      →  CalibrationTrust (learning-loop)
 *
 * A matemática do aprendizado NÃO é reescrita aqui: `evaluateOutcome` e
 * `trustByMoveKind` continuam morando em `learning-loop.ts`, com uma definição
 * só. Este arquivo é a ponte que faltava, não uma segunda opinião.
 *
 * Puro por decisão: sem I/O e sem relógio. A semana entra como argumento, o que
 * torna todo caso testável sem congelar tempo — e torna impossível o defeito de
 * gravar a semana do servidor quando a decisão foi de outra.
 *
 * Custo: R$ 0. Nenhuma tabela nova, nenhum serviço novo, nenhum token de LLM.
 */

import {
  evaluateOutcome,
  trustByMoveKind,
  learningSummary,
  type CalibrationOutcome,
  type CalibrationTrust,
  type ProjectionRecord,
  type RealizedRecord,
  // Import relativo com extensão, como `lib/atlas/triagem-da-fila.ts` já faz: é
  // o que permite ao contrato EXECUTAR este módulo com --experimental-strip-types.
  // O alias "@/" não resolve fora do bundler, e contrato que não executa é grep.
} from "./learning-loop.ts";

/** Faixa projetada. Mesma forma que `MoveProjection.weeklyLeadsDelta`. */
export type FaixaProjetada = { pessimista: number; esperado: number; otimista: number };

/**
 * Linha de `ai_projection_ledger` no shape exato das colunas vivas, conferidas
 * em 2026-07-30 (id e created_at têm default no banco e não entram na escrita).
 */
export type LinhaDoLedger = {
  organization_id: string;
  move_kind: string;
  target: string;
  projected: Record<string, unknown>;
  confidence_at_decision: string;
  decided_at_week: string;
  realized_leads_delta: number | null;
  realized_at_week: string | null;
};

/** Forma mínima de projeção que este arquivo aceita — subconjunto de MoveProjection. */
export type ProjecaoParaGravar = {
  moveKind: string;
  target: string;
  weeklyLeadsDelta: FaixaProjetada;
  confidence: "baixa" | "media" | "alta";
  /** Lastro declarado pelo simulador. Ausência é registrada como ausência. */
  basis?: { measured: boolean; sample: number; minimumSample: number; reason?: string };
};

const finito = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Semana ISO no formato "YYYY-Www" — a mesma chave que a coluna já espera. */
export function semanaIso(data: Date): string {
  const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
  // ISO 8601: a semana pertence ao ano da sua quinta-feira.
  const diaIso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - diaIso);
  const inicioDoAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioDoAno.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

/**
 * Constrói a linha a gravar NO MOMENTO DA DECISÃO.
 *
 * Devolve `null` — e não uma linha meia-boca — quando falta organização, alvo,
 * tipo de movimento ou a faixa não é numérica. Gravar lixo aqui envenenaria o
 * cálculo de viés depois, e viés envenenado é pior que viés ausente: ele tem
 * cara de aprendizado.
 *
 * O lastro (`basis`) viaja dentro de `projected` porque a coluna é jsonb e não
 * há coluna própria. Sem isso, uma projeção sem amostra e uma projeção com 200
 * observações entrariam no ledger indistinguíveis, e a média de viés trataria as
 * duas como a mesma evidência.
 */
export function linhaDeProjecao(
  organizationId: string,
  projecao: ProjecaoParaGravar,
  semanaDaDecisao: string,
): LinhaDoLedger | null {
  if (!organizationId || !String(projecao?.moveKind || "").trim()) return null;
  if (!String(projecao?.target || "").trim()) return null;
  const faixa = projecao.weeklyLeadsDelta;
  if (!faixa || !finito(faixa.pessimista) || !finito(faixa.esperado) || !finito(faixa.otimista)) {
    return null;
  }
  if (!/^\d{4}-W\d{2}$/.test(semanaDaDecisao)) return null;
  return {
    organization_id: organizationId,
    move_kind: projecao.moveKind,
    target: projecao.target,
    projected: {
      pessimista: faixa.pessimista,
      esperado: faixa.esperado,
      otimista: faixa.otimista,
      // `measured: false` aqui é a declaração de que a projeção não tinha
      // amostra. Quem agregar depois pode (e deve) descartar essas linhas.
      basis: projecao.basis
        ? {
            measured: projecao.basis.measured,
            sample: projecao.basis.sample,
            minimumSample: projecao.basis.minimumSample,
            reason: projecao.basis.reason ?? null,
          }
        : null,
    },
    confidence_at_decision: projecao.confidence,
    decided_at_week: semanaDaDecisao,
    realized_leads_delta: null,
    realized_at_week: null,
  };
}

/**
 * Traduz o lastro que a rota de propostas já calcula (`ProposalProjectionBasis`)
 * para o lastro que o ledger grava.
 *
 * Vive aqui, e não na rota, porque é a tradução que decide se a linha vai contar
 * para a confiança futura: `sampleSufficient` diferente de `true` significa
 * amostra abaixo do mínimo, e a projeção correspondente NÃO pode calibrar nada.
 * Espalhar essa decisão pela rota abriria a porta para duas leituras do que é
 * "medido" — o defeito que este repositório já pagou mais de uma vez.
 */
export function lastroDaProposta(basis: {
  sampleSufficient?: boolean;
  windowLeads?: number;
  minimumLeadsForProjection?: number;
  reason?: string | null;
} | null | undefined): ProjecaoParaGravar["basis"] {
  if (!basis) return undefined;
  return {
    measured: basis.sampleSufficient === true,
    sample: finito(basis.windowLeads) ? basis.windowLeads : 0,
    minimumSample: finito(basis.minimumLeadsForProjection) ? basis.minimumLeadsForProjection : 0,
    reason: basis.reason ?? undefined,
  };
}

/** Patch de fechamento: só as duas colunas que o fechamento preenche. */
export type FechamentoDoLedger = {
  patch: { realized_leads_delta: number; realized_at_week: string };
  desfecho: CalibrationOutcome;
};

/**
 * Fecha uma linha aberta com o realizado da semana seguinte.
 *
 * Devolve `null` quando a linha JÁ está fechada — reabrir sobrescreveria um
 * desfecho auditado, e o segundo fechamento com outro número apagaria o
 * primeiro sem deixar rastro. Também recusa realizado não numérico.
 *
 * O veredito não é calculado aqui: delega a `evaluateOutcome`, que já existe.
 */
export function fecharComRealizado(
  linha: LinhaDoLedger,
  realizadoLeadsDelta: number,
  semanaDoRealizado: string,
): FechamentoDoLedger | null {
  if (linha.realized_at_week !== null || linha.realized_leads_delta !== null) return null;
  if (!finito(realizadoLeadsDelta)) return null;
  if (!/^\d{4}-W\d{2}$/.test(semanaDoRealizado)) return null;
  const projetado = linha.projected as Partial<FaixaProjetada>;
  if (
    !finito(projetado.pessimista) ||
    !finito(projetado.esperado) ||
    !finito(projetado.otimista)
  ) {
    return null;
  }
  const projecao: ProjectionRecord = {
    moveKind: linha.move_kind,
    target: linha.target,
    projected: {
      pessimista: projetado.pessimista,
      esperado: projetado.esperado,
      otimista: projetado.otimista,
    },
    confidenceAtDecision: linha.confidence_at_decision as ProjectionRecord["confidenceAtDecision"],
    decidedAtWeek: linha.decided_at_week,
  };
  const realizado: RealizedRecord = {
    moveKind: linha.move_kind,
    target: linha.target,
    realizedLeadsDelta: realizadoLeadsDelta,
    realizedAtWeek: semanaDoRealizado,
  };
  return {
    patch: { realized_leads_delta: realizadoLeadsDelta, realized_at_week: semanaDoRealizado },
    desfecho: evaluateOutcome(projecao, realizado),
  };
}

export type ComparacaoDoLedger = {
  /** Linhas já fechadas (têm realizado). */
  fechadas: number;
  /** Linhas ainda abertas — aguardando a semana seguinte. */
  abertas: number;
  /**
   * Linhas fechadas cuja projeção declarou lastro medido. É este o denominador
   * que vale para calibrar: as demais entram na contagem mas não na confiança.
   */
  fechadasComLastro: number;
  desfechos: CalibrationOutcome[];
  confiancaPorMovimento: CalibrationTrust[];
  /** Resumo em PT do que a IA aprendeu sobre si — reusa learningSummary. */
  resumo: string[];
};

const temLastroMedido = (linha: LinhaDoLedger): boolean => {
  const basis = (linha.projected as { basis?: { measured?: unknown } | null }).basis;
  return Boolean(basis && basis.measured === true);
};

/**
 * A COMPARAÇÃO EXPOSTA — projeção × realizado, agregada por tipo de movimento.
 *
 * Só entra no cálculo de confiança a linha fechada COM lastro medido. Uma
 * projeção sem amostra que por sorte acertou não é evidência de calibração, e
 * deixá-la entrar inflaria a confiança justamente onde ela é menos merecida.
 * As duas contagens ficam visíveis para o número não virar caixa-preta.
 */
export function comparacaoDoLedger(linhas: readonly LinhaDoLedger[]): ComparacaoDoLedger {
  const fechadas: LinhaDoLedger[] = [];
  let abertas = 0;
  for (const linha of linhas) {
    if (linha.realized_at_week !== null && finito(linha.realized_leads_delta)) fechadas.push(linha);
    else abertas += 1;
  }
  // O desfecho é calculado a partir da linha reaberta em memória (o banco não é
  // tocado): `fecharComRealizado` recusa linha já fechada, e é essa recusa que
  // protege o fechamento real de ser sobrescrito.
  const desfechoDaLinha = (linha: LinhaDoLedger): CalibrationOutcome | null => {
    const aberta: LinhaDoLedger = { ...linha, realized_leads_delta: null, realized_at_week: null };
    const fechamento = fecharComRealizado(
      aberta,
      linha.realized_leads_delta as number,
      linha.realized_at_week as string,
    );
    return fechamento ? fechamento.desfecho : null;
  };
  const comLastro = fechadas.filter(temLastroMedido);
  const desfechos = fechadas.map(desfechoDaLinha).filter((d): d is CalibrationOutcome => d !== null);
  const desfechosComLastro = comLastro
    .map(desfechoDaLinha)
    .filter((d): d is CalibrationOutcome => d !== null);
  const confiancaPorMovimento = trustByMoveKind(desfechosComLastro);
  return {
    fechadas: fechadas.length,
    abertas,
    fechadasComLastro: comLastro.length,
    desfechos,
    confiancaPorMovimento,
    resumo: learningSummary(confiancaPorMovimento),
  };
}
