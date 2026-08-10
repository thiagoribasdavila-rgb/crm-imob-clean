import { createHash } from "node:crypto";
import gate from "../config/meta-repeatability-sample-02-atomic-replay-execution-permit-gate.json" with { type: "json" };

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const shaPattern = /^[a-f0-9]{64}$/;
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const expect = (condition, issue, issues) => { if (!condition) issues.push(issue); };

const policyMaterial = () => ({
  schemaVersion: gate.schemaVersion,
  orderedReplayStages: gate.orderedReplayStages,
  atomicConsumptionContract: gate.atomicConsumptionContract,
  permitRules: gate.permitRules
});

export const phase43PermitPolicyFingerprint = () => sha256(JSON.stringify(policyMaterial()));

function findSensitiveEvidence(value, path = "root", issues = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const sensitiveName = /^(rawSession|jwt|nonceValue|rawNonce|permitValue|rawPermit)$/i.test(key)
        || /(password|secret|bearerToken|accessToken|refreshToken|authorizationHeader|database.?url|connection.?string|api.?key|access.?key|service.?role|credential.*value|command|shell|projectRef)/i.test(key);
      if (sensitiveName && typeof item !== "boolean") {
        issues.push(`sensitive_key:${path}.${key}`);
      }
      if (/^(?:rows|records|recordSet|dataRows|leadData|customerData|payload|emails?|phones?|cpfs?|leads?|customers?|profiles?|users?)$/i.test(key)) {
        issues.push(`data_rows_key:${path}.${key}`);
      }
      findSensitiveEvidence(item, `${path}.${key}`, issues);
    }
    return issues;
  }
  if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+|@[a-z0-9.-]+\.[a-z]{2,}|supabase\s+db\s+(?:push|reset)|--linked|\b(?:select|insert|update|delete|alter|drop|create)\s+.+\b(?:from|into|table|schema)\b)/i.test(value)) {
    issues.push(`sensitive_value:${path}`);
  }
  return issues;
}

function validateRaw(raw, label, issues) {
  expect(typeof raw === "string" && Buffer.byteLength(raw) > 0 && Buffer.byteLength(raw) <= gate.maximumInputBytes, `${label}_raw_invalid`, issues);
}

function validateSupervisor(supervisor, rawSupervisor, now, issues) {
  const required = gate.requiredSources.ephemeralReplaySupervisor;
  expect(supervisor && typeof supervisor === "object" && !Array.isArray(supervisor), "phase42_supervisor_object_required", issues);
  validateRaw(rawSupervisor, "phase42_supervisor", issues);
  if (!supervisor || typeof supervisor !== "object" || Array.isArray(supervisor)) return;
  expect(supervisor.schemaVersion === required.schemaVersion && supervisor.stateMachineVersion === required.stateMachineVersion, "phase42_supervisor_schema_mismatch", issues);
  expect(supervisor.phase === required.phase && supervisor.sourcePhase === required.sourcePhase, "phase42_supervisor_phase_mismatch", issues);
  expect(supervisor.status === required.status && supervisor.currentState === required.currentState, "phase42_supervisor_status_or_state_mismatch", issues);
  expect(supervisor.blockedReason === required.blockedReason, "phase42_supervisor_block_reason_mismatch", issues);
  const preparedAt = Date.parse(supervisor.preparedAt);
  expect(Number.isFinite(preparedAt) && preparedAt <= now, "phase42_supervisor_prepared_at_invalid", issues);
  expect(Number.isFinite(preparedAt) && now - preparedAt <= gate.maximumSupervisorAgeSeconds * 1000, "phase42_supervisor_expired", issues);
  for (const field of ["oneTimeReplayAdapterFingerprint", "adapterSessionFingerprint", "stagingTargetFingerprint", "finalHumanValidationFingerprint", "supervisorPolicyFingerprint", "supervisorSessionFingerprint"]) {
    expect(shaPattern.test(supervisor[field] ?? ""), `phase42_supervisor_fingerprint_invalid:${field}`, issues);
  }
  for (const [field, expected] of Object.entries(gate.requiredSupervisorState)) {
    expect(supervisor[field] === expected, `phase42_supervisor_state_mismatch:${field}`, issues);
  }
  expect(exact(supervisor.orderedReplayStages, gate.orderedReplayStages), "phase42_supervisor_stage_order_mismatch", issues);
  expect(Array.isArray(supervisor.transitionPlan) && supervisor.transitionPlan.length === gate.orderedReplayStages.length, "phase42_supervisor_transition_plan_invalid", issues);
  expect(Array.isArray(supervisor.emergencyTransitions) && supervisor.emergencyTransitions.length === 4, "phase42_supervisor_emergency_transitions_invalid", issues);
  expect(supervisor.releaseGates && Object.values(supervisor.releaseGates).every((value) => value === false), "phase42_supervisor_release_gate_open", issues);
  expect(supervisor.databaseTouched === false && supervisor.networkTouched === false && supervisor.processSpawned === false, "phase42_supervisor_local_touch_claimed", issues);
  expect(supervisor.remoteDatabaseTouched === false && supervisor.stagingTouched === false && supervisor.productionTouched === false, "phase42_supervisor_remote_touch_claimed", issues);
  expect(supervisor.metaTouched === false && supervisor.buildExecuted === false, "phase42_supervisor_meta_or_build_claimed", issues);
}

