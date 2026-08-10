const supported = new Set(["lead_qualified", "contact_completed", "visit_scheduled", "proposal_sent", "sale_confirmed"]);
const allowedReasons = new Set(["consent_verified", "human_confirmed", "commercial_evidence_present", "duplicate_free", "stage_consistent", "value_verified", "awaiting_external_gate"]);
const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "feedback_decision_card_blocked", issues: [...issues], dispatchAllowed: false, campaignChangeAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateFeedbackDecisionCard(card) {
  const issues = new Set();
  if (!card || card.schema !== "atlas.meta-feedback-decision-card.v1") issues.add("schema_invalid");
  if (card?.status !== "prepared_for_human_review") issues.add("decision_card_not_prepared");
  if (!safeReference.test(card?.eventReference ?? "")) issues.add("safe_event_reference_missing");
  if (!supported.has(card?.signal)) issues.add("unsupported_signal");
  for (const field of ["consentVerified", "humanConfirmed", "commercialEvidencePresent", "duplicateFree", "stageConsistent"]) if (card?.evidence?.[field] !== true) issues.add(`evidence_missing:${field}`);
  if (["proposal_sent", "sale_confirmed"].includes(card?.signal) && card?.evidence?.valueVerified !== true) issues.add("value_evidence_missing");
  if (card?.recommendation?.action !== "request_external_test_gate") issues.add("unsafe_recommendation_action");
  if (card?.recommendation?.requiresDirectorApproval !== true || card?.recommendation?.requiresSecurityApproval !== true) issues.add("independent_human_approvals_required");
  if (!Array.isArray(card?.recommendation?.reasonCodes) || card.recommendation.reasonCodes.length < 2 || card.recommendation.reasonCodes.some((reason) => !allowedReasons.has(reason))) issues.add("explanation_reason_codes_invalid");
  if (card?.execution?.dispatchAllowed !== false || card?.execution?.campaignChangeAllowed !== false) issues.add("execution_must_remain_blocked");
  if (!card?.forbidden || Object.values(card.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(card ?? {}).some((key) => !["schema", "status", "eventReference", "signal", "evidence", "recommendation", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "feedback_decision_card_valid_external_test_still_requires_independent_approval", dispatchAllowed: false, campaignChangeAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestFeedbackDecisionCard() {
  const base = { schema: "atlas.meta-feedback-decision-card.v1", status: "prepared_for_human_review", eventReference: "event-safe-001", signal: "sale_confirmed", evidence: { consentVerified: true, humanConfirmed: true, commercialEvidencePresent: true, duplicateFree: true, stageConsistent: true, valueVerified: true }, recommendation: { action: "request_external_test_gate", reasonCodes: ["consent_verified", "human_confirmed", "commercial_evidence_present", "duplicate_free", "stage_consistent", "value_verified", "awaiting_external_gate"], requiresDirectorApproval: true, requiresSecurityApproval: true }, execution: { dispatchAllowed: false, campaignChangeAllowed: false }, forbidden: { customerDetails: true, protectedAttributes: true, automaticBudgetChange: true, automaticAudienceChange: true, automaticDispatch: true } };
  const cases = [["valid", (value) => value, true], ["dispatch", (value) => ({ ...value, execution: { ...value.execution, dispatchAllowed: true } }), false], ["auto-action", (value) => ({ ...value, recommendation: { ...value.recommendation, action: "dispatch" } }), false], ["no-security", (value) => ({ ...value, recommendation: { ...value.recommendation, requiresSecurityApproval: false } }), false], ["opaque", (value) => ({ ...value, recommendation: { ...value.recommendation, reasonCodes: [] } }), false], ["sensitive", (value) => ({ ...value, customerName: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateFeedbackDecisionCard(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestFeedbackDecisionCard(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
