const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const classes = new Set(["signal_mapping", "attribution_review", "audience_hypothesis"]);
const outcomes = new Set(["completed", "not_completed", "reverted"]);
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const blocked = (issues) => ({ approved: false, status: "meta_manual_execution_receipt_blocked", issues: [...issues], receiptDisplayAllowed: false, learningEligible: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaManualExecutionReceipt(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-manual-execution-receipt.v1") issues.add("schema_invalid");
  if (record?.status !== "manual_evidence_recorded") issues.add("manual_evidence_missing");
  if (!safeReference.test(record?.finalGateReference ?? "")) issues.add("final_gate_reference_missing");
  const receipt = record?.receipt;
  if (!safeReference.test(receipt?.operatorReference ?? "") || !classes.has(receipt?.changeClass) || !outcomes.has(receipt?.outcome) || !iso.test(receipt?.executedAt ?? "") || !safeReference.test(receipt?.evidenceReference ?? "")) issues.add("receipt_definition_invalid");
  const execution = record?.execution;
  if (execution?.performedExternallyByHuman !== true || execution?.atlasExecuted !== false || execution?.budgetChangedByAtlas !== false || execution?.audienceChangedByAtlas !== false || execution?.campaignChangedByAtlas !== false || execution?.productionTouchedByAtlas !== false) issues.add("execution_boundary_invalid");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "finalGateReference", "receipt", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_manual_execution_receipt_valid_for_observation", receiptDisplayAllowed: true, learningEligible: receipt.outcome === "completed", databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaManualExecutionReceipt() {
  const base = { schema: "atlas.meta-manual-execution-receipt.v1", status: "manual_evidence_recorded", finalGateReference: "gate-20260719-001", receipt: { operatorReference: "admin-20260719-001", changeClass: "signal_mapping", outcome: "completed", executedAt: "2026-07-19T13:00:00Z", evidenceReference: "evidence-20260719-001" }, execution: { performedExternallyByHuman: true, atlasExecuted: false, budgetChangedByAtlas: false, audienceChangedByAtlas: false, campaignChangedByAtlas: false, productionTouchedByAtlas: false }, forbidden: { customerData: true, providerPayload: true, secrets: true, automaticExecution: true } };
  const cases = [["valid", (value) => value, true], ["missing-evidence", (value) => ({ ...value, receipt: { ...value.receipt, evidenceReference: "" } }), false], ["outcome", (value) => ({ ...value, receipt: { ...value.receipt, outcome: "updated" } }), false], ["atlas-executed", (value) => ({ ...value, execution: { ...value.execution, atlasExecuted: true } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChangedByAtlas: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaManualExecutionReceipt(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaManualExecutionReceipt(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
