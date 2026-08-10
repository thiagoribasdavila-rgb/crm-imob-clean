import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-isolated-staging-replay-contract-gate.json"));
const shaPattern = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = (values) => [...values].sort();

const findSensitiveEvidence = (value, path = "$", issues = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/(password|secret|token|authorization|database.?url|connection.?string|api.?key|access.?key|service.?role)/i.test(key)) issues.push(`sensitive_key:${path}.${key}`);
      if (/^(rows|records|payload|emails?|phones?|cpfs?|leads?|customers?|profiles?|users?)$/i.test(key)) issues.push(`data_rows_key:${path}.${key}`);
      findSensitiveEvidence(child, `${path}.${key}`, issues);
    }
    return issues;
  }
  if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+|@[a-z0-9.-]+\.[a-z]{2,})/i.test(value)) issues.push(`sensitive_value:${path}`);
  return issues;
};

const expectBlockedRelease = (releaseGates, issues) => {
  const expected = {
    stagingMigrationAllowed: false,
    productionMigrationAllowed: false,
    productionCompatibilityApproved: false,
    metaDeliveryAllowed: false,
    buildAllowed: false
  };
  if (!releaseGates || typeof releaseGates !== "object" || Array.isArray(releaseGates)) {
    issues.push("phase38_release_gates_object_required");
    return;
  }
  for (const [field, value] of Object.entries(expected)) {
    if (releaseGates[field] !== value) issues.push(`phase38_release_gate_open:${field}`);
  }
};

const validateProjection = (projection, issues) => {
  const required = gate.requiredSources.readinessProjection;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(projection && typeof projection === "object" && !Array.isArray(projection), "phase38_projection_object_required");
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) return;
  expect(projection.schemaVersion === required.schemaVersion, "phase38_projection_schema_mismatch");
  expect(projection.phase === required.phase && projection.sourcePhase === required.sourcePhase && projection.baselinePhase === required.baselinePhase, "phase38_projection_phase_mismatch");
  expect(projection.status === required.status && projection.projectionApproved === required.projectionApproved, "phase38_projection_not_approved");
  expect(Number.isFinite(Date.parse(projection.projectedAt)), "phase38_projected_at_invalid");
  for (const field of ["sourceReadinessFingerprint", "sourceContractFingerprint", "sourceReconciliationFingerprint"]) {
    expect(shaPattern.test(projection[field] ?? ""), `phase38_fingerprint_invalid:${field}`);
  }
  expect(projection.sourceReadinessAccepted === true && projection.sourceContractAccepted === true && projection.sourceReconciliationAccepted === true, "phase38_source_chain_not_accepted");
  expect(projection.chainIntegrityApproved === true, "phase38_chain_integrity_not_approved");
  expect(exact(sorted(Object.keys(projection.controls ?? {})), sorted(gate.requiredControlOrder)), "phase38_control_set_mismatch");
  for (const name of gate.requiredVerifiedControls) expect(projection.controls?.[name] === true, `phase38_required_control_missing:${name}`);
  for (const name of gate.requiredBlockedControls) expect(projection.controls?.[name] === false, `phase38_blocked_control_claimed:${name}`);
  expect(exact(sorted(projection.remainingBlockedControls ?? []), sorted(gate.requiredBlockedControls)), "phase38_remaining_blocked_controls_mismatch");
  expect(projection.evidenceCoverage?.verifiedControls === required.verifiedControls, "phase38_verified_control_count_mismatch");
  expect(projection.evidenceCoverage?.requiredControls === required.requiredControls, "phase38_required_control_count_mismatch");
  expect(projection.evidenceCoverage?.percent === required.coveragePercent, "phase38_coverage_percent_mismatch");
  expectBlockedRelease(projection.releaseGates, issues);
  expect(projection.databaseTouched === false && projection.dockerTouched === false && projection.remoteDatabaseTouched === false, "phase38_operational_touch_claimed");
  expect(projection.metaTouched === false && projection.buildExecuted === false, "phase38_meta_or_build_claimed");
};

