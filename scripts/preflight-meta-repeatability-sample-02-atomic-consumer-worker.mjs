import { createHash } from "node:crypto";
import gate from "../config/meta-repeatability-sample-02-atomic-consumer-worker-gate.json" with { type: "json" };

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const shaPattern = /^[a-f0-9]{64}$/;
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const expect = (condition, issue, issues) => { if (!condition) issues.push(issue); };

const policyMaterial = () => ({
  schemaVersion: gate.schemaVersion,
  atomicReservationFields: gate.atomicReservationFields,
  futureAtomicTransactionPlan: gate.futureAtomicTransactionPlan,
  workerLifecycle: gate.workerLifecycle,
  consumerRules: gate.consumerRules
});

export const phase44ConsumerPolicyFingerprint = () => sha256(JSON.stringify(policyMaterial()));

function findSensitiveEvidence(value, path = "root", issues = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const sensitiveName = /^(rawSession|jwt|nonceValue|rawNonce|permitValue|rawPermit)$/i.test(key)
        || /(password|secret|bearerToken|accessToken|refreshToken|authorizationHeader|database.?url|connection.?string|api.?key|access.?key|service.?role|credential.*value|shell|projectRef)/i.test(key);
      if (sensitiveName && typeof item !== "boolean") issues.push(`sensitive_key:${path}.${key}`);
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

function validatePermit(permit, rawPermit, now, issues) {
  const required = gate.requiredSources.atomicReplayExecutionPermit;
  expect(permit && typeof permit === "object" && !Array.isArray(permit), "phase43_permit_object_required", issues);
  validateRaw(rawPermit, "phase43_permit", issues);
  if (!permit || typeof permit !== "object" || Array.isArray(permit)) return;
  expect(permit.schemaVersion === required.schemaVersion, "phase43_permit_schema_mismatch", issues);
  expect(permit.phase === required.phase && permit.sourcePhase === required.sourcePhase, "phase43_permit_phase_mismatch", issues);
  expect(permit.status === required.status && permit.currentState === required.currentState, "phase43_permit_status_or_state_mismatch", issues);
  expect(permit.blockedReason === required.blockedReason, "phase43_permit_block_reason_mismatch", issues);
  const preparedAt = Date.parse(permit.preparedAt);
  const expiresAt = Date.parse(permit.expiresAt);
  expect(Number.isFinite(preparedAt) && Number.isFinite(expiresAt), "phase43_permit_timestamp_invalid", issues);
  expect(preparedAt <= now && now - preparedAt <= gate.maximumPermitAgeSeconds * 1000, "phase43_permit_expired_by_age", issues);
  expect(expiresAt > now, "phase43_permit_expired", issues);
  expect(expiresAt > preparedAt && expiresAt - preparedAt <= gate.maximumPermitAgeSeconds * 1000, "phase43_permit_validity_invalid", issues);
  for (const field of [
    "ephemeralReplaySupervisorFingerprint", "supervisorSessionFingerprint", "stagingTargetFingerprint",
    "reviewedRuntimeWorkerAttestationFingerprint", "workerArtifactFingerprint", "immediateHumanAuthorizationFingerprint",
    "permitPolicyFingerprint", "permitSessionFingerprint"
  ]) expect(shaPattern.test(permit[field] ?? ""), `phase43_permit_fingerprint_invalid:${field}`, issues);
  for (const [field, expected] of Object.entries(gate.requiredPermitState)) {
    expect(permit[field] === expected, `phase43_permit_state_mismatch:${field}`, issues);
  }
  expect(Array.isArray(permit.reservationPlan) && permit.reservationPlan.length === gate.atomicReservationFields.length, "phase43_permit_reservation_plan_invalid", issues);
  if (Array.isArray(permit.reservationPlan)) {
    expect(exact(permit.reservationPlan.map((item) => item.field), gate.atomicReservationFields), "phase43_permit_reservation_fields_mismatch", issues);
    expect(permit.reservationPlan.every((item) => item.status === "blocked_future_atomic_consumer"), "phase43_permit_reservation_not_blocked", issues);
  }
  expect(permit.releaseGates && Object.values(permit.releaseGates).every((value) => value === false), "phase43_permit_release_gate_open", issues);
  expect(permit.databaseTouched === false && permit.networkTouched === false && permit.processSpawned === false, "phase43_permit_local_touch_claimed", issues);
  expect(permit.remoteDatabaseTouched === false && permit.stagingTouched === false && permit.productionTouched === false, "phase43_permit_remote_touch_claimed", issues);
  expect(permit.metaTouched === false && permit.buildExecuted === false, "phase43_permit_meta_or_build_claimed", issues);
}

function validateConsumerAttestation(attestation, rawAttestation, now, issues) {
  const required = gate.requiredSources.reviewedAtomicConsumerWorkerAttestation;
  expect(attestation && typeof attestation === "object" && !Array.isArray(attestation), "consumer_attestation_object_required", issues);
  validateRaw(rawAttestation, "consumer_attestation", issues);
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) return;
  expect(attestation.schemaVersion === required.schemaVersion, "consumer_attestation_schema_mismatch", issues);
  expect(attestation.status === required.status && attestation.scope === required.scope, "consumer_attestation_status_or_scope_mismatch", issues);
  expect(attestation.reviewerRole === required.reviewerRole && attestation.environment === required.environment, "consumer_attestation_role_or_environment_mismatch", issues);
  for (const [field, expected] of Object.entries(gate.requiredConsumerAttestationProperties)) {
    expect(attestation[field] === expected, `consumer_attestation_property_mismatch:${field}`, issues);
  }
  for (const field of ["reviewerReferenceFingerprint", "consumerWorkerArtifactFingerprint", "transactionReviewFingerprint", "reviewChecklistFingerprint"]) {
    expect(shaPattern.test(attestation[field] ?? ""), `consumer_attestation_fingerprint_invalid:${field}`, issues);
  }
  const reviewedAt = Date.parse(attestation.reviewedAt);
  const expiresAt = Date.parse(attestation.expiresAt);
  expect(Number.isFinite(reviewedAt) && Number.isFinite(expiresAt), "consumer_attestation_timestamp_invalid", issues);
  expect(reviewedAt <= now && now - reviewedAt <= gate.maximumConsumerAttestationAgeSeconds * 1000, "consumer_attestation_too_old", issues);
  expect(expiresAt > now, "consumer_attestation_expired", issues);
  expect(expiresAt > reviewedAt && expiresAt - reviewedAt <= gate.maximumConsumerAttestationValiditySeconds * 1000, "consumer_attestation_validity_invalid", issues);
}

