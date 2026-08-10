import type { AssistedInteractionLearningAssessment } from "./assisted-interaction-learning";

export type AssistedInteractionGovernanceInput = {
  learning: AssistedInteractionLearningAssessment;
  drafted: number;
  confirmed: number;
  feedbackReceived: number;
  confirmationRate: number | null;
  helpfulRate: number | null;
  averageMinutesToNextAction: number | null;
};

export type AssistedInteractionGovernanceDecision = {
  id: string;
  priority: number;
  title: string;
  reason: string;
  evidence: string[];
  action: string;
  href: string;
  type: "Governança de IA";
  confidence: null;
  confidenceBasis: "deterministic";
};

export type AssistedInteractionGovernanceReviewState = {
  state: "not_started" | "pending_outcome" | "closed" | "rejected";
  label: string;
  detail: string;
};

type GovernanceLedgerRecord = {
  decision_key: string;
  human_decision: string;
  due_at: string | null;
  outcome_recorded_at: string | null;
};

export type GovernedDecisionCycleRecord = GovernanceLedgerRecord & {
  created_at: string | null;
};

export type GovernedDecisionCycleSummary = {
  registeredThisWeek: number;
  awaitingOutcome: number;
  overdue: number;
  dueSoon: number;
  withoutDeadline: number;
  outcomesRecordedThisWeek: number;
};

export type GovernedDecisionCycleFilter = "attention" | "overdue" | "due_soon" | "without_deadline" | "pending" | "closed" | "all";

export type GovernedDecisionNextFocus<T extends GovernedDecisionCycleRecord> = {
  record: T | null;
  state: "overdue" | "pending" | "without_deadline" | "clear";
};

export type GovernedDecisionDeadlineState = "overdue" | "upcoming" | "unscheduled";

const percent = (value: number | null) => value === null ? "sem amostra" : `${value.toFixed(1)}%`;
const duration = (value: number | null) => value === null ? "sem amostra" : `${Math.round(value)} min`;

export function isGovernedDecisionDueSoon(record: GovernanceLedgerRecord, now = new Date()): boolean {
  if (record.human_decision === "reject" || record.outcome_recorded_at) return false;
  const dueAt = record.due_at ? new Date(record.due_at) : null;
  if (!dueAt || !Number.isFinite(dueAt.getTime())) return false;
  const nextDay = new Date(now);
  nextDay.setHours(nextDay.getHours() + 24);
  return dueAt >= now && dueAt <= nextDay;
}

/**
 * Converts only aggregate, supervised-learning signals into a human decision.
 * The returned record is intentionally a recommendation: persistence, assignment,
 * deadline and outcome remain governed by the existing decision ledger.
 */
export function buildAssistedInteractionGovernanceDecision(
  input: AssistedInteractionGovernanceInput,
): AssistedInteractionGovernanceDecision | null {
  if (!["review", "observe"].includes(input.learning.status)) return null;

  return {
    id: "assisted-interaction-learning-review",
    priority: input.learning.status === "review" ? 82 : 72,
    title: input.learning.title,
    reason: input.learning.recommendation,
    evidence: [
      input.learning.evidence,
      `Rascunhos: ${input.drafted} · confirmações: ${input.confirmed} · retornos humanos: ${input.feedbackReceived}.`,
      `Confirmação: ${percent(input.confirmationRate)} · utilidade percebida: ${percent(input.helpfulRate)} · próxima ação: ${duration(input.averageMinutesToNextAction)}.`,
    ],
    action: "Registrar revisão, responsável, prazo e resultado observado no Livro Executivo.",
    href: "/decision-center#livro-executivo",
    type: "Governança de IA",
    confidence: null,
    confidenceBasis: "deterministic",
  };
}

export function assessAssistedInteractionGovernanceReview(
  records: GovernanceLedgerRecord[],
): AssistedInteractionGovernanceReviewState {
  const record = records
    .filter((item) => item.decision_key === "human:assisted-interaction-learning-review")
    .sort((left, right) => String(right.due_at || "").localeCompare(String(left.due_at || "")))[0];

  if (!record) return { state: "not_started", label: "Revisão ainda não registrada", detail: "Registre uma decisão humana antes de alterar qualquer rotina." };
  if (record.human_decision === "reject") return { state: "rejected", label: "Revisão rejeitada", detail: "A recomendação foi rejeitada por uma pessoa; nenhuma alteração foi executada." };
  if (record.outcome_recorded_at) return { state: "closed", label: "Revisão com resultado registrado", detail: "O ciclo anterior foi fechado por uma pessoa. A nova leitura continua somente como acompanhamento." };
  const deadline = describeGovernedDecisionDeadline(record.due_at);
  return {
    state: "pending_outcome",
    label: "Revisão em acompanhamento",
    detail: deadline.state === "unscheduled"
      ? "Resultado humano pendente; defina uma data de aferição para completar o ciclo."
      : `Resultado humano pendente: ${deadline.label}.`,
  };
}

/**
 * Provides a compact, factual reading of the decision cycle already visible to
 * the current user. It never changes a deadline, owner, lead or recommendation.
 */
