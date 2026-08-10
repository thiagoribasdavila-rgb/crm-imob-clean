const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const scopes = new Set(["organization", "project", "campaign_class"]);
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const blocked = (issues) => ({ approved: false, status: "meta_copilot_memory_consumption_blocked", issues: [...issues], guidanceAllowed: false, automationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaCopilotMemoryConsumption(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-copilot-memory-consumption.v1") issues.add("schema_invalid");
  if (record?.status !== "context_validated_for_guidance") issues.add("context_not_validated");
  if (!safeReference.test(record?.publicationReference ?? "")) issues.add("publication_reference_missing");
  const context = record?.context;
  if (!scopes.has(context?.requestedScope) || !scopes.has(context?.publishedScope) || context?.requestedScope !== context?.publishedScope || !safeReference.test(context?.sourceReference ?? "") || !iso.test(context?.expiresAt ?? "") || !iso.test(context?.usedAt ?? "")) issues.add("memory_context_invalid");
  if (iso.test(context?.expiresAt ?? "") && iso.test(context?.usedAt ?? "") && Date.parse(context.usedAt) >= Date.parse(context.expiresAt)) issues.add("memory_expired");
  const response = record?.response;
  if (response?.sourceDisclosed !== true || response?.presentedAsGuidance !== true || response?.presentedAsFact !== false || response?.actionExecuted !== false) issues.add("response_boundary_invalid");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "publicationReference", "context", "response", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_copilot_memory_consumption_valid_guidance_only", guidanceAllowed: true, automationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaCopilotMemoryConsumption() {
  const base = { schema: "atlas.meta-copilot-memory-consumption.v1", status: "context_validated_for_guidance", publicationReference: "publication-20260719-001", context: { requestedScope: "organization", publishedScope: "organization", sourceReference: "memory-20260719-001", expiresAt: "2026-10-19T12:00:00Z", usedAt: "2026-07-19T14:00:00Z" }, response: { sourceDisclosed: true, presentedAsGuidance: true, presentedAsFact: false, actionExecuted: false }, forbidden: { automationUse: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["scope", (value) => ({ ...value, context: { ...value.context, requestedScope: "project" } }), false], ["expired", (value) => ({ ...value, context: { ...value.context, expiresAt: "2026-07-19T13:00:00Z" } }), false], ["fact", (value) => ({ ...value, response: { ...value.response, presentedAsFact: true } }), false], ["executed", (value) => ({ ...value, response: { ...value.response, actionExecuted: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaCopilotMemoryConsumption(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaCopilotMemoryConsumption(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
