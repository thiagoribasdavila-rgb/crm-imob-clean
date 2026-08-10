const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const hypothesisClasses = new Set(["signal_quality", "lead_quality", "attribution_quality"]);
const expectedSignals = new Set(["delivery_confirmation", "qualified_lead_match", "conversion_feedback_match"]);
const metrics = new Set(["delivery_rate", "match_rate", "feedback_completeness"]);
const samples = new Set(["single_controlled", "small_controlled", "supervised_batch"]);
const windows = new Set(["one_time", "short_window", "review_window"]);
const stops = new Set(["single_attempt", "quality_threshold", "time_window"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_experiment_plan_blocked", issues: [...issues], planReady: false, externalTestAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningExperimentPlan(plan) {
  const issues = new Set();
  if (!plan || plan.schema !== "atlas.meta-learning-experiment-plan.v1") issues.add("schema_invalid");
  if (plan?.status !== "prepared_for_separate_execution_approval") issues.add("plan_not_prepared");
  if (!safeReference.test(plan?.decisionReference ?? "")) issues.add("decision_reference_missing");
  if (!hypothesisClasses.has(plan?.hypothesis?.class) || !expectedSignals.has(plan?.hypothesis?.expectedSignal)) issues.add("hypothesis_invalid");
  if (!metrics.has(plan?.measurement?.metricClass) || !samples.has(plan?.measurement?.sampleClass) || !windows.has(plan?.measurement?.windowClass) || !stops.has(plan?.measurement?.stopConditionClass)) issues.add("measurement_contract_invalid");
  if (plan?.execution?.planOnly !== true || plan?.execution?.externalTestAllowed !== false || plan?.execution?.campaignChanged !== false || plan?.execution?.productionTouched !== false) issues.add("execution_must_remain_blocked");
  if (!plan?.forbidden || Object.values(plan.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(plan ?? {}).some((key) => !["schema", "status", "decisionReference", "hypothesis", "measurement", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_experiment_plan_valid_separate_execution_approval_required", planReady: true, externalTestAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningExperimentPlan() {
  const base = { schema: "atlas.meta-learning-experiment-plan.v1", status: "prepared_for_separate_execution_approval", decisionReference: "decision-20260719-001", hypothesis: { class: "signal_quality", expectedSignal: "delivery_confirmation" }, measurement: { metricClass: "delivery_rate", sampleClass: "single_controlled", windowClass: "one_time", stopConditionClass: "single_attempt" }, execution: { planOnly: true, externalTestAllowed: false, campaignChanged: false, productionTouched: false }, forbidden: { ungovernedHypothesis: true, automaticExecution: true, customerData: true, providerPayload: true, secrets: true, automaticCampaignChanges: true } };
  const cases = [["valid", (value) => value, true], ["no-hypothesis", (value) => ({ ...value, hypothesis: { ...value.hypothesis, class: "unknown" } }), false], ["no-metric", (value) => ({ ...value, measurement: { ...value.measurement, metricClass: "unknown" } }), false], ["open", (value) => ({ ...value, execution: { ...value.execution, externalTestAllowed: true } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningExperimentPlan(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningExperimentPlan(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
