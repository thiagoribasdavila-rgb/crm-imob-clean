const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const reasons = new Set(["insufficient_evidence", "contradictory_evidence", "lineage_gap", "expired_evidence"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_revalidation_request_blocked", issues: [...issues], revalidationRequestRecorded: false, oldMemoryReuseAllowed: false, externalTestAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningRevalidationRequest(request) {
  const issues = new Set();
  if (!request || request.schema !== "atlas.meta-learning-revalidation-request.v1") issues.add("schema_invalid");
  if (request?.status !== "human_revalidation_requested") issues.add("revalidation_not_requested");
  if (!safeReference.test(request?.resolutionReference ?? "")) issues.add("resolution_reference_missing");
  const details = request?.request;
  if (!safeReference.test(details?.requesterReference ?? "") || !isoDate.test(details?.requestedAt ?? "") || !reasons.has(details?.reasonClass)) issues.add("request_proof_invalid");
  if (details?.requiresNewLineage !== true || details?.requiresNewApproval !== true) issues.add("fresh_governance_required");
  if (request?.execution?.oldMemoryReused !== false || request?.execution?.externalTestStarted !== false || request?.execution?.campaignChanged !== false || request?.execution?.productionTouched !== false) issues.add("reuse_or_external_execution_observed");
  if (!request?.forbidden || Object.values(request.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(request ?? {}).some((key) => !["schema", "status", "resolutionReference", "request", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_revalidation_request_valid_fresh_governance_required", revalidationRequestRecorded: true, oldMemoryReuseAllowed: false, externalTestAllowed: false, campaignChangeAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningRevalidationRequest() {
  const base = { schema: "atlas.meta-learning-revalidation-request.v1", status: "human_revalidation_requested", resolutionReference: "resolution-20260719-001", request: { requesterReference: "director-20260719-004", requestedAt: "2026-07-19T16:00:00.000Z", reasonClass: "insufficient_evidence", requiresNewLineage: true, requiresNewApproval: true }, execution: { oldMemoryReused: false, externalTestStarted: false, campaignChanged: false, productionTouched: false }, forbidden: { automaticRevalidation: true, oldEvidenceReuse: true, automaticCampaignChanges: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["old-lineage", (value) => ({ ...value, request: { ...value.request, requiresNewLineage: false } }), false], ["old-approval", (value) => ({ ...value, request: { ...value.request, requiresNewApproval: false } }), false], ["reuse", (value) => ({ ...value, execution: { ...value.execution, oldMemoryReused: true } }), false], ["external", (value) => ({ ...value, execution: { ...value.execution, externalTestStarted: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningRevalidationRequest(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningRevalidationRequest(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
