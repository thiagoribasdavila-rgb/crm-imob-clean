import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-isolated-restore-rehearsal-gate.json"));
const shaPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-z0-9][a-z0-9_-]{7,127}$/;

const findSensitiveEvidence = (value, path = "$", issues = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/(password|secret|token|authorization|database.?url|connection.?string|api.?key)/i.test(key)) issues.push(`sensitive_key:${path}.${key}`);
      findSensitiveEvidence(child, `${path}.${key}`, issues);
    }
    return issues;
  }
  if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+)/i.test(value)) issues.push(`sensitive_value:${path}`);
  return issues;
};

const expectedControls = () => ({
  source_chain_integrity: true,
  cross_major_artifact_equivalence: true,
  security_equivalence: true,
  rollback_equivalence: true,
  extension_compatibility: true,
  immutable_backup_verified: false,
  restore_drill_verified: false,
  isolated_staging_replay_verified: false,
  data_integrity_verified: false,
  performance_baseline_verified: false,
  observability_ready: false,
  security_advisor_verified: false,
  performance_advisor_verified: false,
  production_rollback_runbook_verified: false,
  human_change_approval_verified: false
});

export function validatePhase35ReadinessReceipt(receipt) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(receipt && typeof receipt === "object" && !Array.isArray(receipt), "phase34_receipt_object_required");
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return { approved: false, issues };

  const source = gate.sourceReadinessReceipt;
  expect(receipt.schemaVersion === source.schemaVersion, "phase34_receipt_schema_mismatch");
  expect(receipt.phase === source.phase && receipt.sourcePhase === source.sourcePhase, "phase34_receipt_phase_mismatch");
  expect(receipt.status === source.status, "phase34_receipt_status_mismatch");
  expect(Number.isFinite(Date.parse(receipt.assessedAt)), "phase34_receipt_timestamp_invalid");
  expect(shaPattern.test(receipt.sourceReceiptFingerprint ?? ""), "phase34_source_fingerprint_invalid");
  expect(receipt.sourceReceiptAccepted === true, "phase34_source_receipt_not_accepted");
  expect(JSON.stringify(receipt.controls ?? {}) === JSON.stringify(expectedControls()), "phase34_control_matrix_mismatch");
  expect(receipt.evidenceCoverage?.verifiedControls === source.verifiedControls, "phase34_verified_control_count_mismatch");
  expect(receipt.evidenceCoverage?.requiredControls === source.requiredControls, "phase34_required_control_count_mismatch");
  expect(receipt.evidenceCoverage?.percent === source.evidenceCoveragePercent, "phase34_evidence_coverage_mismatch");
  expect(receipt.stagingMigrationAllowed === false, "phase34_staging_claim_invalid");
  expect(receipt.productionMigrationAllowed === false, "phase34_production_migration_claim_invalid");
  expect(receipt.productionCompatibilityApproved === false, "phase34_production_compatibility_claim_invalid");
  expect(receipt.remoteDatabaseTouched === false, "phase34_remote_database_touch_prohibited");
  expect(receipt.metaTouched === false, "phase34_meta_touch_prohibited");
  expect(receipt.buildExecuted === false, "phase34_build_execution_prohibited");
  issues.push(...findSensitiveEvidence(receipt));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function validatePhase35BackupManifest(manifest, now = Date.now()) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(manifest && typeof manifest === "object" && !Array.isArray(manifest), "backup_manifest_object_required");
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { approved: false, issues };

  const contract = gate.backupManifest;
  const createdAt = Date.parse(manifest.createdAt);
  const ageHours = (now - createdAt) / 3600000;
  expect(manifest.schemaVersion === contract.schemaVersion, "backup_manifest_schema_mismatch");
  expect(manifest.status === contract.status, "backup_manifest_not_verified");
  expect(idPattern.test(manifest.backupId ?? ""), "backup_id_invalid");
  expect(shaPattern.test(manifest.sourceIdentityHash ?? ""), "backup_source_identity_hash_invalid");
  expect(Number.isFinite(createdAt), "backup_created_at_invalid");
  expect(Number.isFinite(ageHours) && ageHours >= 0, "backup_created_at_in_future");
  expect(Number.isFinite(ageHours) && ageHours <= contract.maximumAgeHours, "backup_too_old");
  expect(contract.allowedBackupTypes.includes(manifest.backupType), "backup_type_invalid");
  expect(manifest.postgresMajor === contract.postgresMajor, "backup_postgres_major_mismatch");
  expect(manifest.postgresImage === contract.postgresImage, "backup_postgres_image_mismatch");
  expect(shaPattern.test(manifest.sha256 ?? ""), "backup_sha256_invalid");
  expect(Number.isSafeInteger(manifest.sizeBytes) && manifest.sizeBytes >= contract.minimumSizeBytes, "backup_size_invalid");
  expect(Number.isSafeInteger(manifest.rpoMinutes) && manifest.rpoMinutes >= 0 && manifest.rpoMinutes <= contract.maximumRpoMinutes, "backup_rpo_invalid");
  expect(manifest.immutable === true, "backup_not_immutable");
  expect(manifest.encryptedAtRest === true, "backup_not_encrypted_at_rest");
  expect(manifest.offsiteCopyVerified === true, "backup_offsite_copy_not_verified");
  expect(manifest.storageObjectsInventoryIncluded === true, "backup_storage_inventory_missing");
  expect(manifest.customRolesDocumented === true, "backup_custom_roles_not_documented");
  expect(manifest.authStorageChangesDocumented === true, "backup_auth_storage_changes_not_documented");
  expect(manifest.realtimePublicationsDocumented === true, "backup_realtime_publications_not_documented");
  expect(manifest.replicationSubscriptionsDocumented === true, "backup_replication_subscriptions_not_documented");
  expect(manifest.containsCredentials === false, "backup_manifest_contains_credentials");
  issues.push(...findSensitiveEvidence(manifest));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function evaluatePhase35RestoreRehearsalContract(readinessReceipt, backupManifest, now = Date.now()) {
  const readiness = validatePhase35ReadinessReceipt(readinessReceipt);
  const backup = validatePhase35BackupManifest(backupManifest, now);
  return {
    sourcesApproved: readiness.approved && backup.approved,
    readinessIssues: readiness.issues,
    backupIssues: backup.issues,
    restorePlan: structuredClone(gate.requiredRestorePlan),
    restoreExecuted: false,
    restoreExecutionAllowed: false,
    stagingMigrationAllowed: false,
    productionMigrationAllowed: false,
    productionCompatibilityApproved: false
  };
}

