import { createHash } from "node:crypto";
import gate from "../config/meta-repeatability-sample-02-ephemeral-staging-replay-supervisor-gate.json" with { type: "json" };

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const shaPattern = /^[a-f0-9]{64}$/;
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const emergencyRollbackState = "EMERGENCY_ROLLBACK_REQUIRED";
const destroyingTargetState = "DESTROYING_TARGET_REQUIRED";

const policyMaterial = () => ({
  schemaVersion: gate.schemaVersion,
  stateMachineVersion: gate.stateMachineVersion,
  orderedReplayStages: gate.orderedReplayStages,
  stageStates: gate.stageStates,
  stateMachine: gate.stateMachine
});

export const phase42SupervisorPolicyFingerprint = () => sha256(JSON.stringify(policyMaterial()));

function findSensitiveEvidence(value, path = "root", issues = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/(password|secret|token|authorization|database.?url|connection.?string|api.?key|access.?key|service.?role|credential.*value|nonceValue|rawNonce|command|shell|projectRef|executionPermitValue|^(?:rows|records|recordSet|dataRows|leadData|customerData)$)/i.test(key)) {
        issues.push(`sensitive_key:${path}.${key}`);
      }
      findSensitiveEvidence(item, `${path}.${key}`, issues);
    }
    return issues;
  }
  if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+|supabase\s+db\s+(?:push|reset)|--linked|\b(?:select|insert|update|delete|alter|drop|create)\s+.+\b(?:from|into|table|schema)\b)/i.test(value)) {
    issues.push(`sensitive_value:${path}`);
  }
  return issues;
}

const expect = (condition, issue, issues) => { if (!condition) issues.push(issue); };

function validateReplayAdapter(adapter, rawAdapter, now, issues) {
  const required = gate.requiredSources.oneTimeReplayAdapter;
  expect(adapter && typeof adapter === "object" && !Array.isArray(adapter), "phase41_replay_adapter_object_required", issues);
  if (!adapter || typeof adapter !== "object" || Array.isArray(adapter)) return;
  expect(adapter.schemaVersion === required.schemaVersion, "phase41_replay_adapter_schema_mismatch", issues);
  expect(adapter.phase === required.phase && adapter.sourcePhase === required.sourcePhase, "phase41_replay_adapter_phase_mismatch", issues);
  expect(adapter.status === required.status && adapter.blockedReason === required.blockedReason, "phase41_replay_adapter_status_mismatch", issues);
  const preparedAt = Date.parse(adapter.preparedAt);
  expect(Number.isFinite(preparedAt) && preparedAt <= now, "phase41_replay_adapter_prepared_at_invalid", issues);
  expect(Number.isFinite(preparedAt) && now - preparedAt <= gate.maximumAdapterAgeSeconds * 1000, "phase41_replay_adapter_expired", issues);
  expect(typeof rawAdapter === "string" && Buffer.byteLength(rawAdapter) <= gate.maximumInputBytes, "phase41_replay_adapter_raw_invalid", issues);
  for (const field of [
    "executionPacketFingerprint", "immediateHumanConfirmationFingerprint", "stagingTargetFingerprint",
    "nonceFingerprint", "adapterSessionFingerprint"
  ]) expect(shaPattern.test(adapter[field] ?? ""), `phase41_replay_adapter_fingerprint_invalid:${field}`, issues);
  for (const [field, expected] of Object.entries(gate.requiredAdapterState)) {
    expect(adapter[field] === expected, `phase41_replay_adapter_state_mismatch:${field}`, issues);
  }
  expect(exact(adapter.orderedReplayStages, gate.orderedReplayStages), "phase41_replay_adapter_stage_order_mismatch", issues);
  expect(Array.isArray(adapter.stagePlan) && adapter.stagePlan.length === gate.orderedReplayStages.length, "phase41_replay_adapter_stage_plan_invalid", issues);
  if (Array.isArray(adapter.stagePlan)) {
    adapter.stagePlan.forEach((entry, index) => {
      expect(entry?.sequence === index + 1, `phase41_replay_adapter_stage_sequence_invalid:${index}`, issues);
      expect(entry?.stage === gate.orderedReplayStages[index], `phase41_replay_adapter_stage_identifier_invalid:${index}`, issues);
      expect(entry?.executionMode === "future_ephemeral_supervisor" && entry?.status === "blocked", `phase41_replay_adapter_stage_state_invalid:${index}`, issues);
    });
  }
  expect(adapter.releaseGates && Object.values(adapter.releaseGates).every((value) => value === false), "phase41_replay_adapter_release_gate_open", issues);
  expect(adapter.databaseTouched === false && adapter.networkTouched === false && adapter.processSpawned === false, "phase41_replay_adapter_local_touch_claimed", issues);
  expect(adapter.remoteDatabaseTouched === false && adapter.stagingTouched === false && adapter.productionTouched === false, "phase41_replay_adapter_remote_touch_claimed", issues);
  expect(adapter.metaTouched === false && adapter.buildExecuted === false, "phase41_replay_adapter_meta_or_build_claimed", issues);
}

