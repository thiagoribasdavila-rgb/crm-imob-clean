import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter-gate.json"));
const shaPattern = /^[a-f0-9]{64}$/;
const noncePattern = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const findSensitiveEvidence = (value, path = "$", issues = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/(password|secret|token|authorization|database.?url|connection.?string|api.?key|access.?key|service.?role|credential.*value|nonceValue|rawNonce|command|shell|projectRef)/i.test(key)) issues.push(`sensitive_key:${path}.${key}`);
      if (/^(rows|records|payload|emails?|phones?|cpfs?|leads?|customers?|profiles?|users?)$/i.test(key)) issues.push(`data_rows_key:${path}.${key}`);
      findSensitiveEvidence(child, `${path}.${key}`, issues);
    }
    return issues;
  }
  if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+|@[a-z0-9.-]+\.[a-z]{2,}|supabase\s+db\s+(?:push|reset))/i.test(value)) issues.push(`sensitive_value:${path}`);
  return issues;
};

const expectClosedRelease = (releaseGates, issues) => {
  const expected = {
    replayExecutionAllowed: false,
    stagingMigrationAllowed: false,
    productionMigrationAllowed: false,
    productionCompatibilityApproved: false,
    metaDeliveryAllowed: false,
    buildAllowed: false
  };
  if (!releaseGates || typeof releaseGates !== "object" || Array.isArray(releaseGates)) {
    issues.push("phase40_release_gates_object_required");
    return;
  }
  for (const [field, value] of Object.entries(expected)) {
    if (releaseGates[field] !== value) issues.push(`phase40_release_gate_open:${field}`);
  }
};

const validateExecutionPacket = (packet, issues) => {
  const required = gate.requiredSources.executionPacket;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(packet && typeof packet === "object" && !Array.isArray(packet), "phase40_execution_packet_object_required");
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return;
  expect(packet.schemaVersion === required.schemaVersion, "phase40_execution_packet_schema_mismatch");
  expect(packet.phase === required.phase && packet.sourcePhase === required.sourcePhase, "phase40_execution_packet_phase_mismatch");
  expect(packet.status === required.status, "phase40_execution_packet_status_mismatch");
  expect(Number.isFinite(Date.parse(packet.preparedAt)), "phase40_execution_packet_prepared_at_invalid");
  for (const field of [
    "stagingReplayContractFingerprint", "operationalWindowFingerprint", "credentialAttestationFingerprint",
    "humanExecutionApprovalFingerprint", "stagingTargetFingerprint"
  ]) expect(shaPattern.test(packet[field] ?? ""), `phase40_execution_packet_fingerprint_invalid:${field}`);
  for (const [field, expected] of Object.entries(gate.requiredPacketState)) {
    expect(packet[field] === expected, `phase40_execution_packet_state_mismatch:${field}`);
  }
  expect(exact(packet.orderedReplayStages, gate.orderedReplayStages), "phase40_execution_packet_stage_order_mismatch");
  expect(packet.blockedReason === "one_time_execution_confirmation_missing", "phase40_execution_packet_block_reason_mismatch");
  expectClosedRelease(packet.releaseGates, issues);
  expect(packet.databaseTouched === false && packet.dockerTouched === false && packet.remoteDatabaseTouched === false, "phase40_execution_packet_infrastructure_touch_claimed");
  expect(packet.stagingTouched === false && packet.productionTouched === false, "phase40_execution_packet_environment_touch_claimed");
  expect(packet.metaTouched === false && packet.buildExecuted === false, "phase40_execution_packet_meta_or_build_claimed");
};

const validateNonce = (nonce, issues) => {
  if (typeof nonce !== "string" || !noncePattern.test(nonce)) {
    issues.push("one_time_execution_nonce_invalid");
    return;
  }
  if (new Set(nonce).size < 8) issues.push("one_time_execution_nonce_entropy_too_low");
};

