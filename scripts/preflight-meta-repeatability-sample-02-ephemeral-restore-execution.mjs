import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePhase35BackupManifest, validatePhase35ReadinessReceipt } from "./preflight-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-ephemeral-restore-execution-gate.json"));
const shaPattern = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const PHASE36_APPROVAL = gate.approval.exactValue;

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

const exactRuntime = () => structuredClone(gate.runtime);
const isSafeCount = (value) => Number.isSafeInteger(value) && value >= 0;

export function validatePhase36SourceContract(contract, rawReadiness, rawBackupManifest) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(contract && typeof contract === "object" && !Array.isArray(contract), "phase35_contract_object_required");
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return { approved: false, issues };

  const source = gate.sourceContract;
  expect(contract.schemaVersion === source.schemaVersion, "phase35_contract_schema_mismatch");
  expect(contract.phase === source.phase && contract.sourcePhase === source.sourcePhase, "phase35_contract_phase_mismatch");
  expect(contract.status === source.status, "phase35_contract_status_mismatch");
  expect(Number.isFinite(Date.parse(contract.preparedAt)), "phase35_contract_timestamp_invalid");
  expect(contract.sourceReadinessFingerprint === sha256(rawReadiness), "phase35_readiness_chain_broken");
  expect(contract.backupManifestFingerprint === sha256(rawBackupManifest), "phase35_backup_chain_broken");
  expect(contract.backupEvidenceAccepted === source.backupEvidenceAccepted, "phase35_backup_evidence_not_accepted");
  expect(contract.restorePlan?.isolatedTarget === true && contract.restorePlan?.disposableTarget === true, "phase35_restore_target_not_isolated");
  expect(contract.restorePlan?.productionTarget === false && contract.restorePlan?.sourceDatabaseWriteAccess === false, "phase35_restore_plan_unsafe");
  expect(contract.restorePlan?.stopOnError === true && contract.restorePlan?.targetDestructionRequired === true, "phase35_restore_safety_missing");
  expect(contract.restorePlan?.humanApprovalRequiredBeforeExecution === true, "phase35_human_approval_not_required");
  expect(contract.restoreExecuted === source.restoreExecuted, "phase35_restore_already_executed");
  expect(contract.restoreExecutionAllowed === source.restoreExecutionAllowed, "phase35_execution_claim_invalid");
  expect(contract.stagingMigrationAllowed === source.stagingMigrationAllowed, "phase35_staging_claim_invalid");
  expect(contract.productionMigrationAllowed === source.productionMigrationAllowed, "phase35_production_claim_invalid");
  expect(contract.productionCompatibilityApproved === source.productionCompatibilityApproved, "phase35_compatibility_claim_invalid");
  expect(contract.remoteDatabaseTouched === false && contract.metaTouched === false && contract.buildExecuted === false, "phase35_prohibited_touch_claimed");
  issues.push(...findSensitiveEvidence(contract));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function validatePhase36BackupManifest(manifest, now = Date.now()) {
  const base = validatePhase35BackupManifest(manifest, now);
  const issues = [...base.issues];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return { approved: false, issues: [...new Set(issues)] };
  const expected = manifest.validationExpectations;
  expect(manifest.backupType === gate.backup.supportedType, "phase36_logical_backup_required");
  expect(manifest.sizeBytes <= gate.backup.maximumSizeBytes, "phase36_backup_too_large");
  expect(expected && typeof expected === "object" && !Array.isArray(expected), "phase36_validation_expectations_required");
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    expect(shaPattern.test(expected.catalogFingerprint ?? ""), "phase36_catalog_fingerprint_invalid");
    for (const field of gate.requiredValidationExpectations.filter((item) => item !== "catalogFingerprint")) {
      expect(isSafeCount(expected[field]), `phase36_expectation_invalid:${field}`);
    }
    expect(expected.userSchemaCount >= 1, "phase36_user_schema_count_empty");
    expect(expected.tableCount >= 1, "phase36_table_count_empty");
    expect(expected.rlsEnabledTableCount <= expected.tableCount, "phase36_rls_count_impossible");
    expect(expected.publicTablesWithoutRls === 0, "phase36_source_security_baseline_failed");
    expect(expected.invalidConstraintCount === 0, "phase36_source_constraints_invalid");
  }
  issues.push(...findSensitiveEvidence(expected));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function validatePhase36ExecutionRequest(input, now = Date.now()) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  const readiness = validatePhase35ReadinessReceipt(input.readinessReceipt);
  const backup = validatePhase36BackupManifest(input.backupManifest, now);
  const contract = validatePhase36SourceContract(input.sourceContract, input.rawReadiness, input.rawBackupManifest);
  issues.push(...readiness.issues.map((code) => `readiness:${code}`));
  issues.push(...backup.issues.map((code) => `backup:${code}`));
  issues.push(...contract.issues.map((code) => `contract:${code}`));
  expect(input.approval === PHASE36_APPROVAL, "phase36_human_approval_missing");
  expect(JSON.stringify(input.runtime) === JSON.stringify(exactRuntime()), "phase36_runtime_contract_mismatch");
  expect(input.runtime?.networkMode === "none" && input.runtime?.publishedPorts === false, "phase36_runtime_network_not_isolated");
  expect(input.runtime?.linkedProject === false && input.runtime?.remoteTarget === false && input.runtime?.productionTarget === false, "phase36_remote_target_prohibited");
  expect(input.backupDescriptor?.regularFile === true, "phase36_backup_regular_file_required");
  expect(input.backupDescriptor?.symbolicLink === false, "phase36_backup_symlink_rejected");
  expect(input.backupDescriptor?.withinWorkspace === true, "phase36_backup_outside_workspace");
  expect(input.backupDescriptor?.sha256 === input.backupManifest?.sha256, "phase36_backup_content_hash_mismatch");
  expect(input.backupDescriptor?.sizeBytes === input.backupManifest?.sizeBytes, "phase36_backup_size_mismatch");
  expect(input.backupDescriptor?.sizeBytes <= gate.backup.maximumSizeBytes, "phase36_backup_size_limit_exceeded");
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function scanPhase36LogicalBackupText(text) {
  const patterns = [
    [/(^|\n)\s*\\!/i, "psql_shell_escape"],
    [/(^|\n)\s*\\setenv\b/i, "psql_setenv"],
    [/\bcopy\b[\s\S]{0,240}\bprogram\b/i, "copy_from_program"],
    [/\bcreate\s+(foreign\s+)?server\b/i, "foreign_server"],
    [/\bcreate\s+user\s+mapping\b/i, "user_mapping"],
    [/\bdblink_connect\s*\(/i, "dblink_connect"],
    [/\b(net\.http_|http_(get|post|put|delete)\s*\()/i, "network_http_call"],
    [/\bcron\.schedule\s*\(/i, "cron_schedule"]
  ];
  return patterns.filter(([pattern]) => pattern.test(text)).map(([, code]) => code);
}

const readinessFixture = () => ({
  schemaVersion: "phase34.migration-readiness.v1", phase: 34, sourcePhase: 33,
  status: "assessment_complete_blocked", assessedAt: "2026-07-19T14:00:00.000Z",
  sourceReceiptFingerprint: "a".repeat(64), sourceReceiptAccepted: true,
  controls: {
    source_chain_integrity: true, cross_major_artifact_equivalence: true, security_equivalence: true,
    rollback_equivalence: true, extension_compatibility: true, immutable_backup_verified: false,
    restore_drill_verified: false, isolated_staging_replay_verified: false, data_integrity_verified: false,
    performance_baseline_verified: false, observability_ready: false, security_advisor_verified: false,
    performance_advisor_verified: false, production_rollback_runbook_verified: false, human_change_approval_verified: false
  },
  evidenceCoverage: { verifiedControls: 5, requiredControls: 15, percent: 33 },
  stagingMigrationAllowed: false, productionMigrationAllowed: false, productionCompatibilityApproved: false,
  remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
});

const backupFixture = () => ({
  schemaVersion: "phase35.backup-manifest.v1", status: "verified", backupId: "atlas-backup-sample-02",
  sourceIdentityHash: "b".repeat(64), createdAt: "2026-07-19T13:00:00.000Z", backupType: "logical",
  postgresMajor: 17, postgresImage: "supabase/postgres:17.6.1.149", sha256: "c".repeat(64),
  sizeBytes: 1024, rpoMinutes: 60, immutable: true, encryptedAtRest: true, offsiteCopyVerified: true,
  storageObjectsInventoryIncluded: true, customRolesDocumented: true, authStorageChangesDocumented: true,
  realtimePublicationsDocumented: true, replicationSubscriptionsDocumented: true, containsCredentials: false,
  validationExpectations: {
    catalogFingerprint: "d".repeat(64), userSchemaCount: 4, tableCount: 12, rlsEnabledTableCount: 12,
    publicTablesWithoutRls: 0, invalidConstraintCount: 0, authUserCount: 6, storageBucketCount: 2,
    storageObjectMetadataCount: 20, migrationCount: 30
  }
});

const contractFixture = (rawReadiness, rawBackupManifest) => ({
  schemaVersion: "phase35.restore-rehearsal-contract.v1", phase: 35, sourcePhase: 34,
  status: "contract_prepared_execution_blocked", preparedAt: "2026-07-19T14:05:00.000Z",
  sourceReadinessFingerprint: sha256(rawReadiness), backupManifestFingerprint: sha256(rawBackupManifest),
  backupEvidenceAccepted: true,
  restorePlan: {
    isolatedTarget: true, disposableTarget: true, productionTarget: false, sourceDatabaseWriteAccess: false,
    singleTransactionWhereSupported: true, stopOnError: true, postRestoreIntegrityChecks: true,
    postRestoreSecurityChecks: true, postRestorePerformanceBaseline: true, targetDestructionRequired: true,
    humanApprovalRequiredBeforeExecution: true
  },
  restoreExecuted: false, restoreExecutionAllowed: false, stagingMigrationAllowed: false,
  productionMigrationAllowed: false, productionCompatibilityApproved: false,
  remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
});

export function selfTestPhase36RestoreExecution() {
  const now = Date.parse("2026-07-19T14:10:00.000Z");
  const createBase = () => {
    const readinessReceipt = readinessFixture();
    const backupManifest = backupFixture();
    const rawReadiness = JSON.stringify(readinessReceipt);
    const rawBackupManifest = JSON.stringify(backupManifest);
    return {
      readinessReceipt, backupManifest, rawReadiness, rawBackupManifest,
      sourceContract: contractFixture(rawReadiness, rawBackupManifest), approval: PHASE36_APPROVAL,
      runtime: exactRuntime(),
      backupDescriptor: { regularFile: true, symbolicLink: false, withinWorkspace: true, sha256: backupManifest.sha256, sizeBytes: backupManifest.sizeBytes }
    };
  };
  const cases = [
    ["baseline", (v) => v, true],
    ["approval", (v) => { v.approval = ""; return v; }, false],
    ["contract-schema", (v) => { v.sourceContract.schemaVersion = "old"; return v; }, false],
    ["contract-phase", (v) => { v.sourceContract.phase = 34; return v; }, false],
    ["contract-status", (v) => { v.sourceContract.status = "approved"; return v; }, false],
    ["contract-readiness-chain", (v) => { v.sourceContract.sourceReadinessFingerprint = "e".repeat(64); return v; }, false],
    ["contract-backup-chain", (v) => { v.sourceContract.backupManifestFingerprint = "e".repeat(64); return v; }, false],
    ["contract-backup-acceptance", (v) => { v.sourceContract.backupEvidenceAccepted = false; return v; }, false],
    ["contract-isolation", (v) => { v.sourceContract.restorePlan.isolatedTarget = false; return v; }, false],
    ["contract-production", (v) => { v.sourceContract.restorePlan.productionTarget = true; return v; }, false],
    ["contract-stop", (v) => { v.sourceContract.restorePlan.stopOnError = false; return v; }, false],
    ["contract-destruction", (v) => { v.sourceContract.restorePlan.targetDestructionRequired = false; return v; }, false],
    ["contract-executed", (v) => { v.sourceContract.restoreExecuted = true; return v; }, false],
    ["contract-remote", (v) => { v.sourceContract.remoteDatabaseTouched = true; return v; }, false],
    ["backup-type", (v) => { v.backupManifest.backupType = "physical_download"; return v; }, false],
    ["backup-large", (v) => { v.backupManifest.sizeBytes = gate.backup.maximumSizeBytes + 1; v.backupDescriptor.sizeBytes = v.backupManifest.sizeBytes; return v; }, false],
    ["backup-expectations", (v) => { delete v.backupManifest.validationExpectations; return v; }, false],
    ["catalog-hash", (v) => { v.backupManifest.validationExpectations.catalogFingerprint = "bad"; return v; }, false],
    ["schema-count", (v) => { v.backupManifest.validationExpectations.userSchemaCount = 0; return v; }, false],
    ["table-count", (v) => { v.backupManifest.validationExpectations.tableCount = 0; return v; }, false],
    ["rls-count", (v) => { v.backupManifest.validationExpectations.rlsEnabledTableCount = 13; return v; }, false],
    ["rls-source", (v) => { v.backupManifest.validationExpectations.publicTablesWithoutRls = 1; return v; }, false],
    ["constraint-source", (v) => { v.backupManifest.validationExpectations.invalidConstraintCount = 1; return v; }, false],
    ["runtime-network", (v) => { v.runtime.networkMode = "bridge"; return v; }, false],
    ["runtime-port", (v) => { v.runtime.publishedPorts = true; return v; }, false],
    ["runtime-linked", (v) => { v.runtime.linkedProject = true; return v; }, false],
    ["runtime-remote", (v) => { v.runtime.remoteTarget = true; return v; }, false],
    ["runtime-production", (v) => { v.runtime.productionTarget = true; return v; }, false],
    ["backup-regular", (v) => { v.backupDescriptor.regularFile = false; return v; }, false],
    ["backup-symlink", (v) => { v.backupDescriptor.symbolicLink = true; return v; }, false],
    ["backup-path", (v) => { v.backupDescriptor.withinWorkspace = false; return v; }, false],
    ["backup-content", (v) => { v.backupDescriptor.sha256 = "f".repeat(64); return v; }, false],
    ["backup-size", (v) => { v.backupDescriptor.sizeBytes = 1023; return v; }, false],
    ["contract-sensitive", (v) => { v.sourceContract.apiToken = "hidden"; return v; }, false]
  ];
  const results = cases.map(([name, mutate, expected]) => {
    const value = mutate(createBase());
    const approved = validatePhase36ExecutionRequest(value, now).approved;
    return { name, expected, approved, passed: approved === expected };
  });
  const textCases = [
    ["safe-sql", "create table public.example(id bigint);", true],
    ["shell", "\\! curl example.invalid", false],
    ["setenv", "\\setenv TOKEN hidden", false],
    ["copy-program", "COPY public.x FROM PROGRAM 'id';", false],
    ["foreign-server", "CREATE FOREIGN SERVER remote FOREIGN DATA WRAPPER postgres_fdw;", false],
    ["user-mapping", "CREATE USER MAPPING FOR postgres SERVER remote;", false],
    ["dblink", "select dblink_connect('remote');", false],
    ["network", "select net.http_post(url := 'x');", false],
    ["cron", "select cron.schedule('* * * * *', 'select 1');", false]
  ].map(([name, text, expected]) => {
    const approved = scanPhase36LogicalBackupText(text).length === 0;
    return { name, expected, approved, passed: approved === expected };
  });
  return [...results, ...textCases];
}

const isDirectExecution = Boolean(process.argv[1])
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution && process.argv.includes("--self-test")) {
  const results = selfTestPhase36RestoreExecution();
  const failures = results.filter((item) => !item.passed);
  console.log(JSON.stringify({ passed: failures.length === 0, caseCount: results.length, failures }, null, 2));
  if (failures.length) process.exit(1);
}
