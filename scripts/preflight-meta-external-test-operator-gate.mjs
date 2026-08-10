const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "external_test_operator_gate_blocked", issues: [...issues], operatorExecutionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateExternalTestOperatorGate(gate) {
  const issues = new Set();
  if (!gate || gate.schema !== "atlas.meta-external-test-operator-gate.v1") issues.add("schema_invalid");
  if (gate?.status !== "operator_confirmed_for_single_test") issues.add("operator_confirmation_missing");
  if (!safeReference.test(gate?.approvalReference ?? "") || !safeReference.test(gate?.operatorReference ?? "")) issues.add("safe_reference_missing");
  if (gate?.environment !== "staging") issues.add("isolated_staging_required");
  if (gate?.testEventOnly !== true) issues.add("single_test_event_required");
  const opensAt = new Date(gate?.executionWindow?.opensAt);
  const closesAt = new Date(gate?.executionWindow?.closesAt);
  if (Number.isNaN(opensAt.valueOf()) || Number.isNaN(closesAt.valueOf()) || closesAt <= opensAt || closesAt - opensAt > 30 * 60 * 1000) issues.add("short_execution_window_required");
  if (gate?.execution?.manuallyConfirmed !== true) issues.add("manual_confirmation_required");
  if (gate?.execution?.dispatchEnabled !== false || gate?.execution?.productionAllowed !== false || gate?.execution?.automaticRetryAllowed !== false) issues.add("execution_controls_must_remain_blocked");
  if (!gate?.forbidden || Object.values(gate.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(gate ?? {}).some((key) => !["schema", "status", "approvalReference", "operatorReference", "environment", "testEventOnly", "executionWindow", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "operator_gate_valid_external_test_command_still_separate", operatorExecutionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestExternalTestOperatorGate() {
  const base = { schema: "atlas.meta-external-test-operator-gate.v1", status: "operator_confirmed_for_single_test", approvalReference: "approval-20260719-001", operatorReference: "operator-20260719-001", environment: "staging", testEventOnly: true, executionWindow: { opensAt: "2026-07-19T12:00:00.000Z", closesAt: "2026-07-19T12:20:00.000Z" }, execution: { manuallyConfirmed: true, dispatchEnabled: false, productionAllowed: false, automaticRetryAllowed: false }, forbidden: { serviceRoleInClient: true, secretsInRequest: true, customerPayloadInLogs: true, multipleEvents: true, automaticCampaignChange: true } };
  const cases = [["valid", (value) => value, true], ["no-manual", (value) => ({ ...value, execution: { ...value.execution, manuallyConfirmed: false } }), false], ["long-window", (value) => ({ ...value, executionWindow: { ...value.executionWindow, closesAt: "2026-07-19T13:00:01.000Z" } }), false], ["production", (value) => ({ ...value, environment: "production" }), false], ["dispatch", (value) => ({ ...value, execution: { ...value.execution, dispatchEnabled: true } }), false], ["payload", (value) => ({ ...value, customerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateExternalTestOperatorGate(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestExternalTestOperatorGate(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
