import assert from "node:assert/strict";
import test from "node:test";
import { assessAssistedInteractionLearning } from "../../lib/ai/assisted-interaction-learning.ts";

const base = { drafted: 20, confirmed: 17, feedbackReceived: 10, helpfulRate: 80, confirmationRate: 85, averageMinutesToNextAction: 120 };

test("não recomenda mudança com amostra insuficiente", () => {
  const result = assessAssistedInteractionLearning({ ...base, drafted: 14 });
  assert.equal(result.status, "insufficient_sample");
  assert.equal(result.automaticExternalAction, false);
});

test("prioriza revisão quando a confirmação humana é baixa", () => {
  const result = assessAssistedInteractionLearning({ ...base, confirmationRate: 45 });
  assert.equal(result.status, "review");
  assert.match(result.recommendation, /Revise com a equipe/);
});

test("trata retorno humano fraco como revisão, nunca como automação", () => {
  const result = assessAssistedInteractionLearning({ ...base, helpfulRate: 60 });
  assert.equal(result.status, "review");
  assert.equal(result.humanReviewRequired, true);
  assert.equal(result.automaticExternalAction, false);
});