function validateWorkerAttestation(attestation, rawAttestation, now, issues) {
  const required = gate.requiredSources.reviewedRuntimeWorkerAttestation;
  expect(attestation && typeof attestation === "object" && !Array.isArray(attestation), "worker_attestation_object_required", issues);
  validateRaw(rawAttestation, "worker_attestation", issues);
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) return;
  expect(attestation.schemaVersion === required.schemaVersion, "worker_attestation_schema_mismatch", issues);
  expect(attestation.status === required.status && attestation.scope === required.scope, "worker_attestation_status_or_scope_mismatch", issues);
  expect(attestation.reviewerRole === required.reviewerRole && attestation.environment === required.environment, "worker_attestation_role_or_environment_mismatch", issues);
  for (const [field, expected] of Object.entries(gate.requiredWorkerAttestationProperties)) {
    expect(attestation[field] === expected, `worker_attestation_property_mismatch:${field}`, issues);
  }
  for (const field of ["reviewerReferenceFingerprint", "workerArtifactFingerprint", "reviewChecklistFingerprint"]) {
    expect(shaPattern.test(attestation[field] ?? ""), `worker_attestation_fingerprint_invalid:${field}`, issues);
  }
  const reviewedAt = Date.parse(attestation.reviewedAt);
  const expiresAt = Date.parse(attestation.expiresAt);
  expect(Number.isFinite(reviewedAt) && Number.isFinite(expiresAt), "worker_attestation_timestamp_invalid", issues);
  expect(reviewedAt <= now && now - reviewedAt <= gate.maximumWorkerAttestationAgeSeconds * 1000, "worker_attestation_too_old", issues);
  expect(expiresAt > now, "worker_attestation_expired", issues);
  expect(expiresAt > reviewedAt && expiresAt - reviewedAt <= gate.maximumWorkerAttestationValiditySeconds * 1000, "worker_attestation_validity_invalid", issues);
}

