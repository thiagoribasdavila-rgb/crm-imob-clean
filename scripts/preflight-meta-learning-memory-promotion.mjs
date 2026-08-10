const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const decisions = new Set(["promote_for_internal_analysis", "reject", "request_more_evidence"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_memory_promotion_blocked", issues: [...issues], memoryWriteAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningMemoryPromotion(promotion) {
  const issues = new Set();
  if (!promotion || promotion.schema !== "atlas.meta-learning-memory-promotion.v1") issues.add("schema_invalid");
  if (promotion?.status !== "human_promotion_recorded") issues.add("promotion_not_recorded");
  if (!safeReference.test(promotion?.comparisonReference ?? "")) issues.add("comparison_reference_missing");
  const details = promotion?.promotion;
  if (!safeReference.test(details?.reviewerReference ?? "") || !isoDate.test(details?.reviewedAt ?? "") || !decisions.has(details?.decision)) issues.add("human_promotion_proof_invalid");
  if (details?.memoryScope !== "internal_analysis_only" || details?.revocable !== true || !isoDate.test(details?.expiresAt ?? "")) issues.add("memory_scope_or_expiry_invalid");
  if (details?.decision === "promote_for_internal_analysis" && promotion?.execution?.memoryWritten !== true) issues.add("approved_memory_not_written");
  if (details?.decision !== "promote_for_internal_analysis" && promotion?.execution?.memoryWritten !== false) issues.add("unapproved_memory_written");
  if (promotion?.execution?.campaignChanged !== false || promotion?.execution?.audienceChanged !== false || promotion?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!promotion?.forbidden || Object.values(promotion.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(promotion ?? {}).some((key) => !["schema", "status", "comparisonReference", "promotion", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_memory_promotion_valid_internal_analysis_only", memoryWriteAllowed: promotion.execution.memoryWritten, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningMemoryPromotion() {
  const base = { schema: "atlas.meta-learning-memory-promotion.v1", status: "human_promotion_recorded", comparisonReference: "comparison-20260719-001", promotion: { reviewerReference: "director-20260719-002", reviewedAt: "2026-07-19T14:00:00.000Z", decision: "promote_for_internal_analysis", memoryScope: "internal_analysis_only", expiresAt: "2026-08-19T00:00:00.000Z", revocable: true }, execution: { memoryWritten: true, campaignChanged: false, audienceChanged: false, productionTouched: false }, forbidden: { automaticPromotion: true, irreversibleMemory: true, customerData: true, providerPayload: true, secrets: true, automaticOptimization: true } };
  const cases = [["valid", (value) => value, true], ["auto", (value) => ({ ...value, status: "promoted_automatically" }), false], ["irreversible", (value) => ({ ...value, promotion: { ...value.promotion, revocable: false } }), false], ["unapproved", (value) => ({ ...value, promotion: { ...value.promotion, decision: "reject" } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningMemoryPromotion(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningMemoryPromotion(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
