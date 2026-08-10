const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const qualities = new Set(["sufficient", "limited", "insufficient"]);
const sampleClasses = new Set(["controlled", "small", "unknown"]);
const recencyClasses = new Set(["current", "aging", "expired"]);
const confidenceBands = new Set(["high", "guarded", "low"]);
const modes = new Set(["recommendation_with_review", "monitor_only", "do_not_use"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_confidence_blocked", issues: [...issues], recommendationAllowed: false, optimizationAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningConfidence(confidence) {
  const issues = new Set();
  if (!confidence || confidence.schema !== "atlas.meta-learning-confidence.v1") issues.add("schema_invalid");
  if (confidence?.status !== "confidence_assessed") issues.add("confidence_not_assessed");
  if (!safeReference.test(confidence?.lineageReference ?? "")) issues.add("lineage_reference_missing");
  if (!qualities.has(confidence?.evidence?.quality) || !sampleClasses.has(confidence?.evidence?.sampleClass) || !recencyClasses.has(confidence?.evidence?.recencyClass)) issues.add("evidence_dimensions_invalid");
  if (!confidence?.decision || !confidenceBands.has(confidence.decision.confidenceBand) || !modes.has(confidence.decision.recommendationMode) || confidence.decision.humanApprovalRequired !== true) issues.add("decision_controls_invalid");
  if (confidence?.evidence?.contradictionDetected === true && confidence?.decision?.recommendationMode !== "monitor_only") issues.add("contradiction_requires_monitoring");
  if ((confidence?.evidence?.quality === "insufficient" || confidence?.evidence?.recencyClass === "expired") && confidence?.decision?.recommendationMode !== "do_not_use") issues.add("weak_evidence_must_not_be_recommended");
  if (confidence?.execution?.campaignChanged !== false || confidence?.execution?.audienceChanged !== false || confidence?.execution?.budgetChanged !== false || confidence?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!confidence?.forbidden || Object.values(confidence.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(confidence ?? {}).some((key) => !["schema", "status", "lineageReference", "evidence", "decision", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_confidence_valid_human_review_required", recommendationAllowed: confidence.decision.recommendationMode === "recommendation_with_review", optimizationAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningConfidence() {
  const base = { schema: "atlas.meta-learning-confidence.v1", status: "confidence_assessed", lineageReference: "lineage-20260719-001", evidence: { quality: "sufficient", sampleClass: "controlled", recencyClass: "current", contradictionDetected: false }, decision: { confidenceBand: "guarded", recommendationMode: "recommendation_with_review", humanApprovalRequired: true }, execution: { campaignChanged: false, audienceChanged: false, budgetChanged: false, productionTouched: false }, forbidden: { inventedConfidence: true, automaticOptimization: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["contradiction", (value) => ({ ...value, evidence: { ...value.evidence, contradictionDetected: true } }), false], ["insufficient", (value) => ({ ...value, evidence: { ...value.evidence, quality: "insufficient" } }), false], ["auto", (value) => ({ ...value, decision: { ...value.decision, humanApprovalRequired: false } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningConfidence(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningConfidence(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
