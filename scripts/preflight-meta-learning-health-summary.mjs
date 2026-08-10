const nonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const actions = new Set(["review_blocked_or_expiring", "monitor_healthy_memory"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_health_summary_blocked", issues: [...issues], displayAllowed: false, memoryChangeAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningHealthSummary(summary) {
  const issues = new Set();
  if (!summary || summary.schema !== "atlas.meta-learning-health-summary.v1") issues.add("schema_invalid");
  if (summary?.status !== "aggregate_health_calculated" || summary?.period !== "current_snapshot") issues.add("summary_not_calculated");
  for (const key of ["valid", "expiring", "blocked", "revoked"]) if (!nonNegativeInteger(summary?.counts?.[key])) issues.add(`count_invalid:${key}`);
  if (summary?.display?.aggregateOnly !== true || summary?.display?.humanReviewRequired !== true || !actions.has(summary?.display?.recommendedAction)) issues.add("display_controls_invalid");
  if ((summary?.counts?.blocked > 0 || summary?.counts?.expiring > 0) && summary?.display?.recommendedAction !== "review_blocked_or_expiring") issues.add("health_risk_requires_review_action");
  if (summary?.execution?.memoryChanged !== false || summary?.execution?.campaignChanged !== false || summary?.execution?.productionTouched !== false) issues.add("external_or_memory_change_observed");
  if (!summary?.forbidden || Object.values(summary.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(summary ?? {}).some((key) => !["schema", "status", "period", "counts", "display", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_health_summary_valid_aggregate_only", displayAllowed: true, memoryChangeAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningHealthSummary() {
  const base = { schema: "atlas.meta-learning-health-summary.v1", status: "aggregate_health_calculated", period: "current_snapshot", counts: { valid: 3, expiring: 1, blocked: 2, revoked: 1 }, display: { aggregateOnly: true, humanReviewRequired: true, recommendedAction: "review_blocked_or_expiring" }, execution: { memoryChanged: false, campaignChanged: false, productionTouched: false }, forbidden: { customerData: true, providerPayload: true, automaticReinstatement: true, automaticOptimization: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["negative", (value) => ({ ...value, counts: { ...value.counts, valid: -1 } }), false], ["wrong-action", (value) => ({ ...value, display: { ...value.display, recommendedAction: "monitor_healthy_memory" } }), false], ["row-data", (value) => ({ ...value, display: { ...value.display, aggregateOnly: false } }), false], ["memory-change", (value) => ({ ...value, execution: { ...value.execution, memoryChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningHealthSummary(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningHealthSummary(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
