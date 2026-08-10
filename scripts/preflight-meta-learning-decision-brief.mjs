const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const questions = new Set(["should_we_investigate", "should_we_retain_for_analysis", "should_we_discard_hypothesis"]);
const summaries = new Set(["controlled_test_summary", "supervised_operation_summary", "historical_aggregate_summary"]);
const bands = new Set(["high", "guarded", "low"]);
const actions = new Set(["review_with_director", "request_more_evidence", "archive_hypothesis"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_decision_brief_blocked", issues: [...issues], briefingReady: false, approvalAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningDecisionBrief(briefing) {
  const issues = new Set();
  if (!briefing || briefing.schema !== "atlas.meta-learning-decision-brief.v1") issues.add("schema_invalid");
  if (briefing?.status !== "ready_for_human_decision") issues.add("brief_not_ready");
  for (const field of ["confidenceReference", "lineageReference"]) if (!safeReference.test(briefing?.[field] ?? "")) issues.add(`reference_missing:${field}`);
  if (!questions.has(briefing?.brief?.decisionQuestion) || !summaries.has(briefing?.brief?.evidenceSummaryClass) || !bands.has(briefing?.brief?.confidenceBand) || !actions.has(briefing?.brief?.recommendedHumanAction)) issues.add("brief_content_invalid");
  if (briefing?.brief?.limitationsAcknowledged !== true) issues.add("limitations_must_be_acknowledged");
  if (briefing?.brief?.confidenceBand === "low" && briefing?.brief?.recommendedHumanAction !== "request_more_evidence") issues.add("low_confidence_requires_more_evidence");
  if (briefing?.execution?.campaignChanged !== false || briefing?.execution?.audienceChanged !== false || briefing?.execution?.budgetChanged !== false || briefing?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!briefing?.forbidden || Object.values(briefing.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(briefing ?? {}).some((key) => !["schema", "status", "confidenceReference", "lineageReference", "brief", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_decision_brief_valid_human_decision_required", briefingReady: true, approvalAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningDecisionBrief() {
  const base = { schema: "atlas.meta-learning-decision-brief.v1", status: "ready_for_human_decision", confidenceReference: "confidence-20260719-001", lineageReference: "lineage-20260719-001", brief: { decisionQuestion: "should_we_retain_for_analysis", evidenceSummaryClass: "controlled_test_summary", confidenceBand: "guarded", recommendedHumanAction: "review_with_director", limitationsAcknowledged: true }, execution: { campaignChanged: false, audienceChanged: false, budgetChanged: false, productionTouched: false }, forbidden: { automaticApproval: true, automaticCampaignChanges: true, automaticAudienceChanges: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["no-limitations", (value) => ({ ...value, brief: { ...value.brief, limitationsAcknowledged: false } }), false], ["low", (value) => ({ ...value, brief: { ...value.brief, confidenceBand: "low" } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["auto", (value) => ({ ...value, automaticApproval: "not-allowed" }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningDecisionBrief(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningDecisionBrief(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