const validateStagingTarget = (manifest, issues) => {
  const required = gate.requiredSources.stagingTarget;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(manifest && typeof manifest === "object" && !Array.isArray(manifest), "staging_target_object_required");
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return;
  expect(manifest.schemaVersion === required.schemaVersion, "staging_target_schema_mismatch");
  expect(manifest.status === required.status && manifest.environment === required.environment, "staging_target_status_or_environment_mismatch");
  expect(Number.isFinite(Date.parse(manifest.verifiedAt)), "staging_target_verified_at_invalid");
  expect(shaPattern.test(manifest.targetReferenceFingerprint ?? ""), "staging_target_reference_fingerprint_invalid");
  expect(shaPattern.test(manifest.configurationFingerprint ?? ""), "staging_target_configuration_fingerprint_invalid");
  for (const [field, expected] of Object.entries(gate.requiredTargetProperties)) expect(manifest[field] === expected, `staging_target_property_mismatch:${field}`);
  expect(Number.isInteger(manifest.ttlHours) && manifest.ttlHours > 0 && manifest.ttlHours <= 24, "staging_target_ttl_invalid");
  expect(manifest.projectIdentityDistinctFromProduction === true, "staging_target_not_distinct_from_production");
};

const validateRollbackPlan = (plan, issues) => {
  const required = gate.requiredSources.rollbackPlan;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(plan && typeof plan === "object" && !Array.isArray(plan), "rollback_plan_object_required");
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return;
  expect(plan.schemaVersion === required.schemaVersion && plan.status === required.status, "rollback_plan_schema_or_status_mismatch");
  expect(Number.isFinite(Date.parse(plan.reviewedAt)), "rollback_plan_reviewed_at_invalid");
  expect(shaPattern.test(plan.planReferenceFingerprint ?? ""), "rollback_plan_reference_fingerprint_invalid");
  for (const [field, expected] of Object.entries(gate.requiredRollbackProperties)) expect(plan[field] === expected, `rollback_plan_property_mismatch:${field}`);
  expect(Number.isInteger(plan.maximumRtoMinutes) && plan.maximumRtoMinutes > 0 && plan.maximumRtoMinutes <= 60, "rollback_plan_rto_invalid");
  expect(Number.isInteger(plan.maximumRpoMinutes) && plan.maximumRpoMinutes === 0, "rollback_plan_rpo_invalid");
};

const validateApproval = (approval, rawProjection, rawTarget, rawRollback, now, issues) => {
  const required = gate.requiredSources.humanApproval;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(approval && typeof approval === "object" && !Array.isArray(approval), "human_approval_object_required");
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) return;
  expect(approval.schemaVersion === required.schemaVersion, "human_approval_schema_mismatch");
  expect(approval.status === required.status && approval.scope === required.scope, "human_approval_scope_mismatch");
  expect(approval.decision === required.decision && approval.approverRole === required.approverRole, "human_approval_decision_or_role_mismatch");
  expect(approval.humanApproved === true, "human_approval_not_explicit");
  expect(approval.executionApproved === false && approval.productionApproved === false && approval.metaApproved === false, "human_approval_scope_escalated");
  expect(shaPattern.test(approval.approverReferenceFingerprint ?? ""), "human_approval_reference_fingerprint_invalid");
  expect(approval.sourceProjectionFingerprint === sha256(rawProjection ?? ""), "human_approval_projection_fingerprint_mismatch");
  expect(approval.stagingTargetFingerprint === sha256(rawTarget ?? ""), "human_approval_target_fingerprint_mismatch");
  expect(approval.rollbackPlanFingerprint === sha256(rawRollback ?? ""), "human_approval_rollback_fingerprint_mismatch");
  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  expect(Number.isFinite(approvedAt) && Number.isFinite(expiresAt), "human_approval_timestamp_invalid");
  expect(approvedAt <= now && expiresAt > now, "human_approval_expired_or_future");
  expect(expiresAt > approvedAt && expiresAt - approvedAt <= gate.maximumApprovalValidityHours * 60 * 60 * 1000, "human_approval_validity_window_invalid");
};

