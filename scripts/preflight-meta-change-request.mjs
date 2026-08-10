const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const changeClasses = new Set(["signal_mapping", "attribution_review", "audience_hypothesis"]);
const scopes = new Set(["measurement_only", "planning_only"]);
const blocked = (issues) => ({ approved: false, status: "meta_change_request_blocked", issues: [...issues], approvalDisplayAllowed: false, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaChangeRequest(request) {
  const issues = new Set();
  if (!request || request.schema !== "atlas.meta-change-request.v1") issues.add("schema_invalid");
  if (request?.status !== "requested_for_human_approval") issues.add("request_status_invalid");
  if (!safeReference.test(request?.planReference ?? "")) issues.add("plan_reference_missing");
  const change = request?.request;
  if (!changeClasses.has(change?.changeClass) || !scopes.has(change?.scope) || !safeReference.test(change?.requestedByReference ?? "")) issues.add("request_definition_invalid");
  if (typeof change?.reason !== "string" || change.reason.trim().length < 12 || change.reason.length > 500) issues.add("request_reason_invalid");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(change?.requestedAt ?? "")) issues.add("request_timestamp_invalid");
  if (request?.execution?.approved !== false || request?.execution?.budgetChanged !== false || request?.execution?.audienceChanged !== false || request?.execution?.campaignChanged !== false || request?.execution?.productionTouched !== false) issues.add("external_change_observed");
  if (!request?.forbidden || Object.values(request.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(request ?? {}).some((key) => !["schema", "status", "planReference", "request", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_change_request_valid_pending_human_approval", approvalDisplayAllowed: true, executionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaChangeRequest() {
  const base = { schema: "atlas.meta-change-request.v1", status: "requested_for_human_approval", planReference: "plan-20260719-001", request: { changeClass: "signal_mapping", scope: "measurement_only", requestedByReference: "director-20260719-001", reason: "Solicitação limitada ao planejamento de medição comercial.", requestedAt: "2026-07-19T12:15:00Z" }, execution: { approved: false, budgetChanged: false, audienceChanged: false, campaignChanged: false, productionTouched: false }, forbidden: { automaticApproval: true, automaticExecution: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["scope", (value) => ({ ...value, request: { ...value.request, scope: "campaign_live" } }), false], ["missing-owner", (value) => ({ ...value, request: { ...value.request, requestedByReference: "" } }), false], ["approved", (value) => ({ ...value, execution: { ...value.execution, approved: true } }), false], ["campaign", (value) => ({ ...value, execution: { ...value.execution, campaignChanged: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaChangeRequest(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaChangeRequest(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
