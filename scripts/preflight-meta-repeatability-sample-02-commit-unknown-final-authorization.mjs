import { createHash } from "node:crypto";
import gate from "../config/meta-repeatability-sample-02-commit-unknown-final-authorization-gate.json" with { type: "json" };

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sha = /^[a-f0-9]{64}$/;
const add = (condition, issue, issues) => { if (!condition) issues.push(issue); };
const policy = () => ({ schemaVersion: gate.schemaVersion, reconciliationRules: gate.reconciliationRules, requiredBlockedState: gate.requiredBlockedState });
export const phase45ControlPolicyFingerprint = () => hash(JSON.stringify(policy()));

function sensitive(value, path = "root", issues = []) {
  if (Array.isArray(value)) { value.forEach((entry, index) => sensitive(entry, `${path}[${index}]`, issues)); return issues; }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (/(password|secret|token|access.?key|api.?key|service.?role|database.?url|connection.?string|rawSession|jwt|nonceValue|permitValue|shell|projectRef)/i.test(key) && typeof entry !== "boolean") issues.push(`sensitive_key:${path}.${key}`);
      if (/^(rows|records|leads|customers|profiles|users|emails|phones|cpfs|payload)$/i.test(key)) issues.push(`data_rows_key:${path}.${key}`);
      sensitive(entry, `${path}.${key}`, issues);
    }
  } else if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+|supabase\s+db\s+(?:push|reset)|--linked)/i.test(value)) issues.push(`sensitive_value:${path}`);
  return issues;
}

function time(value, maxAge, maxValidity, now, label, issues) {
  const created = Date.parse(value.createdAt);
  const expires = Date.parse(value.expiresAt);
  add(Number.isFinite(created) && Number.isFinite(expires), `${label}_timestamp_invalid`, issues);
  add(created <= now && now - created <= maxAge * 1000, `${label}_expired_by_age`, issues);
  add(expires > now, `${label}_expired`, issues);
  add(expires > created && expires - created <= maxValidity * 1000, `${label}_validity_invalid`, issues);
}

