const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const classes = new Set(["signal_mapping", "attribution_review", "audience_hypothesis"]);
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const blocked = (issues) => ({ approved: false, status: "meta_execution_preparation_blocked", issues: [...issues], finalGateAllowed: false, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaExecutionPreparation(record, now = new Date("2026-07-19T12:30:00Z")) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-execution-preparation.v1") issues.add("schema_invalid");
  if (record?.status !== "prepared_for_final_gate") issues.add("preparation_not_ready");
  if (!safeReference.test(record?.approvalReference ?? "")) issues.add("approval_reference_missing");
  const preparation = record?.preparation;
  if (!classes.has(preparation?.changeClass) || !safeReference.test(preparation?.checklistVersion ?? "") || !safeReference.test(preparation?.preparedByReference ?? "") || !iso.test(preparation?.preparedAt ?? "") || !iso.test(preparation?.approvalExpiresAt ?? "")) issues.add("preparation_definition_invalid");
  if (iso.test(preparation?.approvalExpiresAt ?? "") && Date.parse(preparation.approvalExpiresAt) <= now.getTime()) issues.add("approval_expired");
  if (record?.execution?.authorized !== false || record?.execution?.budgetChanged !== false || record?.execution?.audienceChanged !== false || record?.execution?.campaignChanged !== false || record?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "approvalReference", "preparation", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_execution_preparation_valid_final_gate_required", finalGateAllowed: true, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaExecutionPreparation() {
  const base = { schema: "atlas.meta-execution-preparation.v1", status: "prepared_for_final_gate", approvalReference: "approval-20260719-001", preparation: { changeClass: "signal_mapping", checklistVersion: "checklist-20260719-001", preparedByReference: "admin-20260719-001", preparedAt: "2026-07-19T12:20:00Z", approvalExpiresAt: "2026-07-26T12:00:00Z" }, execution: { authorized: false, budgetChanged: false, audienceChanged: false, campaignChanged: false, productionTouched: false }, forbidden: { automaticExecution: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["expired", (value) => ({ ...value, preparation: { ...value.preparation, approvalExpiresAt: "2026-07-19T12:00:00Z" } }), false], ["missing-checklist", (value) => ({ ...value, preparation: { ...value.preparation, checklistVersion: "" } }), false], ["authorized", (value) => ({ ...value, execution: { ...value.execution, authorized: true } }), false], ["audience", (value) => ({ ...value, execution: { ...value.execution, audienceChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaExecutionPreparation(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaExecutionPreparation(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
