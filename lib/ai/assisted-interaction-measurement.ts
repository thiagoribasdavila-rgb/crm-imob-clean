import { assessAssistedInteractionLearning } from "./assisted-interaction-learning.ts";

export const assistedInteractionMetricTypes = {
  draft: "assisted_interaction.draft_created",
  confirmed: "assisted_interaction.confirmed",
  discarded: "assisted_interaction.draft_discarded",
  feedback: "assisted_interaction.feedback_recorded",
} as const;

export type AssistedInteractionMetricType =
  (typeof assistedInteractionMetricTypes)[keyof typeof assistedInteractionMetricTypes];

export type AssistedInteractionMetricRow = {
  event_type: string;
  aggregate_id: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: string;
};

export type AssistedInteractionConfirmationRow = {
  lead_id: string | null;
  created_at: string | null;
};

type CaptureTimeline = {
  draftAt?: number;
  confirmedAt?: number;
  discardedAt?: number;
  feedback?: "helpful" | "needs_adjustment" | "not_useful";
};

function captureKey(row: AssistedInteractionMetricRow) {
  const value = row.payload?.captureId;
  return typeof value === "string" && value.trim() ? value : null;
}

function validTime(value: string | null | undefined) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]) {
  return values.length
    ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 10) / 10
    : null;
}

export function buildAssistedInteractionMeasurement(
  metrics: AssistedInteractionMetricRow[],
  confirmedInteractions: AssistedInteractionConfirmationRow[],
  laterLeadActivities: Array<{ lead_id: string | null; created_at: string | null }>,
) {
  const captures = new Map<string, CaptureTimeline>();
  for (const metric of metrics) {
    const captureId = captureKey(metric);
    const occurredAt = validTime(metric.occurred_at);
    if (!captureId || occurredAt === null) continue;
    const item = captures.get(captureId) ?? {};
    if (metric.event_type === assistedInteractionMetricTypes.draft) item.draftAt ??= occurredAt;
    if (metric.event_type === assistedInteractionMetricTypes.confirmed) item.confirmedAt ??= occurredAt;
    if (metric.event_type === assistedInteractionMetricTypes.discarded) item.discardedAt ??= occurredAt;
    if (metric.event_type === assistedInteractionMetricTypes.feedback) {
      const feedback = metric.payload?.feedback;
      if (feedback === "helpful" || feedback === "needs_adjustment" || feedback === "not_useful") item.feedback ??= feedback;
    }
    captures.set(captureId, item);
  }

  const values = [...captures.values()];
  const drafted = values.filter((item) => item.draftAt !== undefined).length;
  const confirmed = values.filter((item) => item.confirmedAt !== undefined).length;
  const discarded = values.filter((item) => item.discardedAt !== undefined && item.confirmedAt === undefined).length;
  const feedback = values.filter((item) => item.feedback !== undefined);
  const helpful = feedback.filter((item) => item.feedback === "helpful").length;
  const needsAdjustment = feedback.filter((item) => item.feedback === "needs_adjustment").length;
  const notUseful = feedback.filter((item) => item.feedback === "not_useful").length;
  const confirmationMinutes = values
    .filter((item) => item.draftAt !== undefined && item.confirmedAt !== undefined)
    .map((item) => (item.confirmedAt! - item.draftAt!) / 60_000)
    .filter((value) => value >= 0 && value <= 24 * 60);

  const nextActivityMinutes = confirmedInteractions.flatMap((confirmation) => {
    const confirmedAt = validTime(confirmation.created_at);
    if (!confirmation.lead_id || confirmedAt === null) return [];
    const next = laterLeadActivities
      .map((activity) => ({ ...activity, timestamp: validTime(activity.created_at) }))
      .filter((activity) => activity.lead_id === confirmation.lead_id && activity.timestamp !== null && activity.timestamp > confirmedAt)
      .sort((a, b) => a.timestamp! - b.timestamp!)[0];
    const nextTimestamp = next?.timestamp ?? null;
    const elapsed = nextTimestamp === null ? null : (nextTimestamp - confirmedAt) / 60_000;
    return elapsed !== null && elapsed >= 0 && elapsed <= 30 * 24 * 60 ? [elapsed] : [];
  });

  const summary = {
    drafted,
    confirmed,
    discarded,
    feedbackReceived: feedback.length,
    helpful,
    needsAdjustment,
    notUseful,
    helpfulRate: feedback.length ? Math.round((helpful / feedback.length) * 1000) / 10 : null,
    confirmationRate: drafted ? Math.round((confirmed / drafted) * 1000) / 10 : null,
    discardRate: drafted ? Math.round((discarded / drafted) * 1000) / 10 : null,
    medianMinutesToConfirmation: median(confirmationMinutes),
    averageMinutesToNextAction: average(nextActivityMinutes),
    measurementsWithNextAction: nextActivityMinutes.length,
  };

  return {
    summary,
    learning: assessAssistedInteractionLearning(summary),
    policy: {
      aggregateOnly: true,
      rawConversationContentStored: false,
      humanConfirmationRequired: true,
      humanFeedbackOptional: true,
      automaticExternalAction: false,
      interpretation: "A próxima ação mede o próximo registro comercial posterior à confirmação; o feedback é uma avaliação humana opcional da preparação e não comprova qualidade do atendimento.",
    },
  };
}
