import { createHash } from "node:crypto";

const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const blocked = (issues) => ({ approved: false, status: "evidence_intake_blocked", issues: [...issues], releaseReady: false, buildAllowed: false, packageAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });
const suspicious = /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+|api[_-]?key|password|secret|token|jwt|cookie|session|cpf|cnpj)/i;

export function validateRealUseEvidenceIntake(input) {
  const issues = new Set();
  if (!input || input.schema !== "atlas.real-use-evidence-intake.v1") issues.add("schema_invalid");
  if (!input || input.status !== "collected") issues.add("evidence_not_collected");
  if (!input?.sourceCommit || !/^[0-9a-f]{7,64}$/i.test(input.sourceCommit)) issues.add("approved_commit_reference_missing");
  if (input?.environment !== "staging") issues.add("isolated_staging_required");
  for (const field of ["cleanGitSource", "isolatedStaging", "databaseConsistency", "environmentPrepared", "criticalTestsPassed", "minimumCommercialOperationWorking", "directorApproval"]) if (input?.evidence?.[field] !== true) issues.add(`evidence_missing:${field}`);
  for (const field of ["stagingHealthCheck", "databaseAudit", "criticalTestRun", "commercialJourneyRun", "directorDecision"]) if (!input?.references?.[field] || suspicious.test(input.references[field])) issues.add(`safe_reference_missing:${field}`);
  if (!input?.forbidden || Object.values(input.forbidden).some((value) => value !== true)) issues.add("sensitive_data_protection_missing");
  if (Object.keys(input ?? {}).some((key) => !["schema", "status", "collectedAt", "sourceCommit", "environment", "evidence", "references", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "evidence_intake_approved_release_still_requires_human_gate", evidenceFingerprint: fingerprint({ sourceCommit: input.sourceCommit, environment: input.environment, evidence: input.evidence, references: input.references }), releaseReady: false, buildAllowed: false, packageAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestRealUseEvidenceIntake() {
  const base = { schema: "atlas.real-use-evidence-intake.v1", status: "collected", sourceCommit: "a".repeat(40), environment: "staging", evidence: { cleanGitSource: true, isolatedStaging: true, databaseConsistency: true, environmentPrepared: true, criticalTestsPassed: true, minimumCommercialOperationWorking: true, directorApproval: true }, references: { stagingHealthCheck: "health-20260719", databaseAudit: "db-audit-20260719", criticalTestRun: "critical-tests-20260719", commercialJourneyRun: "journey-20260719", directorDecision: "director-go-20260719" }, forbidden: { secrets: true, rawSessions: true, authorizationClaims: true, customerRecords: true, personalData: true } };
  const cases = [["valid", (v) => v, true], ["missing-commit", (v) => ({ ...v, sourceCommit: null }), false], ["production", (v) => ({ ...v, environment: "production" }), false], ["missing-db", (v) => ({ ...v, evidence: { ...v.evidence, databaseConsistency: false } }), false], ["unsafe-reference", (v) => ({ ...v, references: { ...v.references, databaseAudit: "https://private" } }), false], ["sensitive", (v) => ({ ...v, apiKey: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateRealUseEvidenceIntake(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}
if (process.argv.includes("--self-test")) { const result = selfTestRealUseEvidenceIntake(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
