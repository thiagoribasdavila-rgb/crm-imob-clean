import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePhase36BackupManifest } from "./preflight-meta-repeatability-sample-02-ephemeral-restore-execution.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-local-restore-evidence-reconciliation-gate.json"));
const shaPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const safeCount = (value) => Number.isSafeInteger(value) && value >= 0;
const exactObject = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const findSensitiveEvidence = (value, path = "$", issues = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/(password|secret|token|authorization|database.?url|connection.?string|api.?key)/i.test(key)) issues.push(`sensitive_key:${path}.${key}`);
      if (/^(rows|records|payload|emails?|phones?|cpfs?|leads?|customers?|profiles?|users?)$/i.test(key)) issues.push(`data_rows_key:${path}.${key}`);
      findSensitiveEvidence(child, `${path}.${key}`, issues);
    }
    return issues;
  }
  if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+|@[a-z0-9.-]+\.[a-z]{2,})/i.test(value)) issues.push(`sensitive_value:${path}`);
  return issues;
};

const validateMetrics = (metrics, prefix, issues) => {
  const expect = (condition, code) => { if (!condition) issues.push(`${prefix}:${code}`); };
  expect(metrics && typeof metrics === "object" && !Array.isArray(metrics), "object_required");
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return;
  expect(Object.keys(metrics).length === gate.requiredMetricFields.length, "field_count_mismatch");
  expect(shaPattern.test(metrics.catalogFingerprint ?? ""), "catalog_fingerprint_invalid");
  for (const field of gate.requiredMetricFields.filter((field) => field !== "catalogFingerprint")) {
    expect(safeCount(metrics[field]), `invalid_count:${field}`);
  }
  expect(metrics.userSchemaCount >= 1, "user_schema_count_empty");
  expect(metrics.tableCount >= 1, "table_count_empty");
  expect(metrics.rlsEnabledTableCount <= metrics.tableCount, "rls_count_impossible");
  expect(metrics.publicTablesWithoutRls === 0, "public_table_without_rls");
  expect(metrics.invalidConstraintCount === 0, "invalid_constraint");
};

