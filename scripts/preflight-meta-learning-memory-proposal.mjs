const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const types = new Set(["measurement_pattern", "attribution_pattern", "audience_hypothesis"]);
const scopes = new Set(["organization", "project", "campaign_class"]);
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const blocked = (issues) => ({ approved: false, status: "meta_learning_memory_proposal_blocked", issues: [...issues], reviewAllowed: false, publicationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningMemoryProposal(record) {
  const issues = new Set();
  if (!record || record.schema !== "atlas.meta-learning-memory-proposal.v1") issues.add("schema_invalid");
  if (record?.status !== "proposed_for_human_review") issues.add("proposal_not_pending");
  if (!safeReference.test(record?.interpretationReference ?? "")) issues.add("interpretation_reference_missing");
  const proposal = record?.proposal;
  if (!types.has(proposal?.learningType) || proposal?.evidenceLevel !== "corroborated" || typeof proposal?.summary !== "string" || proposal.summary.trim().length < 12 || proposal.summary.length > 500 || !scopes.has(proposal?.scope) || !safeReference.test(proposal?.proposedByReference ?? "") || !iso.test(proposal?.expiresAt ?? "")) issues.add("proposal_definition_invalid");
  if (record?.publication?.published !== false || record?.publication?.availableToCopilot !== false || record?.publication?.availableToAutomation !== false) issues.add("publication_boundary_invalid");
  if (!record?.forbidden || Object.values(record.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(record ?? {}).some((key) => !["schema", "status", "interpretationReference", "proposal", "publication", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_memory_proposal_valid_review_required", reviewAllowed: true, publicationAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningMemoryProposal() {
  const base = { schema: "atlas.meta-learning-memory-proposal.v1", status: "proposed_for_human_review", interpretationReference: "interpretation-20260719-001", proposal: { learningType: "measurement_pattern", evidenceLevel: "corroborated", summary: "Padrão corroborado para leitura de sinais comerciais agregados.", scope: "organization", proposedByReference: "director-20260719-001", expiresAt: "2026-10-19T12:00:00Z" }, publication: { published: false, availableToCopilot: false, availableToAutomation: false }, forbidden: { automaticPublication: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["evidence", (value) => ({ ...value, proposal: { ...value.proposal, evidenceLevel: "directional" } }), false], ["published", (value) => ({ ...value, publication: { ...value.publication, published: true } }), false], ["copilot", (value) => ({ ...value, publication: { ...value.publication, availableToCopilot: true } }), false], ["scope", (value) => ({ ...value, proposal: { ...value.proposal, scope: "global" } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningMemoryProposal(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningMemoryProposal(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