function validateHumanAuthorization(authorization, rawAuthorization, rawSupervisor, supervisor, rawWorker, worker, now, issues) {
  const required = gate.requiredSources.immediateHumanAuthorization;
  expect(authorization && typeof authorization === "object" && !Array.isArray(authorization), "human_authorization_object_required", issues);
  validateRaw(rawAuthorization, "human_authorization", issues);
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)) return;
  expect(authorization.schemaVersion === required.schemaVersion, "human_authorization_schema_mismatch", issues);
  expect(authorization.status === required.status && authorization.scope === required.scope, "human_authorization_status_or_scope_mismatch", issues);
  expect(authorization.decision === required.decision && authorization.approverRole === required.approverRole, "human_authorization_decision_or_role_mismatch", issues);
  expect(authorization.environment === required.environment, "human_authorization_environment_mismatch", issues);
  for (const [field, expected] of Object.entries(gate.requiredHumanAuthorizationProperties)) {
    expect(authorization[field] === expected, `human_authorization_property_mismatch:${field}`, issues);
  }
  expect(shaPattern.test(authorization.approverReferenceFingerprint ?? ""), "human_authorization_approver_fingerprint_invalid", issues);
  expect(authorization.ephemeralReplaySupervisorFingerprint === sha256(rawSupervisor ?? ""), "human_authorization_supervisor_fingerprint_mismatch", issues);
  expect(authorization.supervisorSessionFingerprint === supervisor?.supervisorSessionFingerprint, "human_authorization_supervisor_session_mismatch", issues);
  expect(authorization.stagingTargetFingerprint === supervisor?.stagingTargetFingerprint, "human_authorization_target_fingerprint_mismatch", issues);
  expect(authorization.reviewedRuntimeWorkerAttestationFingerprint === sha256(rawWorker ?? ""), "human_authorization_worker_attestation_fingerprint_mismatch", issues);
  expect(authorization.workerArtifactFingerprint === worker?.workerArtifactFingerprint, "human_authorization_worker_artifact_fingerprint_mismatch", issues);
  expect(authorization.permitPolicyFingerprint === phase43PermitPolicyFingerprint(), "human_authorization_policy_fingerprint_mismatch", issues);
  const confirmedAt = Date.parse(authorization.confirmedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  expect(Number.isFinite(confirmedAt) && Number.isFinite(expiresAt), "human_authorization_timestamp_invalid", issues);
  expect(confirmedAt <= now && now - confirmedAt <= gate.maximumHumanAuthorizationAgeSeconds * 1000, "human_authorization_not_immediate", issues);
  expect(expiresAt > now, "human_authorization_expired", issues);
  expect(expiresAt > confirmedAt && expiresAt - confirmedAt <= gate.maximumHumanAuthorizationValiditySeconds * 1000, "human_authorization_validity_invalid", issues);
}