export function validatePhase45FinalExecutionControl(input, now = Date.now()) {
  const issues = [];
  const plan = input?.atomicConsumerPlan;
  const attestation = input?.reviewedTransactionBoundaryAttestation;
  const authorization = input?.immediateFinalExecutionAuthorization;
  const rawPlan = input?.rawAtomicConsumerPlan;
  const rawAttestation = input?.rawReviewedTransactionBoundaryAttestation;
  const rawAuthorization = input?.rawImmediateFinalExecutionAuthorization;
  for (const [label, raw] of [["consumer_plan", rawPlan], ["transaction_attestation", rawAttestation], ["final_authorization", rawAuthorization]]) add(typeof raw === "string" && Buffer.byteLength(raw) > 0 && Buffer.byteLength(raw) <= gate.maximumInputBytes, `${label}_raw_invalid`, issues);
  add(plan && typeof plan === "object" && !Array.isArray(plan), "consumer_plan_object_required", issues);
  add(attestation && typeof attestation === "object" && !Array.isArray(attestation), "transaction_attestation_object_required", issues);
  add(authorization && typeof authorization === "object" && !Array.isArray(authorization), "final_authorization_object_required", issues);
  if (plan && typeof plan === "object") {
    const source = gate.requiredSources.atomicConsumerPlan;
    for (const key of ["schemaVersion", "phase", "status", "currentState", "blockedReason"]) add(plan[key] === source[key], `consumer_plan_mismatch:${key}`, issues);
    time({ createdAt: plan.preparedAt, expiresAt: plan.expiresAt }, gate.maximumConsumerPlanAgeSeconds, gate.maximumConsumerPlanAgeSeconds, now, "consumer_plan", issues);
    for (const [key, expected] of Object.entries(gate.requiredConsumerPlanState)) add(plan[key] === expected, `consumer_plan_state_mismatch:${key}`, issues);
    for (const key of ["permitSessionFingerprint", "stagingTargetFingerprint", "consumerWorkerArtifactFingerprint", "consumerPolicyFingerprint", "consumerSessionFingerprint"]) add(sha.test(plan[key] ?? ""), `consumer_plan_fingerprint_invalid:${key}`, issues);
  }
  if (attestation && typeof attestation === "object") {
    const source = gate.requiredSources.reviewedTransactionBoundaryAttestation;
    for (const key of ["schemaVersion", "status", "scope", "reviewerRole", "environment"]) add(attestation[key] === source[key], `transaction_attestation_mismatch:${key}`, issues);
    for (const [key, expected] of Object.entries(gate.requiredTransactionAttestationProperties)) add(attestation[key] === expected, `transaction_attestation_property_mismatch:${key}`, issues);
    time({ createdAt: attestation.reviewedAt, expiresAt: attestation.expiresAt }, gate.maximumTransactionAttestationAgeSeconds, gate.maximumTransactionAttestationAgeSeconds, now, "transaction_attestation", issues);
    for (const key of ["reviewerReferenceFingerprint", "transactionBoundaryFingerprint", "reconciliationArtifactFingerprint", "reviewChecklistFingerprint"]) add(sha.test(attestation[key] ?? ""), `transaction_attestation_fingerprint_invalid:${key}`, issues);
  }
  if (authorization && typeof authorization === "object") {
    const source = gate.requiredSources.immediateFinalExecutionAuthorization;
    for (const key of ["schemaVersion", "status", "scope", "decision", "approverRole", "environment"]) add(authorization[key] === source[key], `final_authorization_mismatch:${key}`, issues);
    for (const [key, expected] of Object.entries(gate.requiredFinalAuthorizationProperties)) add(authorization[key] === expected, `final_authorization_property_mismatch:${key}`, issues);
    add(authorization.atomicConsumerPlanFingerprint === hash(rawPlan ?? ""), "final_authorization_plan_fingerprint_mismatch", issues);
    add(authorization.transactionBoundaryAttestationFingerprint === hash(rawAttestation ?? ""), "final_authorization_attestation_fingerprint_mismatch", issues);
    add(authorization.permitSessionFingerprint === plan?.permitSessionFingerprint, "final_authorization_permit_session_mismatch", issues);
    add(authorization.stagingTargetFingerprint === plan?.stagingTargetFingerprint, "final_authorization_target_mismatch", issues);
    add(authorization.consumerWorkerArtifactFingerprint === plan?.consumerWorkerArtifactFingerprint, "final_authorization_worker_mismatch", issues);
    add(authorization.consumerPolicyFingerprint === plan?.consumerPolicyFingerprint, "final_authorization_consumer_policy_mismatch", issues);
    add(authorization.finalControlPolicyFingerprint === phase45ControlPolicyFingerprint(), "final_authorization_control_policy_mismatch", issues);
    add(sha.test(authorization.approverReferenceFingerprint ?? ""), "final_authorization_approver_fingerprint_invalid", issues);
    time({ createdAt: authorization.confirmedAt, expiresAt: authorization.expiresAt }, gate.maximumFinalAuthorizationAgeSeconds, gate.maximumFinalAuthorizationValiditySeconds, now, "final_authorization", issues);
  }
  for (const value of [plan, attestation, authorization]) issues.push(...sensitive(value));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function preparePhase45FinalExecutionControl(input, now = Date.now()) {
  const validation = validatePhase45FinalExecutionControl(input, now);
  const approved = validation.approved;
  const planFingerprint = approved ? hash(input.rawAtomicConsumerPlan) : null;
  const attestationFingerprint = approved ? hash(input.rawReviewedTransactionBoundaryAttestation) : null;
  const authorizationFingerprint = approved ? hash(input.rawImmediateFinalExecutionAuthorization) : null;
  return { schemaVersion: "phase45.final-execution-control-plan.v1", phase: 45, sourcePhase: 44, status: approved ? "final_execution_control_prepared_execution_blocked" : "final_execution_control_rejected", preparedAt: new Date(now).toISOString(), expiresAt: approved ? new Date(now + 120000).toISOString() : null, atomicConsumerPlanFingerprint: planFingerprint, transactionBoundaryAttestationFingerprint: attestationFingerprint, finalExecutionAuthorizationFingerprint: authorizationFingerprint, permitSessionFingerprint: approved ? input.atomicConsumerPlan.permitSessionFingerprint : null, stagingTargetFingerprint: approved ? input.atomicConsumerPlan.stagingTargetFingerprint : null, consumerWorkerArtifactFingerprint: approved ? input.atomicConsumerPlan.consumerWorkerArtifactFingerprint : null, consumerPolicyFingerprint: approved ? input.atomicConsumerPlan.consumerPolicyFingerprint : null, controlSessionFingerprint: approved ? hash(`${planFingerprint}:${attestationFingerprint}:${authorizationFingerprint}:${phase45ControlPolicyFingerprint()}`) : null, consumerPlanAccepted: approved, transactionBoundaryAttestationAccepted: approved, finalExecutionAuthorizationAccepted: approved, finalExecutionControlPrepared: approved, currentState: approved ? "FINAL_EXECUTION_CONTROL_PREPARED_EXECUTION_BLOCKED" : "SEALED", commitUnknownPolicy: "READ_ONLY_RECONCILE_AND_HALT_WITHOUT_RETRY", finalExecutionControlAvailable: false, commitUnknownReconcilerAvailable: false, executionPermitAvailable: false, executionPermitConsumed: false, oneTimeExecutionNonceConsumed: false, consumerArmed: false, supervisorStarted: false, adapterExecuted: false, replayExecuted: false, blockedReason: approved ? "exactly_one_reservation_evidence_and_runtime_execution_boundary_missing" : "source_validation_failed", issues: validation.issues, releaseGates: { runtimeBoundaryVerified: false, exactlyOneReservationProven: false, finalExecutionAuthorizationAvailable: false, permitConsumptionAllowed: false, workerArmAllowed: false, replayExecutionAllowed: false, stagingMutationAllowed: false, productionMutationAllowed: false, metaDeliveryAllowed: false, buildAllowed: false }, databaseTouched: false, networkTouched: false, processSpawned: false, stagingTouched: false, productionTouched: false, metaTouched: false, buildExecuted: false };
}

function fixture(now = Date.parse("2026-07-19T22:00:00.000Z")) {
  const atomicConsumerPlan = { schemaVersion: "phase44.atomic-consumer-ephemeral-worker-plan.v1", phase: 44, status: "atomic_consumer_prepared_execution_blocked", currentState: "ATOMIC_CONSUMER_PREPARED_EXECUTION_BLOCKED", blockedReason: "runtime_transaction_boundary_and_final_execution_authorization_missing", preparedAt: "2026-07-19T21:59:00.000Z", expiresAt: "2026-07-19T22:01:00.000Z", permitAccepted: true, consumerWorkerAttestationAccepted: true, humanAuthorizationAccepted: true, atomicConsumerPlanPrepared: true, atomicConsumerAvailable: false, consumerArmed: false, executionPermitConsumed: false, oneTimeExecutionNonceConsumed: false, supervisorStarted: false, adapterExecuted: false, replayExecuted: false, consumptionState: "UNCONSUMED", consumptionVersion: 0, maximumConsumptionCount: 1, ambiguousCommitPolicy: "BLOCK_AND_RECONCILE_WITHOUT_RETRY", permitSessionFingerprint: "1".repeat(64), stagingTargetFingerprint: "2".repeat(64), consumerWorkerArtifactFingerprint: "3".repeat(64), consumerPolicyFingerprint: "4".repeat(64), consumerSessionFingerprint: "5".repeat(64) };
  const rawAtomicConsumerPlan = JSON.stringify(atomicConsumerPlan);
  const reviewedTransactionBoundaryAttestation = { schemaVersion: "phase45.reviewed-transaction-boundary-attestation.v1", status: "reviewed_for_final_authorization_preparation", scope: "phase45_commit_unknown_reconciliation", reviewerRole: "SECURITY_REVIEWER", environment: "staging", reviewerReferenceFingerprint: "6".repeat(64), transactionBoundaryFingerprint: "7".repeat(64), reconciliationArtifactFingerprint: "8".repeat(64), reviewChecklistFingerprint: "9".repeat(64), reviewedAt: "2026-07-19T21:00:00.000Z", expiresAt: "2026-07-20T21:00:00.000Z", ...gate.requiredTransactionAttestationProperties };
  const rawReviewedTransactionBoundaryAttestation = JSON.stringify(reviewedTransactionBoundaryAttestation);
  const immediateFinalExecutionAuthorization = { schemaVersion: "phase45.immediate-final-execution-authorization.v1", status: "confirmed_for_final_execution_control_preparation", scope: "prepare_final_execution_control_only", decision: "CONFIRM_FINAL_EXECUTION_CONTROL_PREPARATION_ONLY", approverRole: "DIRETOR_DECISOR", environment: "staging", approverReferenceFingerprint: "a".repeat(64), atomicConsumerPlanFingerprint: hash(rawAtomicConsumerPlan), transactionBoundaryAttestationFingerprint: hash(rawReviewedTransactionBoundaryAttestation), permitSessionFingerprint: atomicConsumerPlan.permitSessionFingerprint, stagingTargetFingerprint: atomicConsumerPlan.stagingTargetFingerprint, consumerWorkerArtifactFingerprint: atomicConsumerPlan.consumerWorkerArtifactFingerprint, consumerPolicyFingerprint: atomicConsumerPlan.consumerPolicyFingerprint, finalControlPolicyFingerprint: phase45ControlPolicyFingerprint(), confirmedAt: "2026-07-19T21:59:30.000Z", expiresAt: "2026-07-19T22:01:00.000Z", ...gate.requiredFinalAuthorizationProperties };
  return { now, input: { atomicConsumerPlan, rawAtomicConsumerPlan, reviewedTransactionBoundaryAttestation, rawReviewedTransactionBoundaryAttestation, immediateFinalExecutionAuthorization, rawImmediateFinalExecutionAuthorization: JSON.stringify(immediateFinalExecutionAuthorization) } };
}
export function selfTestPhase45FinalExecutionControl() {
  const base = fixture(); const clone = () => structuredClone(base.input);
  const cases = [["baseline", (v) => v, true], ["plan-consumed", (v) => { v.atomicConsumerPlan.executionPermitConsumed = true; return v; }, false], ["plan-expired", (v) => { v.atomicConsumerPlan.expiresAt = "2026-07-19T21:59:00.000Z"; return v; }, false], ["attestation-definer", (v) => { v.reviewedTransactionBoundaryAttestation.securityDefinerAbsent = false; return v; }, false], ["attestation-retry", (v) => { v.reviewedTransactionBoundaryAttestation.automaticRetryAfterAmbiguousCommitForbidden = false; return v; }, false], ["authorization-aal", (v) => { v.immediateFinalExecutionAuthorization.authenticationAssuranceLevel = "aal1"; return v; }, false], ["authorization-execute", (v) => { v.immediateFinalExecutionAuthorization.executionConsentConfirmed = true; return v; }, false], ["authorization-future", (v) => { v.immediateFinalExecutionAuthorization.confirmedAt = "2026-07-19T22:01:00.000Z"; return v; }, false], ["authorization-chain", (v) => { v.immediateFinalExecutionAuthorization.consumerPolicyFingerprint = "0".repeat(64); return v; }, false], ["secret", (v) => { v.immediateFinalExecutionAuthorization.apiKey = "x"; return v; }, false], ["data", (v) => { v.atomicConsumerPlan.records = [{}]; return v; }, false]];
  const results = cases.map(([name, mutate, expected]) => ({ name, passed: validatePhase45FinalExecutionControl(mutate(clone()), base.now).approved === expected }));
  const prepared = preparePhase45FinalExecutionControl(base.input, base.now);
  results.push({ name: "prepared", passed: prepared.finalExecutionControlPrepared && prepared.currentState === "FINAL_EXECUTION_CONTROL_PREPARED_EXECUTION_BLOCKED" });
  results.push({ name: "short", passed: Date.parse(prepared.expiresAt) - Date.parse(prepared.preparedAt) === 120000 });
  results.push({ name: "blocked", passed: !prepared.executionPermitConsumed && !prepared.consumerArmed && !prepared.replayExecuted && Object.values(prepared.releaseGates).every((v) => v === false) });
  const failures = results.filter((result) => !result.passed).map((result) => result.name); return { passed: failures.length === 0, caseCount: results.length, failures };
}
if (process.argv.includes("--self-test")) { const result = selfTestPhase45FinalExecutionControl(); console.log(JSON.stringify(result, null, 2)); if (!result.passed) process.exit(1); }