function validateHumanAuthorization(authorization, rawAuthorization, rawPermit, permit, rawAttestation, attestation, now, issues) {
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
  expect(authorization.atomicReplayExecutionPermitFingerprint === sha256(rawPermit ?? ""), "human_authorization_permit_fingerprint_mismatch", issues);
  expect(authorization.permitSessionFingerprint === permit?.permitSessionFingerprint, "human_authorization_permit_session_mismatch", issues);
  expect(authorization.stagingTargetFingerprint === permit?.stagingTargetFingerprint, "human_authorization_target_fingerprint_mismatch", issues);
  expect(authorization.reviewedConsumerWorkerAttestationFingerprint === sha256(rawAttestation ?? ""), "human_authorization_consumer_attestation_fingerprint_mismatch", issues);
  expect(authorization.consumerWorkerArtifactFingerprint === attestation?.consumerWorkerArtifactFingerprint, "human_authorization_consumer_artifact_fingerprint_mismatch", issues);
  expect(authorization.consumerPolicyFingerprint === phase44ConsumerPolicyFingerprint(), "human_authorization_policy_fingerprint_mismatch", issues);
  const confirmedAt = Date.parse(authorization.confirmedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  expect(Number.isFinite(confirmedAt) && Number.isFinite(expiresAt), "human_authorization_timestamp_invalid", issues);
  expect(confirmedAt <= now && now - confirmedAt <= gate.maximumHumanAuthorizationAgeSeconds * 1000, "human_authorization_not_immediate", issues);
  expect(expiresAt > now, "human_authorization_expired", issues);
  expect(expiresAt > confirmedAt && expiresAt - confirmedAt <= gate.maximumHumanAuthorizationValiditySeconds * 1000, "human_authorization_validity_invalid", issues);
}

export function validatePhase44AtomicConsumerWorkerSources(input, now = Date.now()) {
  const issues = [];
  validatePermit(input?.atomicReplayExecutionPermit, input?.rawAtomicReplayExecutionPermit, now, issues);
  validateConsumerAttestation(input?.reviewedAtomicConsumerWorkerAttestation, input?.rawReviewedAtomicConsumerWorkerAttestation, now, issues);
  validateHumanAuthorization(
    input?.immediateHumanAuthorization,
    input?.rawImmediateHumanAuthorization,
    input?.rawAtomicReplayExecutionPermit,
    input?.atomicReplayExecutionPermit,
    input?.rawReviewedAtomicConsumerWorkerAttestation,
    input?.reviewedAtomicConsumerWorkerAttestation,
    now,
    issues
  );
  for (const value of [input?.atomicReplayExecutionPermit, input?.reviewedAtomicConsumerWorkerAttestation, input?.immediateHumanAuthorization]) {
    issues.push(...findSensitiveEvidence(value));
  }
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function preparePhase44AtomicConsumerWorker(input, now = Date.now()) {
  const validation = validatePhase44AtomicConsumerWorkerSources(input, now);
  const approved = validation.approved;
  const permitFingerprint = approved ? sha256(input.rawAtomicReplayExecutionPermit) : null;
  const attestationFingerprint = approved ? sha256(input.rawReviewedAtomicConsumerWorkerAttestation) : null;
  const authorizationFingerprint = approved ? sha256(input.rawImmediateHumanAuthorization) : null;
  const policyFingerprint = approved ? phase44ConsumerPolicyFingerprint() : null;
  const consumerSessionFingerprint = approved
    ? sha256(`${permitFingerprint}:${attestationFingerprint}:${authorizationFingerprint}:${policyFingerprint}:${input.atomicReplayExecutionPermit.permitSessionFingerprint}:${input.reviewedAtomicConsumerWorkerAttestation.consumerWorkerArtifactFingerprint}`)
    : null;
  return {
    schemaVersion: "phase44.atomic-consumer-ephemeral-worker-plan.v1",
    phase: 44,
    sourcePhase: 43,
    status: approved ? "atomic_consumer_prepared_execution_blocked" : "atomic_consumer_rejected",
    preparedAt: new Date(now).toISOString(),
    expiresAt: approved ? new Date(now + gate.maximumConsumerPlanValiditySeconds * 1000).toISOString() : null,
    atomicReplayExecutionPermitFingerprint: permitFingerprint,
    permitSessionFingerprint: approved ? input.atomicReplayExecutionPermit.permitSessionFingerprint : null,
    stagingTargetFingerprint: approved ? input.atomicReplayExecutionPermit.stagingTargetFingerprint : null,
    reviewedConsumerWorkerAttestationFingerprint: attestationFingerprint,
    consumerWorkerArtifactFingerprint: approved ? input.reviewedAtomicConsumerWorkerAttestation.consumerWorkerArtifactFingerprint : null,
    immediateHumanAuthorizationFingerprint: authorizationFingerprint,
    consumerPolicyFingerprint: policyFingerprint,
    consumerSessionFingerprint,
    permitAccepted: approved,
    consumerWorkerAttestationAccepted: approved,
    humanAuthorizationAccepted: approved,
    atomicConsumerPlanPrepared: approved,
    currentState: approved ? "ATOMIC_CONSUMER_PREPARED_EXECUTION_BLOCKED" : "SEALED",
    consumptionState: "UNCONSUMED",
    consumptionVersion: 0,
    maximumConsumptionCount: 1,
    atomicReservationFields: approved ? [...gate.atomicReservationFields] : [],
    futureAtomicTransactionPlan: approved ? gate.futureAtomicTransactionPlan.map((step, index) => ({ sequence: index + 1, step, status: "blocked_future_runtime_transaction" })) : [],
    workerLifecycle: approved ? gate.workerLifecycle.map((state, index) => ({ sequence: index + 1, state, status: index < 2 ? "prepared_offline" : "blocked_future_runtime" })) : [],
    ambiguousCommitPolicy: "BLOCK_AND_RECONCILE_WITHOUT_RETRY",
    atomicConsumerAvailable: false,
    consumerArmed: false,
    executionPermitAvailable: false,
    executionPermitConsumed: false,
    oneTimeExecutionNonceConsumed: false,
    supervisorStarted: false,
    adapterExecuted: false,
    replayExecuted: false,
    blockedReason: approved ? "runtime_transaction_boundary_and_final_execution_authorization_missing" : "source_validation_failed",
    issues: validation.issues,
    releaseGates: {
      runtimeTransactionBoundaryAvailable: false,
      finalExecutionAuthorizationAvailable: false,
      permitConsumptionAllowed: false,
      workerArmAllowed: false,
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

const createFixture = (now = Date.parse("2026-07-19T21:00:00.000Z")) => {
  const atomicReplayExecutionPermit = {
    schemaVersion: "phase43.atomic-staging-replay-execution-permit.v1", phase: 43, sourcePhase: 42,
    status: "atomic_permit_prepared_consumption_blocked", preparedAt: "2026-07-19T20:59:00.000Z", expiresAt: "2026-07-19T21:01:00.000Z",
    ephemeralReplaySupervisorFingerprint: "1".repeat(64), supervisorSessionFingerprint: "2".repeat(64), stagingTargetFingerprint: "3".repeat(64),
    reviewedRuntimeWorkerAttestationFingerprint: "4".repeat(64), workerArtifactFingerprint: "5".repeat(64), immediateHumanAuthorizationFingerprint: "6".repeat(64),
    permitPolicyFingerprint: "7".repeat(64), permitSessionFingerprint: "8".repeat(64),
    supervisorAccepted: true, workerAttestationAccepted: true, humanAuthorizationAccepted: true, atomicExecutionPermitPrepared: true,
    currentState: "ATOMIC_PERMIT_PREPARED_CONSUMPTION_BLOCKED", consumptionState: "UNCONSUMED", consumptionVersion: 0,
    maximumConsumptionCount: 1, atomicCompareAndSwapRequired: true, allOrNothingReservationRequired: true,
    reservationPlan: gate.atomicReservationFields.map((field) => ({ field, expected: field === "consumptionVersion" ? 0 : false, next: field === "consumptionVersion" ? 1 : true, status: "blocked_future_atomic_consumer" })),
    executionPermitAvailable: false, executionPermitConsumed: false, oneTimeExecutionNonceConsumed: false,
    supervisorStarted: false, adapterExecuted: false, replayExecuted: false, blockedReason: "reviewed_atomic_consumer_missing", issues: [],
    releaseGates: { atomicConsumerAvailable: false, permitConsumptionAllowed: false, replayExecutionAllowed: false, stagingMigrationAllowed: false, productionMigrationAllowed: false, metaDeliveryAllowed: false, buildAllowed: false },
    databaseTouched: false, networkTouched: false, processSpawned: false, dockerTouched: false, remoteDatabaseTouched: false,
    stagingTouched: false, productionTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawAtomicReplayExecutionPermit = JSON.stringify(atomicReplayExecutionPermit);
  const reviewedAtomicConsumerWorkerAttestation = {
    schemaVersion: "phase44.reviewed-atomic-consumer-worker-attestation.v1", status: "reviewed_for_atomic_consumer_preparation",
    scope: "phase44_atomic_consumer_ephemeral_worker", reviewerRole: "SECURITY_REVIEWER", environment: "staging",
    reviewerReferenceFingerprint: "9".repeat(64), consumerWorkerArtifactFingerprint: "a".repeat(64),
    transactionReviewFingerprint: "b".repeat(64), reviewChecklistFingerprint: "c".repeat(64),
    reviewedAt: "2026-07-19T20:30:00.000Z", expiresAt: "2026-07-20T20:30:00.000Z",
    ...gate.requiredConsumerAttestationProperties
  };
  const rawReviewedAtomicConsumerWorkerAttestation = JSON.stringify(reviewedAtomicConsumerWorkerAttestation);
  const immediateHumanAuthorization = {
    schemaVersion: "phase44.immediate-human-consumer-preparation-authorization.v1", status: "confirmed_for_atomic_consumer_preparation",
    scope: "prepare_phase44_atomic_consumer_worker_only", decision: "CONFIRM_ATOMIC_CONSUMER_PREPARATION_ONLY",
    approverRole: "DIRETOR_DECISOR", environment: "staging", approverReferenceFingerprint: "d".repeat(64),
    atomicReplayExecutionPermitFingerprint: sha256(rawAtomicReplayExecutionPermit),
    permitSessionFingerprint: atomicReplayExecutionPermit.permitSessionFingerprint,
    stagingTargetFingerprint: atomicReplayExecutionPermit.stagingTargetFingerprint,
    reviewedConsumerWorkerAttestationFingerprint: sha256(rawReviewedAtomicConsumerWorkerAttestation),
    consumerWorkerArtifactFingerprint: reviewedAtomicConsumerWorkerAttestation.consumerWorkerArtifactFingerprint,
    consumerPolicyFingerprint: phase44ConsumerPolicyFingerprint(), confirmedAt: "2026-07-19T20:59:30.000Z", expiresAt: "2026-07-19T21:01:00.000Z",
    ...gate.requiredHumanAuthorizationProperties
  };
  return {
    now,
    input: {
      atomicReplayExecutionPermit, rawAtomicReplayExecutionPermit,
      reviewedAtomicConsumerWorkerAttestation, rawReviewedAtomicConsumerWorkerAttestation,
      immediateHumanAuthorization, rawImmediateHumanAuthorization: JSON.stringify(immediateHumanAuthorization)
    }
  };
};

export function selfTestPhase44AtomicConsumerWorker() {
  const fixture = createFixture();
  const clone = () => structuredClone(fixture.input);
  const cases = [
    ["baseline", (v) => v, true],
    ["permit-schema", (v) => { v.atomicReplayExecutionPermit.schemaVersion = "old"; return v; }, false],
    ["permit-phase", (v) => { v.atomicReplayExecutionPermit.phase = 42; return v; }, false],
    ["permit-status", (v) => { v.atomicReplayExecutionPermit.status = "consumed"; return v; }, false],
    ["permit-state", (v) => { v.atomicReplayExecutionPermit.currentState = "RUNNING"; return v; }, false],
    ["permit-age", (v) => { v.atomicReplayExecutionPermit.preparedAt = "2026-07-19T20:50:00.000Z"; return v; }, false],
    ["permit-future", (v) => { v.atomicReplayExecutionPermit.preparedAt = "2026-07-19T21:01:00.000Z"; return v; }, false],
    ["permit-expired", (v) => { v.atomicReplayExecutionPermit.expiresAt = "2026-07-19T20:59:59.000Z"; return v; }, false],
    ["permit-long-validity", (v) => { v.atomicReplayExecutionPermit.expiresAt = "2026-07-19T22:00:00.000Z"; return v; }, false],
    ["permit-consumed", (v) => { v.atomicReplayExecutionPermit.executionPermitConsumed = true; return v; }, false],
    ["nonce-consumed", (v) => { v.atomicReplayExecutionPermit.oneTimeExecutionNonceConsumed = true; return v; }, false],
    ["supervisor-started", (v) => { v.atomicReplayExecutionPermit.supervisorStarted = true; return v; }, false],
    ["adapter-executed", (v) => { v.atomicReplayExecutionPermit.adapterExecuted = true; return v; }, false],
    ["permit-version", (v) => { v.atomicReplayExecutionPermit.consumptionVersion = 1; return v; }, false],
    ["permit-count", (v) => { v.atomicReplayExecutionPermit.maximumConsumptionCount = 2; return v; }, false],
    ["permit-reservation", (v) => { v.atomicReplayExecutionPermit.reservationPlan.pop(); return v; }, false],
    ["permit-release", (v) => { v.atomicReplayExecutionPermit.releaseGates.permitConsumptionAllowed = true; return v; }, false],
    ["permit-touch", (v) => { v.atomicReplayExecutionPermit.stagingTouched = true; return v; }, false],
    ["attestation-schema", (v) => { v.reviewedAtomicConsumerWorkerAttestation.schemaVersion = "old"; return v; }, false],
    ["attestation-status", (v) => { v.reviewedAtomicConsumerWorkerAttestation.status = "unreviewed"; return v; }, false],
    ["attestation-role", (v) => { v.reviewedAtomicConsumerWorkerAttestation.reviewerRole = "CORRETOR"; return v; }, false],
    ["attestation-environment", (v) => { v.reviewedAtomicConsumerWorkerAttestation.environment = "production"; return v; }, false],
    ["attestation-not-reviewed", (v) => { v.reviewedAtomicConsumerWorkerAttestation.reviewed = false; return v; }, false],
    ["attestation-definer", (v) => { v.reviewedAtomicConsumerWorkerAttestation.securityDefinerAbsent = false; return v; }, false],
    ["attestation-rls", (v) => { v.reviewedAtomicConsumerWorkerAttestation.rlsAndTenantScopePreserved = false; return v; }, false],
    ["attestation-retry", (v) => { v.reviewedAtomicConsumerWorkerAttestation.automaticRetryAfterAmbiguousCommitForbidden = false; return v; }, false],
    ["attestation-expired", (v) => { v.reviewedAtomicConsumerWorkerAttestation.expiresAt = "2026-07-19T20:59:00.000Z"; return v; }, false],
    ["attestation-too-old", (v) => { v.reviewedAtomicConsumerWorkerAttestation.reviewedAt = "2026-07-18T20:00:00.000Z"; return v; }, false],
    ["attestation-validity", (v) => { v.reviewedAtomicConsumerWorkerAttestation.expiresAt = "2026-07-22T20:30:00.000Z"; return v; }, false],
    ["authorization-schema", (v) => { v.immediateHumanAuthorization.schemaVersion = "old"; return v; }, false],
    ["authorization-scope", (v) => { v.immediateHumanAuthorization.scope = "execute"; return v; }, false],
    ["authorization-decision", (v) => { v.immediateHumanAuthorization.decision = "EXECUTE"; return v; }, false],
    ["authorization-role", (v) => { v.immediateHumanAuthorization.approverRole = "CORRETOR"; return v; }, false],
    ["authorization-aal", (v) => { v.immediateHumanAuthorization.authenticationAssuranceLevel = "aal1"; return v; }, false],
    ["authorization-source", (v) => { v.immediateHumanAuthorization.trustedAuthorizationSource = "user_metadata"; return v; }, false],
    ["authorization-execution", (v) => { v.immediateHumanAuthorization.executionConfirmed = true; return v; }, false],
    ["authorization-consumption", (v) => { v.immediateHumanAuthorization.permitConsumptionConfirmed = true; return v; }, false],
    ["authorization-permit-chain", (v) => { v.immediateHumanAuthorization.atomicReplayExecutionPermitFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-session-chain", (v) => { v.immediateHumanAuthorization.permitSessionFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-target-chain", (v) => { v.immediateHumanAuthorization.stagingTargetFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-attestation-chain", (v) => { v.immediateHumanAuthorization.reviewedConsumerWorkerAttestationFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-artifact-chain", (v) => { v.immediateHumanAuthorization.consumerWorkerArtifactFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-policy-chain", (v) => { v.immediateHumanAuthorization.consumerPolicyFingerprint = "0".repeat(64); return v; }, false],
    ["authorization-old", (v) => { v.immediateHumanAuthorization.confirmedAt = "2026-07-19T20:58:00.000Z"; return v; }, false],
    ["authorization-future", (v) => { v.immediateHumanAuthorization.confirmedAt = "2026-07-19T21:01:00.000Z"; return v; }, false],
    ["authorization-expired", (v) => { v.immediateHumanAuthorization.expiresAt = "2026-07-19T20:59:00.000Z"; return v; }, false],
    ["authorization-too-long", (v) => { v.immediateHumanAuthorization.expiresAt = "2026-07-19T21:10:00.000Z"; return v; }, false],
    ["credential-key", (v) => { v.immediateHumanAuthorization.apiKey = "placeholder"; return v; }, false],
    ["raw-session", (v) => { v.immediateHumanAuthorization.rawSession = "placeholder"; return v; }, false],
    ["database-url", (v) => { v.reviewedAtomicConsumerWorkerAttestation.notes = "postgresql://redacted"; return v; }, false],
    ["data-rows", (v) => { v.atomicReplayExecutionPermit.records = [{ id: 1 }]; return v; }, false]
  ];
  const results = cases.map(([name, mutate, expected]) => {
    const value = mutate(clone());
    return { name, passed: validatePhase44AtomicConsumerWorkerSources(value, fixture.now).approved === expected };
  });
  const prepared = preparePhase44AtomicConsumerWorker(fixture.input, fixture.now);
  results.push({ name: "consumer-prepared", passed: prepared.atomicConsumerPlanPrepared === true && prepared.status === "atomic_consumer_prepared_execution_blocked" });
  results.push({ name: "plan-short-lived", passed: Date.parse(prepared.expiresAt) - Date.parse(prepared.preparedAt) === 120000 });
  results.push({ name: "five-atomic-fields", passed: exact(prepared.atomicReservationFields, gate.atomicReservationFields) });
  results.push({ name: "twelve-future-steps", passed: prepared.futureAtomicTransactionPlan.length === 12 && prepared.futureAtomicTransactionPlan.every((item) => item.status === "blocked_future_runtime_transaction") });
  results.push({ name: "commit-unknown-blocks", passed: prepared.ambiguousCommitPolicy === "BLOCK_AND_RECONCILE_WITHOUT_RETRY" });
  results.push({ name: "consumer-worker-unavailable", passed: prepared.atomicConsumerAvailable === false && prepared.consumerArmed === false });
  results.push({ name: "permit-nonce-unconsumed", passed: prepared.executionPermitConsumed === false && prepared.oneTimeExecutionNonceConsumed === false });
  results.push({ name: "supervisor-adapter-unstarted", passed: prepared.supervisorStarted === false && prepared.adapterExecuted === false });
  results.push({ name: "replay-blocked", passed: prepared.replayExecuted === false && prepared.releaseGates.replayExecutionAllowed === false });
  results.push({ name: "all-release-gates-closed", passed: Object.values(prepared.releaseGates).every((value) => value === false) });
  results.push({ name: "no-operational-touch", passed: prepared.databaseTouched === false && prepared.networkTouched === false && prepared.processSpawned === false && prepared.stagingTouched === false && prepared.productionTouched === false });
  const failures = results.filter((result) => !result.passed).map((result) => result.name);
  return { passed: failures.length === 0, caseCount: results.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase44AtomicConsumerWorker();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}