export function validatePhase43AtomicReplayExecutionPermitSources(input, now = Date.now()) {
  const issues = [];
  validateSupervisor(input?.ephemeralReplaySupervisor, input?.rawEphemeralReplaySupervisor, now, issues);
  validateWorkerAttestation(input?.reviewedRuntimeWorkerAttestation, input?.rawReviewedRuntimeWorkerAttestation, now, issues);
  validateHumanAuthorization(
    input?.immediateHumanAuthorization,
    input?.rawImmediateHumanAuthorization,
    input?.rawEphemeralReplaySupervisor,
    input?.ephemeralReplaySupervisor,
    input?.rawReviewedRuntimeWorkerAttestation,
    input?.reviewedRuntimeWorkerAttestation,
    now,
    issues
  );
  for (const value of [input?.ephemeralReplaySupervisor, input?.reviewedRuntimeWorkerAttestation, input?.immediateHumanAuthorization]) {
    issues.push(...findSensitiveEvidence(value));
  }
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

const reservationPlan = () => [
  { field: "executionPermitConsumed", expected: false, next: true, status: "blocked_future_atomic_consumer" },
  { field: "oneTimeExecutionNonceConsumed", expected: false, next: true, status: "blocked_future_atomic_consumer" },
  { field: "supervisorStarted", expected: false, next: true, status: "blocked_future_atomic_consumer" },
  { field: "adapterExecuted", expected: false, next: true, status: "blocked_future_atomic_consumer" },
  { field: "consumptionVersion", expected: 0, next: 1, status: "blocked_future_atomic_consumer" }
];

export function preparePhase43AtomicReplayExecutionPermit(input, now = Date.now()) {
  const validation = validatePhase43AtomicReplayExecutionPermitSources(input, now);
  const approved = validation.approved;
  const supervisorFingerprint = approved ? sha256(input.rawEphemeralReplaySupervisor) : null;
  const workerAttestationFingerprint = approved ? sha256(input.rawReviewedRuntimeWorkerAttestation) : null;
  const humanAuthorizationFingerprint = approved ? sha256(input.rawImmediateHumanAuthorization) : null;
  const policyFingerprint = approved ? phase43PermitPolicyFingerprint() : null;
  const permitSessionFingerprint = approved
    ? sha256(`${supervisorFingerprint}:${workerAttestationFingerprint}:${humanAuthorizationFingerprint}:${policyFingerprint}:${input.ephemeralReplaySupervisor.supervisorSessionFingerprint}:${input.reviewedRuntimeWorkerAttestation.workerArtifactFingerprint}`)
    : null;
  return {
    schemaVersion: "phase43.atomic-staging-replay-execution-permit.v1",
    phase: 43,
    sourcePhase: 42,
    status: approved ? "atomic_permit_prepared_consumption_blocked" : "atomic_permit_rejected",
    preparedAt: new Date(now).toISOString(),
    expiresAt: approved ? new Date(now + gate.maximumPermitValiditySeconds * 1000).toISOString() : null,
    ephemeralReplaySupervisorFingerprint: supervisorFingerprint,
    supervisorSessionFingerprint: approved ? input.ephemeralReplaySupervisor.supervisorSessionFingerprint : null,
    stagingTargetFingerprint: approved ? input.ephemeralReplaySupervisor.stagingTargetFingerprint : null,
    reviewedRuntimeWorkerAttestationFingerprint: workerAttestationFingerprint,
    workerArtifactFingerprint: approved ? input.reviewedRuntimeWorkerAttestation.workerArtifactFingerprint : null,
    immediateHumanAuthorizationFingerprint: humanAuthorizationFingerprint,
    permitPolicyFingerprint: policyFingerprint,
    permitSessionFingerprint,
    supervisorAccepted: approved,
    workerAttestationAccepted: approved,
    humanAuthorizationAccepted: approved,
    atomicExecutionPermitPrepared: approved,
    currentState: approved ? "ATOMIC_PERMIT_PREPARED_CONSUMPTION_BLOCKED" : "SEALED",
    consumptionState: "UNCONSUMED",
    consumptionVersion: 0,
    maximumConsumptionCount: gate.atomicConsumptionContract.maximumConsumptionCount,
    atomicCompareAndSwapRequired: true,
    allOrNothingReservationRequired: true,
    reservationPlan: approved ? reservationPlan() : [],
    executionPermitAvailable: false,
    executionPermitConsumed: false,
    oneTimeExecutionNonceConsumed: false,
    supervisorStarted: false,
    adapterExecuted: false,
    replayExecuted: false,
    blockedReason: approved ? "reviewed_atomic_consumer_missing" : "source_validation_failed",
    issues: validation.issues,
    releaseGates: {
      atomicConsumerAvailable: false,
      permitConsumptionAllowed: false,
      replayExecutionAllowed: false,
      stagingMigrationAllowed: false,
      productionMigrationAllowed: false,
      metaDeliveryAllowed: false,
      buildAllowed: false
    },
    databaseTouched: false,
    networkTouched: false,
    processSpawned: false,
    dockerTouched: false,
    remoteDatabaseTouched: false,
    stagingTouched: false,
    productionTouched: false,
    metaTouched: false,
    buildExecuted: false
  };
}

const createFixture = (now = Date.parse("2026-07-19T20:20:00.000Z")) => {
  const ephemeralReplaySupervisor = {
    schemaVersion: "phase42.ephemeral-staging-replay-supervisor.v1", stateMachineVersion: "phase42.staging-replay-state-machine.v1",
    phase: 42, sourcePhase: 41, status: "supervisor_prepared_execution_blocked", preparedAt: "2026-07-19T20:17:00.000Z",
    oneTimeReplayAdapterFingerprint: "1".repeat(64), adapterSessionFingerprint: "2".repeat(64), stagingTargetFingerprint: "3".repeat(64),
    finalHumanValidationFingerprint: "4".repeat(64), supervisorPolicyFingerprint: "5".repeat(64), supervisorSessionFingerprint: "6".repeat(64),
    adapterAccepted: true, finalHumanValidationAccepted: true, supervisorPrepared: true,
    currentState: "SUPERVISOR_PREPARED_EXECUTION_BLOCKED", orderedReplayStages: [...gate.orderedReplayStages],
    transitionPlan: gate.orderedReplayStages.map((stage, index) => ({ sequence: index + 1, stage, status: "blocked" })),
    emergencyTransitions: [{}, {}, {}, {}], stopOnError: true, rollbackRequiredAfterFailure: true, targetDestructionRequired: true,
    executionPermitConsumed: false, oneTimeExecutionNonceConsumed: false, supervisorStarted: false, adapterExecuted: false, replayExecuted: false,
    blockedReason: "runtime_worker_and_atomic_execution_permit_missing", issues: [],
    releaseGates: { runtimeWorkerAvailable: false, executionPermitAvailable: false, replayExecutionAllowed: false, stagingMigrationAllowed: false, productionMigrationAllowed: false, metaDeliveryAllowed: false, buildAllowed: false },
    databaseTouched: false, networkTouched: false, processSpawned: false, dockerTouched: false, remoteDatabaseTouched: false,
    stagingTouched: false, productionTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawEphemeralReplaySupervisor = JSON.stringify(ephemeralReplaySupervisor);
  const reviewedRuntimeWorkerAttestation = {
    schemaVersion: "phase43.reviewed-runtime-worker-attestation.v1", status: "reviewed_for_atomic_staging_permit_preparation",
    scope: "phase43_atomic_staging_permit", reviewerRole: "SECURITY_REVIEWER", environment: "staging",
    reviewerReferenceFingerprint: "7".repeat(64), workerArtifactFingerprint: "8".repeat(64), reviewChecklistFingerprint: "9".repeat(64),
    reviewedAt: "2026-07-19T20:00:00.000Z", expiresAt: "2026-07-20T20:00:00.000Z",
    ...gate.requiredWorkerAttestationProperties
  };
  const rawReviewedRuntimeWorkerAttestation = JSON.stringify(reviewedRuntimeWorkerAttestation);
  const immediateHumanAuthorization = {
    schemaVersion: "phase43.immediate-human-atomic-permit-authorization.v1", status: "confirmed_for_atomic_permit_preparation",
    scope: "prepare_phase43_atomic_staging_execution_permit", decision: "CONFIRM_ATOMIC_PERMIT_PREPARATION_ONLY",
    approverRole: "DIRETOR_DECISOR", environment: "staging", approverReferenceFingerprint: "a".repeat(64),
    ephemeralReplaySupervisorFingerprint: sha256(rawEphemeralReplaySupervisor),
    supervisorSessionFingerprint: ephemeralReplaySupervisor.supervisorSessionFingerprint,
    stagingTargetFingerprint: ephemeralReplaySupervisor.stagingTargetFingerprint,
    reviewedRuntimeWorkerAttestationFingerprint: sha256(rawReviewedRuntimeWorkerAttestation),
    workerArtifactFingerprint: reviewedRuntimeWorkerAttestation.workerArtifactFingerprint,
    permitPolicyFingerprint: phase43PermitPolicyFingerprint(), confirmedAt: "2026-07-19T20:19:30.000Z", expiresAt: "2026-07-19T20:21:00.000Z",
    ...gate.requiredHumanAuthorizationProperties
  };
  return {
    now,
    input: {
      ephemeralReplaySupervisor, rawEphemeralReplaySupervisor,
      reviewedRuntimeWorkerAttestation, rawReviewedRuntimeWorkerAttestation,
      immediateHumanAuthorization, rawImmediateHumanAuthorization: JSON.stringify(immediateHumanAuthorization)
    }
  };
};

export function selfTestPhase43AtomicReplayExecutionPermit() {
  const fixture = createFixture();
  const clone = () => structuredClone(fixture.input);
  const cases = [
    ["baseline", (v) => v, true],
    ["supervisor-schema", (v) => { v.ephemeralReplaySupervisor.schemaVersion = "old"; return v; }, false],
    ["supervisor-phase", (v) => { v.ephemeralReplaySupervisor.phase = 41; return v; }, false],
    ["supervisor-status", (v) => { v.ephemeralReplaySupervisor.status = "executed"; return v; }, false],
    ["supervisor-state", (v) => { v.ephemeralReplaySupervisor.currentState = "RUNNING"; return v; }, false],
    ["supervisor-expired", (v) => { v.ephemeralReplaySupervisor.preparedAt = "2026-07-19T20:10:00.000Z"; return v; }, false],
    ["supervisor-future", (v) => { v.ephemeralReplaySupervisor.preparedAt = "2026-07-19T20:21:00.000Z"; return v; }, false],
    ["supervisor-started", (v) => { v.ephemeralReplaySupervisor.supervisorStarted = true; return v; }, false],
    ["supervisor-permit-consumed", (v) => { v.ephemeralReplaySupervisor.executionPermitConsumed = true; return v; }, false],
    ["supervisor-nonce-consumed", (v) => { v.ephemeralReplaySupervisor.oneTimeExecutionNonceConsumed = true; return v; }, false],
    ["supervisor-adapter-executed", (v) => { v.ephemeralReplaySupervisor.adapterExecuted = true; return v; }, false],
    ["supervisor-replayed", (v) => { v.ephemeralReplaySupervisor.replayExecuted = true; return v; }, false],
    ["supervisor-stage-order", (v) => { v.ephemeralReplaySupervisor.orderedReplayStages.reverse(); return v; }, false],
    ["supervisor-release", (v) => { v.ephemeralReplaySupervisor.releaseGates.replayExecutionAllowed = true; return v; }, false],
    ["supervisor-touch", (v) => { v.ephemeralReplaySupervisor.stagingTouched = true; return v; }, false],
    ["worker-schema", (v) => { v.reviewedRuntimeWorkerAttestation.schemaVersion = "old"; return v; }, false],
    ["worker-status", (v) => { v.reviewedRuntimeWorkerAttestation.status = "unreviewed"; return v; }, false],
    ["worker-role", (v) => { v.reviewedRuntimeWorkerAttestation.reviewerRole = "CORRETOR"; return v; }, false],
    ["worker-environment", (v) => { v.reviewedRuntimeWorkerAttestation.environment = "production"; return v; }, false],
    ["worker-not-reviewed", (v) => { v.reviewedRuntimeWorkerAttestation.reviewed = false; return v; }, false],
    ["worker-freeform", (v) => { v.reviewedRuntimeWorkerAttestation.freeformCommandsAbsent = false; return v; }, false],
    ["worker-production-path", (v) => { v.reviewedRuntimeWorkerAttestation.productionPathAbsent = false; return v; }, false],
    ["worker-expired", (v) => { v.reviewedRuntimeWorkerAttestation.expiresAt = "2026-07-19T20:10:00.000Z"; return v; }, false],
    ["worker-too-old", (v) => { v.reviewedRuntimeWorkerAttestation.reviewedAt = "2026-07-18T19:00:00.000Z"; return v; }, false],
    ["worker-validity", (v) => { v.reviewedRuntimeWorkerAttestation.expiresAt = "2026-07-22T20:00:00.000Z"; return v; }, false],
    ["authorization-schema", (v) => { v.immediateHumanAuthorization.schemaVersion = "old"; return v; }, false],
    ["authorization-scope", (v) => { v.immediateHumanAuthorization.scope = "execute"; return v; }, false],
    ["authorization-decision", (v) => { v.immediateHumanAuthorization.decision = "EXECUTE"; return v; }, false],
    ["authorization-role", (v) => { v.immediateHumanAuthorization.approverRole = "CORRETOR"; return v; }, false],
    ["authorization-aal", (v) => { v.immediateHumanAuthorization.authenticationAssuranceLevel = "aal1"; return v; }, false],
    ["authorization-source", (v) => { v.immediateHumanAuthorization.trustedAuthorizationSource = "user_metadata"; return v; }, false],
    ["authorization-execution", (v) => { v.immediateHumanAuthorization.executionConfirmed = true; return v; }, false],
    ["authorization-production", (v) => { v.immediateHumanAuthorization.productionConfirmed = true; return v; }, false],
    ["authorization-supervisor-chain", (v) => { v.immediateHumanAuthorization.ephemeralReplaySupervisorFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-session-chain", (v) => { v.immediateHumanAuthorization.supervisorSessionFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-target-chain", (v) => { v.immediateHumanAuthorization.stagingTargetFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-worker-chain", (v) => { v.immediateHumanAuthorization.reviewedRuntimeWorkerAttestationFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-artifact-chain", (v) => { v.immediateHumanAuthorization.workerArtifactFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-policy-chain", (v) => { v.immediateHumanAuthorization.permitPolicyFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-old", (v) => { v.immediateHumanAuthorization.confirmedAt = "2026-07-19T20:18:00.000Z"; return v; }, false],
    ["authorization-future", (v) => { v.immediateHumanAuthorization.confirmedAt = "2026-07-19T20:21:00.000Z"; return v; }, false],
    ["authorization-expired", (v) => { v.immediateHumanAuthorization.expiresAt = "2026-07-19T20:19:00.000Z"; return v; }, false],
    ["authorization-too-long", (v) => { v.immediateHumanAuthorization.expiresAt = "2026-07-19T20:30:00.000Z"; return v; }, false],
    ["credential-key", (v) => { v.immediateHumanAuthorization.apiKey = "placeholder"; return v; }, false],
    ["raw-session", (v) => { v.immediateHumanAuthorization.rawSession = "placeholder"; return v; }, false],
    ["database-url", (v) => { v.reviewedRuntimeWorkerAttestation.notes = "postgresql://redacted"; return v; }, false],
    ["freeform-command", (v) => { v.reviewedRuntimeWorkerAttestation.command = "run"; return v; }, false],
    ["data-rows", (v) => { v.ephemeralReplaySupervisor.records = [{ id: 1 }]; return v; }, false]
  ];
  const results = cases.map(([name, mutate, expected]) => {
    const value = mutate(clone());
    return { name, passed: validatePhase43AtomicReplayExecutionPermitSources(value, fixture.now).approved === expected };
  });
  const prepared = preparePhase43AtomicReplayExecutionPermit(fixture.input, fixture.now);
  results.push({ name: "permit-prepared", passed: prepared.atomicExecutionPermitPrepared === true && prepared.status === "atomic_permit_prepared_consumption_blocked" });
  results.push({ name: "permit-short-lived", passed: Date.parse(prepared.expiresAt) - Date.parse(prepared.preparedAt) === 120000 });
  results.push({ name: "permit-unavailable-unconsumed", passed: prepared.executionPermitAvailable === false && prepared.executionPermitConsumed === false });
  results.push({ name: "atomic-contract", passed: prepared.atomicCompareAndSwapRequired === true && prepared.allOrNothingReservationRequired === true && prepared.maximumConsumptionCount === 1 });
  results.push({ name: "reservation-complete", passed: prepared.reservationPlan.length === 5 && prepared.reservationPlan.every((item) => item.status === "blocked_future_atomic_consumer") });
  results.push({ name: "version-unconsumed", passed: prepared.consumptionState === "UNCONSUMED" && prepared.consumptionVersion === 0 });
  results.push({ name: "supervisor-adapter-nonce-unconsumed", passed: prepared.supervisorStarted === false && prepared.adapterExecuted === false && prepared.oneTimeExecutionNonceConsumed === false });
  results.push({ name: "replay-blocked", passed: prepared.replayExecuted === false && prepared.releaseGates.replayExecutionAllowed === false });
  results.push({ name: "all-release-gates-closed", passed: Object.values(prepared.releaseGates).every((value) => value === false) });
  results.push({ name: "no-operational-touch", passed: prepared.databaseTouched === false && prepared.networkTouched === false && prepared.processSpawned === false && prepared.stagingTouched === false && prepared.productionTouched === false });
  const failures = results.filter((result) => !result.passed).map((result) => result.name);
  return { passed: failures.length === 0, caseCount: results.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase43AtomicReplayExecutionPermit();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}
