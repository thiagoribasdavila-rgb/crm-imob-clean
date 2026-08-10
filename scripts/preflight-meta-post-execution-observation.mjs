const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const metrics = new Set(["qualified_leads", "contact_rate", "visit_rate", "proposal_rate", "sales_rate"]);
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const blocked = (issues) => ({ approved: false, status: "meta_post_execution_observation_blocked", issues: [...issues], interpretationAllowed: false, optimizationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaPostExecutionObservation(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-post-execution-observation.v1") issues.add("schema_invalid");
  if (record?.status !== "ready_for_human_interpretation") issues.add("observation_not_ready");
  if (!safeReference.test(record?.receiptReference ?? "")) issues.add("receipt_reference_missing");
  const observation = record?.observation;
  if (!metrics.has(observation?.metric) || !Number.isFinite(observation?.baselineValue) || !Number.isFinite(observation?.observedValue) || !iso.test(observation?.windowStart ?? "") || !iso.test(observation?.windowEnd ?? "") || Date.parse(observation?.windowEnd ?? "") <= Date.parse(observation?.windowStart ?? "") || !safeReference.test(observation?.sourceReference ?? "") || observation?.isCausalClaim !== false) issues.add("observation_definition_invalid");
  if (record?.execution?.atlasExecuted !== false || record?.execution?.externalChangesRequested !== false || record?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "receiptReference", "observation", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_post_execution_observation_valid_human_interpretation_required", interpretationAllowed: true, optimizationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaPostExecutionObservation() {
  const base = { schema: "atlas.meta-post-execution-observation.v1", status: "ready_for_human_interpretation", receiptReference: "receipt-20260719-001", observation: { metric: "qualified_leads", baselineValue: 18, observedValue: 21, windowStart: "2026-07-12T00:00:00Z", windowEnd: "2026-07-19T00:00:00Z", sourceReference: "aggregate-20260719-001", isCausalClaim: false }, execution: { atlasExecuted: false, externalChangesRequested: false, productionTouched: false }, forbidden: { customerData: true, providerPayload: true, secrets: true, automaticOptimization: true } };
  const cases = [["valid", (value) => value, true], ["causal", (value) => ({ ...value, observation: { ...value.observation, isCausalClaim: true } }), false], ["window", (value) => ({ ...value, observation: { ...value.observation, windowEnd: value.observation.windowStart } }), false], ["metric", (value) => ({ ...value, observation: { ...value.observation, metric: "revenue" } }), false], ["production", (value) => ({ ...value, execution: { ...value.execution, productionTouched: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaPostExecutionObservation(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaPostExecutionObservation(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
