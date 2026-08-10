const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const metrics = new Set(["delivery_rate", "match_rate", "feedback_completeness"]);
const observations = new Set(["aggregate_pass", "aggregate_fail", "aggregate_inconclusive"]);
const outcomes = new Set(["supported", "not_supported", "inconclusive"]);
const blocked = (issues) => ({ approved: false, status: "meta_experiment_result_comparison_blocked", issues: [...issues], comparisonReady: false, followUpExperimentAllowed: false, optimizationAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaExperimentResultComparison(result) {
  const issues = new Set();
  if (!result || result.schema !== "atlas.meta-experiment-result-comparison.v1") issues.add("schema_invalid");
  if (result?.status !== "aggregate_result_compared") issues.add("comparison_not_complete");
  for (const field of ["planReference", "observationReference"]) if (!safeReference.test(result?.[field] ?? "")) issues.add(`reference_missing:${field}`);
  if (!metrics.has(result?.comparison?.metricClass) || !observations.has(result?.comparison?.observationClass) || !outcomes.has(result?.comparison?.hypothesisOutcome)) issues.add("comparison_dimensions_invalid");
  if (result?.comparison?.stopConditionMet !== true || result?.comparison?.humanReviewRequired !== true) issues.add("stop_or_human_review_missing");
  if (result?.comparison?.observationClass === "aggregate_inconclusive" && result?.comparison?.hypothesisOutcome !== "inconclusive") issues.add("inconclusive_result_must_remain_inconclusive");
  if (result?.execution?.followUpExperimentCreated !== false || result?.execution?.campaignChanged !== false || result?.execution?.audienceChanged !== false || result?.execution?.productionTouched !== false) issues.add("automatic_follow_up_or_external_change_observed");
  if (!result?.forbidden || Object.values(result.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(result ?? {}).some((key) => !["schema", "status", "planReference", "observationReference", "comparison", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_experiment_result_comparison_valid_human_review_required", comparisonReady: true, followUpExperimentAllowed: false, optimizationAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaExperimentResultComparison() {
  const base = { schema: "atlas.meta-experiment-result-comparison.v1", status: "aggregate_result_compared", planReference: "plan-20260719-001", observationReference: "observation-20260719-002", comparison: { metricClass: "delivery_rate", observationClass: "aggregate_pass", hypothesisOutcome: "supported", stopConditionMet: true, humanReviewRequired: true }, execution: { followUpExperimentCreated: false, campaignChanged: false, audienceChanged: false, productionTouched: false }, forbidden: { rowLevelCustomerData: true, providerPayload: true, automaticFollowUpExperiment: true, automaticOptimization: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["inconclusive", (value) => ({ ...value, comparison: { ...value.comparison, observationClass: "aggregate_inconclusive" } }), false], ["no-stop", (value) => ({ ...value, comparison: { ...value.comparison, stopConditionMet: false } }), false], ["followup", (value) => ({ ...value, execution: { ...value.execution, followUpExperimentCreated: true } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaExperimentResultComparison(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaExperimentResultComparison(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
