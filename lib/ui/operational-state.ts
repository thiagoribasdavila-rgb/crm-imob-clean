export type OperationalState =
  | "neutral"
  | "action"
  | "healthy"
  | "attention"
  | "critical"
  | "blocked"
  | "insufficient"
  | "loading";

export type OperationalTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "violet";

export type OperationalDecision =
  | "observe"
  | "act"
  | "review"
  | "act_now"
  | "unblock"
  | "validate"
  | "wait";

export type OperationalStateDefinition = {
  state: OperationalState;
  label: string;
  tone: OperationalTone;
  symbol: string;
  severityRank: number;
  decision: OperationalDecision;
  meaning: string;
};

export const OPERATIONAL_STATE_DICTIONARY: Record<OperationalState, OperationalStateDefinition> = {
  neutral: {
    state: "neutral",
    label: "Informativo",
    tone: "neutral",
    symbol: "•",
    severityRank: 0,
    decision: "observe",
    meaning: "Contexto sem avaliação positiva ou negativa.",
  },
  action: {
    state: "action",
    label: "Ação disponível",
    tone: "info",
    symbol: "→",
    severityRank: 1,
    decision: "act",
    meaning: "Existe uma próxima ação segura e opcional.",
  },
  healthy: {
    state: "healthy",
    label: "Saudável",
    tone: "success",
    symbol: "✓",
    severityRank: 0,
    decision: "observe",
    meaning: "A evidência disponível confirma operação dentro do esperado.",
  },
  attention: {
    state: "attention",
    label: "Revisar",
    tone: "warning",
    symbol: "!",
    severityRank: 2,
    decision: "review",
    meaning: "Há desvio ou pendência que deve ser revisado, sem bloqueio imediato.",
  },
  critical: {
    state: "critical",
    label: "Agir agora",
    tone: "danger",
    symbol: "!",
    severityRank: 3,
    decision: "act_now",
    meaning: "Há risco comprovado que exige ação humana imediata.",
  },
  blocked: {
    state: "blocked",
    label: "Bloqueado",
    tone: "danger",
    symbol: "×",
    severityRank: 4,
    decision: "unblock",
    meaning: "A operação não pode continuar até que a dependência indicada seja resolvida.",
  },
  insufficient: {
    state: "insufficient",
    label: "Amostra insuficiente",
    tone: "violet",
    symbol: "?",
    severityRank: 1,
    decision: "validate",
    meaning: "Ainda não há evidência suficiente para recomendar uma decisão.",
  },
  loading: {
    state: "loading",
    label: "Atualizando",
    tone: "neutral",
    symbol: "…",
    severityRank: 0,
    decision: "wait",
    meaning: "A leitura ainda está sendo atualizada e não deve orientar decisão.",
  },
};

const STATE_ALIASES: Record<string, OperationalState> = {
  operational: "healthy",
  ready: "healthy",
  connected: "healthy",
  complete: "healthy",
  completed: "healthy",
  sufficient: "healthy",
  success: "healthy",
  opportunity: "action",
  info: "action",
  degraded: "attention",
  stale: "attention",
  stalled: "attention",
  warning: "attention",
  high: "attention",
  error: "critical",
  danger: "critical",
  unavailable: "blocked",
  failed: "blocked",
  no_sample: "insufficient",
  insufficient_sample: "insufficient",
  learning: "insufficient",
  connecting: "loading",
  pending: "loading",
};

export function resolveOperationalState(value: unknown): OperationalStateDefinition {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const state = key in OPERATIONAL_STATE_DICTIONARY
    ? key as OperationalState
    : STATE_ALIASES[key] ?? "neutral";
  return OPERATIONAL_STATE_DICTIONARY[state];
}

export function mostSevereOperationalState(values: unknown[]) {
  return values
    .map(resolveOperationalState)
    .sort((left, right) => right.severityRank - left.severityRank)[0]
    ?? OPERATIONAL_STATE_DICTIONARY.neutral;
}
