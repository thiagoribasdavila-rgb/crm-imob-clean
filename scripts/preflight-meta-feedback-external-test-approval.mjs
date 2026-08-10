const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const approvalShape = (approval) => safeReference.test(approval?.reference ?? "") && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(approval?.approvedAt ?? "") && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(approval?.expiresAt ?? "") && new Date(approval.expiresAt) > new Date(approval.approvedAt);
const blocked = (issues) => ({ approved: false, status: "external_test_approval_blocked", issues: [...issues], externalTestAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateFeedbackExternalTestApproval(approval) {
  const issues = new Set();
  if (!approval || approval.schema !== "atlas.meta-feedback-external-test-approval.v1") issues.add("schema_invalid");
  if (approval?.status !== "approved_for_single_external_test") issues.add("approval_not_complete");
  if (!safeReference.test(approval?.decisionReference ?? "") || !safeReference.test(approval?.eventReference ?? "")) issues.add("safe_decision_or_event_reference_missing");
  if (approval?.environment !== "staging") issues.add("isolated_staging_required");
  const director = approval?.approvals?.director;
  const security = approval?.approvals?.security;
  if (!approvalShape(director)) issues.add("director_approval_invalid");
  if (!approvalShape(security)) issues.add("security_approval_invalid");
  if (director?.reference === security?.reference) issues.add("independent_approval_references_required");
  if (director?.decisionReference !== approval?.decisionReference || security?.decisionReference !== approval?.decisionReference) issues.add("approval_decision_binding_invalid");
  if (approval?.execution?.externalTestAllowed !== false || approval?.execution?.productionAllowed !== false || approval?.execution?.retryAllowed !== false || approval?.execution?.automaticPromotionAllowed !== false) issues.add("execution_must_remain_blocked_until_external_operator_gate");
  if (!approval?.forbidden || Object.values(approval.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(approval ?? {}).some((key) => !["schema", "status", "decisionReference", "eventReference", "environment", "approvals", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "external_test_approval_valid_operator_gate_still_required", externalTestAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestFeedbackExternalTestApproval() {
  const decisionReference = "decision-card-20260719";
  const base = { schema: "atlas.meta-feedback-external-test-approval.v1", status: "approved_for_single_external_test", decisionReference, eventReference: "event-safe-001", environment: "staging", approvals: { director: { reference: "director-gate-20260719", decisionReference, approvedAt: "2026-07-19T12:00:00.000Z", expiresAt: "2026-07-20T12:00:00.000Z" }, security: { reference: "security-gate-20260719", decisionReference, approvedAt: "2026-07-19T12:01:00.000Z", expiresAt: "2026-07-20T12:01:00.000Z" } }, execution: { externalTestAllowed: false, productionAllowed: false, retryAllowed: false, automaticPromotionAllowed: false }, forbidden: { sharedApproval: true, expiredApproval: true, secrets: true, customerData: true, automaticCampaignChanges: true } };
  const cases = [["valid", (value) => value, true], ["shared", (value) => ({ ...value, approvals: { ...value.approvals, security: { ...value.approvals.security, reference: value.approvals.director.reference } } }), false], ["expired", (value) => ({ ...value, approvals: { ...value.approvals, director: { ...value.approvals.director, expiresAt: "2026-07-19T11:00:00.000Z" } } }), false], ["wrong-decision", (value) => ({ ...value, approvals: { ...value.approvals, security: { ...value.approvals.security, decisionReference: "other-decision" } } }), false], ["open", (value) => ({ ...value, execution: { ...value.execution, externalTestAllowed: true } }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateFeedbackExternalTestApproval(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestFeedbackExternalTestApproval(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
