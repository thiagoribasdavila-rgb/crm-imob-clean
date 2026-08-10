import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePhase26Contract } from "./preflight-meta-repeatability-sample-02-manual-permit-contract.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const gate = readJson("config/meta-repeatability-sample-02-atomic-ledger-gate.json");
const signalContract = readJson(gate.sourceSignalContract);
const HASH = /^[a-f0-9]{64}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9._:-]{8,120}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const evidenceFingerprint = (value) => sha256(canonicalJson(value));

function validReference(value) {
  return SAFE_REFERENCE.test(value ?? "") && !EMAIL.test(value ?? "") && !/\d{10,}/.test(value ?? "");
}

function containsForbiddenMaterial(input, allowLedgerReference = false) {
  const forbiddenKeys = new Set([
    "accessToken", "authorization", "password", "secretKey", "serviceRoleKey",
    "testEventCode", "payload", "rawPayload", "rawResponse", "responseBody",
    "email", "phone", "cpf", "address", "income", "projectRef", "supabaseUrl",
  ]);
  const visit = (value, parentKey = "") => {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (allowLedgerReference && parentKey === "ledgerReference" && validReference(normalized)) return false;
      return /Bearer\s+|sb_secret_|\.supabase\.co|eyJ[a-zA-Z0-9_-]{10,}\./i.test(normalized) || EMAIL.test(normalized);
    }
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some((nested) => visit(nested, parentKey));
    return Object.entries(value).some(([key, nested]) => forbiddenKeys.has(key) || visit(nested, key));
  };
  return visit(input);
}

function canonicalEventIsValid(event) {
  const canonical = signalContract?.canonicalEvents?.[event?.eventName];
  return Boolean(canonical && canonical.metaEligible !== false && canonical.classification === event?.classification);
}

function protectedSourceFingerprints(contract) {
  return [
    evidenceFingerprint(contract),
    contract?.sourceEvidence?.phase25Fingerprint,
    contract?.sourceEvidence?.phase24Fingerprint,
    contract?.sourceEvidence?.phase23Fingerprint,
    contract?.sourceEvidence?.baselineEventIdFingerprint,
    contract?.sourceEvidence?.operatorReconfirmationFingerprint,
    contract?.event?.eventIdFingerprint,
    contract?.event?.syntheticRecordFingerprint,
    contract?.binding?.contractReferenceFingerprint,
    contract?.antiReplay?.permitNonceFingerprint,
    contract?.antiReplay?.idempotencyFingerprint,
  ];
}

export function simulateAtomicReservation(ledgerKeyFingerprint, expectedRevision = 0) {
  const state = new Map();
  const attempt = () => {
    const current = state.get(ledgerKeyFingerprint);
    if (current || expectedRevision !== gate.ledgerPolicy.initialRevision) return { accepted: false, reason: current ? "duplicate_reservation" : "revision_conflict" };
    state.set(ledgerKeyFingerprint, { revision: gate.ledgerPolicy.proposedRevision, status: "reserved_in_memory_rehearsal" });
    return { accepted: true, reason: null };
  };
  const attempts = [attempt(), attempt()];
  return {
    inMemoryOnly: true,
    attemptCount: attempts.length,
    winnerCount: attempts.filter((item) => item.accepted).length,
    duplicateRejectionCount: attempts.filter((item) => item.reason === "duplicate_reservation").length,
    databaseTouched: false,
    filesystemLedgerTouched: false,
    networkTouched: false,
  };
}

