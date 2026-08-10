import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-readiness-evidence-projection-gate.json"));
const shaPattern = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const expectedControlKeys = [...gate.requiredControlOrder].sort();

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

const validateReleaseGatesClosed = (releaseGates, prefix, issues) => {
  const expect = (condition, code) => { if (!condition) issues.push(`${prefix}:${code}`); };
  expect(releaseGates && typeof releaseGates === "object" && !Array.isArray(releaseGates), "release_gates_object_required");
  if (!releaseGates || typeof releaseGates !== "object" || Array.isArray(releaseGates)) return;
  for (const [field, value] of Object.entries(gate.requiredBlockedState)) expect(releaseGates[field] === value, `release_gate_open:${field}`);
};

const validatePhase34Readiness = (readiness, issues) => {
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  const required = gate.requiredSources.readiness;
  expect(readiness && typeof readiness === "object" && !Array.isArray(readiness), "phase34_readiness_object_required");
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness)) return;
  expect(readiness.schemaVersion === required.schemaVersion, "phase34_readiness_schema_mismatch");
  expect(readiness.phase === required.phase && readiness.sourcePhase === required.sourcePhase, "phase34_readiness_phase_mismatch");
  expect(readiness.status === required.status, "phase34_readiness_status_mismatch");
  expect(readiness.sourceReceiptAccepted === required.sourceReceiptAccepted, "phase34_source_receipt_not_accepted");
  expect(Number.isFinite(Date.parse(readiness.assessedAt)), "phase34_assessed_at_invalid");
  expect(shaPattern.test(readiness.sourceReceiptFingerprint ?? ""), "phase34_source_receipt_fingerprint_invalid");
  const keys = Object.keys(readiness.controls ?? {}).sort();
  expect(exact(keys, expectedControlKeys), "phase34_control_set_mismatch");
  for (const name of gate.inheritedVerifiedControls) expect(readiness.controls?.[name] === true, `phase34_inherited_control_not_verified:${name}`);
  for (const name of gate.requiredControlOrder.filter((name) => !gate.inheritedVerifiedControls.includes(name))) {
    expect(readiness.controls?.[name] === false, `phase34_unverified_control_claimed:${name}`);
  }
  expect(readiness.evidenceCoverage?.verifiedControls === 5, "phase34_verified_control_count_mismatch");
  expect(readiness.evidenceCoverage?.requiredControls === gate.projectedCoverage.requiredControls, "phase34_required_control_count_mismatch");
  expect(readiness.evidenceCoverage?.percent === 33, "phase34_evidence_coverage_mismatch");
  expect(readiness.stagingMigrationAllowed === false && readiness.productionMigrationAllowed === false, "phase34_migration_gate_open");
  expect(readiness.productionCompatibilityApproved === false, "phase34_production_compatibility_claimed");
  expect(readiness.remoteDatabaseTouched === false && readiness.metaTouched === false && readiness.buildExecuted === false, "phase34_prohibited_touch_claimed");
};

const validatePhase35Contract = (contract, rawReadiness, issues) => {
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  const required = gate.requiredSources.restoreContract;
  expect(contract && typeof contract === "object" && !Array.isArray(contract), "phase35_contract_object_required");
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return;
  expect(contract.schemaVersion === required.schemaVersion, "phase35_contract_schema_mismatch");
  expect(contract.phase === required.phase && contract.sourcePhase === required.sourcePhase, "phase35_contract_phase_mismatch");
  expect(contract.status === required.status, "phase35_contract_status_mismatch");
  expect(contract.sourceReadinessFingerprint === sha256(rawReadiness ?? ""), "phase35_readiness_fingerprint_mismatch");
  expect(shaPattern.test(contract.backupManifestFingerprint ?? ""), "phase35_manifest_fingerprint_invalid");
  expect(contract.backupEvidenceAccepted === true, "phase35_backup_evidence_not_accepted");
  expect(contract.restorePlan?.isolatedTarget === true && contract.restorePlan?.disposableTarget === true, "phase35_restore_target_not_isolated");
  expect(contract.restorePlan?.productionTarget === false && contract.restorePlan?.sourceDatabaseWriteAccess === false, "phase35_restore_plan_unsafe");
  expect(contract.restorePlan?.stopOnError === true && contract.restorePlan?.targetDestructionRequired === true, "phase35_restore_safety_missing");
  expect(contract.restorePlan?.humanApprovalRequiredBeforeExecution === true, "phase35_human_approval_not_required");
  expect(contract.restoreExecuted === false && contract.restoreExecutionAllowed === false, "phase35_restore_state_invalid");
  expect(contract.stagingMigrationAllowed === false && contract.productionMigrationAllowed === false, "phase35_migration_gate_open");
  expect(contract.productionCompatibilityApproved === false, "phase35_production_compatibility_claimed");
  expect(contract.remoteDatabaseTouched === false && contract.metaTouched === false && contract.buildExecuted === false, "phase35_prohibited_touch_claimed");
};