export function validatePhase37RestoreEvidence(input, now = Date.now()) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  const evidence = input?.evidence;
  const contract = input?.sourceContract;
  const manifest = input?.backupManifest;
  expect(evidence && typeof evidence === "object" && !Array.isArray(evidence), "phase36_evidence_object_required");
  expect(contract && typeof contract === "object" && !Array.isArray(contract), "phase35_contract_object_required");
  expect(manifest && typeof manifest === "object" && !Array.isArray(manifest), "phase35_manifest_object_required");
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return { approved: false, issues };

  const expectedSource = gate.sourceEvidence;
  expect(evidence.schemaVersion === expectedSource.schemaVersion, "phase36_evidence_schema_mismatch");
  expect(evidence.phase === expectedSource.phase && evidence.sourcePhase === expectedSource.sourcePhase, "phase36_evidence_phase_mismatch");
  expect(evidence.status === expectedSource.status && evidence.environment === expectedSource.environment, "phase36_evidence_status_mismatch");
  expect(uuidPattern.test(evidence.runId ?? ""), "phase36_run_id_invalid");
  const started = Date.parse(evidence.startedAt);
  const finished = Date.parse(evidence.finishedAt);
  expect(Number.isFinite(started) && Number.isFinite(finished), "phase36_timestamp_invalid");
  expect(Number.isFinite(started) && Number.isFinite(finished) && started <= finished && finished <= now, "phase36_timestamp_order_invalid");
  expect(Number.isFinite(finished) && now - finished <= expectedSource.maximumAgeHours * 3600000, "phase36_evidence_stale");

  if (contract && typeof contract === "object" && !Array.isArray(contract)) {
    expect(contract.schemaVersion === gate.requiredSourceChain.contractSchemaVersion, "phase35_contract_schema_mismatch");
    expect(contract.phase === 35 && contract.sourcePhase === 34, "phase35_contract_phase_mismatch");
    expect(contract.status === "contract_prepared_execution_blocked", "phase35_contract_status_mismatch");
    expect(shaPattern.test(contract.sourceReadinessFingerprint ?? ""), "phase35_readiness_fingerprint_invalid");
    expect(contract.backupManifestFingerprint === sha256(input.rawBackupManifest ?? ""), "phase35_contract_manifest_chain_broken");
    expect(contract.backupEvidenceAccepted === true, "phase35_backup_evidence_not_accepted");
    expect(contract.restorePlan?.isolatedTarget === true && contract.restorePlan?.disposableTarget === true, "phase35_restore_target_not_isolated");
    expect(contract.restorePlan?.productionTarget === false && contract.restorePlan?.sourceDatabaseWriteAccess === false, "phase35_restore_plan_unsafe");
    expect(contract.restorePlan?.stopOnError === true && contract.restorePlan?.targetDestructionRequired === true, "phase35_restore_safety_missing");
    expect(contract.restorePlan?.humanApprovalRequiredBeforeExecution === true, "phase35_human_approval_not_required");
    expect(contract.restoreExecuted === false && contract.restoreExecutionAllowed === false, "phase35_restore_state_invalid");
    expect(contract.stagingMigrationAllowed === false && contract.productionMigrationAllowed === false && contract.productionCompatibilityApproved === false, "phase35_migration_gate_open");
    expect(contract.remoteDatabaseTouched === false && contract.metaTouched === false && contract.buildExecuted === false, "phase35_contract_prohibited_touch");
  }
  if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) {
    const manifestValidation = validatePhase36BackupManifest(manifest, now);
    issues.push(...manifestValidation.issues.map((code) => `manifest:${code}`));
    expect(manifest.schemaVersion === gate.requiredSourceChain.manifestSchemaVersion, "phase35_manifest_schema_mismatch");
    expect(manifest.backupType === gate.requiredSourceChain.backupType, "phase35_manifest_type_mismatch");
    expect(manifest.postgresMajor === gate.requiredSourceChain.postgresMajor, "phase35_manifest_postgres_mismatch");
    expect(manifest.postgresImage === gate.requiredSourceChain.postgresImage, "phase35_manifest_image_mismatch");
  }

  expect(evidence.sourceContractFingerprint === sha256(input.rawSourceContract ?? ""), "phase36_contract_fingerprint_mismatch");
  expect(evidence.backupManifestFingerprint === sha256(input.rawBackupManifest ?? ""), "phase36_manifest_fingerprint_mismatch");
  expect(evidence.backupContentFingerprint === manifest?.sha256, "phase36_backup_content_fingerprint_mismatch");
  expect(shaPattern.test(evidence.sourceReadinessFingerprint ?? ""), "phase36_readiness_fingerprint_invalid");
  expect(evidence.sourceReadinessFingerprint === contract?.sourceReadinessFingerprint, "phase36_readiness_chain_mismatch");

  const runtime = evidence.runtime;
  expect(runtime?.engine === "docker_compose", "phase36_runtime_engine_mismatch");
  expect(runtime?.networkMode === "none" && runtime?.publishedPorts === false, "phase36_runtime_not_isolated");
  expect(runtime?.databaseHealthy === true, "phase36_database_not_healthy");
  expect(shaPattern.test(runtime?.imageFingerprint ?? "") && shaPattern.test(runtime?.targetFingerprint ?? ""), "phase36_runtime_fingerprint_invalid");
  expect(Number(String(runtime?.postgresVersion ?? "").split(".")[0]) === gate.requiredSourceChain.postgresMajor, "phase36_runtime_postgres_mismatch");

  for (const field of gate.requiredValidationChecks) expect(evidence.validation?.[field] === true, `phase36_validation_failed:${field}`);
  expect(evidence.restore?.attempted === true && evidence.restore?.completed === true && evidence.restore?.approved === true, "phase36_restore_not_approved");
  expect(Number.isSafeInteger(evidence.restore?.durationMs) && evidence.restore.durationMs > 0, "phase36_restore_duration_invalid");
  expect(evidence.restore?.durationMs <= expectedSource.maximumRestoreDurationMs, "phase36_restore_duration_exceeded");
  expect(evidence.restore?.volumesDestroyed === true && evidence.validation?.targetDestructionVerified === true, "phase36_target_not_destroyed");

  validateMetrics(evidence.metrics?.expected, "expected_metrics", issues);
  validateMetrics(evidence.metrics?.actual, "actual_metrics", issues);
  expect(exactObject(evidence.metrics?.expected, manifest?.validationExpectations), "phase36_expected_metrics_manifest_mismatch");
  expect(exactObject(evidence.metrics?.actual, evidence.metrics?.expected), "phase36_actual_metrics_mismatch");

  const events = evidence.eventSequence;
  expect(Array.isArray(events) && events.length === gate.requiredOrderedEvents.length, "phase36_event_sequence_length_mismatch");
  if (Array.isArray(events)) {
    const names = events.map((item) => item?.event);
    expect(exactObject(names, gate.requiredOrderedEvents), "phase36_event_sequence_mismatch");
    expect(new Set(names).size === names.length, "phase36_event_sequence_duplicate");
    const eventTimes = events.map((item) => Date.parse(item?.at));
    expect(eventTimes.every(Number.isFinite), "phase36_event_timestamp_invalid");
    expect(eventTimes.every((value, index) => index === 0 || value >= eventTimes[index - 1]), "phase36_event_timestamp_order_invalid");
    expect(eventTimes.every((value) => Number.isFinite(started) && Number.isFinite(finished) && value >= started && value <= finished), "phase36_event_outside_run");
    expect(events.every((item) => item && Object.keys(item).sort().join(",") === "at,event"), "phase36_event_shape_invalid");
  }

  expect(evidence.releaseGates?.localRestoreApproved === expectedSource.localRestoreApproved, "phase36_local_restore_gate_mismatch");
  expect(evidence.releaseGates?.stagingMigrationAllowed === false && evidence.releaseGates?.productionMigrationAllowed === false, "phase36_migration_gate_open");
  expect(evidence.releaseGates?.productionCompatibilityApproved === false, "phase36_compatibility_gate_open");
  expect(evidence.localDatabaseTouched === true, "phase36_local_restore_touch_missing");
  expect(evidence.remoteDatabaseTouched === false && evidence.metaTouched === false && evidence.buildExecuted === false, "phase36_prohibited_touch_claimed");
  issues.push(...findSensitiveEvidence(evidence));
  issues.push(...findSensitiveEvidence(contract));
  issues.push(...findSensitiveEvidence(manifest));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function reconcilePhase37RestoreEvidence(input, now = Date.now()) {
  const validation = validatePhase37RestoreEvidence(input, now);
  const evidence = input?.evidence ?? {};
  const approved = validation.approved;
  return {
    schemaVersion: "phase37.local-restore-reconciliation-receipt.v1",
    phase: 37,
    sourcePhase: 36,
    status: approved ? "reconciled_local_restore_only" : "reconciliation_rejected",
    reconciledAt: new Date(now).toISOString(),
    sourceEvidenceFingerprint: approved ? sha256(input.rawEvidence) : null,
    sourceContractFingerprint: approved ? evidence.sourceContractFingerprint : null,
    backupManifestFingerprint: approved ? evidence.backupManifestFingerprint : null,
    backupContentFingerprint: approved ? evidence.backupContentFingerprint : null,
    sourceEvidenceAccepted: approved,
    chainIntegrityApproved: approved,
    metricsReconciled: approved,
    securityReconciled: approved,
    lifecycleReconciled: approved,
    localRestoreHomologated: approved,
    readinessControlCandidates: {
      immutable_backup_verified: approved,
      restore_drill_verified: approved,
      data_integrity_verified: approved,
      security_equivalence: approved
    },
    issues: validation.issues,
    releaseGates: {
      stagingMigrationAllowed: false,
      productionMigrationAllowed: false,
      productionCompatibilityApproved: false,
      metaDeliveryAllowed: false,
      buildAllowed: false
    },
    databaseTouched: false,
    dockerTouched: false,
    remoteDatabaseTouched: false,
    metaTouched: false,
    buildExecuted: false
  };
}

