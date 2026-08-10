import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-isolated-staging-replay-execution-packet-gate.json"));
const shaPattern = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const findSensitiveEvidence = (value, path = "$", issues = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/(password|secret|token|authorization|database.?url|connection.?string|api.?key|access.?key|service.?role|credential.*value)/i.test(key)) issues.push(`sensitive_key:${path}.${key}`);
      if (/^(rows|records|payload|emails?|phones?|cpfs?|leads?|customers?|profiles?|users?)$/i.test(key)) issues.push(`data_rows_key:${path}.${key}`);
      findSensitiveEvidence(child, `${path}.${key}`, issues);
    }
    return issues;
  }
  if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+|@[a-z0-9.-]+\.[a-z]{2,})/i.test(value)) issues.push(`sensitive_value:${path}`);
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
    issues.push("phase39_release_gates_object_required");
    return;
  }
  for (const [field, value] of Object.entries(expected)) {
    if (releaseGates[field] !== value) issues.push(`phase39_release_gate_open:${field}`);
  }
};

const validateContract = (contract, issues) => {
  const required = gate.requiredSources.stagingReplayContract;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(contract && typeof contract === "object" && !Array.isArray(contract), "phase39_contract_object_required");
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return;
  expect(contract.schemaVersion === required.schemaVersion, "phase39_contract_schema_mismatch");
  expect(contract.phase === required.phase && contract.sourcePhase === required.sourcePhase, "phase39_contract_phase_mismatch");
  expect(contract.status === required.status, "phase39_contract_status_mismatch");
  expect(Number.isFinite(Date.parse(contract.preparedAt)), "phase39_contract_prepared_at_invalid");
  for (const field of ["sourceProjectionFingerprint", "stagingTargetFingerprint", "rollbackPlanFingerprint", "humanApprovalFingerprint"]) {
    expect(shaPattern.test(contract[field] ?? ""), `phase39_contract_fingerprint_invalid:${field}`);
  }
  for (const [field, expected] of Object.entries(gate.requiredContractState)) {
    expect(contract[field] === expected, `phase39_contract_state_mismatch:${field}`);
  }
  expect(exact(contract.orderedReplayStages, gate.orderedReplayStages), "phase39_contract_stage_order_mismatch");
  expectClosedRelease(contract.releaseGates, issues);
  expect(contract.databaseTouched === false && contract.dockerTouched === false && contract.remoteDatabaseTouched === false, "phase39_contract_infrastructure_touch_claimed");
  expect(contract.stagingTouched === false && contract.productionTouched === false, "phase39_contract_environment_touch_claimed");
  expect(contract.metaTouched === false && contract.buildExecuted === false, "phase39_contract_meta_or_build_claimed");
};

const validateWindow = (window, rawContract, contract, now, issues) => {
  const required = gate.requiredSources.operationalWindow;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(window && typeof window === "object" && !Array.isArray(window), "operational_window_object_required");
  if (!window || typeof window !== "object" || Array.isArray(window)) return;
  expect(window.schemaVersion === required.schemaVersion, "operational_window_schema_mismatch");
  expect(window.status === required.status && window.environment === required.environment, "operational_window_status_or_environment_mismatch");
  expect(window.contractFingerprint === sha256(rawContract ?? ""), "operational_window_contract_fingerprint_mismatch");
  expect(window.stagingTargetFingerprint === contract?.stagingTargetFingerprint, "operational_window_target_fingerprint_mismatch");
  expect(shaPattern.test(window.authorizerReferenceFingerprint ?? ""), "operational_window_authorizer_fingerprint_invalid");
  for (const [field, expected] of Object.entries(gate.requiredWindowProperties)) {
    expect(window[field] === expected, `operational_window_property_mismatch:${field}`);
  }
  const authorizedAt = Date.parse(window.authorizedAt);
  const startsAt = Date.parse(window.startsAt);
  const endsAt = Date.parse(window.endsAt);
  expect(Number.isFinite(authorizedAt) && Number.isFinite(startsAt) && Number.isFinite(endsAt), "operational_window_timestamp_invalid");
  expect(authorizedAt <= startsAt && startsAt <= now && endsAt > now, "operational_window_not_active");
  expect(endsAt > startsAt && endsAt - startsAt <= gate.maximumWindowMinutes * 60 * 1000, "operational_window_duration_invalid");
  expect(startsAt - authorizedAt <= gate.maximumWindowLeadHours * 60 * 60 * 1000, "operational_window_lead_time_invalid");
};

