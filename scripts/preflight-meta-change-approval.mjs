const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const outcomes = new Set(["approved_for_controlled_execution", "rejected", "revision_requested"]);
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const blocked = (issues) => ({ approved: false, status: "meta_change_approval_blocked", issues: [...issues], executionPreparationAllowed: false, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaChangeApproval(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-change-approval.v1") issues.add("schema_invalid");
  if (record?.status !== "human_approval_recorded") issues.add("approval_not_recorded");
  if (!safeReference.test(record?.changeRequestReference ?? "")) issues.add("change_request_reference_missing");
  const approval = record?.approval;
  if (!outcomes.has(approval?.outcome)) issues.add("approval_outcome_invalid");
  if (!safeReference.test(approval?.primaryReviewerReference ?? "") || !safeReference.test(approval?.secondaryReviewerReference ?? "") || approval?.primaryReviewerReference === approval?.secondaryReviewerReference) issues.add("independent_review_required");
  if (typeof approval?.reason !== "string" || approval.reason.trim().length < 12 || approval.reason.length > 500) issues.add("approval_reason_invalid");
  if (!iso.test(approval?.expiresAt ?? "") || Number.isNaN(Date.parse(approval?.expiresAt))) issues.add("approval_expiry_invalid");
  if (record?.execution?.authorized !== false || record?.execution?.budgetChanged !== false || record?.execution?.audienceChanged !== false || record?.execution?.campaignChanged !== false || record?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "changeRequestReference", "approval", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_change_approval_valid_preparation_only", executionPreparationAllowed: record.approval.outcome === "approved_for_controlled_execution", executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaChangeApproval() {
  const base = { schema: "atlas.meta-change-approval.v1", status: "human_approval_recorded", changeRequestReference: "request-20260719-001", approval: { outcome: "approved_for_controlled_execution", primaryReviewerReference: "director-20260719-001", secondaryReviewerReference: "admin-20260719-001", reason: "Aprovado para preparação controlada, sem execução automática.", expiresAt: "2026-07-26T12:00:00Z" }, execution: { authorized: false, budgetChanged: false, audienceChanged: false, campaignChanged: false, productionTouched: false }, forbidden: { automaticApproval: true, automaticExecution: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["same-reviewer", (value) => ({ ...value, approval: { ...value.approval, secondaryReviewerReference: value.approval.primaryReviewerReference } }), false], ["expiry", (value) => ({ ...value, approval: { ...value.approval, expiresAt: "tomorrow" } }), false], ["authorized", (value) => ({ ...value, execution: { ...value.execution, authorized: true } }), false], ["budget", (value) => ({ ...value, execution: { ...value.execution, budgetChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaChangeApproval(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaChangeApproval(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
