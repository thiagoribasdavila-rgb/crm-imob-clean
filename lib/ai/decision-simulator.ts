/**
 * Simulador de decisão de marketing — projeção determinística de 1 semana
 * para cada movimento proposto (MarketingMove), ANTES da aprovação do diretor.
 *
 * Núcleo puro: sem fetch, sem Date.now, sem aleatório. Toda suposição usada no
 * cálculo vira string em `assumptions` — honestidade acima de precisão: quando
 * não há base histórica, o esperado é 0 com explicação, nunca um chute.
 * Nada aqui executa nada; é insumo para a Caixa de Aprovações.
 */

import type { BudgetLine, CostBucket } from "@/lib/marketing/cost-report";

/**
 * Lastro declarado de uma projeção: quantos fatos observados a sustentam.
 * Existe para a tela nunca imprimir número seco — `measured: false` significa
 * "não sei", e "não sei" é uma resposta melhor do que um número inventado.
 */
export type ProjectionBasis = {
  measured: boolean;
  /** Tamanho da amostra observada (movimentações, leads, o que sustentar a conta). */
  sample: number;
  minimumSample: number;
  /** Preenchido somente quando `measured` é false — o motivo por extenso. */
  reason?: string;
};

export type MoveProjection = {
  moveKind: string;
  target: string;
  weeklySpendDelta: number;
  weeklyLeadsDelta: { pessimista: number; esperado: number; otimista: number };
  confidence: "baixa" | "media" | "alta";
  assumptions: string[];
  horizon: "1 semana";
  /**
   * Opcional para não quebrar quem já consome MoveProjection. Ausência é
   * tratada por `hasBasis` como SEM lastro: quem não declarou amostra não
   * ganha o benefício da dúvida.
   */
  basis?: ProjectionBasis;
};

/** Forma mínima de um MarketingMove aceita pelo simulador. */
export type SimulatedMove = {
  kind: string;
  target: string;
  amount?: number;
  from?: string;
  to?: string;
};

export type SimulationContext = {
  /** Buckets de campanha/produto (lib/marketing/cost-report.aggregate). */
  campaigns: CostBucket[];
  /** Visão de verba semanal por produto (fallback de gasto quando o alvo não está em campaigns). */
  budget?: BudgetLine[];
  /** Janela dos dados de `campaigns`. Default "7d". Com "30d", gasto/leads viram semanais (÷4.33). */
  period?: "7d" | "30d";
};

