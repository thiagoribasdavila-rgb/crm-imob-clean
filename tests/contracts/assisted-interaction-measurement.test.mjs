import test from "node:test";
import assert from "node:assert/strict";
import {
  assistedInteractionMetricTypes,
  buildAssistedInteractionMeasurement,
} from "../../lib/ai/assisted-interaction-measurement.ts";

test("assisted interaction measurement reports aggregate confirmation and discard rates", () => {
  const result = buildAssistedInteractionMeasurement([
    { event_type: assistedInteractionMetricTypes.draft, aggregate_id: "lead-a", payload: { captureId: "a" }, occurred_at: "2026-08-04T10:00:00.000Z" },
    { event_type: assistedInteractionMetricTypes.confirmed, aggregate_id: "lead-a", payload: { captureId: "a" }, occurred_at: "2026-08-04T10:10:00.000Z" },
    { event_type: assistedInteractionMetricTypes.draft, aggregate_id: "lead-b", payload: { captureId: "b" }, occurred_at: "2026-08-04T10:00:00.000Z" },
    { event_type: assistedInteractionMetricTypes.discarded, aggregate_id: "lead-b", payload: { captureId: "b" }, occurred_at: "2026-08-04T10:02:00.000Z" },
    { event_type: assistedInteractionMetricTypes.feedback, aggregate_id: "lead-a", payload: { captureId: "a", feedback: "helpful" }, occurred_at: "2026-08-04T10:31:00.000Z" },
  ], [{ lead_id: "lead-a", created_at: "2026-08-04T10:10:00.000Z" }], [{ lead_id: "lead-a", created_at: "2026-08-04T10:30:00.000Z" }]);

  assert.equal(result.summary.drafted, 2);
  assert.equal(result.summary.confirmed, 1);
  assert.equal(result.summary.discarded, 1);
  assert.equal(result.summary.confirmationRate, 50);
  assert.equal(result.summary.discardRate, 50);
  assert.equal(result.summary.medianMinutesToConfirmation, 10);
  assert.equal(result.summary.averageMinutesToNextAction, 20);
  assert.equal(result.summary.feedbackReceived, 1);
  assert.equal(result.summary.helpful, 1);
  assert.equal(result.summary.helpfulRate, 100);
  assert.equal(result.learning.status, "insufficient_sample");
});

test("measurement never derives raw conversation content", async () => {
  const file = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../../app/api/v1/leads/[id]/assisted-interaction/route.ts", import.meta.url), "utf8"));
  const measurementBlock = file.slice(file.indexOf("async function recordMeasurement"), file.indexOf("function errorResponse"));
  assert.equal(measurementBlock.includes("sourceText"), false);
  assert.equal(measurementBlock.includes("originalNote"), false);
});

test("feedback supervisionado não envia texto original para a telemetria", async () => {
  const file = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../../app/api/v1/leads/[id]/assisted-interaction/route.ts", import.meta.url), "utf8"));
  const feedbackBlock = file.slice(file.indexOf('if (action === "feedback")'), file.indexOf('return NextResponse.json(\n      { error: "Ação de captura assistida inválida."'));
  assert.ok(feedbackBlock.length > 0, "feedback branch should be present before the invalid-action response");
  assert.match(feedbackBlock, /feedbackOptions/);
  assert.match(feedbackBlock, /humanReviewed: true/);
  assert.match(feedbackBlock, /assisted_interaction_confirmed/);
  assert.equal(feedbackBlock.includes("sourceText:"), false);
  assert.equal(feedbackBlock.includes("originalNote:"), false);
});