export function summarizeGovernedDecisionCycle(
  records: GovernedDecisionCycleRecord[],
  now = new Date(),
): GovernedDecisionCycleSummary {
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const isThisWeek = (value: string | null) => {
    const date = value ? new Date(value) : null;
    return Boolean(date && Number.isFinite(date.getTime()) && date >= weekStart && date <= now);
  };
  const awaiting = records.filter((item) => item.human_decision !== "reject" && !item.outcome_recorded_at);
  return {
    registeredThisWeek: records.filter((item) => isThisWeek(item.created_at)).length,
    awaitingOutcome: awaiting.length,
    overdue: awaiting.filter((item) => {
      const dueAt = item.due_at ? new Date(item.due_at) : null;
      return Boolean(dueAt && Number.isFinite(dueAt.getTime()) && dueAt < now);
    }).length,
    dueSoon: awaiting.filter((item) => isGovernedDecisionDueSoon(item, now)).length,
    withoutDeadline: awaiting.filter((item) => {
      const dueAt = item.due_at ? new Date(item.due_at) : null;
      return !dueAt || !Number.isFinite(dueAt.getTime());
    }).length,
    outcomesRecordedThisWeek: records.filter((item) => isThisWeek(item.outcome_recorded_at)).length,
  };
}

/**
 * Reorders records only for the current screen: overdue commitments, dated
 * pending outcomes, missing-deadline records, then closed history. No writes occur.
 */
export function prioritizeGovernedDecisionCycle<T extends GovernedDecisionCycleRecord>(
  records: T[],
  now = new Date(),
): T[] {
  const rank = (record: T) => {
    if (record.human_decision === "reject" || record.outcome_recorded_at) return 3;
    const dueAt = record.due_at ? new Date(record.due_at) : null;
    if (dueAt && Number.isFinite(dueAt.getTime()) && dueAt < now) return 0;
    if (dueAt && Number.isFinite(dueAt.getTime())) return 1;
    return 2;
  };
  const time = (value: string | null) => {
    const date = value ? new Date(value).getTime() : 0;
    return Number.isFinite(date) ? date : 0;
  };
  return [...records].sort((left, right) => {
    const rankDelta = rank(left) - rank(right);
    if (rankDelta) return rankDelta;
    if (rank(left) < 2) return time(left.due_at) - time(right.due_at);
    return time(right.created_at) - time(left.created_at);
  });
}

/**
 * Filters the already scoped ledger for the current screen. This is a view-only
 * helper: it never changes a human decision, deadline, owner or outcome.
 */
export function filterGovernedDecisionCycle<T extends GovernedDecisionCycleRecord>(
  records: T[],
  filter: GovernedDecisionCycleFilter,
  now = new Date(),
): T[] {
  const isOpen = (record: T) => record.human_decision !== "reject" && !record.outcome_recorded_at;
  const isOverdue = (record: T) => {
    if (!isOpen(record)) return false;
    const dueAt = record.due_at ? new Date(record.due_at) : null;
    return Boolean(dueAt && Number.isFinite(dueAt.getTime()) && dueAt < now);
  };

  if (filter === "all") return records;
  if (filter === "attention") return records.filter(isOpen);
  if (filter === "overdue") return records.filter(isOverdue);
  if (filter === "due_soon") return records.filter((record) => {
    return isOpen(record) && isGovernedDecisionDueSoon(record, now);
  });
  if (filter === "without_deadline") return records.filter((record) => {
    if (!isOpen(record)) return false;
    const dueAt = record.due_at ? new Date(record.due_at) : null;
    return !dueAt || !Number.isFinite(dueAt.getTime());
  });
  if (filter === "pending") return records.filter((record) => isOpen(record) && !isOverdue(record));
  return records.filter((record) => !isOpen(record));
}

/**
 * Surfaces one existing human commitment as the next focus. The source remains
 * the ordered ledger and this helper has no persistence or automation effect.
 */
export function getNextGovernedDecisionFocus<T extends GovernedDecisionCycleRecord>(
  records: T[],
  now = new Date(),
): GovernedDecisionNextFocus<T> {
  const next = prioritizeGovernedDecisionCycle(records, now)[0] ?? null;
  if (!next) return { record: null, state: "clear" };
  if (next.human_decision === "reject" || next.outcome_recorded_at) return { record: null, state: "clear" };
  const dueAt = next.due_at ? new Date(next.due_at) : null;
  if (!dueAt || !Number.isFinite(dueAt.getTime())) return { record: next, state: "without_deadline" };
  return { record: next, state: dueAt < now ? "overdue" : "pending" };
}

/**
 * Keeps legacy or incomplete decision records readable in the executive view.
 * It normalizes only display state and never repairs or writes the source data.
 */
export function describeGovernedDecisionDeadline(value: string | null | undefined, now = new Date()): {
  state: GovernedDecisionDeadlineState;
  label: string;
} {
  if (!value) return { state: "unscheduled", label: "sem prazo registrado" };
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { state: "unscheduled", label: "prazo indisponível" };
  return {
    state: date < now ? "overdue" : "upcoming",
    label: `prazo ${date.toLocaleString("pt-BR")}`,
  };
}
