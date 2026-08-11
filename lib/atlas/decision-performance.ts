export const ATLAS_DECISION_PERFORMANCE_CONTRACT = {
  version: "v3000-phase-55",
  source: "atlas.pipeline",
  aggregateType: "pipeline_decision",
  budgets: {
    interactionFeedbackMs: 100,
    telemetryPayloadBytes: 1024,
    operationalLeadLimit: 500,
  },
  eventTypes: {
    priorityIdentified: "atlas.pipeline_priority_identified",
    opportunityOpened: "atlas.pipeline_opportunity_opened",
    actionStarted: "atlas.pipeline_action_started",
    resultRegistered: "atlas.pipeline_result_registered",
  },
} as const;

export type DecisionPerformanceEvent =
  | "priorityIdentified"
  | "opportunityOpened"
  | "actionStarted"
  | "resultRegistered";

export type DecisionPerformancePayload = {
  durationMs?: number;
  loadedLeadCount?: number;
  visibleStageCount?: number;
  method?: string;
  fromStage?: string;
  toStage?: string;
  result?: "success" | "error";
};

const ALLOWED_PAYLOAD_KEYS = new Set<keyof DecisionPerformancePayload>([
  "durationMs",
  "loadedLeadCount",
  "visibleStageCount",
  "method",
  "fromStage",
  "toStage",
  "result",
]);

export function sanitizeDecisionPerformancePayload(
  payload: DecisionPerformancePayload & Record<string, unknown>,
) {
  const sanitized: Record<string, number | string> = {
    performanceVersion: ATLAS_DECISION_PERFORMANCE_CONTRACT.version,
  };

  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_PAYLOAD_KEYS.has(key as keyof DecisionPerformancePayload))
      continue;
    if (typeof value !== "number" && typeof value !== "string") continue;
    sanitized[key] =
      typeof value === "number" && key === "durationMs"
        ? Math.max(0, Math.round(value))
        : value;
  }

  return sanitized;
}

export function buildDecisionPerformanceEvent(
  event: DecisionPerformanceEvent,
  payload: DecisionPerformancePayload & Record<string, unknown> = {},
) {
  return {
    eventType: ATLAS_DECISION_PERFORMANCE_CONTRACT.eventTypes[event],
    source: ATLAS_DECISION_PERFORMANCE_CONTRACT.source,
    aggregateType: ATLAS_DECISION_PERFORMANCE_CONTRACT.aggregateType,
    payload: sanitizeDecisionPerformancePayload(payload),
  };
}

export function groupRecordsByStage<T extends { status?: string | null }>(
  records: T[],
  fallbackStage = "novo",
) {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const stage = record.status || fallbackStage;
    const items = grouped.get(stage);
    if (items) items.push(record);
    else grouped.set(stage, [record]);
  }
  return grouped;
}

export function decisionGroupingComplexity(
  leadCount: number,
  stageCount: number,
) {
  const safeLeadCount = Math.max(0, Math.floor(leadCount));
  const safeStageCount = Math.max(0, Math.floor(stageCount));
  const previousComparisons = safeLeadCount * safeStageCount;
  const optimizedOperations = safeLeadCount + safeStageCount;
  const reductionPercent = previousComparisons
    ? Number(
        (
          ((previousComparisons - optimizedOperations) / previousComparisons) *
          100
        ).toFixed(2),
      )
    : 0;

  return {
    previousComparisons,
    optimizedOperations,
    reductionPercent,
  };
}