const approvedReadinessReceipt = () => ({
  schemaVersion: "phase34.migration-readiness.v1",
  phase: 34,
  sourcePhase: 33,
  status: "assessment_complete_blocked",
  assessedAt: "2026-07-19T14:00:00.000Z",
  sourceReceiptFingerprint: "a".repeat(64),
  sourceReceiptAccepted: true,
  controls: expectedControls(),
  evidenceCoverage: { verifiedControls: 5, requiredControls: 15, percent: 33 },
  stagingMigrationAllowed: false,
  productionMigrationAllowed: false,
  productionCompatibilityApproved: false,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
});

const approvedBackupManifest = () => ({
  schemaVersion: "phase35.backup-manifest.v1",
  status: "verified",
  backupId: "atlas-backup-sample-02",
  sourceIdentityHash: "b".repeat(64),
  createdAt: "2026-07-19T13:00:00.000Z",
  backupType: "logical",
  postgresMajor: 17,
  postgresImage: "supabase/postgres:17.6.1.149",
  sha256: "c".repeat(64),
  sizeBytes: 1024,
  rpoMinutes: 60,
  immutable: true,
  encryptedAtRest: true,
  offsiteCopyVerified: true,
  storageObjectsInventoryIncluded: true,
  customRolesDocumented: true,
  authStorageChangesDocumented: true,
  realtimePublicationsDocumented: true,
  replicationSubscriptionsDocumented: true,
  containsCredentials: false
});

