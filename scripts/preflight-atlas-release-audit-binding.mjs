import { validateReadinessAuditLedger } from "./preflight-atlas-readiness-audit-ledger.mjs";

const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "release_audit_binding_blocked", issues: [...issues], buildAllowed: false, packageAllowed: false, deploymentAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateReleaseAuditBinding(binding, ledger) {
  const issues = new Set();
  const ledgerCheck = validateReadinessAuditLedger(ledger);
  if (!ledgerCheck.approved) issues.add("audit_ledger_invalid");
  if (!binding || binding.schema !== "atlas.release-audit-binding.v1") issues.add("schema_invalid");
  if (binding?.status !== "bound_for_release_gate") issues.add("binding_not_approved");
  if (!/^[a-f0-9]{64}$/i.test(binding?.evidenceFingerprint ?? "")) issues.add("evidence_fingerprint_missing");
  if (!/^[a-f0-9]{64}$/i.test(binding?.ledgerEntryHash ?? "")) issues.add("ledger_entry_hash_missing");
  if (!safeReference.test(binding?.releaseGateReference ?? "")) issues.add("safe_release_gate_reference_missing");
  if (binding?.execution?.buildAllowed !== false || binding?.execution?.packageAllowed !== false || binding?.execution?.deploymentAllowed !== false) issues.add("execution_must_remain_blocked_until_all_release_gates");
  if (!binding?.forbidden || Object.values(binding.forbidden).some((value) => value !== true)) issues.add("sensitive_data_protection_missing");
  if (Object.keys(binding ?? {}).some((key) => !["schema", "status", "evidenceFingerprint", "ledgerEntryHash", "releaseGateReference", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  const entry = ledger?.entries?.find((candidate) => candidate.entryHash === binding?.ledgerEntryHash);
  if (!entry) issues.add("ledger_entry_not_found");
  else if (entry.evidenceFingerprint !== binding.evidenceFingerprint) issues.add("evidence_fingerprint_not_bound_to_ledger_entry");
  return issues.size ? blocked(issues) : { approved: true, status: "release_audit_binding_valid_release_gates_still_required", buildAllowed: false, packageAllowed: false, deploymentAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export async function selfTestReleaseAuditBinding() {
  const { createHash } = await import("node:crypto");
  const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const entry = { sequence: 1, evidenceFingerprint: "a".repeat(64), decisionReference: "director-release-gate-20260719", environment: "staging", releaseAuthorized: true, previousEntryHash: null };
  entry.entryHash = digest(entry);
  const ledger = { schema: "atlas.readiness-audit-ledger.v1", status: "auditable", entries: [entry], execution: { buildAllowed: false, packageAllowed: false, deploymentAllowed: false }, forbidden: { secrets: true, rawSessions: true, authorizationClaims: true, customerRecords: true, personalData: true } };
  const binding = { schema: "atlas.release-audit-binding.v1", status: "bound_for_release_gate", evidenceFingerprint: entry.evidenceFingerprint, ledgerEntryHash: entry.entryHash, releaseGateReference: "release-gate-20260719", execution: { buildAllowed: false, packageAllowed: false, deploymentAllowed: false }, forbidden: { secrets: true, rawSessions: true, authorizationClaims: true, customerRecords: true, personalData: true } };
  const cases = [
    ["valid", (value) => value, true],
    ["missing-entry", (value) => ({ ...value, ledgerEntryHash: "b".repeat(64) }), false],
    ["mismatched-evidence", (value) => ({ ...value, evidenceFingerprint: "c".repeat(64) }), false],
    ["execution-open", (value) => ({ ...value, execution: { ...value.execution, packageAllowed: true } }), false],
    ["sensitive", (value) => ({ ...value, token: "not-allowed" }), false],
  ];
  const failures = cases.filter(([_, mutate, expected]) => validateReleaseAuditBinding(mutate(structuredClone(binding)), structuredClone(ledger)).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = await selfTestReleaseAuditBinding();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}
