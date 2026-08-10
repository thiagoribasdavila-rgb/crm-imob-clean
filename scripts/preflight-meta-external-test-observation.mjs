const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "external_test_observation_blocked", issues: [...issues], productionAllowed: false, retryAllowed: false, promotionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateExternalTestObservation(observation) {
  const issues = new Set();
  if (!observation || observation.schema !== "atlas.meta-external-test-observation.v1") issues.add("schema_invalid");
  if (observation?.status !== "observed_once_in_staging") issues.add("observation_not_complete");
  for (const field of ["permitReference", "eventReference"]) if (!safeReference.test(observation?.[field] ?? "")) issues.add(`safe_reference_missing:${field}`);
  if (observation?.execution?.attemptCount !== 1 || observation?.execution?.permitConsumed !== true || observation?.execution?.externalCallObserved !== true) issues.add("single_execution_proof_missing");
  if (observation?.execution?.productionTouched !== false || observation?.execution?.retryTriggered !== false) issues.add("unsafe_execution_observed");
  if (!["accepted", "rejected", "inconclusive"].includes(observation?.outcome?.resultClass)) issues.add("result_class_invalid");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observation?.outcome?.observedAt ?? "")) issues.add("observed_at_invalid");
  if (observation?.outcome?.followUp !== "human_review_required") issues.add("human_follow_up_required");
  if (!observation?.forbidden || Object.values(observation.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(observation ?? {}).some((key) => !["schema", "status", "permitReference", "eventReference", "execution", "outcome", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "external_test_observation_valid_human_review_required", productionAllowed: false, retryAllowed: false, promotionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestExternalTestObservation() {
  const base = { schema: "atlas.meta-external-test-observation.v1", status: "observed_once_in_staging", permitReference: "permit-20260719-001", eventReference: "event-safe-001", execution: { attemptCount: 1, permitConsumed: true, externalCallObserved: true, productionTouched: false, retryTriggered: false }, outcome: { resultClass: "accepted", observedAt: "2026-07-19T12:00:00.000Z", followUp: "human_review_required" }, forbidden: { providerPayload: true, providerResponseBody: true, customerData: true, automaticRetry: true, automaticPromotion: true } };
  const cases = [["valid", (value) => value, true], ["twice", (value) => ({ ...value, execution: { ...value.execution, attemptCount: 2 } }), false], ["retry", (value) => ({ ...value, execution: { ...value.execution, retryTriggered: true } }), false], ["production", (value) => ({ ...value, execution: { ...value.execution, productionTouched: true } }), false], ["auto-follow-up", (value) => ({ ...value, outcome: { ...value.outcome, followUp: "promote" } }), false], ["payload", (value) => ({ ...value, providerResponseBody: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateExternalTestObservation(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestExternalTestObservation(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
