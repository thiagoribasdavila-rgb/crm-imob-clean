const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const insightClasses = new Set(["signal_quality", "lead_quality", "attribution_quality"]);
const bands = new Set(["high", "guarded", "low"]);
const evidenceStatuses = new Set(["sufficient", "limited", "insufficient", "conflicting"]);
const validityStatuses = new Set(["valid", "expiring", "expired", "revoked"]);
const actionModes = new Set(["view_only", "request_human_review"]);
const blocked = (issues) => ({ approved: false, status: "meta_insight_disclosure_blocked", issues: [...issues], insightDisplayAllowed: false, actionAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaInsightDisclosure(disclosure) {
  const issues = new Set();
  if (!disclosure || disclosure.schema !== "atlas.meta-insight-disclosure.v1") issues.add("schema_invalid");
  if (disclosure?.status !== "transparent_insight_ready") issues.add("insight_not_ready");
  if (!safeReference.test(disclosure?.memoryReference ?? "")) issues.add("memory_reference_missing");
  const display = disclosure?.display;
  if (!insightClasses.has(display?.insightClass) || !bands.has(display?.confidenceBand) || !evidenceStatuses.has(display?.evidenceStatus) || !validityStatuses.has(display?.validityStatus) || !actionModes.has(display?.actionMode) || display?.humanReviewRequired !== true) issues.add("transparency_fields_invalid");
  if ((display?.confidenceBand === "low" || ["insufficient", "conflicting"].includes(display?.evidenceStatus) || ["expired", "revoked"].includes(display?.validityStatus)) && display?.actionMode !== "view_only") issues.add("weak_or_invalid_insight_must_be_view_only");
  if (disclosure?.execution?.actionExecuted !== false || disclosure?.execution?.campaignChanged !== false || disclosure?.execution?.productionTouched !== false) issues.add("action_or_external_change_observed");
  if (!disclosure?.forbidden || Object.values(disclosure.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(disclosure ?? {}).some((key) => !["schema", "status", "memoryReference", "display", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_insight_disclosure_valid_transparent_view_only", insightDisplayAllowed: true, actionAllowed: false, productionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaInsightDisclosure() {
  const base = { schema: "atlas.meta-insight-disclosure.v1", status: "transparent_insight_ready", memoryReference: "memory-20260719-001", display: { insightClass: "signal_quality", confidenceBand: "guarded", evidenceStatus: "limited", validityStatus: "valid", humanReviewRequired: true, actionMode: "view_only" }, execution: { actionExecuted: false, campaignChanged: false, productionTouched: false }, forbidden: { hiddenConfidence: true, hiddenEvidenceStatus: true, automaticAction: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["low-action", (value) => ({ ...value, display: { ...value.display, confidenceBand: "low", actionMode: "request_human_review" } }), false], ["hidden", (value) => ({ ...value, display: { ...value.display, evidenceStatus: "unknown" } }), false], ["execute", (value) => ({ ...value, execution: { ...value.execution, actionExecuted: true } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaInsightDisclosure(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaInsightDisclosure(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