const validateCredentialAttestation = (attestation, rawContract, rawWindow, contract, window, now, issues) => {
  const required = gate.requiredSources.credentialAttestation;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(attestation && typeof attestation === "object" && !Array.isArray(attestation), "credential_attestation_object_required");
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) return;
  expect(attestation.schemaVersion === required.schemaVersion, "credential_attestation_schema_mismatch");
  expect(attestation.status === required.status && attestation.environment === required.environment, "credential_attestation_status_or_environment_mismatch");
  expect(attestation.contractFingerprint === sha256(rawContract ?? ""), "credential_attestation_contract_fingerprint_mismatch");
  expect(attestation.stagingTargetFingerprint === contract?.stagingTargetFingerprint, "credential_attestation_target_fingerprint_mismatch");
  expect(attestation.operationalWindowFingerprint === sha256(rawWindow ?? ""), "credential_attestation_window_fingerprint_mismatch");
  expect(shaPattern.test(attestation.credentialSetFingerprint ?? ""), "credential_attestation_set_fingerprint_invalid");
  expect(shaPattern.test(attestation.attestorReferenceFingerprint ?? ""), "credential_attestation_attestor_fingerprint_invalid");
  for (const [field, expected] of Object.entries(gate.requiredCredentialProperties)) {
    expect(attestation[field] === expected, `credential_attestation_property_mismatch:${field}`);
  }
  const attestedAt = Date.parse(attestation.attestedAt);
  const expiresAt = Date.parse(attestation.expiresAt);
  const windowEnd = Date.parse(window?.endsAt);
  expect(Number.isFinite(attestedAt) && Number.isFinite(expiresAt), "credential_attestation_timestamp_invalid");
  expect(attestedAt <= now && expiresAt > now, "credential_attestation_expired_or_future");
  expect(expiresAt > attestedAt && expiresAt - attestedAt <= gate.maximumApprovalValidityHours * 60 * 60 * 1000, "credential_attestation_validity_invalid");
  expect(Number.isFinite(windowEnd) && expiresAt >= windowEnd, "credential_attestation_does_not_cover_window");
};

const validateExecutionApproval = (approval, rawContract, rawWindow, rawAttestation, contract, window, now, issues) => {
  const required = gate.requiredSources.humanExecutionApproval;
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(approval && typeof approval === "object" && !Array.isArray(approval), "execution_approval_object_required");
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) return;
  expect(approval.schemaVersion === required.schemaVersion, "execution_approval_schema_mismatch");
  expect(approval.status === required.status && approval.scope === required.scope, "execution_approval_scope_mismatch");
  expect(approval.decision === required.decision && approval.approverRole === required.approverRole, "execution_approval_decision_or_role_mismatch");
  for (const [field, expected] of Object.entries(gate.requiredApprovalProperties)) {
    expect(approval[field] === expected, `execution_approval_property_mismatch:${field}`);
  }
  expect(shaPattern.test(approval.approverReferenceFingerprint ?? ""), "execution_approval_approver_fingerprint_invalid");
  expect(approval.contractFingerprint === sha256(rawContract ?? ""), "execution_approval_contract_fingerprint_mismatch");
  expect(approval.stagingTargetFingerprint === contract?.stagingTargetFingerprint, "execution_approval_target_fingerprint_mismatch");
  expect(approval.operationalWindowFingerprint === sha256(rawWindow ?? ""), "execution_approval_window_fingerprint_mismatch");
  expect(approval.credentialAttestationFingerprint === sha256(rawAttestation ?? ""), "execution_approval_attestation_fingerprint_mismatch");
  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  const windowEnd = Date.parse(window?.endsAt);
  expect(Number.isFinite(approvedAt) && Number.isFinite(expiresAt), "execution_approval_timestamp_invalid");
  expect(approvedAt <= now && expiresAt > now, "execution_approval_expired_or_future");
  expect(expiresAt > approvedAt && expiresAt - approvedAt <= gate.maximumApprovalValidityHours * 60 * 60 * 1000, "execution_approval_validity_invalid");
  expect(Number.isFinite(windowEnd) && expiresAt >= windowEnd, "execution_approval_does_not_cover_window");
};

