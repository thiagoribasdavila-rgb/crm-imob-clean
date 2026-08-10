const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const outcomes = new Set(["approved_for_planning", "rejected", "revision_requested"]);

const blocked = (issues) => ({ approved: false, status: "meta_simulation_decision_blocked", issues: [...issues], planningAllowed: false, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaSimulationDecision(decision) {
  const issues = new Set();
  if (!decision || decision.schema !== "atlas.meta-simulation-decision.v1") issues.add("schema_invalid");
  if (decision?.status !== "human_decision_recorded") issues.add("decision_not_recorded");
  if (!safeReference.test(decision?.simulationReference ?? "")) issues.add("simulation_reference_missing");
  const review = decision?.decision;
  if (!outcomes.has(review?.outcome)) issues.add("outcome_invalid");
  if (!safeReference.test(review?.reviewerReference ?? "")) issues.add("reviewer_reference_missing");
  if (typeof review?.reason !== "string" || review.reason.trim().length < 12 || review.reason.length > 500) issues.add("decision_reason_invalid");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(review?.decidedAt ?? "")) issues.add("decision_timestamp_invalid");
  if (decision?.execution?.authorized !== false || decision?.execution?.budgetChanged !== false || decision?.execution?.audienceChanged !== false || decision?.execution?.campaignChanged !== false || decision?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!decision?.forbidden || Object.values(decision.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(decision ?? {}).some((key) => !["schema", "status", "simulationReference", "decision", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_simulation_decision_recorded_planning_only", planningAllowed: decision.decision.outcome === "approved_for_planning", executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaSimulationDecision() {
  const base = { schema: "atlas.meta-simulation-decision.v1", status: "human_decision_recorded", simulationReference: "simulation-20260719-001", decision: { outcome: "approved_for_planning", reviewerReference: "director-20260719-001", reason: "Cenário coerente para planejamento, sem autorização de execução.", decidedAt: "2026-07-19T12:00:00Z" }, execution: { authorized: false, budgetChanged: false, audienceChanged: false, campaignChanged: false, productionTouched: false }, forbidden: { automaticExecution: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["missing-reviewer", (value) => ({ ...value, decision: { ...value.decision, reviewerReference: "" } }), false], ["short-reason", (value) => ({ ...value, decision: { ...value.decision, reason: "ok" } }), false], ["authorization", (value) => ({ ...value, execution: { ...value.execution, authorized: true } }), false], ["budget", (value) => ({ ...value, execution: { ...value.execution, budgetChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaSimulationDecision(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaSimulationDecision(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
