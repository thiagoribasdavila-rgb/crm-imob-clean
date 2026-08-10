const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const states = new Set(["eligible_for_analysis", "blocked_pending_review", "revoked"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_memory_revocation_blocked", issues: [...issues], analysisUseAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningMemoryRevocation(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-learning-memory-revocation.v1") issues.add("schema_invalid");
  if (record?.status !== "memory_usage_assessed") issues.add("assessment_not_complete");
  if (!safeReference.test(record?.memoryReference ?? "")) issues.add("memory_reference_missing");
  if (typeof record?.assessment?.lineageValid !== "boolean" || typeof record?.assessment?.expired !== "boolean" || typeof record?.assessment?.revocationRequested !== "boolean" || !isoDate.test(record?.assessment?.reviewedAt ?? "")) issues.add("assessment_evidence_invalid");
  if (!states.has(record?.decision?.usageState) || record?.decision?.humanReviewRequired !== true) issues.add("usage_decision_invalid");
  const invalid = record?.assessment?.lineageValid !== true || record?.assessment?.expired === true || record?.assessment?.revocationRequested === true;
  if (invalid && record?.decision?.usageState === "eligible_for_analysis") issues.add("invalid_memory_must_be_blocked");
  if (record?.assessment?.revocationRequested === true && record?.decision?.usageState !== "revoked") issues.add("revocation_must_be_final");
  if (record?.execution?.memoryUsedInRecommendation !== false || record?.execution?.campaignChanged !== false || record?.execution?.productionTouched !== false) issues.add("memory_or_external_use_observed");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "memoryReference", "assessment", "decision", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_memory_revocation_valid_review_required", analysisUseAllowed: record.decision.usageState === "eligible_for_analysis", campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningMemoryRevocation() {
  const base = { schema: "atlas.meta-learning-memory-revocation.v1", status: "memory_usage_assessed", memoryReference: "memory-20260719-001", assessment: { lineageValid: true, expired: false, revocationRequested: false, reviewedAt: "2026-07-19T15:00:00.000Z" }, decision: { usageState: "eligible_for_analysis", humanReviewRequired: true }, execution: { memoryUsedInRecommendation: false, campaignChanged: false, productionTouched: false }, forbidden: { useAfterExpiry: true, useAfterRevocation: true, automaticReinstatement: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["expired", (value) => ({ ...value, assessment: { ...value.assessment, expired: true } }), false], ["revocation", (value) => ({ ...value, assessment: { ...value.assessment, revocationRequested: true } }), false], ["lineage", (value) => ({ ...value, assessment: { ...value.assessment, lineageValid: false } }), false], ["used", (value) => ({ ...value, execution: { ...value.execution, memoryUsedInRecommendation: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningMemoryRevocation(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningMemoryRevocation(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
