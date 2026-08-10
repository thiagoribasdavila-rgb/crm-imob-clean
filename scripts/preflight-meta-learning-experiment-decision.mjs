const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const outcomes = new Set(["approve_plan_only", "reject", "request_more_evidence"]);
const objectives = new Set(["signal_quality", "lead_quality", "attribution_quality"]);
const stopConditions = new Set(["single_attempt", "time_window", "quality_threshold"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_experiment_decision_blocked", issues: [...issues], experimentPlanAllowed: false, externalTestAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningExperimentDecision(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-learning-experiment-decision.v1") issues.add("schema_invalid");
  if (record?.status !== "director_decision_recorded") issues.add("director_decision_not_recorded");
  if (!safeReference.test(record?.briefReference ?? "")) issues.add("brief_reference_missing");
  if (!outcomes.has(record?.decision?.outcome) || !safeReference.test(record?.decision?.directorReference ?? "") || !isoDate.test(record?.decision?.decidedAt ?? "")) issues.add("director_decision_proof_invalid");
  if (!objectives.has(record?.decision?.objectiveClass) || !stopConditions.has(record?.decision?.stopConditionClass)) issues.add("objective_or_stop_condition_invalid");
  if (record?.decision?.outcome === "approve_plan_only" && record?.execution?.experimentPlanPrepared !== true) issues.add("approved_plan_not_prepared");
  if (record?.decision?.outcome !== "approve_plan_only" && record?.execution?.experimentPlanPrepared !== false) issues.add("unapproved_plan_prepared");
  if (record?.execution?.externalTestAllowed !== false || record?.execution?.campaignChanged !== false || record?.execution?.productionTouched !== false) issues.add("execution_must_remain_blocked");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "briefReference", "decision", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_experiment_decision_valid_plan_only", experimentPlanAllowed: record.execution.experimentPlanPrepared, externalTestAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningExperimentDecision() {
  const base = { schema: "atlas.meta-learning-experiment-decision.v1", status: "director_decision_recorded", briefReference: "brief-20260719-001", decision: { outcome: "approve_plan_only", directorReference: "director-20260719-001", decidedAt: "2026-07-19T13:00:00.000Z", objectiveClass: "signal_quality", stopConditionClass: "single_attempt" }, execution: { experimentPlanPrepared: true, externalTestAllowed: false, campaignChanged: false, productionTouched: false }, forbidden: { automaticApproval: true, automaticExecution: true, customerData: true, providerPayload: true, secrets: true, automaticCampaignChanges: true } };
  const cases = [["valid", (value) => value, true], ["missing-director", (value) => ({ ...value, decision: { ...value.decision, directorReference: null } }), false], ["unapproved-plan", (value) => ({ ...value, decision: { ...value.decision, outcome: "reject" } }), false], ["external", (value) => ({ ...value, execution: { ...value.execution, externalTestAllowed: true } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningExperimentDecision(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningExperimentDecision(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
