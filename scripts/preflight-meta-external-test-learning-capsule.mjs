const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const resultClasses = new Set(["accepted", "rejected", "inconclusive"]);
const evidenceQualities = new Set(["sufficient", "limited", "insufficient"]);
const recommendations = new Set(["retain_for_analysis", "investigate_before_reuse", "discard_from_learning"]);
const blocked = (issues) => ({ approved: false, status: "external_test_learning_capsule_blocked", issues: [...issues], learningStored: false, campaignChangeAllowed: false, audienceChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateExternalTestLearningCapsule(capsule) {
  const issues = new Set();
  if (!capsule || capsule.schema !== "atlas.meta-external-test-learning-capsule.v1") issues.add("schema_invalid");
  if (capsule?.status !== "reviewed_summary_ready") issues.add("reviewed_summary_not_ready");
  for (const field of ["reviewReference", "eventReference"]) if (!safeReference.test(capsule?.[field] ?? "")) issues.add(`safe_reference_missing:${field}`);
  if (!resultClasses.has(capsule?.learning?.resultClass)) issues.add("result_class_invalid");
  if (!evidenceQualities.has(capsule?.learning?.evidenceQuality)) issues.add("evidence_quality_invalid");
  if (!recommendations.has(capsule?.learning?.recommendation) || capsule?.learning?.requiresHumanApproval !== true) issues.add("human_controlled_recommendation_required");
  if (capsule?.execution?.campaignChanged !== false || capsule?.execution?.metaEventSent !== false || capsule?.execution?.productionTouched !== false || capsule?.execution?.automaticOptimizationTriggered !== false) issues.add("external_or_automatic_change_observed");
  if (!capsule?.forbidden || Object.values(capsule.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(capsule ?? {}).some((key) => !["schema", "status", "reviewReference", "eventReference", "learning", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "external_test_learning_capsule_valid_human_approval_required", learningStored: false, campaignChangeAllowed: false, audienceChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestExternalTestLearningCapsule() {
  const base = { schema: "atlas.meta-external-test-learning-capsule.v1", status: "reviewed_summary_ready", reviewReference: "review-20260719-001", eventReference: "event-safe-001", learning: { resultClass: "accepted", evidenceQuality: "limited", recommendation: "retain_for_analysis", requiresHumanApproval: true }, execution: { campaignChanged: false, metaEventSent: false, productionTouched: false, automaticOptimizationTriggered: false }, forbidden: { customerData: true, providerPayload: true, providerResponseBody: true, secrets: true, automaticCampaignChanges: true, automaticAudienceChanges: true } };
  const cases = [["valid", (value) => value, true], ["auto-approval", (value) => ({ ...value, learning: { ...value.learning, requiresHumanApproval: false } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["event", (value) => ({ ...value, execution: { ...value.execution, metaEventSent: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false], ["no-evidence", (value) => ({ ...value, learning: { ...value.learning, evidenceQuality: "unknown" } }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateExternalTestLearningCapsule(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestExternalTestLearningCapsule(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