const validateImmediateConfirmation = (confirmation, rawPacket, packet, nonce, now, issues) => {
  const required = gate.requiredSources.immediateHumanConfirmation;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(confirmation && typeof confirmation === "object" && !Array.isArray(confirmation), "immediate_confirmation_object_required");
  if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) return;
  expect(confirmation.schemaVersion === required.schemaVersion, "immediate_confirmation_schema_mismatch");
  expect(confirmation.status === required.status && confirmation.scope === required.scope, "immediate_confirmation_status_or_scope_mismatch");
  expect(confirmation.decision === required.decision && confirmation.approverRole === required.approverRole, "immediate_confirmation_decision_or_role_mismatch");
  expect(confirmation.environment === required.environment, "immediate_confirmation_environment_mismatch");
  for (const [field, expected] of Object.entries(gate.requiredConfirmationProperties)) {
    expect(confirmation[field] === expected, `immediate_confirmation_property_mismatch:${field}`);
  }
  expect(shaPattern.test(confirmation.approverReferenceFingerprint ?? ""), "immediate_confirmation_approver_fingerprint_invalid");
  expect(confirmation.executionPacketFingerprint === sha256(rawPacket ?? ""), "immediate_confirmation_packet_fingerprint_mismatch");
  expect(confirmation.stagingTargetFingerprint === packet?.stagingTargetFingerprint, "immediate_confirmation_target_fingerprint_mismatch");
  if (typeof nonce === "string" && noncePattern.test(nonce)) {
    expect(confirmation.nonceFingerprint === sha256(nonce), "immediate_confirmation_nonce_fingerprint_mismatch");
  }
  const confirmedAt = Date.parse(confirmation.confirmedAt);
  const expiresAt = Date.parse(confirmation.expiresAt);
  expect(Number.isFinite(confirmedAt) && Number.isFinite(expiresAt), "immediate_confirmation_timestamp_invalid");
  expect(confirmedAt <= now && now - confirmedAt <= gate.maximumConfirmationAgeSeconds * 1000, "immediate_confirmation_not_immediate");
  expect(expiresAt > now, "immediate_confirmation_expired");
  expect(expiresAt > confirmedAt && expiresAt - confirmedAt <= gate.maximumConfirmationValiditySeconds * 1000, "immediate_confirmation_validity_invalid");
};

