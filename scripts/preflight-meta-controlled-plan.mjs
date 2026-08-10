const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const safeText = (value, min, max) => typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
const blocked = (issues) => ({ approved: false, status: "meta_controlled_plan_blocked", issues: [...issues], planDisplayAllowed: false, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaControlledPlan(plan) {
  const issues = new Set();
  if (!plan || plan.schema !== "atlas.meta-controlled-plan.v1") issues.add("schema_invalid");
  if (plan?.status !== "draft_for_human_review") issues.add("plan_not_draft");
  if (!safeReference.test(plan?.decisionReference ?? "")) issues.add("decision_reference_missing");
  const proposal = plan?.plan;
  if (!safeText(proposal?.objective, 12, 300) || !safeText(proposal?.hypothesis, 12, 500) || !safeText(proposal?.successMetric, 3, 100) || !Number.isInteger(proposal?.reviewWindowDays) || proposal.reviewWindowDays < 1 || proposal.reviewWindowDays > 30 || !safeReference.test(proposal?.ownerReference ?? "")) issues.add("plan_definition_invalid");
  if (plan?.execution?.authorized !== false || plan?.execution?.outboundMessagesSent !== false || plan?.execution?.budgetChanged !== false || plan?.execution?.audienceChanged !== false || plan?.execution?.campaignChanged !== false || plan?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!plan?.forbidden || Object.values(plan.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(plan ?? {}).some((key) => !["schema", "status", "decisionReference", "plan", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_controlled_plan_valid_draft_only", planDisplayAllowed: true, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaControlledPlan() {
  const base = { schema: "atlas.meta-controlled-plan.v1", status: "draft_for_human_review", decisionReference: "decision-20260719-001", plan: { objective: "Medir a qualidade dos sinais comerciais recebidos.", hypothesis: "Sinais de contato registrado melhoram a leitura de qualificação.", successMetric: "taxa de qualificação", reviewWindowDays: 14, ownerReference: "director-20260719-001" }, execution: { authorized: false, outboundMessagesSent: false, budgetChanged: false, audienceChanged: false, campaignChanged: false, productionTouched: false }, forbidden: { automaticExecution: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["missing-decision", (value) => ({ ...value, decisionReference: "" }), false], ["bad-window", (value) => ({ ...value, plan: { ...value.plan, reviewWindowDays: 0 } }), false], ["message", (value) => ({ ...value, execution: { ...value.execution, outboundMessagesSent: true } }), false], ["audience", (value) => ({ ...value, execution: { ...value.execution, audienceChanged: true } }), false], ["extra", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaControlledPlan(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaControlledPlan(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
