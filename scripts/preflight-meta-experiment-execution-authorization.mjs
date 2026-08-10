const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const blocked = (issues) => ({ approved: false, status: "meta_experiment_execution_authorization_blocked", issues: [...issues], externalTestAllowed: false, campaignChangeAllowed: false, audienceChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaExperimentExecutionAuthorization(authorization) {
  const issues = new Set();
  if (!authorization || authorization.schema !== "atlas.meta-experiment-execution-authorization.v1") issues.add("schema_invalid");
  if (authorization?.status !== "authorized_for_single_staging_execution") issues.add("authorization_not_complete");
  for (const field of ["planReference", "permitReference"]) if (!safeReference.test(authorization?.[field] ?? "")) issues.add(`reference_missing:${field}`);
  const details = authorization?.authorization;
  if (!safeReference.test(details?.operatorReference ?? "") || !isoDate.test(details?.authorizedAt ?? "") || !isoDate.test(details?.expiresAt ?? "") || new Date(details?.expiresAt) <= new Date(details?.authorizedAt)) issues.add("authorization_window_invalid");
  if (details?.environment !== "staging" || details?.maxAttempts !== 1) issues.add("staging_single_attempt_required");
  if (authorization?.execution?.externalTestAllowed !== false || authorization?.execution?.campaignChanged !== false || authorization?.execution?.audienceChanged !== false || authorization?.execution?.productionTouched !== false) issues.add("execution_must_remain_blocked_until_runtime_gate");
  if (!authorization?.forbidden || Object.values(authorization.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(authorization ?? {}).some((key) => !["schema", "status", "planReference", "permitReference", "authorization", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_experiment_execution_authorization_valid_runtime_gate_required", externalTestAllowed: false, campaignChangeAllowed: false, audienceChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaExperimentExecutionAuthorization() {
  const base = { schema: "atlas.meta-experiment-execution-authorization.v1", status: "authorized_for_single_staging_execution", planReference: "plan-20260719-001", permitReference: "permit-20260719-002", authorization: { operatorReference: "operator-20260719-001", authorizedAt: "2026-07-19T13:30:00.000Z", expiresAt: "2026-07-19T14:00:00.000Z", environment: "staging", maxAttempts: 1 }, execution: { externalTestAllowed: false, campaignChanged: false, audienceChanged: false, productionTouched: false }, forbidden: { planSubstitution: true, multiAttempt: true, production: true, automaticRetry: true, automaticPromotion: true, customerData: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["wrong-env", (value) => ({ ...value, authorization: { ...value.authorization, environment: "production" } }), false], ["multiple", (value) => ({ ...value, authorization: { ...value.authorization, maxAttempts: 2 } }), false], ["expired", (value) => ({ ...value, authorization: { ...value.authorization, expiresAt: "2026-07-19T13:00:00.000Z" } }), false], ["open", (value) => ({ ...value, execution: { ...value.execution, externalTestAllowed: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaExperimentExecutionAuthorization(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaExperimentExecutionAuthorization(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
