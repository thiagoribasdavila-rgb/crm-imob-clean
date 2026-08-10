const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "meta_experiment_runtime_gate_blocked", issues: [...issues], dispatchAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaExperimentRuntimeGate(gate) {
  const issues = new Set();
  if (!gate || gate.schema !== "atlas.meta-experiment-runtime-gate.v1") issues.add("schema_invalid");
  if (gate?.status !== "runtime_preflight_passed") issues.add("runtime_preflight_not_passed");
  for (const field of ["planReference", "authorizationReference"]) if (!safeReference.test(gate?.[field] ?? "")) issues.add(`reference_missing:${field}`);
  if (gate?.runtime?.environment !== "staging") issues.add("staging_required");
  if (gate?.runtime?.attemptNumber !== 1) issues.add("exactly_one_attempt_required");
  if (gate?.runtime?.authorizationActive !== true || gate?.runtime?.planIntegrityVerified !== true) issues.add("authorization_or_plan_integrity_missing");
  if (gate?.execution?.dispatchAllowed !== false || gate?.execution?.metaContacted !== false || gate?.execution?.campaignChanged !== false || gate?.execution?.productionTouched !== false) issues.add("dispatch_must_remain_blocked_for_preflight");
  if (!gate?.forbidden || Object.values(gate.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(gate ?? {}).some((key) => !["schema", "status", "planReference", "authorizationReference", "runtime", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_experiment_runtime_gate_valid_manual_dispatch_required", dispatchAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaExperimentRuntimeGate() {
  const base = { schema: "atlas.meta-experiment-runtime-gate.v1", status: "runtime_preflight_passed", planReference: "plan-20260719-001", authorizationReference: "authorization-20260719-001", runtime: { environment: "staging", attemptNumber: 1, authorizationActive: true, planIntegrityVerified: true }, execution: { dispatchAllowed: false, metaContacted: false, campaignChanged: false, productionTouched: false }, forbidden: { environmentOverride: true, attemptOverride: true, planOverride: true, automaticRetry: true, customerData: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["production", (value) => ({ ...value, runtime: { ...value.runtime, environment: "production" } }), false], ["second", (value) => ({ ...value, runtime: { ...value.runtime, attemptNumber: 2 } }), false], ["integrity", (value) => ({ ...value, runtime: { ...value.runtime, planIntegrityVerified: false } }), false], ["dispatch", (value) => ({ ...value, execution: { ...value.execution, dispatchAllowed: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaExperimentRuntimeGate(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaExperimentRuntimeGate(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
