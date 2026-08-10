const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const scopes = new Set(["measurement_only", "planning_only"]);
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const phrase = "CONFIRMO APENAS O ESCOPO PLANEJADO";
const blocked = (issues) => ({ approved: false, status: "meta_final_execution_gate_blocked", issues: [...issues], confirmationDisplayAllowed: false, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaFinalExecutionGate(record, now = new Date("2026-07-19T12:40:00Z")) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-final-execution-gate.v1") issues.add("schema_invalid");
  if (record?.status !== "explicit_confirmation_recorded") issues.add("explicit_confirmation_missing");
  if (!safeReference.test(record?.preparationReference ?? "")) issues.add("preparation_reference_missing");
  const gate = record?.gate;
  if (!safeReference.test(gate?.operatorReference ?? "") || !scopes.has(gate?.confirmedScope) || !iso.test(gate?.confirmedAt ?? "") || !iso.test(gate?.approvalExpiresAt ?? "") || gate?.confirmationPhrase !== phrase) issues.add("gate_confirmation_invalid");
  if (iso.test(gate?.approvalExpiresAt ?? "") && Date.parse(gate.approvalExpiresAt) <= now.getTime()) issues.add("approval_expired");
  if (record?.execution?.requested !== false || record?.execution?.performed !== false || record?.execution?.budgetChanged !== false || record?.execution?.audienceChanged !== false || record?.execution?.campaignChanged !== false || record?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "preparationReference", "gate", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_final_execution_gate_valid_manual_action_required", confirmationDisplayAllowed: true, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaFinalExecutionGate() {
  const base = { schema: "atlas.meta-final-execution-gate.v1", status: "explicit_confirmation_recorded", preparationReference: "preparation-20260719-001", gate: { operatorReference: "admin-20260719-001", confirmedScope: "measurement_only", confirmedAt: "2026-07-19T12:35:00Z", approvalExpiresAt: "2026-07-26T12:00:00Z", confirmationPhrase: phrase }, execution: { requested: false, performed: false, budgetChanged: false, audienceChanged: false, campaignChanged: false, productionTouched: false }, forbidden: { automaticConfirmation: true, automaticExecution: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["phrase", (value) => ({ ...value, gate: { ...value.gate, confirmationPhrase: "confirm" } }), false], ["scope", (value) => ({ ...value, gate: { ...value.gate, confirmedScope: "campaign_live" } }), false], ["expired", (value) => ({ ...value, gate: { ...value.gate, approvalExpiresAt: "2026-07-19T12:00:00Z" } }), false], ["performed", (value) => ({ ...value, execution: { ...value.execution, performed: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaFinalExecutionGate(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaFinalExecutionGate(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