const validatePhase37Reconciliation = (receipt, rawContract, issues) => {
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  const required = gate.requiredSources.reconciliation;
  expect(receipt && typeof receipt === "object" && !Array.isArray(receipt), "phase37_reconciliation_object_required");
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return;
  expect(receipt.schemaVersion === required.schemaVersion, "phase37_reconciliation_schema_mismatch");
  expect(receipt.phase === required.phase && receipt.sourcePhase === required.sourcePhase, "phase37_reconciliation_phase_mismatch");
  expect(receipt.status === required.status, "phase37_reconciliation_status_mismatch");
  expect(Number.isFinite(Date.parse(receipt.reconciledAt)), "phase37_reconciled_at_invalid");
  expect(receipt.sourceEvidenceAccepted === required.sourceEvidenceAccepted, "phase37_source_evidence_not_accepted");
  expect(receipt.localRestoreHomologated === required.localRestoreHomologated, "phase37_local_restore_not_homologated");
  expect(receipt.chainIntegrityApproved === true && receipt.metricsReconciled === true, "phase37_chain_or_metrics_not_reconciled");
  expect(receipt.securityReconciled === true && receipt.lifecycleReconciled === true, "phase37_security_or_lifecycle_not_reconciled");
  expect(shaPattern.test(receipt.sourceEvidenceFingerprint ?? ""), "phase37_source_evidence_fingerprint_invalid");
  expect(receipt.sourceContractFingerprint === sha256(rawContract ?? ""), "phase37_contract_fingerprint_mismatch");
  expect(shaPattern.test(receipt.backupManifestFingerprint ?? "") && shaPattern.test(receipt.backupContentFingerprint ?? ""), "phase37_backup_fingerprint_invalid");
  const expectedCandidates = [...gate.allowedPromotions, ...gate.confirmationOnlyControls].sort();
  expect(exact(Object.keys(receipt.readinessControlCandidates ?? {}).sort(), expectedCandidates), "phase37_candidate_set_mismatch");
  for (const name of expectedCandidates) expect(receipt.readinessControlCandidates?.[name] === true, `phase37_candidate_not_verified:${name}`);
  validateReleaseGatesClosed(receipt.releaseGates, "phase37", issues);
  expect(receipt.databaseTouched === false && receipt.dockerTouched === false && receipt.remoteDatabaseTouched === false, "phase37_operational_touch_claimed");
  expect(receipt.metaTouched === false && receipt.buildExecuted === false, "phase37_meta_or_build_claimed");
};