export function validatePhase41OneTimeReplayAdapterSources(input, now = Date.now()) {
  const issues = [];
  validateExecutionPacket(input?.executionPacket, issues);
  validateNonce(input?.oneTimeExecutionNonce, issues);
  validateImmediateConfirmation(
    input?.immediateHumanConfirmation,
    input?.rawExecutionPacket,
    input?.executionPacket,
    input?.oneTimeExecutionNonce,
    now,
    issues
  );
  for (const value of [input?.executionPacket, input?.immediateHumanConfirmation]) issues.push(...findSensitiveEvidence(value));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function preparePhase41OneTimeReplayAdapter(input, now = Date.now()) {
  const validation = validatePhase41OneTimeReplayAdapterSources(input, now);
  const approved = validation.approved;
  const packetFingerprint = approved ? sha256(input.rawExecutionPacket) : null;
  const confirmationFingerprint = approved ? sha256(input.rawImmediateHumanConfirmation) : null;
  const nonceFingerprint = approved ? sha256(input.oneTimeExecutionNonce) : null;
  const sessionFingerprint = approved ? sha256(`${packetFingerprint}:${confirmationFingerprint}:${nonceFingerprint}:${input.executionPacket.stagingTargetFingerprint}`) : null;
  return {
    schemaVersion: "phase41.isolated-staging-one-time-replay-adapter.v1",
    phase: 41,
    sourcePhase: 40,
    status: approved ? "adapter_prepared_execution_blocked" : "adapter_rejected",
    preparedAt: new Date(now).toISOString(),
    executionPacketFingerprint: packetFingerprint,
    immediateHumanConfirmationFingerprint: confirmationFingerprint,
    stagingTargetFingerprint: approved ? input.executionPacket.stagingTargetFingerprint : null,
    nonceFingerprint,
    adapterSessionFingerprint: sessionFingerprint,
    executionPacketAccepted: approved,
    immediateHumanConfirmationAccepted: approved,
    oneTimeExecutionNonceVerified: approved,
    executionAdapterPrepared: approved,
    orderedReplayStages: approved ? [...gate.orderedReplayStages] : [],
    stagePlan: approved ? gate.orderedReplayStages.map((stage, index) => ({ sequence: index + 1, stage, executionMode: "future_ephemeral_supervisor", status: "blocked" })) : [],
    oneTimeExecutionConfirmationReceived: approved,
    oneTimeExecutionNonceConsumed: false,
    adapterExecuted: false,
    replayExecuted: false,
    blockedReason: approved ? "ephemeral_runtime_supervisor_missing" : "source_validation_failed",
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

const createFixture = (now = Date.parse("2026-07-19T20:00:00.000Z")) => {
  const executionPacket = {
    schemaVersion: "phase40.isolated-staging-replay-execution-packet.v1", phase: 40, sourcePhase: 39,
    status: "execution_packet_prepared_replay_blocked", preparedAt: "2026-07-19T19:58:00.000Z",
    stagingReplayContractFingerprint: "1".repeat(64), operationalWindowFingerprint: "2".repeat(64),
    credentialAttestationFingerprint: "3".repeat(64), humanExecutionApprovalFingerprint: "4".repeat(64),
    stagingTargetFingerprint: "5".repeat(64), stagingReplayContractAccepted: true, operationalWindowAccepted: true,
    credentialAttestationAccepted: true, humanExecutionApprovalAccepted: true, executionPacketPrepared: true,
    orderedReplayStages: [...gate.orderedReplayStages], oneTimeImmediateConfirmationRequired: true,
    oneTimeExecutionConfirmationReceived: false, oneTimeExecutionNonceRequired: true,
    oneTimeExecutionNonceConsumed: false, replayExecuted: false, blockedReason: "one_time_execution_confirmation_missing",
    releaseGates: { replayExecutionAllowed: false, stagingMigrationAllowed: false, productionMigrationAllowed: false, productionCompatibilityApproved: false, metaDeliveryAllowed: false, buildAllowed: false },
    databaseTouched: false, dockerTouched: false, remoteDatabaseTouched: false, stagingTouched: false,
    productionTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawExecutionPacket = JSON.stringify(executionPacket);
  const oneTimeExecutionNonce = "0123456789abcdef".repeat(4);
  const immediateHumanConfirmation = {
    schemaVersion: "phase41.immediate-human-execution-confirmation.v1",
    status: "confirmed_for_single_use_staging_replay",
    scope: "prepare_phase41_one_time_staging_replay_adapter",
    decision: "CONFIRM_STAGING_REPLAY_ONCE",
    approverRole: "DIRETOR_DECISOR",
    environment: "staging",
    confirmedAt: "2026-07-19T19:58:30.000Z",
    expiresAt: "2026-07-19T20:05:00.000Z",
    approverReferenceFingerprint: "6".repeat(64),
    executionPacketFingerprint: sha256(rawExecutionPacket),
    stagingTargetFingerprint: executionPacket.stagingTargetFingerprint,
    nonceFingerprint: sha256(oneTimeExecutionNonce),
    ...gate.requiredConfirmationProperties
  };
  return {
    executionPacket,
    immediateHumanConfirmation,
    oneTimeExecutionNonce,
    rawExecutionPacket,
    rawImmediateHumanConfirmation: JSON.stringify(immediateHumanConfirmation),
    now
  };
};

export function selfTestPhase41OneTimeReplayAdapter() {
  const cases = [
    ["baseline", (v) => v, true],
    ["packet-schema", (v) => { v.executionPacket.schemaVersion = "old"; return v; }, false],
    ["packet-status", (v) => { v.executionPacket.status = "not_prepared"; return v; }, false],
    ["packet-phase", (v) => { v.executionPacket.phase = 39; return v; }, false],
    ["packet-source-not-accepted", (v) => { v.executionPacket.stagingReplayContractAccepted = false; return v; }, false],
    ["packet-confirmation-already-used", (v) => { v.executionPacket.oneTimeExecutionConfirmationReceived = true; return v; }, false],
    ["packet-nonce-already-consumed", (v) => { v.executionPacket.oneTimeExecutionNonceConsumed = true; return v; }, false],
    ["packet-replay", (v) => { v.executionPacket.replayExecuted = true; return v; }, false],
    ["packet-stage-order", (v) => { v.executionPacket.orderedReplayStages.reverse(); return v; }, false],
    ["packet-staging-gate", (v) => { v.executionPacket.releaseGates.stagingMigrationAllowed = true; return v; }, false],
    ["packet-production-gate", (v) => { v.executionPacket.releaseGates.productionMigrationAllowed = true; return v; }, false],
    ["packet-touched", (v) => { v.executionPacket.remoteDatabaseTouched = true; return v; }, false],
    ["confirmation-schema", (v) => { v.immediateHumanConfirmation.schemaVersion = "old"; return v; }, false],
    ["confirmation-scope", (v) => { v.immediateHumanConfirmation.scope = "production"; return v; }, false],
    ["confirmation-decision", (v) => { v.immediateHumanConfirmation.decision = "CONFIRM_PRODUCTION"; return v; }, false],
    ["confirmation-role", (v) => { v.immediateHumanConfirmation.approverRole = "CORRETOR"; return v; }, false],
    ["confirmation-not-human", (v) => { v.immediateHumanConfirmation.humanConfirmed = false; return v; }, false],
    ["confirmation-not-single-use", (v) => { v.immediateHumanConfirmation.singleUse = false; return v; }, false],
    ["confirmation-production", (v) => { v.immediateHumanConfirmation.productionConfirmed = true; return v; }, false],
    ["confirmation-meta", (v) => { v.immediateHumanConfirmation.metaConfirmed = true; return v; }, false],
    ["confirmation-build", (v) => { v.immediateHumanConfirmation.buildConfirmed = true; return v; }, false],
    ["confirmation-packet-chain", (v) => { v.immediateHumanConfirmation.executionPacketFingerprint = "0".repeat(64); return v; }, false],
    ["confirmation-target-chain", (v) => { v.immediateHumanConfirmation.stagingTargetFingerprint = "0".repeat(64); return v; }, false],
    ["confirmation-nonce-chain", (v) => { v.immediateHumanConfirmation.nonceFingerprint = "0".repeat(64); return v; }, false],
    ["confirmation-old", (v) => { v.immediateHumanConfirmation.confirmedAt = "2026-07-19T19:50:00.000Z"; return v; }, false],
    ["confirmation-future", (v) => { v.immediateHumanConfirmation.confirmedAt = "2026-07-19T20:01:00.000Z"; return v; }, false],
    ["confirmation-expired", (v) => { v.immediateHumanConfirmation.expiresAt = "2026-07-19T19:59:00.000Z"; return v; }, false],
    ["confirmation-too-long", (v) => { v.immediateHumanConfirmation.expiresAt = "2026-07-19T20:20:00.000Z"; return v; }, false],
    ["nonce-missing", (v) => { v.oneTimeExecutionNonce = ""; return v; }, false],
    ["nonce-short", (v) => { v.oneTimeExecutionNonce = "ab".repeat(16); return v; }, false],
    ["nonce-non-hex", (v) => { v.oneTimeExecutionNonce = "z".repeat(64); return v; }, false],
    ["nonce-low-entropy", (v) => { v.oneTimeExecutionNonce = "a".repeat(64); return v; }, false],
    ["sensitive-key", (v) => { v.immediateHumanConfirmation.apiKey = "hidden"; return v; }, false],
    ["database-url", (v) => { v.executionPacket.endpoint = "postgresql://example.invalid/db"; return v; }, false],
    ["freeform-command", (v) => { v.immediateHumanConfirmation.command = "do something"; return v; }, false],
    ["data-rows", (v) => { v.executionPacket.records = []; return v; }, false]
  ];
  const results = cases.map(([name, mutate, expected]) => {
    const fixture = createFixture();
    const mutated = mutate(structuredClone(fixture));
    const result = validatePhase41OneTimeReplayAdapterSources(mutated, fixture.now);
    return { name, passed: result.approved === expected };
  });
  const fixture = createFixture();
  const prepared = preparePhase41OneTimeReplayAdapter(fixture, fixture.now);
  results.push({ name: "adapter-prepared", passed: prepared.executionAdapterPrepared === true && prepared.status === "adapter_prepared_execution_blocked" });
  results.push({ name: "confirmation-recorded", passed: prepared.oneTimeExecutionConfirmationReceived === true && prepared.immediateHumanConfirmationAccepted === true });
  results.push({ name: "nonce-verified-not-consumed", passed: prepared.oneTimeExecutionNonceVerified === true && prepared.oneTimeExecutionNonceConsumed === false });
  results.push({ name: "nonce-value-absent", passed: !JSON.stringify(prepared).includes(fixture.oneTimeExecutionNonce) });
  results.push({ name: "stage-plan-declarative", passed: prepared.stagePlan.length === 12 && prepared.stagePlan.every((stage) => stage.status === "blocked" && stage.executionMode === "future_ephemeral_supervisor") });
  results.push({ name: "replay-remains-blocked", passed: prepared.releaseGates.replayExecutionAllowed === false && prepared.replayExecuted === false && prepared.adapterExecuted === false });
  results.push({ name: "all-environments-untouched", passed: prepared.remoteDatabaseTouched === false && prepared.stagingTouched === false && prepared.productionTouched === false });
  results.push({ name: "network-process-meta-build-untouched", passed: prepared.networkTouched === false && prepared.processSpawned === false && prepared.metaTouched === false && prepared.buildExecuted === false });
  const failures = results.filter((item) => !item.passed);
  return { passed: failures.length === 0, caseCount: results.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase41OneTimeReplayAdapter();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}