export function validatePhase40StagingReplayExecutionPacketSources(input, now = Date.now()) {
  const issues = [];
  validateContract(input?.stagingReplayContract, issues);
  validateWindow(input?.operationalWindow, input?.rawStagingReplayContract, input?.stagingReplayContract, now, issues);
  validateCredentialAttestation(input?.credentialAttestation, input?.rawStagingReplayContract, input?.rawOperationalWindow, input?.stagingReplayContract, input?.operationalWindow, now, issues);
  validateExecutionApproval(input?.humanExecutionApproval, input?.rawStagingReplayContract, input?.rawOperationalWindow, input?.rawCredentialAttestation, input?.stagingReplayContract, input?.operationalWindow, now, issues);
  for (const value of [input?.stagingReplayContract, input?.operationalWindow, input?.credentialAttestation, input?.humanExecutionApproval]) {
    issues.push(...findSensitiveEvidence(value));
  }
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function preparePhase40StagingReplayExecutionPacket(input, now = Date.now()) {
  const validation = validatePhase40StagingReplayExecutionPacketSources(input, now);
  const approved = validation.approved;
  return {
    schemaVersion: "phase40.isolated-staging-replay-execution-packet.v1",
    phase: 40,
    sourcePhase: 39,
    status: approved ? "execution_packet_prepared_replay_blocked" : "execution_packet_rejected",
    preparedAt: new Date(now).toISOString(),
    stagingReplayContractFingerprint: approved ? sha256(input.rawStagingReplayContract) : null,
    operationalWindowFingerprint: approved ? sha256(input.rawOperationalWindow) : null,
    credentialAttestationFingerprint: approved ? sha256(input.rawCredentialAttestation) : null,
    humanExecutionApprovalFingerprint: approved ? sha256(input.rawHumanExecutionApproval) : null,
    stagingTargetFingerprint: approved ? input.stagingReplayContract.stagingTargetFingerprint : null,
    stagingReplayContractAccepted: approved,
    operationalWindowAccepted: approved,
    credentialAttestationAccepted: approved,
    humanExecutionApprovalAccepted: approved,
    executionPacketPrepared: approved,
    orderedReplayStages: approved ? [...gate.orderedReplayStages] : [],
    oneTimeImmediateConfirmationRequired: true,
    oneTimeExecutionConfirmationReceived: false,
    oneTimeExecutionNonceRequired: true,
    oneTimeExecutionNonceConsumed: false,
    replayExecuted: false,
    blockedReason: approved ? "one_time_execution_confirmation_missing" : "source_validation_failed",
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
  const stagingReplayContract = {
    schemaVersion: "phase39.isolated-staging-replay-contract.v1", phase: 39, sourcePhase: 38,
    status: "contract_prepared_replay_blocked", preparedAt: "2026-07-19T17:30:00.000Z",
    sourceProjectionFingerprint: "1".repeat(64), stagingTargetFingerprint: "2".repeat(64),
    rollbackPlanFingerprint: "3".repeat(64), humanApprovalFingerprint: "4".repeat(64),
    sourceProjectionAccepted: true, stagingTargetAccepted: true, rollbackPlanAccepted: true,
    humanApprovalAccepted: true, contractPrepared: true, orderedReplayStages: [...gate.orderedReplayStages],
    executionApprovalRequired: true, replayExecuted: false,
    releaseGates: { replayExecutionAllowed: false, stagingMigrationAllowed: false, productionMigrationAllowed: false, productionCompatibilityApproved: false, metaDeliveryAllowed: false, buildAllowed: false },
    databaseTouched: false, dockerTouched: false, remoteDatabaseTouched: false, stagingTouched: false,
    productionTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawStagingReplayContract = JSON.stringify(stagingReplayContract);
  const operationalWindow = {
    schemaVersion: "phase40.staging-replay-window.v1", status: "authorized", environment: "staging",
    authorizedAt: "2026-07-19T17:50:00.000Z", startsAt: "2026-07-19T17:55:00.000Z", endsAt: "2026-07-19T19:30:00.000Z",
    contractFingerprint: sha256(rawStagingReplayContract), stagingTargetFingerprint: stagingReplayContract.stagingTargetFingerprint,
    authorizerReferenceFingerprint: "5".repeat(64), ...gate.requiredWindowProperties
  };
  const rawOperationalWindow = JSON.stringify(operationalWindow);
  const credentialAttestation = {
    schemaVersion: "phase40.ephemeral-credential-attestation.v1", status: "verified_in_memory_only", environment: "staging",
    attestedAt: "2026-07-19T17:56:00.000Z", expiresAt: "2026-07-19T20:00:00.000Z",
    contractFingerprint: sha256(rawStagingReplayContract), stagingTargetFingerprint: stagingReplayContract.stagingTargetFingerprint,
    operationalWindowFingerprint: sha256(rawOperationalWindow), credentialSetFingerprint: "6".repeat(64),
    attestorReferenceFingerprint: "7".repeat(64), ...gate.requiredCredentialProperties
  };
  const rawCredentialAttestation = JSON.stringify(credentialAttestation);
  const humanExecutionApproval = {
    schemaVersion: "phase40.staging-replay-execution-approval.v1", status: "approved_for_isolated_staging_execution",
    scope: "execute_phase40_isolated_staging_replay_only", decision: "EXECUTE_ISOLATED_STAGING_ONLY", approverRole: "DIRETOR_DECISOR",
    approvedAt: "2026-07-19T17:58:00.000Z", expiresAt: "2026-07-19T20:00:00.000Z",
    approverReferenceFingerprint: "8".repeat(64), contractFingerprint: sha256(rawStagingReplayContract),
    stagingTargetFingerprint: stagingReplayContract.stagingTargetFingerprint, operationalWindowFingerprint: sha256(rawOperationalWindow),
    credentialAttestationFingerprint: sha256(rawCredentialAttestation), ...gate.requiredApprovalProperties
  };
  return {
    stagingReplayContract, operationalWindow, credentialAttestation, humanExecutionApproval,
    rawStagingReplayContract, rawOperationalWindow, rawCredentialAttestation,
    rawHumanExecutionApproval: JSON.stringify(humanExecutionApproval), now
  };
};

export function selfTestPhase40StagingReplayExecutionPacket() {
  const cases = [
    ["baseline", (v) => v, true],
    ["contract-schema", (v) => { v.stagingReplayContract.schemaVersion = "old"; return v; }, false],
    ["contract-status", (v) => { v.stagingReplayContract.status = "not_prepared"; return v; }, false],
    ["contract-source", (v) => { v.stagingReplayContract.contractPrepared = false; return v; }, false],
    ["contract-stage-order", (v) => { v.stagingReplayContract.orderedReplayStages.reverse(); return v; }, false],
    ["contract-replay", (v) => { v.stagingReplayContract.replayExecuted = true; return v; }, false],
    ["contract-staging-gate", (v) => { v.stagingReplayContract.releaseGates.stagingMigrationAllowed = true; return v; }, false],
    ["contract-production-gate", (v) => { v.stagingReplayContract.releaseGates.productionMigrationAllowed = true; return v; }, false],
    ["window-schema", (v) => { v.operationalWindow.schemaVersion = "old"; return v; }, false],
    ["window-production", (v) => { v.operationalWindow.productionTarget = true; return v; }, false],
    ["window-production-data", (v) => { v.operationalWindow.productionDataAllowed = true; return v; }, false],
    ["window-not-sanitized", (v) => { v.operationalWindow.sanitizedDataOnly = false; return v; }, false],
    ["window-no-destroy", (v) => { v.operationalWindow.destroyTargetAtEnd = false; return v; }, false],
    ["window-contract-chain", (v) => { v.operationalWindow.contractFingerprint = "0".repeat(64); return v; }, false],
    ["window-target-chain", (v) => { v.operationalWindow.stagingTargetFingerprint = "0".repeat(64); return v; }, false],
    ["window-not-active", (v) => { v.operationalWindow.startsAt = "2026-07-19T18:30:00.000Z"; return v; }, false],
    ["window-expired", (v) => { v.operationalWindow.endsAt = "2026-07-19T17:59:00.000Z"; return v; }, false],
    ["window-too-long", (v) => { v.operationalWindow.endsAt = "2026-07-19T21:00:00.000Z"; return v; }, false],
    ["attestation-schema", (v) => { v.credentialAttestation.schemaVersion = "old"; return v; }, false],
    ["attestation-persisted", (v) => { v.credentialAttestation.persisted = true; return v; }, false],
    ["attestation-logged", (v) => { v.credentialAttestation.logged = true; return v; }, false],
    ["attestation-not-least-privilege", (v) => { v.credentialAttestation.leastPrivilege = false; return v; }, false],
    ["attestation-production", (v) => { v.credentialAttestation.productionCredential = true; return v; }, false],
    ["attestation-window-chain", (v) => { v.credentialAttestation.operationalWindowFingerprint = "0".repeat(64); return v; }, false],
    ["attestation-expired", (v) => { v.credentialAttestation.expiresAt = "2026-07-19T17:59:00.000Z"; return v; }, false],
    ["attestation-short", (v) => { v.credentialAttestation.expiresAt = "2026-07-19T19:00:00.000Z"; return v; }, false],
    ["approval-schema", (v) => { v.humanExecutionApproval.schemaVersion = "old"; return v; }, false],
    ["approval-scope", (v) => { v.humanExecutionApproval.scope = "production"; return v; }, false],
    ["approval-decision", (v) => { v.humanExecutionApproval.decision = "APPROVE_CONTRACT_ONLY"; return v; }, false],
    ["approval-not-human", (v) => { v.humanExecutionApproval.humanApproved = false; return v; }, false],
    ["approval-no-staging", (v) => { v.humanExecutionApproval.stagingExecutionApproved = false; return v; }, false],
    ["approval-production", (v) => { v.humanExecutionApproval.productionApproved = true; return v; }, false],
    ["approval-meta", (v) => { v.humanExecutionApproval.metaApproved = true; return v; }, false],
    ["approval-build", (v) => { v.humanExecutionApproval.buildApproved = true; return v; }, false],
    ["approval-contract-chain", (v) => { v.humanExecutionApproval.contractFingerprint = "0".repeat(64); return v; }, false],
    ["approval-window-chain", (v) => { v.humanExecutionApproval.operationalWindowFingerprint = "0".repeat(64); return v; }, false],
    ["approval-attestation-chain", (v) => { v.humanExecutionApproval.credentialAttestationFingerprint = "0".repeat(64); return v; }, false],
    ["approval-expired", (v) => { v.humanExecutionApproval.expiresAt = "2026-07-19T17:59:00.000Z"; return v; }, false],
    ["approval-short", (v) => { v.humanExecutionApproval.expiresAt = "2026-07-19T19:00:00.000Z"; return v; }, false],
    ["sensitive-key", (v) => { v.credentialAttestation.credentialValue = "hidden"; return v; }, false],
    ["sensitive-url", (v) => { v.operationalWindow.endpoint = "https://example.invalid"; return v; }, false],
    ["data-rows", (v) => { v.humanExecutionApproval.records = []; return v; }, false]
  ];
  const results = cases.map(([name, mutate, expected]) => {
    const fixture = createFixture();
    const mutated = mutate(structuredClone(fixture));
    const result = validatePhase40StagingReplayExecutionPacketSources(mutated, fixture.now);
    return { name, passed: result.approved === expected };
  });
  const fixture = createFixture();
  const prepared = preparePhase40StagingReplayExecutionPacket(fixture, fixture.now);
  results.push({ name: "packet-prepared", passed: prepared.executionPacketPrepared === true && prepared.status === "execution_packet_prepared_replay_blocked" });
  results.push({ name: "confirmation-remains-missing", passed: prepared.oneTimeExecutionConfirmationReceived === false && prepared.oneTimeExecutionNonceConsumed === false });
  results.push({ name: "replay-remains-blocked", passed: prepared.releaseGates.replayExecutionAllowed === false && prepared.replayExecuted === false });
  results.push({ name: "staging-remains-untouched", passed: prepared.releaseGates.stagingMigrationAllowed === false && prepared.stagingTouched === false });
  results.push({ name: "production-meta-build-blocked", passed: prepared.releaseGates.productionMigrationAllowed === false && prepared.productionTouched === false && prepared.metaTouched === false && prepared.buildExecuted === false });
  results.push({ name: "stages-exact", passed: exact(prepared.orderedReplayStages, gate.orderedReplayStages) });
  const failures = results.filter((item) => !item.passed);
  return { passed: failures.length === 0, caseCount: results.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase40StagingReplayExecutionPacket();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}