export type PlanProjection = {
  projections: MoveProjection[];
  totals: {
    weeklySpendDelta: number;
    weeklyLeadsDelta: { pessimista: number; esperado: number; otimista: number };
  };
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Semanas médias por mês (52/12) — usada para converter janelas de 30d em semana. */
const WEEKS_PER_MONTH = 4.33;
/** Retorno decrescente: verba nova rende menos que a média histórica do destino. */
const DIMINISHING_RETURN = 0.8;
/** Faixa de incerteza (±25%) aplicada sobre a parte projetada dos leads. */
const BAND = 0.25;

const QUALITATIVE_KINDS = new Set(["revisar", "definir_meta", "manter"]);

function findBucket(campaigns: CostBucket[], target: string | undefined): CostBucket | null {
  if (!target) return null;
  const t = target.trim().toLowerCase();
  if (!t) return null;
  return campaigns.find((c) => c.key.toLowerCase() === t || c.label.trim().toLowerCase() === t) ?? null;
}

function findBudgetLine(budget: BudgetLine[] | undefined, target: string): BudgetLine | null {
  if (!budget) return null;
  const t = target.trim().toLowerCase();
  return budget.find((b) => b.product.trim().toLowerCase() === t) ?? null;
}

/** Degraus de confiança: ≥30 leads com CPL → alta; 10–29 → media; <10 ou CPL null → baixa. */
function confidenceFor(bucket: CostBucket | null): MoveProjection["confidence"] {
  if (!bucket || bucket.cpl == null) return "baixa";
  if (bucket.leads >= 30) return "alta";
  if (bucket.leads >= 10) return "media";
  return "baixa";
}

function zeroProjection(move: SimulatedMove, confidence: MoveProjection["confidence"], assumptions: string[]): MoveProjection {
  return {
    moveKind: move.kind,
    target: move.target,
    weeklySpendDelta: 0,
    weeklyLeadsDelta: { pessimista: 0, esperado: 0, otimista: 0 },
    confidence,
    assumptions,
    horizon: "1 semana",
  };
}

function band(expected: number): { pessimista: number; esperado: number; otimista: number } {
  const lo = expected * (1 + BAND);
  const hi = expected * (1 - BAND);
  // expected é negativo em pausas; garante pessimista ≤ esperado ≤ otimista sempre.
  return {
    pessimista: r2(Math.min(lo, hi)),
    esperado: r2(expected),
    otimista: r2(Math.max(lo, hi)),
  };
}

function simulatePause(move: SimulatedMove, ctx: SimulationContext): MoveProjection {
  const assumptions: string[] = [];
  const bucket = findBucket(ctx.campaigns, move.target);

  if (!bucket) {
    const line = findBudgetLine(ctx.budget, move.target);
    if (line) {
      assumptions.push(
        `Alvo "${move.target}" sem dados de campanha — gasto semanal derivado da verba do produto (R$ ${line.spent}).`,
        "Sem base histórica de leads para o alvo — perda de leads projetada em 0.",
      );
      return {
        moveKind: move.kind,
        target: move.target,
        weeklySpendDelta: r2(-line.spent),
        weeklyLeadsDelta: { pessimista: 0, esperado: 0, otimista: 0 },
        confidence: "baixa",
        assumptions,
        horizon: "1 semana",
      };
    }
    return zeroProjection(move, "baixa", [
      `Alvo "${move.target}" não encontrado nos dados de campanha nem na verba — projeção zerada por falta de base.`,
    ]);
  }

  const monthly = ctx.period === "30d";
  const f = monthly ? 1 / WEEKS_PER_MONTH : 1;
  if (monthly) {
    assumptions.push(`Base de 30 dias convertida para semana dividindo por ${WEEKS_PER_MONTH} (semanas médias por mês).`);
  }

  const weeklySpend = bucket.spend * f;
  const weeklyLeads = bucket.leads * f;
  assumptions.push("Pausa remove todo o gasto e todos os leads semanais do alvo; faixa de ±25% sobre os leads históricos.");
  if (bucket.leads === 0) {
    assumptions.push("Alvo sem leads no período — pausar só corta gasto, sem perda de leads projetada.");
  }

  return {
    moveKind: move.kind,
    target: move.target,
    weeklySpendDelta: r2(-weeklySpend),
    weeklyLeadsDelta: band(-weeklyLeads),
    confidence: confidenceFor(bucket),
    assumptions,
    horizon: "1 semana",
  };
}

function gainedLeads(amount: number, dest: CostBucket | null, destName: string, assumptions: string[]): number {
  if (!dest) {
    assumptions.push(`Destino "${destName}" não encontrado nos dados — sem base histórica, leads esperados = 0.`);
    return 0;
  }
  if (dest.cpl == null) {
    assumptions.push(`Destino "${destName}" sem CPL histórico (0 leads no período) — sem base histórica, leads esperados = 0.`);
    return 0;
  }
  assumptions.push(
    `Leads ganhos = verba ÷ CPL do destino (R$ ${dest.cpl}) × ${DIMINISHING_RETURN} de retorno decrescente (verba nova rende menos que a média histórica).`,
  );
  return (amount / dest.cpl) * DIMINISHING_RETURN;
}

function simulateScale(move: SimulatedMove, ctx: SimulationContext): MoveProjection {
  const amount = Number.isFinite(move.amount) && (move.amount as number) > 0 ? (move.amount as number) : null;
  if (amount == null) {
    return zeroProjection(move, "baixa", [
      "Movimento de escala sem valor semanal (amount) definido — nada a projetar.",
    ]);
  }
  const assumptions: string[] = [];
  const dest = findBucket(ctx.campaigns, move.target);
  const gained = gainedLeads(amount, dest, move.target, assumptions);
  if (gained > 0) assumptions.push("Faixa de ±25% sobre os leads projetados no destino.");
  return {
    moveKind: move.kind,
    target: move.target,
    weeklySpendDelta: r2(amount),
    weeklyLeadsDelta: band(gained),
    confidence: confidenceFor(dest),
    assumptions,
    horizon: "1 semana",
  };
}

function simulateReallocate(move: SimulatedMove, ctx: SimulationContext): MoveProjection {
  const amount = Number.isFinite(move.amount) && (move.amount as number) > 0 ? (move.amount as number) : null;
  if (amount == null) {
    return zeroProjection(move, "baixa", [
      "Realocação sem valor semanal (amount) definido — nada a projetar.",
    ]);
  }
  const assumptions: string[] = [
    "Realocação move verba entre alvos — gasto líquido semanal inalterado (delta 0).",
  ];

  const destName = move.to || move.target;
  const dest = findBucket(ctx.campaigns, destName);
  const gained = gainedLeads(amount, dest, destName, assumptions);

  let lost = 0;
  if (!move.from) {
    assumptions.push("Origem da realocação não informada — perda de leads na origem projetada em 0.");
  } else {
    const origin = findBucket(ctx.campaigns, move.from);
    if (!origin || origin.cpl == null) {
      assumptions.push(`Origem "${move.from}" sem CPL histórico — perda de leads na origem projetada em 0.`);
    } else {
      lost = amount / origin.cpl;
      assumptions.push(
        `Leads perdidos na origem = verba ÷ CPL da origem (R$ ${origin.cpl}), sem fator de retorno — cortar não tem fricção.`,
      );
    }
  }
  if (gained > 0) assumptions.push("Faixa de ±25% aplicada só sobre os leads projetados no destino; a perda na origem é tratada como certa.");

  return {
    moveKind: move.kind,
    target: destName,
    weeklySpendDelta: 0,
    weeklyLeadsDelta: {
      pessimista: r2(gained * (1 - BAND) - lost),
      esperado: r2(gained - lost),
      otimista: r2(gained * (1 + BAND) - lost),
    },
    confidence: confidenceFor(dest),
    assumptions,
    horizon: "1 semana",
  };
}

/** Projeta o efeito de 1 semana de um movimento proposto — determinístico e honesto. */
export function simulateMove(move: SimulatedMove, context: SimulationContext): MoveProjection {
  if (move.kind === "pausar") return simulatePause(move, context);
  if (move.kind === "escalar") return simulateScale(move, context);
  if (move.kind === "realocar") return simulateReallocate(move, context);
  if (QUALITATIVE_KINDS.has(move.kind)) {
    return zeroProjection(move, "alta", [
      `Movimento "${move.kind}" é qualitativo — não altera gasto nem leads diretamente na janela de 1 semana.`,
    ]);
  }
  return zeroProjection(move, "baixa", [
    `Tipo de movimento desconhecido ("${move.kind}") — projeção zerada por precaução.`,
  ]);
}

/* ------------------------------------------------------------------------- *
 * Capacidade comercial (contratar)
 *
 * Bloco estritamente aditivo: nenhuma assinatura acima muda. A decisão de folha
 * é a de maior valor financeiro que a diretoria toma e hoje é tomada sem conta
 * nenhuma; aqui ela ganha faixa, amostra declarada e — quando não há medição —
 * um "ainda não sei" explícito, que é mais barato que um número errado.
 * ------------------------------------------------------------------------- */

/**
 * Tipos de movimento que mexem em gente, não em verba.
 *
 * "remanejar" saiu: nenhuma rota o emite, e um kind sem chamador devolvendo
 * projeção "medida" de zero é superfície que só pode envelhecer errada.
 * Volta no commit da tela que o propuser.
 */
export const CAPACITY_KINDS = new Set(["contratar"]);

/**
 * Mínimo de movimentações ATRIBUÍDAS a corretor para aceitar um throughput como
 * medido. Abaixo disto a média por corretor é ruído de uma semana atípica.
 */
export const MINIMUM_CAPACITY_SAMPLE = 20;

/**
 * Mínimo de PESSOAS distintas por trás da média. Média de duas pessoas em que
 * uma fez 196 movimentações e a outra 2 não é média de nada — é bimodal, e
 * projetar contratação sobre ela é projetar sobre uma pessoa só.
 */
export const MINIMUM_CAPACITY_ACTORS = 3;

/**
 * Mínimo de semanas REAIS de janela. Ritmo comercial tem sazonalidade semanal
 * (segunda não é sexta); menos de duas semanas mede um episódio, não um ritmo.
 */
export const MINIMUM_CAPACITY_WEEKS = 2;

/**
 * Contexto de capacidade. Todo campo é CONTAGEM OBSERVADA, jamais meta:
 * `null` quer dizer "não medido" e 0 quer dizer "medido, e é zero" — a
 * diferença entre os dois é a diferença entre honestidade e invenção.
 */
export type CapacityContext = {
  /** Leads abertos (não terminais) hoje — o estoque que precisa de gente. */
  openLeads: number;
  /** Corretores ativos no cadastro. */
  activeBrokers: number;
  /** CORRETORES que de fato movimentaram leads na janela observada. */
  observedActors: number;
  /** Leads distintos trabalhados por corretor por semana. null = não medido. */
  observedLeadsPerBrokerPerWeek: number | null;
  /**
   * Movimentações lidas na janela — volume da fonte, JAMAIS a amostra. Inclui
   * linha sem autor (trigger de banco, importação, automação), que não entra no
   * numerador do throughput e por isso não pode validar porta de amostra.
   */
  observedMoves: number;
  /**
   * Movimentações com autor CORRETOR identificado: a mesma população que
   * alimenta o numerador, e a única que pode servir de amostra.
   */
  observedAttributedMoves: number;
  /** Semanas REAIS cobertas pela janela (sem piso) — usada como credencial. */
  observedWeeks: number;
  /** Fração das movimentações que avançaram etapa (0..1). null = não medido. */
  observedAdvanceRate: number | null;
  /** Ganhos registrados na mesma janela. 0 é o que tira o lastro da receita. */
  observedWins: number;
  /**
   * Fração das movimentações atribuídas que terminaram em etapa terminal
   * (0..1). Descarte em massa produz throughput alto sem trabalho comercial
   * nenhum — quem lê a projeção precisa saber quanto do ritmo é encerramento.
   */
  observedTerminalShare: number | null;
  /** O que a fonte do throughput NÃO enxerga. Vira suposição exibida na tela. */
  sourceCoverage?: string | null;
};

/** A tela só pode imprimir número quando isto for verdadeiro. */
export function hasBasis(projection: MoveProjection): boolean {
  return projection.basis?.measured === true;
}

function headcount(move: SimulatedMove): number {
  const parsed = Number(move.amount);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

function noBasis(move: SimulatedMove, assumptions: string[], sample: number, reason: string, note?: string): MoveProjection {
  return {
    ...zeroProjection(move, "baixa", [...assumptions, `Sem lastro: ${reason}${note ? ` — ${note}` : "."}`]),
    basis: { measured: false, sample, minimumSample: MINIMUM_CAPACITY_SAMPLE, reason },
  };
}

const MISSING_MEASUREMENT_NOTE =
  "o ganho semanal sai 0 por ausência de medição, não porque o movimento seja inútil.";

/**
 * Projeta o efeito de 1 semana de um movimento de capacidade.
 *
 * O número projetado é LEAD TRABALHADO, nunca receita: nesta base não há ganho
 * registrado, então converter capacidade em dinheiro seria chute com aparência
 * de conta.
 *
 * Quatro portas precisam abrir ANTES de `basis.measured` virar true, e todas
 * existem por um episódio real: corretor ativo no cadastro (senão a média não
 * tem sujeito), amostra atribuída a corretor (senão movimentação de trigger
 * valida uma conta de que não participa), pessoas suficientes (senão a média é
 * de uma pessoa só) e janela real de semanas (senão um mutirão de três dias
 * vira ritmo). Falhar em qualquer uma devolve "ainda não sei" — que é a
 * resposta barata; o número errado é o caro.
 */
export function simulateCapacity(move: SimulatedMove, ctx: CapacityContext): MoveProjection {
  if (!CAPACITY_KINDS.has(move.kind)) {
    return noBasis(
      move,
      [],
      0,
      `"${move.kind}" não é movimento de capacidade (aceitos: ${[...CAPACITY_KINDS].join(", ")})`,
    );
  }

  const heads = headcount(move);
  const assumptions: string[] = [];

  // A fonte declara o que não enxerga antes de qualquer número: quem lê a
  // projeção precisa saber de qual metade da operação ela foi extraída.
  if (ctx.sourceCoverage) assumptions.push(`Cobertura da fonte: ${ctx.sourceCoverage}`);

  // Carga por corretor é aritmética pura sobre contagem viva — é o único
  // número desta projeção que não depende de nenhum modelo.
  if (ctx.activeBrokers > 0) {
    assumptions.push(
      `Carga atual: ${ctx.openLeads} leads abertos para ${ctx.activeBrokers} corretor(es) ativo(s) — ${r2(ctx.openLeads / ctx.activeBrokers)} por corretor.`,
    );
    const after = ctx.activeBrokers + heads;
    assumptions.push(
      `Com ${heads} corretor(es) a mais: os mesmos ${ctx.openLeads} leads abertos para ${after} corretores — ${r2(ctx.openLeads / after)} por corretor. É redistribuição de carga; contratar não cria demanda.`,
    );
  }

  // Contratar mexe na folha e o Atlas não conhece salário: 0 aqui é ausência de
  // dado, não gratuidade.
  assumptions.push(
    "Custo de folha não é conhecido pelo Atlas — delta de gasto semanal fica em 0 por falta de dado, não porque contratar seja de graça.",
  );

  // A amostra é a população ATRIBUÍDA: contar linha sem autor abriria a porta
  // com movimentação que não entra no numerador — lastro de 430 sobre conta
  // feita com 199.
  const sample = ctx.observedAttributedMoves;
  const throughput = ctx.observedLeadsPerBrokerPerWeek;
  if (ctx.observedMoves > 0) {
    assumptions.push(
      `Amostra atribuída: ${sample} de ${ctx.observedMoves} movimentações lidas têm autor corretor identificado (${Math.round((1 - sample / ctx.observedMoves) * 1000) / 10}% do histórico não tem dono e fica fora da conta).`,
    );
  }

  // Sem corretor ativo no cadastro, "leads por corretor por semana" não tem
  // sujeito: qualquer número aqui seria média de um conjunto vazio.
  if (ctx.activeBrokers <= 0) {
    return noBasis(
      move,
      assumptions,
      sample,
      "não há corretor ativo no cadastro — throughput por corretor não tem sujeito",
      MISSING_MEASUREMENT_NOTE,
    );
  }
  if (throughput == null) {
    return noBasis(move, assumptions, sample, "throughput por corretor não é medido nesta base", MISSING_MEASUREMENT_NOTE);
  }
  if (sample < MINIMUM_CAPACITY_SAMPLE) {
    return noBasis(
      move,
      assumptions,
      sample,
      `amostra insuficiente: ${sample} movimentações de corretor contra o mínimo de ${MINIMUM_CAPACITY_SAMPLE}`,
      MISSING_MEASUREMENT_NOTE,
    );
  }
  if (ctx.observedActors < MINIMUM_CAPACITY_ACTORS) {
    return noBasis(
      move,
      assumptions,
      sample,
      `${ctx.observedActors} corretor(es) movimentaram leads na janela, contra o mínimo de ${MINIMUM_CAPACITY_ACTORS} — média de tão poucas pessoas não é throughput de equipe`,
      MISSING_MEASUREMENT_NOTE,
    );
  }
  if (ctx.observedWeeks < MINIMUM_CAPACITY_WEEKS) {
    return noBasis(
      move,
      assumptions,
      sample,
      `janela observada de ${r2(ctx.observedWeeks)} semana(s), abaixo do mínimo de ${MINIMUM_CAPACITY_WEEKS}`,
      MISSING_MEASUREMENT_NOTE,
    );
  }
  if (throughput <= 0) {
    return noBasis(move, assumptions, sample, "nenhum corretor movimentou leads na janela observada", MISSING_MEASUREMENT_NOTE);
  }

  assumptions.push(
    `Throughput observado: ${r2(throughput)} leads distintos trabalhados por corretor por semana (${sample} movimentações de ${ctx.observedActors} corretor(es) em ${r2(ctx.observedWeeks)} semana(s)).`,
  );

  // Descarte em massa é rápido e não é trabalho comercial. Sem esta linha, um
  // mutirão de limpeza vira "ritmo de corretagem" na leitura da diretoria.
  if (ctx.observedTerminalShare != null) {
    assumptions.push(
      `${Math.round(ctx.observedTerminalShare * 1000) / 10}% das movimentações observadas foram para etapa terminal (ganho/perda/arquivo) — essa parcela é velocidade de encerramento, não de trabalho comercial.`,
    );
  }

  const raw = throughput * heads;
  // Horizonte de 1 semana: leads trabalhados na semana e leads abertos hoje são
  // a mesma unidade, então o estoque é teto legítimo — e a regra é declarada
  // sempre, morda ou não, porque limite invisível é comentário, não regra.
  const expected = Math.min(raw, ctx.openLeads);
  assumptions.push(
    `Ganho bruto = ${r2(throughput)} × ${heads} = ${r2(raw)} leads a mais trabalhados por semana.`,
    `Teto do horizonte: no máximo os ${ctx.openLeads} leads abertos de hoje podem ser trabalhados na semana${expected < raw ? `, então o ganho para em ${r2(expected)}` : " (o teto não morde neste cenário)"}.`,
    "Faixa de ±25% sobre o ganho projetado.",
  );

  if (ctx.observedAdvanceRate != null) {
    assumptions.push(
      `Taxa de avanço observada: ${Math.round(ctx.observedAdvanceRate * 1000) / 10}% das movimentações avançaram etapa — sustenta esperar avanço de funil, não venda.`,
    );
  }

  // A regra que o dono cravou: sem ganho registrado, receita não se projeta.
  if (ctx.observedWins <= 0) {
    assumptions.push(
      `Receita fica SEM LASTRO: ${sample} movimentações e nenhum ganho registrado na janela — não existe taxa de conversão observada para transformar lead trabalhado em venda. Esta projeção é de capacidade, não de faturamento.`,
    );
  } else {
    assumptions.push(
      `${ctx.observedWins} ganho(s) registrado(s) na janela — amostra ainda pequena demais para virar projeção de receita; a projeção segue sendo de capacidade.`,
    );
  }

  // Decisão de folha não ganha confiança "alta" a partir de movimentação de
  // kanban: o registro mede trabalho declarado, não resultado. E quando mais da
  // metade do movimento observado é encerramento, o teto é "baixa" — ritmo de
  // descarte não sustenta previsão de trabalho comercial.
  const mostlyTerminal = (ctx.observedTerminalShare ?? 0) > 0.5;
  const confidence: MoveProjection["confidence"] =
    !mostlyTerminal && sample >= MINIMUM_CAPACITY_SAMPLE * 5 && ctx.observedWeeks >= MINIMUM_CAPACITY_WEEKS * 2 ? "media" : "baixa";

  return {
    moveKind: move.kind,
    target: move.target,
    weeklySpendDelta: 0,
    weeklyLeadsDelta: band(expected),
    confidence,
    assumptions,
    horizon: "1 semana",
    basis: { measured: true, sample, minimumSample: MINIMUM_CAPACITY_SAMPLE },
  };
}

/** Projeta o plano inteiro: uma projeção por movimento + totais somados. */
export function simulatePlan(plan: { moves: SimulatedMove[] }, context: SimulationContext): PlanProjection {
  const projections = plan.moves.map((m) => simulateMove(m, context));
  let spend = 0;
  let pess = 0;
  let esp = 0;
  let otm = 0;
  for (const p of projections) {
    spend += p.weeklySpendDelta;
    pess += p.weeklyLeadsDelta.pessimista;
    esp += p.weeklyLeadsDelta.esperado;
    otm += p.weeklyLeadsDelta.otimista;
  }
  return {
    projections,
    totals: {
      weeklySpendDelta: r2(spend),
      weeklyLeadsDelta: { pessimista: r2(pess), esperado: r2(esp), otimista: r2(otm) },
    },
  };
}
