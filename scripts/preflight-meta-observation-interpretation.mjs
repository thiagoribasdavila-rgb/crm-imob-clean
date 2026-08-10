const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const levels = new Set(["insufficient", "directional", "corroborated"]);
const nextSteps = new Set(["collect_more_evidence", "request_revalidation", "close_without_learning"]);
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const blocked = (issues) => ({ approved: false, status: "meta_observation_interpretation_blocked", issues: [...issues], learningRecommendationAllowed: false, optimizationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaObservationInterpretation(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-observation-interpretation.v1") issues.add("schema_invalid");
  if (record?.status !== "human_interpretation_recorded") issues.add("interpretation_not_recorded");
  if (!safeReference.test(record?.observationReference ?? "")) issues.add("observation_reference_missing");
  const interpretation = record?.interpretation;
  if (!safeReference.test(interpretation?.reviewerReference ?? "") || typeof interpretation?.conclusion !== "string" || interpretation.conclusion.trim().length < 12 || interpretation.conclusion.length > 500 || !levels.has(interpretation?.evidenceLevel) || !nextSteps.has(interpretation?.recommendedNextStep) || !iso.test(interpretation?.interpretedAt ?? "") || interpretation?.causalClaim !== false) issues.add("interpretation_definition_invalid");
  if (interpretation?.evidenceLevel === "insufficient" && interpretation?.recommendedNextStep !== "collect_more_evidence") issues.add("insufficient_evidence_requires_collection");
  if (record?.execution?.optimizationRequested !== false || record?.execution?.budgetChanged !== false || record?.execution?.audienceChanged !== false || record?.execution?.campaignChanged !== false || record?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "observationReference", "interpretation", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_observation_interpretation_valid_human_learning_recommendation", learningRecommendationAllowed: true, optimizationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaObservationInterpretation() {
  const base = { schema: "atlas.meta-observation-interpretation.v1", status: "human_interpretation_recorded", observationReference: "observation-20260719-001", interpretation: { reviewerReference: "director-20260719-001", conclusion: "A variação é direcional e deve ser acompanhada em nova janela.", evidenceLevel: "directional", recommendedNextStep: "collect_more_evidence", interpretedAt: "2026-07-19T13:20:00Z", causalClaim: false }, execution: { optimizationRequested: false, budgetChanged: false, audienceChanged: false, campaignChanged: false, productionTouched: false }, forbidden: { automaticConclusion: true, automaticOptimization: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["causal", (value) => ({ ...value, interpretation: { ...value.interpretation, causalClaim: true } }), false], ["insufficient", (value) => ({ ...value, interpretation: { ...value.interpretation, evidenceLevel: "insufficient", recommendedNextStep: "request_revalidation" } }), false], ["missing-reviewer", (value) => ({ ...value, interpretation: { ...value.interpretation, reviewerReference: "" } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaObservationInterpretation(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaObservationInterpretation(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