export function validatePhase39StagingReplayContractSources(input, now = Date.now()) {
  const issues = [];
  validateProjection(input?.projection, issues);
  validateStagingTarget(input?.stagingTarget, issues);
  validateRollbackPlan(input?.rollbackPlan, issues);
  validateApproval(input?.humanApproval, input?.rawProjection, input?.rawStagingTarget, input?.rawRollbackPlan, now, issues);
  for (const value of [input?.projection, input?.stagingTarget, input?.rollbackPlan, input?.humanApproval]) issues.push(...findSensitiveEvidence(value));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function preparePhase39StagingReplayContract(input, now = Date.now()) {
  const validation = validatePhase39StagingReplayContractSources(input, now);
  const approved = validation.approved;
  return {
    schemaVersion: "phase39.isolated-staging-replay-contract.v1",
    phase: 39,
    sourcePhase: 38,
    status: approved ? "contract_prepared_replay_blocked" : "contract_rejected",
    preparedAt: new Date(now).toISOString(),
    sourceProjectionFingerprint: approved ? sha256(input.rawProjection) : null,
    stagingTargetFingerprint: approved ? sha256(input.rawStagingTarget) : null,
    rollbackPlanFingerprint: approved ? sha256(input.rawRollbackPlan) : null,
    humanApprovalFingerprint: approved ? sha256(input.rawHumanApproval) : null,
    sourceProjectionAccepted: approved,
    stagingTargetAccepted: approved,
    rollbackPlanAccepted: approved,
    humanApprovalAccepted: approved,
    contractPrepared: approved,
    orderedReplayStages: approved ? [...gate.orderedReplayStages] : [],
    executionApprovalRequired: true,
    replayExecuted: false,
    issues: validation.issues,
    releaseGates: {
      replayExecutionAllowed: false,
      stagingMigrationAllowed: false,
      productionMigrationAllowed: false,
      productionCompatibilityApproved: false,
      metaDeliveryAllowed: false,
      buildAllowed: false
    },
    databaseTouched: false,
    dockerTouched: false,
    remoteDatabaseTouched: false,
    stagingTouched: false,
    productionTouched: false,
    metaTouched: false,
    buildExecuted: false
  };
}

const createFixture = (now = Date.parse("2026-07-19T18:00:00.000Z")) => {
  const controls = Object.fromEntries(gate.requiredControlOrder.map((name) => [name, gate.requiredVerifiedControls.includes(name)]));
  const projection = {
    schemaVersion: "phase38.readiness-projection-receipt.v1", phase: 38, sourcePhase: 37, baselinePhase: 34,
    status: "projected_readiness_blocked", projectedAt: "2026-07-19T16:00:00.000Z",
    sourceReadinessFingerprint: "1".repeat(64), sourceContractFingerprint: "2".repeat(64), sourceReconciliationFingerprint: "3".repeat(64),
    sourceReadinessAccepted: true, sourceContractAccepted: true, sourceReconciliationAccepted: true,
    chainIntegrityApproved: true, projectionApproved: true, controls,
    evidenceCoverage: { verifiedControls: 8, requiredControls: 15, percent: 53 },
    remainingBlockedControls: [...gate.requiredBlockedControls],
    releaseGates: { stagingMigrationAllowed: false, productionMigrationAllowed: false, productionCompatibilityApproved: false, metaDeliveryAllowed: false, buildAllowed: false },
    databaseTouched: false, dockerTouched: false, remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
  };
  const stagingTarget = {
    schemaVersion: "phase39.isolated-staging-target-manifest.v1", status: "verified_for_contract", environment: "staging",
    verifiedAt: "2026-07-19T16:30:00.000Z", targetReferenceFingerprint: "4".repeat(64), configurationFingerprint: "5".repeat(64),
    ...gate.requiredTargetProperties, ttlHours: 12, projectIdentityDistinctFromProduction: true
  };
  const rollbackPlan = {
    schemaVersion: "phase39.staging-rollback-plan.v1", status: "reviewed_for_contract", reviewedAt: "2026-07-19T16:45:00.000Z",
    planReferenceFingerprint: "6".repeat(64), ...gate.requiredRollbackProperties, maximumRtoMinutes: 30, maximumRpoMinutes: 0
  };
  const rawProjection = JSON.stringify(projection);
  const rawStagingTarget = JSON.stringify(stagingTarget);
  const rawRollbackPlan = JSON.stringify(rollbackPlan);
  const humanApproval = {
    schemaVersion: "phase39.staging-replay-contract-approval.v1", status: "approved_for_contract_preparation_only",
    scope: "prepare_phase39_isolated_staging_replay_contract", decision: "APPROVE_CONTRACT_ONLY", approverRole: "DIRETOR_DECISOR",
    humanApproved: true, executionApproved: false, productionApproved: false, metaApproved: false,
    approverReferenceFingerprint: "7".repeat(64), sourceProjectionFingerprint: sha256(rawProjection),
    stagingTargetFingerprint: sha256(rawStagingTarget), rollbackPlanFingerprint: sha256(rawRollbackPlan),
    approvedAt: "2026-07-19T17:00:00.000Z", expiresAt: "2026-07-20T17:00:00.000Z"
  };
  return { projection, stagingTarget, rollbackPlan, humanApproval, rawProjection, rawStagingTarget, rawRollbackPlan, rawHumanApproval: JSON.stringify(humanApproval), now };
};

export function selfTestPhase39StagingReplayContract() {
  const cases = [
    ["baseline", (v) => v, true],
    ["projection-schema", (v) => { v.projection.schemaVersion = "old"; return v; }, false],
    ["projection-status", (v) => { v.projection.status = "not_projected"; return v; }, false],
    ["projection-control-set", (v) => { v.projection.controls.extra = false; return v; }, false],
    ["projection-required-control", (v) => { v.projection.controls.data_integrity_verified = false; return v; }, false],
    ["projection-blocked-control", (v) => { v.projection.controls.observability_ready = true; return v; }, false],
    ["projection-coverage", (v) => { v.projection.evidenceCoverage.percent = 60; return v; }, false],
    ["projection-staging-gate", (v) => { v.projection.releaseGates.stagingMigrationAllowed = true; return v; }, false],
    ["target-schema", (v) => { v.stagingTarget.schemaVersion = "old"; return v; }, false],
    ["target-production", (v) => { v.stagingTarget.productionTarget = true; return v; }, false],
    ["target-production-data", (v) => { v.stagingTarget.containsProductionData = true; return v; }, false],
    ["target-not-disposable", (v) => { v.stagingTarget.disposable = false; return v; }, false],
    ["target-auth-not-isolated", (v) => { v.stagingTarget.authIsolated = false; return v; }, false],
    ["target-storage-not-isolated", (v) => { v.stagingTarget.storageIsolated = false; return v; }, false],
    ["target-credentials", (v) => { v.stagingTarget.credentialsEmbedded = true; return v; }, false],
    ["target-ttl", (v) => { v.stagingTarget.ttlHours = 72; return v; }, false],
    ["rollback-schema", (v) => { v.rollbackPlan.schemaVersion = "old"; return v; }, false],
    ["rollback-production", (v) => { v.rollbackPlan.productionRollback = true; return v; }, false],
    ["rollback-snapshot", (v) => { v.rollbackPlan.preReplaySnapshotRequired = false; return v; }, false],
    ["rollback-stop", (v) => { v.rollbackPlan.stopOnError = false; return v; }, false],
    ["rollback-rls", (v) => { v.rollbackPlan.rlsAuthStorageVerification = false; return v; }, false],
    ["rollback-destruction", (v) => { v.rollbackPlan.targetDestructionAfterReplay = false; return v; }, false],
    ["rollback-rto", (v) => { v.rollbackPlan.maximumRtoMinutes = 90; return v; }, false],
    ["approval-schema", (v) => { v.humanApproval.schemaVersion = "old"; return v; }, false],
    ["approval-scope", (v) => { v.humanApproval.scope = "production"; return v; }, false],
    ["approval-not-human", (v) => { v.humanApproval.humanApproved = false; return v; }, false],
    ["approval-execution", (v) => { v.humanApproval.executionApproved = true; return v; }, false],
    ["approval-production", (v) => { v.humanApproval.productionApproved = true; return v; }, false],
    ["approval-projection-chain", (v) => { v.humanApproval.sourceProjectionFingerprint = "0".repeat(64); return v; }, false],
    ["approval-target-chain", (v) => { v.humanApproval.stagingTargetFingerprint = "0".repeat(64); return v; }, false],
    ["approval-rollback-chain", (v) => { v.humanApproval.rollbackPlanFingerprint = "0".repeat(64); return v; }, false],
    ["approval-expired", (v) => { v.humanApproval.expiresAt = "2026-07-19T17:30:00.000Z"; return v; }, false],
    ["approval-too-long", (v) => { v.humanApproval.expiresAt = "2026-07-21T17:00:00.000Z"; return v; }, false],
    ["sensitive-key", (v) => { v.stagingTarget.apiKey = "value"; return v; }, false],
    ["sensitive-url", (v) => { v.stagingTarget.endpoint = "https://example.invalid"; return v; }, false],
    ["data-rows", (v) => { v.rollbackPlan.records = []; return v; }, false]
  ];
  const results = cases.map(([name, mutate, expected]) => {
    const fixture = createFixture();
    const mutated = mutate(structuredClone(fixture));
    const result = validatePhase39StagingReplayContractSources(mutated, fixture.now);
    return { name, passed: result.approved === expected };
  });
  const prepared = preparePhase39StagingReplayContract(createFixture(), createFixture().now);
  results.push({ name: "contract-prepared", passed: prepared.contractPrepared === true && prepared.status === "contract_prepared_replay_blocked" });
  results.push({ name: "replay-remains-blocked", passed: prepared.releaseGates.replayExecutionAllowed === false && prepared.replayExecuted === false });
  results.push({ name: "production-remains-blocked", passed: prepared.releaseGates.productionMigrationAllowed === false && prepared.productionTouched === false });
  results.push({ name: "stages-exact", passed: exact(prepared.orderedReplayStages, gate.orderedReplayStages) });
  const failures = results.filter((item) => !item.passed);
  return { passed: failures.length === 0, caseCount: results.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase39StagingReplayContract();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}
