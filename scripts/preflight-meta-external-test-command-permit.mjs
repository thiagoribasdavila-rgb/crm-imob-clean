const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "external_test_command_permit_blocked", issues: [...issues], commandAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateExternalTestCommandPermit(permit) {
  const issues = new Set();
  if (!permit || permit.schema !== "atlas.meta-external-test-command-permit.v1") issues.add("schema_invalid");
  if (permit?.status !== "issued_for_single_external_test") issues.add("permit_not_issued");
  for (const field of ["decisionReference", "approvalReference", "operatorGateReference", "dryRunReference", "eventReference"]) if (!safeReference.test(permit?.[field] ?? "")) issues.add(`safe_reference_missing:${field}`);
  if (permit?.environment !== "staging" || permit?.scope !== "single_test_event") issues.add("staging_single_event_scope_required");
  if (permit?.permit?.issued !== true || permit?.permit?.consumed !== false) issues.add("permit_state_invalid");
  const expiresAt = new Date(permit?.permit?.expiresAt);
  if (Number.isNaN(expiresAt.valueOf()) || expiresAt <= new Date("2026-01-01T00:00:00.000Z")) issues.add("permit_expiry_invalid");
  if (permit?.execution?.commandExecuted !== false || permit?.execution?.productionAllowed !== false || permit?.execution?.retryAllowed !== false || permit?.execution?.automaticPromotionAllowed !== false) issues.add("execution_must_remain_blocked_until_command_invocation");
  if (!permit?.forbidden || Object.values(permit.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(permit ?? {}).some((key) => !["schema", "status", "decisionReference", "approvalReference", "operatorGateReference", "dryRunReference", "eventReference", "environment", "scope", "permit", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "external_test_command_permit_valid_command_not_executed", commandAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestExternalTestCommandPermit() {
  const base = { schema: "atlas.meta-external-test-command-permit.v1", status: "issued_for_single_external_test", decisionReference: "decision-card-20260719", approvalReference: "approval-20260719-001", operatorGateReference: "operator-gate-20260719", dryRunReference: "dry-run-20260719", eventReference: "event-safe-001", environment: "staging", scope: "single_test_event", permit: { issued: true, expiresAt: "2026-07-20T12:00:00.000Z", consumed: false }, execution: { commandExecuted: false, productionAllowed: false, retryAllowed: false, automaticPromotionAllowed: false }, forbidden: { bulkDispatch: true, payloadLogging: true, secretsInArtifact: true, productionDispatch: true, automaticCampaignChanges: true } };
  const cases = [["valid", (value) => value, true], ["bulk", (value) => ({ ...value, scope: "bulk" }), false], ["consumed", (value) => ({ ...value, permit: { ...value.permit, consumed: true } }), false], ["executed", (value) => ({ ...value, execution: { ...value.execution, commandExecuted: true } }), false], ["production", (value) => ({ ...value, environment: "production" }), false], ["unsafe", (value) => ({ ...value, customerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateExternalTestCommandPermit(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestExternalTestCommandPermit(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
