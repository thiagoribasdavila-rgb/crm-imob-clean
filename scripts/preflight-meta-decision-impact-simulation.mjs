const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const changes = new Set(["signal_mapping", "attribution_review", "audience_hypothesis"]);
const impacts = new Set(["low", "medium", "high", "unknown"]);
const confidence = new Set(["high", "guarded", "low"]);
const blocked = (issues) => ({ approved: false, status: "meta_decision_impact_simulation_blocked", issues: [...issues], simulationDisplayAllowed: false, optimizationAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaDecisionImpactSimulation(simulation) {
  const issues = new Set();
  if (!simulation || simulation.schema !== "atlas.meta-decision-impact-simulation.v1") issues.add("schema_invalid");
  if (simulation?.status !== "estimate_ready_for_human_review") issues.add("simulation_not_ready");
  if (!safeReference.test(simulation?.briefReference ?? "")) issues.add("brief_reference_missing");
  const scenario = simulation?.scenario;
  if (!changes.has(scenario?.changeClass) || !impacts.has(scenario?.impactBand) || !confidence.has(scenario?.confidenceBand) || scenario?.isEstimate !== true || scenario?.humanReviewRequired !== true) issues.add("scenario_controls_invalid");
  if (scenario?.confidenceBand === "low" && scenario?.impactBand !== "unknown") issues.add("low_confidence_impact_must_be_unknown");
  if (simulation?.execution?.budgetChanged !== false || simulation?.execution?.audienceChanged !== false || simulation?.execution?.campaignChanged !== false || simulation?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!simulation?.forbidden || Object.values(simulation.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(simulation ?? {}).some((key) => !["schema", "status", "briefReference", "scenario", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_decision_impact_simulation_valid_estimate_only", simulationDisplayAllowed: true, optimizationAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaDecisionImpactSimulation() {
  const base = { schema: "atlas.meta-decision-impact-simulation.v1", status: "estimate_ready_for_human_review", briefReference: "brief-20260719-002", scenario: { changeClass: "signal_mapping", impactBand: "medium", confidenceBand: "guarded", isEstimate: true, humanReviewRequired: true }, execution: { budgetChanged: false, audienceChanged: false, campaignChanged: false, productionTouched: false }, forbidden: { presentedAsFact: true, automaticOptimization: true, automaticBudgetChange: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["fact", (value) => ({ ...value, scenario: { ...value.scenario, isEstimate: false } }), false], ["low", (value) => ({ ...value, scenario: { ...value.scenario, confidenceBand: "low" } }), false], ["budget", (value) => ({ ...value, execution: { ...value.execution, budgetChanged: true } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaDecisionImpactSimulation(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaDecisionImpactSimulation(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