export function validateAtomicLedgerRequest(input, phase26Contract, now = Date.now()) {
  const issues = new Set();
  const source = validatePhase26Contract(phase26Contract, now);
  if (!source.approved) for (const issue of source.issueCodes) issues.add(`phase26:${issue}`);
  if (input?.format !== "atlas_meta_repeatability_atomic_ledger_request_v1" || input?.phase !== 27 || input?.environment !== gate.environment) issues.add("atomic_ledger_request_invalid");
  if (!validReference(input?.ledgerReference)) issues.add("ledger_reference_invalid");
  if (containsForbiddenMaterial(input, true)) issues.add("forbidden_material_detected");
  if (!HASH.test(input?.sourceContractFingerprint ?? "") || input?.sourceContractFingerprint !== evidenceFingerprint(phase26Contract)) issues.add("source_contract_fingerprint_mismatch");
  if (input?.slot?.slotId !== gate.targetSlot.slotId || input?.slot?.sampleOrdinal !== gate.targetSlot.sampleOrdinal) issues.add("ledger_slot_mismatch");

  const event = input?.event ?? {};
  const sourceEvent = phase26Contract?.event ?? {};
  if (!canonicalEventIsValid(event)) issues.add("canonical_event_contract_invalid");
  for (const field of ["eventName", "classification", "eventIdFingerprint", "syntheticRecordFingerprint"]) if (event[field] !== sourceEvent[field]) issues.add(`source_event_mismatch:${field}`);

  const ledgerReferenceHash = typeof input?.ledgerReference === "string" ? sha256(input.ledgerReference) : null;
  if (protectedSourceFingerprints(phase26Contract).includes(ledgerReferenceHash)) issues.add("ledger_reference_collision_with_source");
  const operation = input?.operation ?? {};
  if (operation.type !== "prepare_atomic_reservation_contract") issues.add("ledger_operation_invalid");
  if (operation.expectedRevision !== gate.ledgerPolicy.initialRevision || operation.proposedRevision !== gate.ledgerPolicy.proposedRevision) issues.add("ledger_revision_contract_invalid");
  for (const field of ["persistReservation", "issuePermit", "consumePermit", "executeAction", "deliverEvent"]) if (operation[field] !== false) issues.add(`ledger_operation_must_remain_inactive:${field}`);

  const requestedAt = Date.parse(input?.requestedAt ?? "");
  const sourceGeneratedAt = Date.parse(phase26Contract?.generatedAt ?? "");
  const sourceExpiresAt = Date.parse(phase26Contract?.sourceEvidence?.phase25ExpiresAt ?? "");
  if (![requestedAt, sourceGeneratedAt, sourceExpiresAt].every(Number.isFinite)) issues.add("ledger_request_time_invalid");
  else {
    if (requestedAt < sourceGeneratedAt || requestedAt > now + 300_000) issues.add("ledger_request_timestamp_invalid");
    if (sourceExpiresAt <= now) issues.add("source_contract_expired");
  }

  const controls = input?.controls ?? {};
  for (const control of [
    "sourceContractReviewed", "compareAndSetRequired", "singleWinnerRequired",
    "duplicateReservationRejected", "atomicConsumeBeforeAction", "appendOnlyAuditRequired",
    "temporaryCodeRemainsInOfficialSurface", "stopWithoutRetry", "campaignUnchanged",
    "budgetUnchanged", "audienceUnchanged", "noPerformanceClaim",
  ]) if (controls[control] !== true) issues.add(`ledger_control_missing:${control}`);
  if (controls.realCustomerDataIncluded !== false) issues.add("real_customer_data_forbidden");
  if (phase26Contract?.lifecycle?.issued !== false || phase26Contract?.lifecycle?.consumed !== false || phase26Contract?.lifecycle?.executed !== false || phase26Contract?.lifecycle?.eventDelivered !== false) issues.add("source_contract_already_used");
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

export function createAtomicLedgerPreparation(phase26Contract, request, now = Date.now()) {
  const validation = validateAtomicLedgerRequest(request, phase26Contract, now);
  if (!validation.approved) return { approved: false, issueCodes: validation.issueCodes, preparation: null };
  const phase26Fingerprint = evidenceFingerprint(phase26Contract);
  const ledgerReferenceFingerprint = sha256(request.ledgerReference);
  const ledgerKeyFingerprint = evidenceFingerprint({
    environment: gate.environment,
    slot: gate.targetSlot,
    phase26Fingerprint,
    contractReferenceFingerprint: phase26Contract.binding.contractReferenceFingerprint,
    permitNonceFingerprint: phase26Contract.antiReplay.permitNonceFingerprint,
    idempotencyFingerprint: phase26Contract.antiReplay.idempotencyFingerprint,
    eventIdFingerprint: phase26Contract.event.eventIdFingerprint,
    syntheticRecordFingerprint: phase26Contract.event.syntheticRecordFingerprint,
  });
  const rehearsal = simulateAtomicReservation(ledgerKeyFingerprint, request.operation.expectedRevision);
  const preparation = {
    format: "atlas_meta_repeatability_atomic_ledger_preparation_v1",
    phase: 27,
    environment: gate.environment,
    generatedAt: new Date(now).toISOString(),
    passed: rehearsal.winnerCount === 1 && rehearsal.duplicateRejectionCount === 1,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    rawResponsePersisted: false,
    screenshotPersisted: false,
    sourceEvidence: {
      phase26Approved: true,
      phase26Fingerprint,
      phase25Fingerprint: phase26Contract.sourceEvidence.phase25Fingerprint,
      phase26GeneratedAt: phase26Contract.generatedAt,
      phase25ExpiresAt: phase26Contract.sourceEvidence.phase25ExpiresAt,
    },
    slot: { slotId: gate.targetSlot.slotId, sampleOrdinal: gate.targetSlot.sampleOrdinal },
    event: {
      eventName: phase26Contract.event.eventName,
      classification: phase26Contract.event.classification,
      eventIdFingerprint: phase26Contract.event.eventIdFingerprint,
      syntheticRecordFingerprint: phase26Contract.event.syntheticRecordFingerprint,
    },
    identity: {
      ledgerReferenceFingerprint,
      ledgerKeyFingerprint,
      contractReferenceFingerprint: phase26Contract.binding.contractReferenceFingerprint,
      permitNonceFingerprint: phase26Contract.antiReplay.permitNonceFingerprint,
      idempotencyFingerprint: phase26Contract.antiReplay.idempotencyFingerprint,
    },
    atomicPolicy: {
      strategy: gate.ledgerPolicy.strategy,
      expectedRevision: gate.ledgerPolicy.initialRevision,
      proposedRevision: gate.ledgerPolicy.proposedRevision,
      singleWinnerRequired: true,
      duplicateReservationRejected: true,
      atomicConsumptionRequired: true,
      appendOnlyAuditRequired: true,
    },
    rehearsal,
    lifecycle: {
      status: "atomic_ledger_contract_prepared_not_persisted",
      reservationPersisted: false,
      permitIssued: false,
      permitUsable: false,
      permitConsumed: false,
      actionExecuted: false,
      eventDelivered: false,
    },
    releaseGates: {
      atomicLedgerContractPrepared: true,
      phase26ContractLinked: true,
      ledgerPersistenceAllowed: false,
      permitIssuanceAllowed: false,
      permitConsumptionAllowed: false,
      authorizationActivationAllowed: false,
      manualObservationAllowed: false,
      automaticRetryAllowed: false,
      automaticDeliveryAllowed: false,
      productionDeliveryAllowed: false,
      campaignMutationAllowed: false,
      budgetMutationAllowed: false,
      audienceMutationAllowed: false,
      deploymentAllowed: false,
    },
    issueCodes: [],
    errorCode: null,
  };
  return { approved: true, issueCodes: [], preparation };
}

export function validatePhase27Preparation(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_repeatability_atomic_ledger_preparation_v1" || input?.phase !== 27 || input?.environment !== gate.environment) issues.add("phase27_preparation_invalid");
  if (input?.passed !== true || input?.sanitized !== true) issues.add("atomic_ledger_preparation_not_approved");
  if (input?.containsSecrets !== false || input?.containsPersonalData !== false || input?.containsTemporaryCode !== false) issues.add("atomic_ledger_preparation_not_sanitized");
  if (input?.payloadPersisted !== false || input?.rawResponsePersisted !== false || input?.screenshotPersisted !== false) issues.add("sensitive_artifact_persisted");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");

  const source = input?.sourceEvidence ?? {};
  for (const fingerprint of [source.phase26Fingerprint, source.phase25Fingerprint]) if (!HASH.test(fingerprint ?? "")) issues.add("source_evidence_invalid");
  if (source.phase26Approved !== true) issues.add("phase26_source_not_approved");
  if (input?.slot?.slotId !== gate.targetSlot.slotId || input?.slot?.sampleOrdinal !== gate.targetSlot.sampleOrdinal) issues.add("ledger_slot_invalid");
  if (!canonicalEventIsValid(input?.event)) issues.add("canonical_event_contract_invalid");
  const eventHash = input?.event?.eventIdFingerprint;
  const recordHash = input?.event?.syntheticRecordFingerprint;
  if (![eventHash, recordHash].every((value) => HASH.test(value ?? "")) || eventHash === recordHash) issues.add("event_identity_invalid");

  const identity = input?.identity ?? {};
  const identityValues = [identity.ledgerReferenceFingerprint, identity.ledgerKeyFingerprint, identity.contractReferenceFingerprint, identity.permitNonceFingerprint, identity.idempotencyFingerprint, eventHash, recordHash, source.phase26Fingerprint, source.phase25Fingerprint];
  if (!identityValues.every((value) => HASH.test(value ?? ""))) issues.add("ledger_identity_invalid");
  if (new Set(identityValues).size !== identityValues.length) issues.add("ledger_identity_collision");

  const generatedAt = Date.parse(input?.generatedAt ?? "");
  const sourceGeneratedAt = Date.parse(source.phase26GeneratedAt ?? "");
  const sourceExpiresAt = Date.parse(source.phase25ExpiresAt ?? "");
  if (![generatedAt, sourceGeneratedAt, sourceExpiresAt].every(Number.isFinite)) issues.add("ledger_time_invalid");
  else {
    if (generatedAt < sourceGeneratedAt || generatedAt > now + 300_000) issues.add("ledger_timestamp_invalid");
    if (sourceExpiresAt <= now) issues.add("source_contract_expired");
  }

  const policy = input?.atomicPolicy ?? {};
  if (policy.strategy !== "compare_and_set" || policy.expectedRevision !== 0 || policy.proposedRevision !== 1) issues.add("atomic_revision_policy_invalid");
  for (const control of ["singleWinnerRequired", "duplicateReservationRejected", "atomicConsumptionRequired", "appendOnlyAuditRequired"]) if (policy[control] !== true) issues.add(`atomic_policy_invalid:${control}`);
  const rehearsal = input?.rehearsal ?? {};
  if (rehearsal.inMemoryOnly !== true || rehearsal.attemptCount !== 2 || rehearsal.winnerCount !== 1 || rehearsal.duplicateRejectionCount !== 1) issues.add("atomic_rehearsal_failed");
  if (rehearsal.databaseTouched !== false || rehearsal.filesystemLedgerTouched !== false || rehearsal.networkTouched !== false) issues.add("atomic_rehearsal_left_memory");

  const lifecycle = input?.lifecycle ?? {};
  if (lifecycle.status !== "atomic_ledger_contract_prepared_not_persisted") issues.add("ledger_lifecycle_invalid");
  for (const control of ["reservationPersisted", "permitIssued", "permitUsable", "permitConsumed", "actionExecuted", "eventDelivered"]) if (lifecycle[control] !== false) issues.add(`ledger_falsely_advanced:${control}`);
  const release = input?.releaseGates ?? {};
  if (release.atomicLedgerContractPrepared !== true || release.phase26ContractLinked !== true) issues.add("ledger_gate_not_prepared");
  for (const control of [
    "ledgerPersistenceAllowed", "permitIssuanceAllowed", "permitConsumptionAllowed",
    "authorizationActivationAllowed", "manualObservationAllowed", "automaticRetryAllowed",
    "automaticDeliveryAllowed", "productionDeliveryAllowed", "campaignMutationAllowed",
    "budgetMutationAllowed", "audienceMutationAllowed", "deploymentAllowed",
  ]) if (release[control] !== false) issues.add(`release_gate_invalid:${control}`);
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

function phase26Fixture(now = Date.now()) {
  return {
    format: "atlas_meta_repeatability_manual_permit_contract_v1", phase: 26, environment: "staging_clone",
    generatedAt: new Date(now - 30_000).toISOString(), passed: true, sanitized: true,
    containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false, payloadPersisted: false, rawResponsePersisted: false, screenshotPersisted: false,
    sourceEvidence: { phase25Approved: true, phase25Fingerprint: "1".repeat(64), phase25GeneratedAt: new Date(now - 60_000).toISOString(), phase25ExpiresAt: new Date(now + 4 * 60_000).toISOString(), phase24Fingerprint: "2".repeat(64), phase23Fingerprint: "3".repeat(64), baselineEventIdFingerprint: "4".repeat(64), operatorReconfirmationFingerprint: "5".repeat(64) },
    slot: { slotId: "repeatability_02", sampleOrdinal: 2 },
    event: { eventName: "QualifiedLead", classification: "commercial_progress", eventIdFingerprint: "6".repeat(64), syntheticRecordFingerprint: "7".repeat(64) },
    binding: { operatorRole: "operator", operatorReferenceFingerprint: "5".repeat(64), contractReferenceFingerprint: sha256("phase26-contract-reference") },
    antiReplay: { permitNonceFingerprint: "9".repeat(64), idempotencyFingerprint: "a".repeat(64), uniqueAndUnusedAttested: true, atomicLedgerRequiredBeforeIssuance: true },
    permitPolicy: { maximumValiditySeconds: 120, singleUse: true, consumeBeforeAction: true, atomicConsumptionRequired: true, reuseForbidden: true, mustExpireBeforeSourceReceipt: true },
    lifecycle: { status: "contract_prepared_not_issued", issued: false, usable: false, consumed: false, executed: false, eventDelivered: false },
    releaseGates: { manualPermitContractPrepared: true, phase25ReceiptLinked: true, permitIssuanceAllowed: false, authorizationActivationAllowed: false, manualObservationAllowed: false, automaticRetryAllowed: false, automaticDeliveryAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
}

function requestFixture(contract, now = Date.now()) {
  return {
    format: "atlas_meta_repeatability_atomic_ledger_request_v1", phase: 27, environment: "staging_clone",
    ledgerReference: "sample02-atomic-ledger-reference", requestedAt: new Date(now - 5_000).toISOString(), sourceContractFingerprint: evidenceFingerprint(contract),
    slot: { slotId: "repeatability_02", sampleOrdinal: 2 },
    event: { eventName: contract.event.eventName, classification: contract.event.classification, eventIdFingerprint: contract.event.eventIdFingerprint, syntheticRecordFingerprint: contract.event.syntheticRecordFingerprint },
    operation: { type: "prepare_atomic_reservation_contract", expectedRevision: 0, proposedRevision: 1, persistReservation: false, issuePermit: false, consumePermit: false, executeAction: false, deliverEvent: false },
    controls: { sourceContractReviewed: true, compareAndSetRequired: true, singleWinnerRequired: true, duplicateReservationRejected: true, atomicConsumeBeforeAction: true, appendOnlyAuditRequired: true, realCustomerDataIncluded: false, temporaryCodeRemainsInOfficialSurface: true, stopWithoutRetry: true, campaignUnchanged: true, budgetUnchanged: true, audienceUnchanged: true, noPerformanceClaim: true },
  };
}

function runSelfTest() {
  const now = Date.now();
  const contract = phase26Fixture(now);
  const request = requestFixture(contract, now);
  const created = createAtomicLedgerPreparation(contract, request, now);
  const validation = validatePhase27Preparation(created.preparation, now);
  const tests = [
    { id: "approved_sanitized_preparation", passed: created.approved && validation.approved, issueCodes: validation.issueCodes },
    { id: "single_winner_proven", passed: created.preparation?.rehearsal?.winnerCount === 1 },
    { id: "duplicate_rejected", passed: created.preparation?.rehearsal?.duplicateRejectionCount === 1 },
    { id: "ledger_not_persisted", passed: created.preparation?.lifecycle?.reservationPersisted === false && created.preparation?.releaseGates?.ledgerPersistenceAllowed === false },
    { id: "permit_not_issued_or_consumed", passed: created.preparation?.lifecycle?.permitIssued === false && created.preparation?.lifecycle?.permitConsumed === false },
    { id: "raw_ledger_reference_not_persisted", passed: !canonicalJson(created.preparation).includes("sample02-atomic-ledger-reference") },
  ];
  const requestTest = (id, mutate, code) => {
    const source = phase26Fixture(now); const value = requestFixture(source, now); mutate(value, source);
    const result = createAtomicLedgerPreparation(source, value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  requestTest("source_fingerprint_required", (v) => { v.sourceContractFingerprint = "b".repeat(64); }, "source_contract_fingerprint_mismatch");
  requestTest("slot_must_match", (v) => { v.slot.slotId = "repeatability_03"; }, "ledger_slot_mismatch");
  requestTest("event_name_must_match", (v) => { v.event.eventName = "Contact"; }, "source_event_mismatch:eventName");
  requestTest("event_hash_must_match", (v) => { v.event.eventIdFingerprint = "b".repeat(64); }, "source_event_mismatch:eventIdFingerprint");
  requestTest("ledger_reference_required", (v) => { v.ledgerReference = "x"; }, "ledger_reference_invalid");
  requestTest("ledger_reference_source_collision", (v) => { v.ledgerReference = "phase26-contract-reference"; }, "ledger_reference_collision_with_source");
  requestTest("email_blocked", (v) => { v.ledgerReference = "person@example.com"; }, "forbidden_material_detected");
  requestTest("operation_type_fixed", (v) => { v.operation.type = "persist"; }, "ledger_operation_invalid");
  requestTest("expected_revision_fixed", (v) => { v.operation.expectedRevision = 1; }, "ledger_revision_contract_invalid");
  requestTest("proposed_revision_fixed", (v) => { v.operation.proposedRevision = 2; }, "ledger_revision_contract_invalid");
  requestTest("persistence_blocked", (v) => { v.operation.persistReservation = true; }, "ledger_operation_must_remain_inactive:persistReservation");
  requestTest("issuance_blocked", (v) => { v.operation.issuePermit = true; }, "ledger_operation_must_remain_inactive:issuePermit");
  requestTest("consumption_blocked", (v) => { v.operation.consumePermit = true; }, "ledger_operation_must_remain_inactive:consumePermit");
  requestTest("execution_blocked", (v) => { v.operation.executeAction = true; }, "ledger_operation_must_remain_inactive:executeAction");
  requestTest("delivery_blocked", (v) => { v.operation.deliverEvent = true; }, "ledger_operation_must_remain_inactive:deliverEvent");
  requestTest("compare_and_set_required", (v) => { v.controls.compareAndSetRequired = false; }, "ledger_control_missing:compareAndSetRequired");
  requestTest("single_winner_required", (v) => { v.controls.singleWinnerRequired = false; }, "ledger_control_missing:singleWinnerRequired");
  requestTest("duplicate_rejection_required", (v) => { v.controls.duplicateReservationRejected = false; }, "ledger_control_missing:duplicateReservationRejected");
  requestTest("atomic_consume_required", (v) => { v.controls.atomicConsumeBeforeAction = false; }, "ledger_control_missing:atomicConsumeBeforeAction");
  requestTest("append_only_audit_required", (v) => { v.controls.appendOnlyAuditRequired = false; }, "ledger_control_missing:appendOnlyAuditRequired");
  requestTest("real_customer_data_blocked", (v) => { v.controls.realCustomerDataIncluded = true; }, "real_customer_data_forbidden");
  requestTest("temporary_code_must_remain_off_atlas", (v) => { v.controls.temporaryCodeRemainsInOfficialSurface = false; }, "ledger_control_missing:temporaryCodeRemainsInOfficialSurface");
  requestTest("retry_block_required", (v) => { v.controls.stopWithoutRetry = false; }, "ledger_control_missing:stopWithoutRetry");

  const invalidSource = phase26Fixture(now); invalidSource.releaseGates.productionDeliveryAllowed = true;
  const invalidResult = createAtomicLedgerPreparation(invalidSource, requestFixture(invalidSource, now), now);
  tests.push({ id: "valid_phase26_contract_required", passed: !invalidResult.approved && invalidResult.issueCodes.some((issue) => issue.includes("phase26:")) });
  requestTest("used_source_contract_blocked", (v, source) => { source.lifecycle.issued = true; v.sourceContractFingerprint = evidenceFingerprint(source); }, "source_contract_already_used");

  const preparationTest = (id, mutate, code) => {
    const value = structuredClone(created.preparation); mutate(value);
    const result = validatePhase27Preparation(value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  preparationTest("ledger_persistence_gate_closed", (v) => { v.releaseGates.ledgerPersistenceAllowed = true; }, "release_gate_invalid:ledgerPersistenceAllowed");
  preparationTest("permit_issuance_gate_closed", (v) => { v.releaseGates.permitIssuanceAllowed = true; }, "release_gate_invalid:permitIssuanceAllowed");
  preparationTest("permit_consumption_gate_closed", (v) => { v.releaseGates.permitConsumptionAllowed = true; }, "release_gate_invalid:permitConsumptionAllowed");
  preparationTest("production_gate_closed", (v) => { v.releaseGates.productionDeliveryAllowed = true; }, "release_gate_invalid:productionDeliveryAllowed");
  preparationTest("reservation_not_persisted", (v) => { v.lifecycle.reservationPersisted = true; }, "ledger_falsely_advanced:reservationPersisted");
  preparationTest("permit_not_issued", (v) => { v.lifecycle.permitIssued = true; }, "ledger_falsely_advanced:permitIssued");
  preparationTest("permit_not_consumed", (v) => { v.lifecycle.permitConsumed = true; }, "ledger_falsely_advanced:permitConsumed");
  preparationTest("event_not_delivered", (v) => { v.lifecycle.eventDelivered = true; }, "ledger_falsely_advanced:eventDelivered");
  preparationTest("compare_and_set_immutable", (v) => { v.atomicPolicy.strategy = "last_write_wins"; }, "atomic_revision_policy_invalid");
  preparationTest("revision_immutable", (v) => { v.atomicPolicy.proposedRevision = 2; }, "atomic_revision_policy_invalid");
  preparationTest("single_winner_immutable", (v) => { v.atomicPolicy.singleWinnerRequired = false; }, "atomic_policy_invalid:singleWinnerRequired");
  preparationTest("winner_count_exact", (v) => { v.rehearsal.winnerCount = 2; }, "atomic_rehearsal_failed");
  preparationTest("duplicate_count_exact", (v) => { v.rehearsal.duplicateRejectionCount = 0; }, "atomic_rehearsal_failed");
  preparationTest("database_touch_blocked", (v) => { v.rehearsal.databaseTouched = true; }, "atomic_rehearsal_left_memory");
  preparationTest("filesystem_ledger_touch_blocked", (v) => { v.rehearsal.filesystemLedgerTouched = true; }, "atomic_rehearsal_left_memory");
  preparationTest("network_touch_blocked", (v) => { v.rehearsal.networkTouched = true; }, "atomic_rehearsal_left_memory");
  preparationTest("ledger_identity_collision_blocked", (v) => { v.identity.ledgerReferenceFingerprint = v.identity.permitNonceFingerprint; }, "ledger_identity_collision");
  preparationTest("source_contract_must_remain_live", (v) => { v.sourceEvidence.phase25ExpiresAt = new Date(now - 1).toISOString(); }, "source_contract_expired");
  preparationTest("canonical_event_required", (v) => { v.event.eventName = "UnknownEvent"; }, "canonical_event_contract_invalid");
  preparationTest("personal_data_key_blocked", (v) => { v.email = "person@example.com"; }, "forbidden_material_detected");

  const conflict = simulateAtomicReservation("f".repeat(64), 1);
  tests.push({ id: "revision_conflict_has_no_winner", passed: conflict.winnerCount === 0 && conflict.duplicateRejectionCount === 0 });
  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = readJson(process.argv[2] ?? "config/fixtures/meta-repeatability-sample-02-atomic-ledger-template.json");
    const result = validatePhase27Preparation(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
