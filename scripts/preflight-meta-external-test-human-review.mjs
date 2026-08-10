const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const allowedDecisions = new Set(["accepted_for_analysis", "rejected", "needs_investigation"]);
const allowedRationales = new Set(["technical_result", "policy_result", "data_quality_result", "inconclusive_result"]);
const blocked = (issues) => ({ approved: false, status: "external_test_human_review_blocked", issues: [...issues], nextExternalCallAllowed: false, productionAllowed: false, retryAllowed: false, promotionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateExternalTestHumanReview(review) {
  const issues = new Set();
  if (!review || review.schema !== "atlas.meta-external-test-human-review.v1") issues.add("schema_invalid");
  if (review?.status !== "human_review_recorded") issues.add("human_review_not_recorded");
  for (const field of ["permitReference", "eventReference", "observationReference"]) if (!safeReference.test(review?.[field] ?? "")) issues.add(`safe_reference_missing:${field}`);
  if (!allowedDecisions.has(review?.decision)) issues.add("decision_invalid");
  if (!safeReference.test(review?.review?.reviewerReference ?? "") || !isoDate.test(review?.review?.reviewedAt ?? "")) issues.add("reviewer_proof_missing");
  if (!allowedRationales.has(review?.review?.rationaleCategory)) issues.add("rationale_category_invalid");
  if (review?.execution?.nextExternalCallAllowed !== false || review?.execution?.productionAllowed !== false || review?.execution?.automaticRetryAllowed !== false || review?.execution?.automaticPromotionAllowed !== false) issues.add("execution_must_remain_blocked_after_review");
  if (!review?.forbidden || Object.values(review.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(review ?? {}).some((key) => !["schema", "status", "permitReference", "eventReference", "observationReference", "decision", "review", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "external_test_human_review_valid_analysis_only", nextExternalCallAllowed: false, productionAllowed: false, retryAllowed: false, promotionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestExternalTestHumanReview() {
  const base = { schema: "atlas.meta-external-test-human-review.v1", status: "human_review_recorded", permitReference: "permit-20260719-001", eventReference: "event-safe-001", observationReference: "observation-20260719-001", decision: "accepted_for_analysis", review: { reviewerReference: "director-review-20260719", reviewedAt: "2026-07-19T12:05:00.000Z", rationaleCategory: "technical_result" }, execution: { nextExternalCallAllowed: false, productionAllowed: false, automaticRetryAllowed: false, automaticPromotionAllowed: false }, forbidden: { automaticDecision: true, providerPayload: true, customerData: true, secrets: true, automaticRetry: true, automaticPromotion: true } };
  const cases = [["valid", (value) => value, true], ["automatic", (value) => ({ ...value, status: "approved_automatically" }), false], ["open", (value) => ({ ...value, execution: { ...value.execution, nextExternalCallAllowed: true } }), false], ["production", (value) => ({ ...value, execution: { ...value.execution, productionAllowed: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false], ["no-reviewer", (value) => ({ ...value, review: { ...value.review, reviewerReference: null } }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateExternalTestHumanReview(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestExternalTestHumanReview(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
