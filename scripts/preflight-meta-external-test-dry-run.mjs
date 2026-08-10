const requiredSteps = ["verify_operator_gate", "verify_single_event_scope", "verify_staging_scope", "verify_no_payload_logging", "verify_dispatch_disabled", "require_separate_external_command"];
const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "external_test_dry_run_blocked", issues: [...issues], externalCommandAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateExternalTestDryRun(run) {
  const issues = new Set();
  if (!run || run.schema !== "atlas.meta-external-test-dry-run.v1") issues.add("schema_invalid");
  if (run?.status !== "completed_without_external_calls") issues.add("dry_run_not_completed");
  if (!safeReference.test(run?.operatorGateReference ?? "")) issues.add("operator_gate_reference_missing");
  if (!Array.isArray(run?.steps) || requiredSteps.some((step) => !run.steps.includes(step)) || run.steps.length !== requiredSteps.length) issues.add("dry_run_steps_incomplete");
  for (const field of ["externalCallsMade", "secretsRead", "customerPayloadRead", "productionTouched", "dispatchEnabled"]) if (run?.simulation?.[field] !== false) issues.add(`simulation_control_invalid:${field}`);
  if (run?.result?.readyForSeparateExternalCommand !== true) issues.add("separate_command_not_ready");
  if (!Array.isArray(run?.result?.blockers) || !run.result.blockers.includes("external_command_still_required")) issues.add("external_command_blocker_missing");
  if (Object.keys(run ?? {}).some((key) => !["schema", "status", "operatorGateReference", "steps", "simulation", "result"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "external_test_dry_run_valid_external_command_still_separate", externalCommandAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestExternalTestDryRun() {
  const base = { schema: "atlas.meta-external-test-dry-run.v1", status: "completed_without_external_calls", operatorGateReference: "operator-gate-20260719", steps: requiredSteps, simulation: { externalCallsMade: false, secretsRead: false, customerPayloadRead: false, productionTouched: false, dispatchEnabled: false }, result: { readyForSeparateExternalCommand: true, blockers: ["external_command_still_required"] } };
  const cases = [["valid", (value) => value, true], ["missing-step", (value) => ({ ...value, steps: value.steps.slice(1) }), false], ["call-made", (value) => ({ ...value, simulation: { ...value.simulation, externalCallsMade: true } }), false], ["production", (value) => ({ ...value, simulation: { ...value.simulation, productionTouched: true } }), false], ["no-blocker", (value) => ({ ...value, result: { ...value.result, blockers: [] } }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateExternalTestDryRun(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestExternalTestDryRun(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
