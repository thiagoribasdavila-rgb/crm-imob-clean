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

export type MoveProjection = {
  moveKind: string;
  target: string;
  weeklySpendDelta: number;
  weeklyLeadsDelta: { pessimista: number; esperado: number; otimista: number };
  confidence: "baixa" | "media" | "alta";
  assumptions: string[];
  horizon: "1 semana";
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