export function validatePhase38ReadinessProjectionSources(input) {
  const issues = [];
  validatePhase34Readiness(input?.readiness, issues);
  validatePhase35Contract(input?.sourceContract, input?.rawReadiness, issues);
  validatePhase37Reconciliation(input?.reconciliation, input?.rawSourceContract, issues);
  issues.push(...findSensitiveEvidence(input?.readiness));
  issues.push(...findSensitiveEvidence(input?.sourceContract));
  issues.push(...findSensitiveEvidence(input?.reconciliation));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function projectPhase38Readiness(input, now = Date.now()) {
  const validation = validatePhase38ReadinessProjectionSources(input);
  const approved = validation.approved;
  const baselineControls = input?.readiness?.controls ?? {};
  const controls = Object.fromEntries(gate.requiredControlOrder.map((name) => [name, approved ? baselineControls[name] === true : false]));
  if (approved) {
    for (const name of gate.allowedPromotions) controls[name] = input.reconciliation.readinessControlCandidates[name] === true;
  }
  const verifiedControls = approved ? Object.values(controls).filter(Boolean).length : 0;
  const requiredControls = gate.requiredControlOrder.length;
  const remainingBlockedControls = gate.requiredControlOrder.filter((name) => controls[name] !== true);
  return {
    schemaVersion: "phase38.readiness-projection-receipt.v1",
    phase: 38,
    sourcePhase: 37,
    baselinePhase: 34,
    status: approved ? "projected_readiness_blocked" : "projection_rejected",
    projectedAt: new Date(now).toISOString(),
    sourceReadinessFingerprint: approved ? sha256(input.rawReadiness) : null,
    sourceContractFingerprint: approved ? sha256(input.rawSourceContract) : null,
    sourceReconciliationFingerprint: approved ? sha256(input.rawReconciliation) : null,
    sourceReadinessAccepted: approved,
    sourceContractAccepted: approved,
    sourceReconciliationAccepted: approved,
    chainIntegrityApproved: approved,
    projectionApproved: approved,
    promotedControls: approved ? [...gate.allowedPromotions] : [],
    confirmationOnlyControls: approved ? [...gate.confirmationOnlyControls] : [],
    controls,
    evidenceCoverage: {
      verifiedControls,
      requiredControls,
      percent: Math.floor((verifiedControls / requiredControls) * 100)
    },
    remainingBlockedControls,
    issues: validation.issues,
    releaseGates: { ...gate.requiredBlockedState },
    databaseTouched: false,
    dockerTouched: false,
    remoteDatabaseTouched: false,
    metaTouched: false,
    buildExecuted: false
  };
}

const createFixture = () => {
  const controls = Object.fromEntries(gate.requiredControlOrder.map((name) => [name, gate.inheritedVerifiedControls.includes(name)]));
  const readiness = {
    schemaVersion: "phase34.migration-readiness.v1", phase: 34, sourcePhase: 33,
    status: "assessment_complete_blocked", assessedAt: "2026-07-19T13:00:00.000Z",
    sourceReceiptFingerprint: "1".repeat(64), sourceReceiptAccepted: true, controls,
    evidenceCoverage: { verifiedControls: 5, requiredControls: 15, percent: 33 },
    stagingMigrationAllowed: false, productionMigrationAllowed: false, productionCompatibilityApproved: false,
    remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawReadiness = JSON.stringify(readiness);
  const sourceContract = {
    schemaVersion: "phase35.restore-rehearsal-contract.v1", phase: 35, sourcePhase: 34,
    status: "contract_prepared_execution_blocked", sourceReadinessFingerprint: sha256(rawReadiness),
    backupManifestFingerprint: "2".repeat(64), backupEvidenceAccepted: true,
    restorePlan: { isolatedTarget: true, disposableTarget: true, productionTarget: false, sourceDatabaseWriteAccess: false,
      stopOnError: true, targetDestructionRequired: true, humanApprovalRequiredBeforeExecution: true },
    restoreExecuted: false, restoreExecutionAllowed: false, stagingMigrationAllowed: false,
    productionMigrationAllowed: false, productionCompatibilityApproved: false,
    remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawSourceContract = JSON.stringify(sourceContract);
  const reconciliation = {
    schemaVersion: "phase37.local-restore-reconciliation-receipt.v1", phase: 37, sourcePhase: 36,
    status: "reconciled_local_restore_only", reconciledAt: "2026-07-19T14:10:00.000Z",
    sourceEvidenceFingerprint: "3".repeat(64), sourceContractFingerprint: sha256(rawSourceContract),
    backupManifestFingerprint: "2".repeat(64), backupContentFingerprint: "4".repeat(64),
    sourceEvidenceAccepted: true, chainIntegrityApproved: true, metricsReconciled: true,
    securityReconciled: true, lifecycleReconciled: true, localRestoreHomologated: true,
    readinessControlCandidates: Object.fromEntries([...gate.allowedPromotions, ...gate.confirmationOnlyControls].map((name) => [name, true])),
    releaseGates: { ...gate.requiredBlockedState }, databaseTouched: false, dockerTouched: false,
    remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawReconciliation = JSON.stringify(reconciliation);
  return { readiness, sourceContract, reconciliation, rawReadiness, rawSourceContract, rawReconciliation };
};

export function selfTestPhase38ReadinessProjection() {
  const cases = [
    ["baseline", (v) => v, true],
    ["readiness-schema", (v) => { v.readiness.schemaVersion = "old"; return v; }, false],
    ["readiness-phase", (v) => { v.readiness.phase = 33; return v; }, false],
    ["readiness-status", (v) => { v.readiness.status = "approved"; return v; }, false],
    ["readiness-source", (v) => { v.readiness.sourceReceiptAccepted = false; return v; }, false],
    ["readiness-control-set", (v) => { v.readiness.controls.extra = false; return v; }, false],
    ["readiness-inherited", (v) => { v.readiness.controls.source_chain_integrity = false; return v; }, false],
    ["readiness-false-claimed", (v) => { v.readiness.controls.observability_ready = true; return v; }, false],
    ["readiness-count", (v) => { v.readiness.evidenceCoverage.verifiedControls = 6; return v; }, false],
    ["readiness-coverage", (v) => { v.readiness.evidenceCoverage.percent = 40; return v; }, false],
    ["readiness-staging", (v) => { v.readiness.stagingMigrationAllowed = true; return v; }, false],
    ["readiness-production", (v) => { v.readiness.productionMigrationAllowed = true; return v; }, false],
    ["contract-schema", (v) => { v.sourceContract.schemaVersion = "old"; return v; }, false],
    ["contract-status", (v) => { v.sourceContract.status = "approved"; return v; }, false],
    ["contract-readiness-chain", (v) => { v.sourceContract.sourceReadinessFingerprint = "0".repeat(64); return v; }, false],
    ["contract-backup", (v) => { v.sourceContract.backupEvidenceAccepted = false; return v; }, false],
    ["contract-isolation", (v) => { v.sourceContract.restorePlan.isolatedTarget = false; return v; }, false],
    ["contract-production-target", (v) => { v.sourceContract.restorePlan.productionTarget = true; return v; }, false],
    ["contract-destruction", (v) => { v.sourceContract.restorePlan.targetDestructionRequired = false; return v; }, false],
    ["contract-approval", (v) => { v.sourceContract.restorePlan.humanApprovalRequiredBeforeExecution = false; return v; }, false],
    ["contract-executed", (v) => { v.sourceContract.restoreExecuted = true; return v; }, false],
    ["reconciliation-schema", (v) => { v.reconciliation.schemaVersion = "old"; return v; }, false],
    ["reconciliation-status", (v) => { v.reconciliation.status = "rejected"; return v; }, false],
    ["reconciliation-contract-chain", (v) => { v.reconciliation.sourceContractFingerprint = "0".repeat(64); return v; }, false],
    ["reconciliation-evidence", (v) => { v.reconciliation.sourceEvidenceAccepted = false; return v; }, false],
    ["reconciliation-chain", (v) => { v.reconciliation.chainIntegrityApproved = false; return v; }, false],
    ["reconciliation-metrics", (v) => { v.reconciliation.metricsReconciled = false; return v; }, false],
    ["reconciliation-security", (v) => { v.reconciliation.securityReconciled = false; return v; }, false],
    ["reconciliation-lifecycle", (v) => { v.reconciliation.lifecycleReconciled = false; return v; }, false],
    ["reconciliation-homologation", (v) => { v.reconciliation.localRestoreHomologated = false; return v; }, false],
    ["candidate-set", (v) => { v.reconciliation.readinessControlCandidates.observability_ready = true; return v; }, false],
    ["candidate-false", (v) => { v.reconciliation.readinessControlCandidates.restore_drill_verified = false; return v; }, false],
    ["reconciliation-staging", (v) => { v.reconciliation.releaseGates.stagingMigrationAllowed = true; return v; }, false],
    ["reconciliation-production", (v) => { v.reconciliation.releaseGates.productionMigrationAllowed = true; return v; }, false],
    ["remote", (v) => { v.reconciliation.remoteDatabaseTouched = true; return v; }, false],
    ["meta", (v) => { v.reconciliation.metaTouched = true; return v; }, false],
    ["build", (v) => { v.reconciliation.buildExecuted = true; return v; }, false],
    ["secret", (v) => { v.reconciliation.apiToken = "hidden"; return v; }, false],
    ["data-rows", (v) => { v.reconciliation.rows = [{ id: 1 }]; return v; }, false]
  ];
  const results = cases.map(([name, mutate, expected]) => {
    const fixture = mutate(createFixture());
    const approved = validatePhase38ReadinessProjectionSources(fixture).approved;
    return { name, expected, approved, passed: approved === expected };
  });
  const projection = projectPhase38Readiness(createFixture(), Date.parse("2026-07-19T15:00:00.000Z"));
  const projectionChecks = [
    ["projection-approved", projection.projectionApproved === true],
    ["promotion-allowlist", exact(projection.promotedControls, gate.allowedPromotions)],
    ["confirmation-only", exact(projection.confirmationOnlyControls, gate.confirmationOnlyControls)],
    ["coverage", exact(projection.evidenceCoverage, gate.projectedCoverage)],
    ["remaining-blocked", exact(projection.remainingBlockedControls, gate.blockedControlsAfterProjection)],
    ["release-closed", Object.values(projection.releaseGates).every((value) => value === false)],
    ["no-operational-touch", projection.databaseTouched === false && projection.dockerTouched === false
      && projection.remoteDatabaseTouched === false && projection.metaTouched === false && projection.buildExecuted === false]
  ];
  for (const [name, passed] of projectionChecks) results.push({ name, expected: true, approved: passed, passed });
  return results;
}

const isDirectExecution = Boolean(process.argv[1])
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution && process.argv.includes("--self-test")) {
  const results = selfTestPhase38ReadinessProjection();
  const failures = results.filter((item) => !item.passed);
  console.log(JSON.stringify({ passed: failures.length === 0, caseCount: results.length, failures }, null, 2));
  if (failures.length) process.exit(1);
}
