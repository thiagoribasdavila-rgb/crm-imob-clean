import { createHash } from "node:crypto";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const allowedKeys = ["schema", "status", "entries", "execution", "forbidden"];
const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "readiness_audit_blocked", issues: [...issues], buildAllowed: false, packageAllowed: false, deploymentAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateReadinessAuditLedger(input) {
  const issues = new Set();
  if (!input || input.schema !== "atlas.readiness-audit-ledger.v1") issues.add("schema_invalid");
  if (!Array.isArray(input?.entries)) issues.add("entries_invalid");
  if (input?.status !== (input?.entries?.length ? "auditable" : "empty")) issues.add("ledger_status_invalid");
  if (input?.execution?.buildAllowed !== false || input?.execution?.packageAllowed !== false || input?.execution?.deploymentAllowed !== false) issues.add("execution_must_remain_blocked");
  if (!input?.forbidden || Object.values(input.forbidden).some((value) => value !== true)) issues.add("sensitive_data_protection_missing");
  if (Object.keys(input ?? {}).some((key) => !allowedKeys.includes(key))) issues.add("sensitive_data_detected");

  const seenFingerprints = new Set();
  let previousHash = null;
  for (const [index, entry] of (input?.entries ?? []).entries()) {
    if (!entry || entry.sequence !== index + 1) issues.add(`sequence_invalid:${index + 1}`);
    if (!/^[a-f0-9]{64}$/i.test(entry?.evidenceFingerprint ?? "")) issues.add(`evidence_fingerprint_invalid:${index + 1}`);
    if (seenFingerprints.has(entry?.evidenceFingerprint)) issues.add("evidence_fingerprint_reused");
    seenFingerprints.add(entry?.evidenceFingerprint);
    if (!safeReference.test(entry?.decisionReference ?? "")) issues.add(`safe_decision_reference_missing:${index + 1}`);
    if (entry?.environment !== "staging") issues.add("isolated_staging_required");
    if (entry?.releaseAuthorized !== true) issues.add(`human_authorization_missing:${index + 1}`);
    if (entry?.previousEntryHash !== previousHash) issues.add(`hash_chain_broken:${index + 1}`);
    const expectedEntryHash = hash({ sequence: entry?.sequence, evidenceFingerprint: entry?.evidenceFingerprint, decisionReference: entry?.decisionReference, environment: entry?.environment, releaseAuthorized: entry?.releaseAuthorized, previousEntryHash: entry?.previousEntryHash });
    if (entry?.entryHash !== expectedEntryHash) issues.add(`entry_hash_invalid:${index + 1}`);
    previousHash = entry?.entryHash;
  }
  return issues.size ? blocked(issues) : { approved: true, status: "readiness_audit_ledger_valid_release_gate_still_required", latestEntryHash: previousHash, buildAllowed: false, packageAllowed: false, deploymentAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestReadinessAuditLedger() {
  const entry = { sequence: 1, evidenceFingerprint: "a".repeat(64), decisionReference: "director-release-gate-20260719", environment: "staging", releaseAuthorized: true, previousEntryHash: null };
  entry.entryHash = hash(entry);
  const base = { schema: "atlas.readiness-audit-ledger.v1", status: "auditable", entries: [entry], execution: { buildAllowed: false, packageAllowed: false, deploymentAllowed: false }, forbidden: { secrets: true, rawSessions: true, authorizationClaims: true, customerRecords: true, personalData: true } };
  const cases = [
    ["valid", (value) => value, true],
    ["reused-fingerprint", (value) => ({ ...value, entries: [...value.entries, { ...value.entries[0], sequence: 2, previousEntryHash: value.entries[0].entryHash, entryHash: "b".repeat(64) }] }), false],
    ["tampered-entry", (value) => ({ ...value, entries: [{ ...value.entries[0], decisionReference: "changed-reference" }] }), false],
    ["production", (value) => ({ ...value, entries: [{ ...value.entries[0], environment: "production" }] }), false],
    ["execution-open", (value) => ({ ...value, execution: { ...value.execution, buildAllowed: true } }), false],
    ["sensitive", (value) => ({ ...value, token: "not-allowed" }), false],
  ];
  const failures = cases.filter(([_, mutate, expected]) => validateReadinessAuditLedger(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestReadinessAuditLedger();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}