const manifestFixture = () => ({
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

const createFixture = () => {
  const backupManifest = manifestFixture();
  const rawBackupManifest = JSON.stringify(backupManifest);
  const sourceContract = {
    schemaVersion: "phase35.restore-rehearsal-contract.v1", phase: 35, sourcePhase: 34,
    status: "contract_prepared_execution_blocked", sourceReadinessFingerprint: "a".repeat(64),
    backupManifestFingerprint: sha256(rawBackupManifest), backupEvidenceAccepted: true,
    restorePlan: { isolatedTarget: true, disposableTarget: true, productionTarget: false, sourceDatabaseWriteAccess: false,
      stopOnError: true, targetDestructionRequired: true, humanApprovalRequiredBeforeExecution: true },
    restoreExecuted: false, restoreExecutionAllowed: false, stagingMigrationAllowed: false,
    productionMigrationAllowed: false, productionCompatibilityApproved: false,
    remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawSourceContract = JSON.stringify(sourceContract);
  const metrics = structuredClone(backupManifest.validationExpectations);
  const evidence = {
    schemaVersion: "phase36.local-restore-evidence.v1", phase: 36, sourcePhase: 35,
    status: "approved_local_restore_only", runId: "123e4567-e89b-42d3-a456-426614174000",
    startedAt: "2026-07-19T14:00:00.000Z", finishedAt: "2026-07-19T14:05:00.000Z",
    sourceContractFingerprint: sha256(rawSourceContract), sourceReadinessFingerprint: "a".repeat(64),
    backupManifestFingerprint: sha256(rawBackupManifest), backupContentFingerprint: backupManifest.sha256,
    environment: "local_ephemeral_restore",
    runtime: { engine: "docker_compose", networkMode: "none", publishedPorts: false, databaseHealthy: true,
      imageFingerprint: "e".repeat(64), postgresVersion: "17.6", targetFingerprint: "f".repeat(64) },
    validation: Object.fromEntries(gate.requiredValidationChecks.map((field) => [field, true])),
    metrics: { expected: metrics, actual: structuredClone(metrics) },
    eventSequence: gate.requiredOrderedEvents.map((event, index) => ({ event, at: `2026-07-19T14:0${index}:00.000Z` })),
    restore: { attempted: true, completed: true, approved: true, durationMs: 120000, volumesDestroyed: true },
    releaseGates: { localRestoreApproved: true, stagingMigrationAllowed: false, productionMigrationAllowed: false, productionCompatibilityApproved: false },
    localDatabaseTouched: true, remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawEvidence = JSON.stringify(evidence);
  return { evidence, sourceContract, backupManifest, rawEvidence, rawSourceContract, rawBackupManifest };
};

export function selfTestPhase37RestoreReconciliation() {
  const now = Date.parse("2026-07-19T14:10:00.000Z");
  const cases = [
    ["baseline", (v) => v, true],
    ["schema", (v) => { v.evidence.schemaVersion = "old"; return v; }, false],
    ["phase", (v) => { v.evidence.phase = 35; return v; }, false],
    ["status", (v) => { v.evidence.status = "failed"; return v; }, false],
    ["run-id", (v) => { v.evidence.runId = "bad"; return v; }, false],
    ["future", (v) => { v.evidence.finishedAt = "2026-07-20T14:00:00.000Z"; return v; }, false],
    ["stale", (v) => { v.evidence.startedAt = "2026-07-18T12:00:00.000Z"; v.evidence.finishedAt = "2026-07-18T13:00:00.000Z"; return v; }, false],
    ["contract-chain", (v) => { v.evidence.sourceContractFingerprint = "0".repeat(64); return v; }, false],
    ["manifest-chain", (v) => { v.evidence.backupManifestFingerprint = "0".repeat(64); return v; }, false],
    ["content-chain", (v) => { v.evidence.backupContentFingerprint = "0".repeat(64); return v; }, false],
    ["contract-status", (v) => { v.sourceContract.status = "approved"; v.rawSourceContract = JSON.stringify(v.sourceContract); v.evidence.sourceContractFingerprint = sha256(v.rawSourceContract); return v; }, false],
    ["readiness-chain", (v) => { v.evidence.sourceReadinessFingerprint = "9".repeat(64); return v; }, false],
    ["contract-isolation", (v) => { v.sourceContract.restorePlan.isolatedTarget = false; v.rawSourceContract = JSON.stringify(v.sourceContract); v.evidence.sourceContractFingerprint = sha256(v.rawSourceContract); return v; }, false],
    ["contract-migration", (v) => { v.sourceContract.stagingMigrationAllowed = true; v.rawSourceContract = JSON.stringify(v.sourceContract); v.evidence.sourceContractFingerprint = sha256(v.rawSourceContract); return v; }, false],
    ["manifest-type", (v) => { v.backupManifest.backupType = "physical_download"; v.rawBackupManifest = JSON.stringify(v.backupManifest); return v; }, false],
    ["runtime-network", (v) => { v.evidence.runtime.networkMode = "bridge"; return v; }, false],
    ["runtime-port", (v) => { v.evidence.runtime.publishedPorts = true; return v; }, false],
    ["runtime-health", (v) => { v.evidence.runtime.databaseHealthy = false; return v; }, false],
    ["runtime-version", (v) => { v.evidence.runtime.postgresVersion = "15.8"; return v; }, false],
    ["validation", (v) => { v.evidence.validation.securityApproved = false; return v; }, false],
    ["attempt", (v) => { v.evidence.restore.attempted = false; return v; }, false],
    ["complete", (v) => { v.evidence.restore.completed = false; return v; }, false],
    ["duration", (v) => { v.evidence.restore.durationMs = 2000000; return v; }, false],
    ["destroy", (v) => { v.evidence.restore.volumesDestroyed = false; return v; }, false],
    ["expected-metric", (v) => { v.evidence.metrics.expected.tableCount = 13; return v; }, false],
    ["actual-metric", (v) => { v.evidence.metrics.actual.authUserCount = 7; return v; }, false],
    ["rls", (v) => { v.evidence.metrics.actual.publicTablesWithoutRls = 1; return v; }, false],
    ["constraints", (v) => { v.evidence.metrics.actual.invalidConstraintCount = 1; return v; }, false],
    ["event-order", (v) => { [v.evidence.eventSequence[1], v.evidence.eventSequence[2]] = [v.evidence.eventSequence[2], v.evidence.eventSequence[1]]; return v; }, false],
    ["event-duplicate", (v) => { v.evidence.eventSequence[2].event = v.evidence.eventSequence[1].event; return v; }, false],
    ["event-extra", (v) => { v.evidence.eventSequence.push({ event: "extra", at: v.evidence.finishedAt }); return v; }, false],
    ["staging", (v) => { v.evidence.releaseGates.stagingMigrationAllowed = true; return v; }, false],
    ["production", (v) => { v.evidence.releaseGates.productionMigrationAllowed = true; return v; }, false],
    ["remote", (v) => { v.evidence.remoteDatabaseTouched = true; return v; }, false],
    ["meta", (v) => { v.evidence.metaTouched = true; return v; }, false],
    ["build", (v) => { v.evidence.buildExecuted = true; return v; }, false],
    ["secret", (v) => { v.evidence.apiToken = "hidden"; return v; }, false],
    ["data-rows", (v) => { v.evidence.rows = [{ id: 1 }]; return v; }, false]
  ];
  const results = cases.map(([name, mutate, expected]) => {
    const value = mutate(createFixture());
    value.rawEvidence = JSON.stringify(value.evidence);
    const approved = validatePhase37RestoreEvidence(value, now).approved;
    return { name, expected, approved, passed: approved === expected };
  });
  const approvedReceipt = reconcilePhase37RestoreEvidence(createFixture(), now);
  results.push({ name: "receipt-local-only", expected: true, approved: approvedReceipt.localRestoreHomologated === true
    && approvedReceipt.releaseGates.stagingMigrationAllowed === false && approvedReceipt.databaseTouched === false, passed: approvedReceipt.localRestoreHomologated === true
    && approvedReceipt.releaseGates.stagingMigrationAllowed === false && approvedReceipt.databaseTouched === false });
  return results;
}

const isDirectExecution = Boolean(process.argv[1])
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution && process.argv.includes("--self-test")) {
  const results = selfTestPhase37RestoreReconciliation();
  const failures = results.filter((item) => !item.passed);
  console.log(JSON.stringify({ passed: failures.length === 0, caseCount: results.length, failures }, null, 2));
  if (failures.length) process.exit(1);
}