function validateFinalHumanValidation(validation, rawAdapter, adapter, now, issues) {
  const required = gate.requiredSources.finalHumanValidation;
  expect(validation && typeof validation === "object" && !Array.isArray(validation), "final_human_validation_object_required", issues);
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) return;
  expect(validation.schemaVersion === required.schemaVersion, "final_human_validation_schema_mismatch", issues);
  expect(validation.status === required.status && validation.scope === required.scope, "final_human_validation_status_or_scope_mismatch", issues);
  expect(validation.decision === required.decision && validation.approverRole === required.approverRole, "final_human_validation_decision_or_role_mismatch", issues);
  expect(validation.environment === required.environment, "final_human_validation_environment_mismatch", issues);
  for (const [field, expected] of Object.entries(gate.requiredFinalValidationProperties)) {
    expect(validation[field] === expected, `final_human_validation_property_mismatch:${field}`, issues);
  }
  expect(shaPattern.test(validation.approverReferenceFingerprint ?? ""), "final_human_validation_approver_fingerprint_invalid", issues);
  expect(validation.oneTimeReplayAdapterFingerprint === sha256(rawAdapter ?? ""), "final_human_validation_adapter_fingerprint_mismatch", issues);
  expect(validation.adapterSessionFingerprint === adapter?.adapterSessionFingerprint, "final_human_validation_adapter_session_mismatch", issues);
  expect(validation.stagingTargetFingerprint === adapter?.stagingTargetFingerprint, "final_human_validation_target_fingerprint_mismatch", issues);
  expect(validation.supervisorPolicyFingerprint === phase42SupervisorPolicyFingerprint(), "final_human_validation_policy_fingerprint_mismatch", issues);
  const confirmedAt = Date.parse(validation.confirmedAt);
  const expiresAt = Date.parse(validation.expiresAt);
  expect(Number.isFinite(confirmedAt) && Number.isFinite(expiresAt), "final_human_validation_timestamp_invalid", issues);
  expect(confirmedAt <= now && now - confirmedAt <= gate.maximumFinalValidationAgeSeconds * 1000, "final_human_validation_not_immediate", issues);
  expect(expiresAt > now, "final_human_validation_expired", issues);
  expect(expiresAt > confirmedAt && expiresAt - confirmedAt <= gate.maximumFinalValidationValiditySeconds * 1000, "final_human_validation_validity_invalid", issues);
}

