const supported = new Set(["lead_qualified", "contact_completed", "visit_scheduled", "proposal_sent", "sale_confirmed"]);
const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "commercial_signal_quality_gate_blocked", issues: [...issues], feedbackAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateCommercialSignalQualityGate(gate) {
  const issues = new Set();
  if (!gate || gate.schema !== "atlas.meta-commercial-signal-quality-gate.v1") issues.add("schema_invalid");
  if (gate?.status !== "evaluated") issues.add("quality_not_evaluated");
  if (!safeReference.test(gate?.eventReference ?? "")) issues.add("safe_event_reference_missing");
  if (!supported.has(gate?.signal)) issues.add("signal_not_eligible_for_feedback");
  for (const field of ["consentVerified", "humanConfirmed", "commercialEvidencePresent", "duplicateFree", "stageConsistent"]) if (gate?.quality?.[field] !== true) issues.add(`quality_evidence_missing:${field}`);
  if (["proposal_sent", "sale_confirmed"].includes(gate?.signal) && gate?.quality?.valueVerified !== true) issues.add("revenue_value_not_verified");
  if (!gate?.decision?.eligibleForFeedback) issues.add("feedback_not_eligible");
  if (gate?.decision?.requiresHumanReview !== true) issues.add("human_review_required");
  if (gate?.decision?.automaticPromotionAllowed !== false) issues.add("automatic_promotion_forbidden");
  if (!gate?.forbidden || Object.values(gate.forbidden).some((value) => value !== true)) issues.add("sensitive_or_automatic_optimization_protection_missing");
  if (Object.keys(gate ?? {}).some((key) => !["schema", "status", "eventReference", "signal", "quality", "decision", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "commercial_signal_quality_gate_valid_feedback_dispatch_still_requires_external_gate", feedbackAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestCommercialSignalQualityGate() {
  const base = { schema: "atlas.meta-commercial-signal-quality-gate.v1", status: "evaluated", eventReference: "event-safe-001", signal: "sale_confirmed", quality: { consentVerified: true, humanConfirmed: true, commercialEvidencePresent: true, duplicateFree: true, stageConsistent: true, valueVerified: true }, decision: { eligibleForFeedback: true, requiresHumanReview: true, automaticPromotionAllowed: false }, forbidden: { leadRanking: true, protectedAttributes: true, personalData: true, automaticBudgetChange: true, automaticAudienceChange: true } };
  const cases = [["valid", (value) => value, true], ["click", (value) => ({ ...value, signal: "lead_received" }), false], ["no-evidence", (value) => ({ ...value, quality: { ...value.quality, commercialEvidencePresent: false } }), false], ["unverified-value", (value) => ({ ...value, quality: { ...value.quality, valueVerified: false } }), false], ["auto-budget", (value) => ({ ...value, forbidden: { ...value.forbidden, automaticBudgetChange: false } }), false], ["auto-promotion", (value) => ({ ...value, decision: { ...value.decision, automaticPromotionAllowed: true } }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateCommercialSignalQualityGate(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestCommercialSignalQualityGate(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
