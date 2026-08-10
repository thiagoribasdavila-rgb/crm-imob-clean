const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "commercial_dispatch_rehearsal_blocked", issues: [...issues], dispatchAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateCommercialDispatchRehearsal(request) {
  const issues = new Set();
  if (!request || request.schema !== "atlas.meta-commercial-dispatch-rehearsal.v1") issues.add("schema_invalid");
  if (request?.status !== "approved_for_test_event_gate") issues.add("rehearsal_not_approved");
  if (request?.environment !== "staging") issues.add("isolated_staging_required");
  for (const field of ["outboxReference", "authorizationReference"]) if (!safeReference.test(request?.[field] ?? "")) issues.add(`safe_reference_missing:${field}`);
  if (request?.testEventOnly !== true) issues.add("test_event_only_required");
  if (!Number.isInteger(request?.maxEvents) || request.maxEvents < 1 || request.maxEvents > 1) issues.add("single_event_limit_required");
  if (request?.dispatch?.enabled !== false || request?.dispatch?.provider !== null || request?.dispatch?.productionAllowed !== false) issues.add("dispatch_must_remain_disabled_before_external_gate");
  if (!request?.forbidden || Object.values(request.forbidden).some((value) => value !== true)) issues.add("sensitive_data_protection_missing");
  if (Object.keys(request ?? {}).some((key) => !["schema", "status", "environment", "outboxReference", "authorizationReference", "testEventOnly", "maxEvents", "dispatch", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "commercial_dispatch_rehearsal_valid_external_test_still_requires_separate_gate", dispatchAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestCommercialDispatchRehearsal() {
  const base = { schema: "atlas.meta-commercial-dispatch-rehearsal.v1", status: "approved_for_test_event_gate", environment: "staging", outboxReference: "outbox-proof-20260719", authorizationReference: "director-test-event-20260719", testEventOnly: true, maxEvents: 1, dispatch: { enabled: false, provider: null, productionAllowed: false }, forbidden: { secrets: true, rawCustomerData: true, productionEvents: true, automaticRetry: true, automaticOptimization: true } };
  const cases = [["valid", (value) => value, true], ["production", (value) => ({ ...value, environment: "production" }), false], ["multiple", (value) => ({ ...value, maxEvents: 2 }), false], ["live-event", (value) => ({ ...value, testEventOnly: false }), false], ["dispatch-open", (value) => ({ ...value, dispatch: { ...value.dispatch, enabled: true } }), false], ["sensitive", (value) => ({ ...value, accessToken: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateCommercialDispatchRehearsal(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestCommercialDispatchRehearsal(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
