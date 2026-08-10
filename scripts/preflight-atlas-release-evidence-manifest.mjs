import { validateReleaseAuditBinding } from "./preflight-atlas-release-audit-binding.mjs";

const checks = ["cleanGitSource", "isolatedStaging", "databaseConsistency", "environmentPrepared", "criticalTestsPassed", "minimumCommercialOperationWorking", "directorApproval"];
const blocked = (issues) => ({ approved: false, status: "release_evidence_manifest_blocked", issues: [...issues], buildAllowed: false, packageAllowed: false, deploymentAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateReleaseEvidenceManifest(manifest, binding, ledger) {
  const issues = new Set();
  const bindingCheck = validateReleaseAuditBinding(binding, ledger);
  if (!bindingCheck.approved) issues.add("release_audit_binding_invalid");
  if (!manifest || manifest.schema !== "atlas.release-evidence-manifest.v1") issues.add("schema_invalid");
  if (manifest?.status !== "verified_for_final_gate") issues.add("manifest_not_verified");
  if (!/^[0-9a-f]{7,64}$/i.test(manifest?.sourceCommit ?? "")) issues.add("approved_commit_reference_missing");
  if (manifest?.evidenceFingerprint !== binding?.evidenceFingerprint) issues.add("evidence_fingerprint_chain_mismatch");
  if (manifest?.ledgerEntryHash !== binding?.ledgerEntryHash) issues.add("ledger_hash_chain_mismatch");
  if (manifest?.releaseGateReference !== binding?.releaseGateReference) issues.add("release_reference_chain_mismatch");
  for (const check of checks) if (manifest?.requiredChecks?.[check] !== true) issues.add(`required_check_missing:${check}`);
  if (manifest?.execution?.buildAllowed !== false || manifest?.execution?.packageAllowed !== false || manifest?.execution?.deploymentAllowed !== false) issues.add("execution_must_remain_blocked_until_release_command");
  if (!manifest?.forbidden || Object.values(manifest.forbidden).some((value) => value !== true)) issues.add("sensitive_data_protection_missing");
  if (Object.keys(manifest ?? {}).some((key) => !["schema", "status", "sourceCommit", "evidenceFingerprint", "ledgerEntryHash", "releaseGateReference", "requiredChecks", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "release_evidence_manifest_valid_final_release_command_still_required", buildAllowed: false, packageAllowed: false, deploymentAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export async function selfTestReleaseEvidenceManifest() {
  const { createHash } = await import("node:crypto");
  const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const entry = { sequence: 1, evidenceFingerprint: "a".repeat(64), decisionReference: "director-release-gate-20260719", environment: "staging", releaseAuthorized: true, previousEntryHash: null };
  entry.entryHash = hash(entry);
  const ledger = { schema: "atlas.readiness-audit-ledger.v1", status: "auditable", entries: [entry], execution: { buildAllowed: false, packageAllowed: false, deploymentAllowed: false }, forbidden: { secrets: true, rawSessions: true, authorizationClaims: true, customerRecords: true, personalData: true } };
  const binding = { schema: "atlas.release-audit-binding.v1", status: "bound_for_release_gate", evidenceFingerprint: entry.evidenceFingerprint, ledgerEntryHash: entry.entryHash, releaseGateReference: "release-gate-20260719", execution: { buildAllowed: false, packageAllowed: false, deploymentAllowed: false }, forbidden: { secrets: true, rawSessions: true, authorizationClaims: true, customerRecords: true, personalData: true } };
  const manifest = { schema: "atlas.release-evidence-manifest.v1", status: "verified_for_final_gate", sourceCommit: "b".repeat(40), evidenceFingerprint: entry.evidenceFingerprint, ledgerEntryHash: entry.entryHash, releaseGateReference: binding.releaseGateReference, requiredChecks: Object.fromEntries(checks.map((check) => [check, true])), execution: { buildAllowed: false, packageAllowed: false, deploymentAllowed: false }, forbidden: { secrets: true, rawSessions: true, authorizationClaims: true, customerRecords: true, personalData: true } };
  const cases = [["valid", (value) => value, true], ["missing-check", (value) => ({ ...value, requiredChecks: { ...value.requiredChecks, criticalTestsPassed: false } }), false], ["chain-mismatch", (value) => ({ ...value, ledgerEntryHash: "b".repeat(64) }), false], ["execution-open", (value) => ({ ...value, execution: { ...value.execution, buildAllowed: true } }), false], ["sensitive", (value) => ({ ...value, secret: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateReleaseEvidenceManifest(mutate(structuredClone(manifest)), structuredClone(binding), structuredClone(ledger)).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = await selfTestReleaseEvidenceManifest(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }
