const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const outcomes = new Set(["keep_blocked", "revoke_memory", "request_more_evidence"]);
const reasons = new Set(["expiry_confirmed", "lineage_gap", "contradictory_evidence", "insufficient_evidence"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_review_resolution_blocked", issues: [...issues], resolutionRecorded: false, memoryReinstatementAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningReviewResolution(resolution) {
  const issues = new Set();
  if (!resolution || resolution.schema !== "atlas.meta-learning-review-resolution.v1") issues.add("schema_invalid");
  if (resolution?.status !== "human_resolution_recorded") issues.add("resolution_not_recorded");
  if (!safeReference.test(resolution?.queueReference ?? "")) issues.add("queue_reference_missing");
  const details = resolution?.resolution;
  if (!safeReference.test(details?.reviewerReference ?? "") || !isoDate.test(details?.reviewedAt ?? "") || !outcomes.has(details?.outcome) || !reasons.has(details?.reasonClass)) issues.add("resolution_proof_invalid");
  if (details?.outcome === "revoke_memory" && resolution?.execution?.memoryRevoked !== true) issues.add("revocation_not_executed");
  if (details?.outcome !== "revoke_memory" && resolution?.execution?.memoryRevoked !== false) issues.add("unapproved_revocation_observed");
  if (resolution?.execution?.memoryReinstated !== false || resolution?.execution?.campaignChanged !== false || resolution?.execution?.productionTouched !== false) issues.add("reinstatement_or_external_change_observed");
  if (!resolution?.forbidden || Object.values(resolution.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(resolution ?? {}).some((key) => !["schema", "status", "queueReference", "resolution", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_review_resolution_valid_no_reinstatement", resolutionRecorded: true, memoryReinstatementAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningReviewResolution() {
  const base = { schema: "atlas.meta-learning-review-resolution.v1", status: "human_resolution_recorded", queueReference: "queue-20260719-001", resolution: { reviewerReference: "director-20260719-003", reviewedAt: "2026-07-19T15:30:00.000Z", outcome: "revoke_memory", reasonClass: "expiry_confirmed" }, execution: { memoryReinstated: false, memoryRevoked: true, campaignChanged: false, productionTouched: false }, forbidden: { automaticResolution: true, automaticReinstatement: true, automaticCampaignChanges: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["no-reviewer", (value) => ({ ...value, resolution: { ...value.resolution, reviewerReference: null } }), false], ["no-revoke", (value) => ({ ...value, execution: { ...value.execution, memoryRevoked: false } }), false], ["reinstated", (value) => ({ ...value, execution: { ...value.execution, memoryReinstated: true } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningReviewResolution(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningReviewResolution(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