export function selfTestPhase35RestoreRehearsal() {
  const now = Date.parse("2026-07-19T14:00:00.000Z");
  const readinessCases = [
    ["readiness-baseline", (value) => value, true],
    ["readiness-schema", (value) => { value.schemaVersion = "old"; return value; }, false],
    ["readiness-phase", (value) => { value.phase = 33; return value; }, false],
    ["readiness-status", (value) => { value.status = "approved"; return value; }, false],
    ["readiness-timestamp", (value) => { value.assessedAt = "invalid"; return value; }, false],
    ["readiness-fingerprint", (value) => { value.sourceReceiptFingerprint = "bad"; return value; }, false],
    ["readiness-source", (value) => { value.sourceReceiptAccepted = false; return value; }, false],
    ["readiness-control", (value) => { value.controls.source_chain_integrity = false; return value; }, false],
    ["readiness-extra-control", (value) => { value.controls.extra = false; return value; }, false],
    ["readiness-coverage", (value) => { value.evidenceCoverage.percent = 34; return value; }, false],
    ["readiness-staging", (value) => { value.stagingMigrationAllowed = true; return value; }, false],
    ["readiness-production", (value) => { value.productionMigrationAllowed = true; return value; }, false],
    ["readiness-compatibility", (value) => { value.productionCompatibilityApproved = true; return value; }, false],
    ["readiness-remote", (value) => { value.remoteDatabaseTouched = true; return value; }, false],
    ["readiness-meta", (value) => { value.metaTouched = true; return value; }, false],
    ["readiness-build", (value) => { value.buildExecuted = true; return value; }, false],
    ["readiness-secret", (value) => { value.apiToken = "hidden"; return value; }, false]
  ];
  const backupCases = [
    ["backup-baseline", (value) => value, true],
    ["backup-schema", (value) => { value.schemaVersion = "old"; return value; }, false],
    ["backup-status", (value) => { value.status = "pending"; return value; }, false],
    ["backup-id", (value) => { value.backupId = "bad"; return value; }, false],
    ["backup-source", (value) => { value.sourceIdentityHash = "bad"; return value; }, false],
    ["backup-time", (value) => { value.createdAt = "invalid"; return value; }, false],
    ["backup-future", (value) => { value.createdAt = "2026-07-20T14:00:00.000Z"; return value; }, false],
    ["backup-stale", (value) => { value.createdAt = "2026-07-17T13:00:00.000Z"; return value; }, false],
    ["backup-type", (value) => { value.backupType = "unknown"; return value; }, false],
    ["backup-major", (value) => { value.postgresMajor = 15; return value; }, false],
    ["backup-image", (value) => { value.postgresImage = "latest"; return value; }, false],
    ["backup-hash", (value) => { value.sha256 = "bad"; return value; }, false],
    ["backup-size", (value) => { value.sizeBytes = 0; return value; }, false],
    ["backup-rpo", (value) => { value.rpoMinutes = 2000; return value; }, false],
    ["backup-immutable", (value) => { value.immutable = false; return value; }, false],
    ["backup-encryption", (value) => { value.encryptedAtRest = false; return value; }, false],
    ["backup-offsite", (value) => { value.offsiteCopyVerified = false; return value; }, false],
    ["backup-storage", (value) => { value.storageObjectsInventoryIncluded = false; return value; }, false],
    ["backup-roles", (value) => { value.customRolesDocumented = false; return value; }, false],
    ["backup-auth-storage", (value) => { value.authStorageChangesDocumented = false; return value; }, false],
    ["backup-realtime", (value) => { value.realtimePublicationsDocumented = false; return value; }, false],
    ["backup-replication", (value) => { value.replicationSubscriptionsDocumented = false; return value; }, false],
    ["backup-credentials", (value) => { value.containsCredentials = true; return value; }, false],
    ["backup-secret", (value) => { value.connectionString = "hidden"; return value; }, false]
  ];
  const failures = [];
  for (const [name, mutate, expected] of readinessCases) {
    const result = validatePhase35ReadinessReceipt(mutate(structuredClone(approvedReadinessReceipt())));
    if (result.approved !== expected) failures.push({ name, expected, result });
  }
  for (const [name, mutate, expected] of backupCases) {
    const result = validatePhase35BackupManifest(mutate(structuredClone(approvedBackupManifest())), now);
    if (result.approved !== expected) failures.push({ name, expected, result });
  }
  const contract = evaluatePhase35RestoreRehearsalContract(approvedReadinessReceipt(), approvedBackupManifest(), now);
  if (!contract.sourcesApproved) failures.push({ name: "source-contract", contract });
  if (!contract.restorePlan.isolatedTarget || !contract.restorePlan.disposableTarget || contract.restorePlan.productionTarget) failures.push({ name: "target-isolation", contract });
  if (contract.restoreExecuted || contract.restoreExecutionAllowed || contract.stagingMigrationAllowed || contract.productionMigrationAllowed || contract.productionCompatibilityApproved) failures.push({ name: "execution-gate", contract });
  return { passed: failures.length === 0, caseCount: readinessCases.length + backupCases.length + 3, failures };
}

const isDirectExecution = Boolean(process.argv[1])
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution && process.argv.includes("--self-test")) {
  const result = selfTestPhase35RestoreRehearsal();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}