export function validatePhase42EphemeralStagingReplaySupervisorSources(input, now = Date.now()) {
  const issues = [];
  validateReplayAdapter(input?.oneTimeReplayAdapter, input?.rawOneTimeReplayAdapter, now, issues);
  validateFinalHumanValidation(input?.finalHumanValidation, input?.rawOneTimeReplayAdapter, input?.oneTimeReplayAdapter, now, issues);
  for (const value of [input?.oneTimeReplayAdapter, input?.finalHumanValidation]) issues.push(...findSensitiveEvidence(value));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

const transitionPlan = () => gate.orderedReplayStages.map((stage, index) => ({
  sequence: index + 1,
  stage,
  state: gate.stageStates[index],
  onSuccess: index === gate.orderedReplayStages.length - 1 ? gate.stateMachine.terminalState : gate.stageStates[index + 1],
  onFailure: index === gate.orderedReplayStages.length - 1 ? gate.stateMachine.cleanupState : gate.stateMachine.failureState,
  onTimeout: index === gate.orderedReplayStages.length - 1 ? gate.stateMachine.cleanupState : gate.stateMachine.failureState,
  maximumAttempts: gate.stateMachine.maximumAttemptsPerStage,
  timeoutSeconds: gate.maximumStageDurationSeconds,
  executionMode: "future_reviewed_runtime_worker",
  status: "blocked"
}));

const emergencyTransitions = () => [
  { from: gate.stateMachine.failureState, to: emergencyRollbackState, trigger: "failure_acknowledged", status: "blocked" },
  { from: emergencyRollbackState, to: destroyingTargetState, trigger: "rollback_completed_or_failed", status: "blocked" },
  { from: destroyingTargetState, to: gate.stateMachine.terminalState, trigger: "destruction_verified", status: "blocked" },
  { from: destroyingTargetState, to: destroyingTargetState, trigger: "destruction_not_verified", status: "blocked_manual_escalation_required" }
];

export function preparePhase42EphemeralStagingReplaySupervisor(input, now = Date.now()) {
  const validation = validatePhase42EphemeralStagingReplaySupervisorSources(input, now);
  const approved = validation.approved;
  const adapterFingerprint = approved ? sha256(input.rawOneTimeReplayAdapter) : null;
  const finalHumanValidationFingerprint = approved ? sha256(input.rawFinalHumanValidation) : null;
  const supervisorPolicyFingerprint = approved ? phase42SupervisorPolicyFingerprint() : null;
  const supervisorSessionFingerprint = approved
    ? sha256(`${adapterFingerprint}:${finalHumanValidationFingerprint}:${supervisorPolicyFingerprint}:${input.oneTimeReplayAdapter.adapterSessionFingerprint}:${input.oneTimeReplayAdapter.stagingTargetFingerprint}`)
    : null;
  return {
    schemaVersion: "phase42.ephemeral-staging-replay-supervisor.v1",
    stateMachineVersion: gate.stateMachineVersion,
    phase: 42,
    sourcePhase: 41,
    status: approved ? "supervisor_prepared_execution_blocked" : "supervisor_rejected",
    preparedAt: new Date(now).toISOString(),
    oneTimeReplayAdapterFingerprint: adapterFingerprint,
    adapterSessionFingerprint: approved ? input.oneTimeReplayAdapter.adapterSessionFingerprint : null,
    stagingTargetFingerprint: approved ? input.oneTimeReplayAdapter.stagingTargetFingerprint : null,
    finalHumanValidationFingerprint,
    supervisorPolicyFingerprint,
    supervisorSessionFingerprint,
    adapterAccepted: approved,
    finalHumanValidationAccepted: approved,
    supervisorPrepared: approved,
    currentState: approved ? gate.stateMachine.preparedState : gate.stateMachine.initialState,
    orderedReplayStages: approved ? [...gate.orderedReplayStages] : [],
    transitionPlan: approved ? transitionPlan() : [],
    emergencyTransitions: approved ? emergencyTransitions() : [],
    stopOnError: true,
    rollbackRequiredAfterFailure: true,
    targetDestructionRequired: true,
    executionPermitConsumed: false,
    oneTimeExecutionNonceConsumed: false,
    supervisorStarted: false,
    adapterExecuted: false,
    replayExecuted: false,
    blockedReason: approved ? "runtime_worker_and_atomic_execution_permit_missing" : "source_validation_failed",
    issues: validation.issues,
    releaseGates: {
      runtimeWorkerAvailable: false,
      executionPermitAvailable: false,
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

const createFixture = (now = Date.parse("2026-07-19T20:10:00.000Z")) => {
  const adapter = {
    schemaVersion: "phase41.isolated-staging-one-time-replay-adapter.v1", phase: 41, sourcePhase: 40,
    status: "adapter_prepared_execution_blocked", preparedAt: "2026-07-19T20:05:00.000Z",
    executionPacketFingerprint: "1".repeat(64), immediateHumanConfirmationFingerprint: "2".repeat(64),
    stagingTargetFingerprint: "3".repeat(64), nonceFingerprint: "4".repeat(64), adapterSessionFingerprint: "5".repeat(64),
    executionPacketAccepted: true, immediateHumanConfirmationAccepted: true, oneTimeExecutionNonceVerified: true,
    executionAdapterPrepared: true, orderedReplayStages: [...gate.orderedReplayStages],
    stagePlan: gate.orderedReplayStages.map((stage, index) => ({ sequence: index + 1, stage, executionMode: "future_ephemeral_supervisor", status: "blocked" })),
    oneTimeExecutionConfirmationReceived: true, oneTimeExecutionNonceConsumed: false, adapterExecuted: false, replayExecuted: false,
    blockedReason: "ephemeral_runtime_supervisor_missing", issues: [],
    releaseGates: { replayExecutionAllowed: false, stagingMigrationAllowed: false, productionMigrationAllowed: false, productionCompatibilityApproved: false, metaDeliveryAllowed: false, buildAllowed: false },
    databaseTouched: false, networkTouched: false, processSpawned: false, dockerTouched: false,
    remoteDatabaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawAdapter = JSON.stringify(adapter);
  const finalHumanValidation = {
    schemaVersion: "phase42.final-human-supervisor-validation.v1",
    status: "confirmed_for_ephemeral_supervisor_preparation",
    scope: "prepare_phase42_ephemeral_staging_replay_supervisor",
    decision: "CONFIRM_SUPERVISOR_PREPARATION_ONLY",
    approverRole: "DIRETOR_DECISOR",
    environment: "staging",
    humanConfirmed: true,
    preparationOnly: true,
    singleSupervisorSession: true,
    stagingConfirmed: true,
    executionConfirmed: false,
    productionConfirmed: false,
    metaConfirmed: false,
    buildConfirmed: false,
    approverReferenceFingerprint: "6".repeat(64),
    oneTimeReplayAdapterFingerprint: sha256(rawAdapter),
    adapterSessionFingerprint: adapter.adapterSessionFingerprint,
    stagingTargetFingerprint: adapter.stagingTargetFingerprint,
    supervisorPolicyFingerprint: phase42SupervisorPolicyFingerprint(),
    confirmedAt: "2026-07-19T20:09:00.000Z",
    expiresAt: "2026-07-19T20:15:00.000Z"
  };
  return {
    now,
    input: {
      oneTimeReplayAdapter: adapter,
      rawOneTimeReplayAdapter: rawAdapter,
      finalHumanValidation,
      rawFinalHumanValidation: JSON.stringify(finalHumanValidation)
    }
  };
};

export function selfTestPhase42EphemeralStagingReplaySupervisor() {
  const fixture = createFixture();
  const clone = () => structuredClone(fixture.input);
  const mutations = [
    ["baseline", (v) => v, true],
    ["adapter-schema", (v) => { v.oneTimeReplayAdapter.schemaVersion = "old"; return v; }, false],
    ["adapter-phase", (v) => { v.oneTimeReplayAdapter.phase = 40; return v; }, false],
    ["adapter-status", (v) => { v.oneTimeReplayAdapter.status = "executed"; return v; }, false],
    ["adapter-expired", (v) => { v.oneTimeReplayAdapter.preparedAt = "2026-07-19T19:50:00.000Z"; return v; }, false],
    ["adapter-future", (v) => { v.oneTimeReplayAdapter.preparedAt = "2026-07-19T20:11:00.000Z"; return v; }, false],
    ["adapter-session", (v) => { v.oneTimeReplayAdapter.adapterSessionFingerprint = "x"; return v; }, false],
    ["adapter-target", (v) => { v.oneTimeReplayAdapter.stagingTargetFingerprint = "x"; return v; }, false],
    ["adapter-nonce-unverified", (v) => { v.oneTimeReplayAdapter.oneTimeExecutionNonceVerified = false; return v; }, false],
    ["adapter-nonce-consumed", (v) => { v.oneTimeReplayAdapter.oneTimeExecutionNonceConsumed = true; return v; }, false],
    ["adapter-executed", (v) => { v.oneTimeReplayAdapter.adapterExecuted = true; return v; }, false],
    ["adapter-replayed", (v) => { v.oneTimeReplayAdapter.replayExecuted = true; return v; }, false],
    ["adapter-stage-order", (v) => { v.oneTimeReplayAdapter.orderedReplayStages.reverse(); return v; }, false],
    ["adapter-stage-plan", (v) => { v.oneTimeReplayAdapter.stagePlan[0].stage = "freeform"; return v; }, false],
    ["adapter-stage-mode", (v) => { v.oneTimeReplayAdapter.stagePlan[0].executionMode = "shell"; return v; }, false],
    ["adapter-release", (v) => { v.oneTimeReplayAdapter.releaseGates.replayExecutionAllowed = true; return v; }, false],
    ["adapter-network", (v) => { v.oneTimeReplayAdapter.networkTouched = true; return v; }, false],
    ["validation-schema", (v) => { v.finalHumanValidation.schemaVersion = "old"; return v; }, false],
    ["validation-scope", (v) => { v.finalHumanValidation.scope = "execute"; return v; }, false],
    ["validation-decision", (v) => { v.finalHumanValidation.decision = "EXECUTE"; return v; }, false],
    ["validation-role", (v) => { v.finalHumanValidation.approverRole = "CORRETOR"; return v; }, false],
    ["validation-environment", (v) => { v.finalHumanValidation.environment = "production"; return v; }, false],
    ["validation-not-human", (v) => { v.finalHumanValidation.humanConfirmed = false; return v; }, false],
    ["validation-not-preparation-only", (v) => { v.finalHumanValidation.preparationOnly = false; return v; }, false],
    ["validation-execution", (v) => { v.finalHumanValidation.executionConfirmed = true; return v; }, false],
    ["validation-production", (v) => { v.finalHumanValidation.productionConfirmed = true; return v; }, false],
    ["validation-meta", (v) => { v.finalHumanValidation.metaConfirmed = true; return v; }, false],
    ["validation-build", (v) => { v.finalHumanValidation.buildConfirmed = true; return v; }, false],
    ["validation-adapter-chain", (v) => { v.finalHumanValidation.oneTimeReplayAdapterFingerprint = "0".repeat(64); return v; }, false],
    ["validation-session-chain", (v) => { v.finalHumanValidation.adapterSessionFingerprint = "0".repeat(64); return v; }, false],
    ["validation-target-chain", (v) => { v.finalHumanValidation.stagingTargetFingerprint = "0".repeat(64); return v; }, false],
    ["validation-policy-chain", (v) => { v.finalHumanValidation.supervisorPolicyFingerprint = "0".repeat(64); return v; }, false],
    ["validation-old", (v) => { v.finalHumanValidation.confirmedAt = "2026-07-19T20:00:00.000Z"; return v; }, false],
    ["validation-future", (v) => { v.finalHumanValidation.confirmedAt = "2026-07-19T20:11:00.000Z"; return v; }, false],
    ["validation-expired", (v) => { v.finalHumanValidation.expiresAt = "2026-07-19T20:09:00.000Z"; return v; }, false],
    ["validation-too-long", (v) => { v.finalHumanValidation.expiresAt = "2026-07-19T20:30:00.000Z"; return v; }, false],
    ["credential-key", (v) => { v.finalHumanValidation.apiKey = "placeholder"; return v; }, false],
    ["database-url", (v) => { v.finalHumanValidation.notes = "postgresql://redacted"; return v; }, false],
    ["data-rows", (v) => { v.oneTimeReplayAdapter.rows = [{ id: 1 }]; return v; }, false]
  ];
  const results = mutations.map(([name, mutate, expected]) => {
    const value = mutate(clone());
    const approved = validatePhase42EphemeralStagingReplaySupervisorSources(value, fixture.now).approved;
    return { name, passed: approved === expected };
  });
  const prepared = preparePhase42EphemeralStagingReplaySupervisor(fixture.input, fixture.now);
  results.push({ name: "supervisor-prepared", passed: prepared.supervisorPrepared === true && prepared.status === "supervisor_prepared_execution_blocked" });
  results.push({ name: "state-blocked", passed: prepared.currentState === "SUPERVISOR_PREPARED_EXECUTION_BLOCKED" && prepared.supervisorStarted === false });
  results.push({ name: "transitions-complete", passed: prepared.transitionPlan.length === 12 && prepared.transitionPlan.every((item) => item.status === "blocked") });
  results.push({ name: "stop-on-error", passed: prepared.stopOnError === true && prepared.transitionPlan.slice(0, -1).every((item) => item.onFailure === "HALTED_ROLLBACK_REQUIRED") });
  results.push({ name: "rollback-and-destruction", passed: prepared.rollbackRequiredAfterFailure === true && prepared.targetDestructionRequired === true && prepared.emergencyTransitions.length === 4 });
  results.push({ name: "adapter-unconsumed", passed: prepared.oneTimeExecutionNonceConsumed === false && prepared.executionPermitConsumed === false && prepared.adapterExecuted === false });
  results.push({ name: "no-operational-touch", passed: prepared.replayExecuted === false && prepared.databaseTouched === false && prepared.networkTouched === false && prepared.stagingTouched === false });
  results.push({ name: "all-release-gates-closed", passed: Object.values(prepared.releaseGates).every((value) => value === false) });
  const failures = results.filter((result) => !result.passed).map((result) => result.name);
  return { passed: failures.length === 0, caseCount: results.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase42EphemeralStagingReplaySupervisor();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}
