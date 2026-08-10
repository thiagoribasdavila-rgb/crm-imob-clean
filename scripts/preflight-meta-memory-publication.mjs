const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const outcomes = new Set(["approved_for_copilot", "rejected", "revision_requested"]);
const scopes = new Set(["organization", "project", "campaign_class"]);
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const blocked = (issues) => ({ approved: false, status: "meta_memory_publication_blocked", issues: [...issues], publicationAllowed: false, automationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaMemoryPublication(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-memory-publication.v1") issues.add("schema_invalid");
  if (record?.status !== "independent_review_recorded") issues.add("review_not_recorded");
  if (!safeReference.test(record?.proposalReference ?? "")) issues.add("proposal_reference_missing");
  const review = record?.review;
  if (!safeReference.test(review?.reviewerReference ?? "") || !safeReference.test(review?.proposerReference ?? "") || review?.reviewerReference === review?.proposerReference) issues.add("independent_review_required");
  if (!outcomes.has(review?.outcome) || !scopes.has(review?.publicationScope) || !iso.test(review?.expiresAt ?? "") || typeof review?.reason !== "string" || review.reason.trim().length < 12 || review.reason.length > 500) issues.add("publication_review_invalid");
  const publication = record?.publication;
  const shouldPublish = review?.outcome === "approved_for_copilot";
  if (publication?.published !== shouldPublish || publication?.availableToCopilot !== shouldPublish || publication?.availableToAutomation !== false) issues.add("publication_boundary_invalid");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "proposalReference", "review", "publication", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: shouldPublish ? "meta_memory_publication_valid_copilot_only" : "meta_memory_publication_valid_not_published", publicationAllowed: shouldPublish, automationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaMemoryPublication() {
  const base = { schema: "atlas.meta-memory-publication.v1", status: "independent_review_recorded", proposalReference: "proposal-20260719-001", review: { reviewerReference: "admin-20260719-001", proposerReference: "director-20260719-001", outcome: "approved_for_copilot", publicationScope: "organization", expiresAt: "2026-10-19T12:00:00Z", reason: "Evidência corroborada, útil para orientação contextual do Copilot." }, publication: { published: true, availableToCopilot: true, availableToAutomation: false }, forbidden: { automaticPublication: true, automaticAutomationUse: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["same-reviewer", (value) => ({ ...value, review: { ...value.review, reviewerReference: value.review.proposerReference } }), false], ["automation", (value) => ({ ...value, publication: { ...value.publication, availableToAutomation: true } }), false], ["not-published", (value) => ({ ...value, publication: { ...value.publication, published: false } }), false], ["scope", (value) => ({ ...value, review: { ...value.review, publicationScope: "global" } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaMemoryPublication(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaMemoryPublication(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
