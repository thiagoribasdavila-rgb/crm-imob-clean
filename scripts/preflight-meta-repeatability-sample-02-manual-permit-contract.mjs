import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePhase25Receipt } from "./preflight-meta-repeatability-sample-02-jit-confirmation.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const gate = readJson("config/meta-repeatability-sample-02-manual-permit-contract-gate.json");
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

function containsForbiddenMaterial(input, allowRawReferences = false) {
  const forbiddenKeys = new Set([
    "accessToken", "authorization", "password", "secretKey", "serviceRoleKey",
    "testEventCode", "payload", "rawPayload", "rawResponse", "responseBody",
    "email", "phone", "cpf", "address", "income", "projectRef", "supabaseUrl",
  ]);
  const visit = (value, parentKey = "") => {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (allowRawReferences && parentKey === "reference" && validReference(normalized)) return false;
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

function sourceEvidenceFingerprints(receipt) {
  return [
    receipt?.sourceEvidence?.phase24Fingerprint,
    receipt?.sourceEvidence?.phase23Fingerprint,
    receipt?.sourceEvidence?.baselineEventIdFingerprint,
    receipt?.humanGovernance?.confirmationReferenceFingerprint,
    ...["director", "security", "operator", "reviewer"].map((role) => receipt?.humanGovernance?.[`${role}ReconfirmationFingerprint`]),
    receipt?.event?.eventIdFingerprint,
    receipt?.event?.syntheticRecordFingerprint,
  ];
}

export function validateManualPermitContractRequest(input, phase25Receipt, now = Date.now()) {
  const issues = new Set();
  const source = validatePhase25Receipt(phase25Receipt, now);
  if (!source.approved) for (const issue of source.issueCodes) issues.add(`phase25:${issue}`);
  if (input?.format !== "atlas_meta_repeatability_manual_permit_contract_request_v1" || input?.phase !== 26 || input?.environment !== gate.environment) issues.add("permit_contract_request_invalid");
  if (!validReference(input?.contractReference)) issues.add("contract_reference_invalid");
  const contractReferenceHash = typeof input?.contractReference === "string" ? sha256(input.contractReference) : null;
  if (containsForbiddenMaterial(input, true)) issues.add("forbidden_material_detected");
  if (!HASH.test(input?.sourceReceiptFingerprint ?? "") || input?.sourceReceiptFingerprint !== evidenceFingerprint(phase25Receipt)) issues.add("source_receipt_fingerprint_mismatch");
  if (input?.slot?.slotId !== gate.targetSlot.slotId || input?.slot?.sampleOrdinal !== gate.targetSlot.sampleOrdinal) issues.add("permit_slot_mismatch");

  const event = input?.event ?? {};
  const sourceEvent = phase25Receipt?.event ?? {};
  if (!canonicalEventIsValid(event)) issues.add("canonical_event_contract_invalid");
  for (const field of ["eventName", "classification", "eventIdFingerprint", "syntheticRecordFingerprint"]) if (event[field] !== sourceEvent[field]) issues.add(`source_event_mismatch:${field}`);

  if (input?.operatorBinding?.role !== gate.operatorBinding.requiredRole || !validReference(input?.operatorBinding?.reference)) issues.add("operator_binding_invalid");
  const operatorHash = typeof input?.operatorBinding?.reference === "string" ? sha256(input.operatorBinding.reference) : null;
  if (operatorHash !== phase25Receipt?.humanGovernance?.operatorReconfirmationFingerprint) issues.add("operator_reconfirmation_mismatch");

  const nonceReference = input?.antiReplay?.nonce?.reference;
  const idempotencyReference = input?.antiReplay?.idempotencyKey?.reference;
  if (!validReference(nonceReference) || !validReference(idempotencyReference)) issues.add("anti_replay_reference_invalid");
  const nonceHash = typeof nonceReference === "string" ? sha256(nonceReference) : null;
  const idempotencyHash = typeof idempotencyReference === "string" ? sha256(idempotencyReference) : null;
  if (nonceHash === idempotencyHash) issues.add("nonce_and_idempotency_must_differ");
  const protectedFingerprints = [...sourceEvidenceFingerprints(phase25Receipt), contractReferenceHash];
  if ([nonceHash, idempotencyHash].some((value) => protectedFingerprints.includes(value))) issues.add("anti_replay_collision_with_source");
  if (sourceEvidenceFingerprints(phase25Receipt).includes(contractReferenceHash)) issues.add("contract_reference_collision_with_source");
  if (input?.antiReplay?.uniqueAndUnusedAttested !== true) issues.add("anti_replay_uniqueness_attestation_required");

  const requestedAt = Date.parse(input?.requestedAt ?? "");
  const sourceGeneratedAt = Date.parse(phase25Receipt?.generatedAt ?? "");
  const sourceExpiresAt = Date.parse(phase25Receipt?.expiresAt ?? "");
  const validitySeconds = input?.requestedValiditySeconds;
  const skewMs = gate.permitPolicy.clockSkewSeconds * 1000;
  if (![requestedAt, sourceGeneratedAt, sourceExpiresAt].every(Number.isFinite)) issues.add("permit_contract_time_invalid");
  else {
    if (requestedAt < sourceGeneratedAt || requestedAt > now + skewMs) issues.add("permit_contract_timestamp_invalid");
    if (sourceExpiresAt <= now) issues.add("source_receipt_expired");
    if (!Number.isInteger(validitySeconds) || validitySeconds < gate.permitPolicy.minimumValiditySeconds || validitySeconds > gate.permitPolicy.maximumValiditySeconds) issues.add("permit_validity_out_of_bounds");
    else if (now + validitySeconds * 1000 > sourceExpiresAt) issues.add("permit_validity_exceeds_source_receipt");
  }

  const controls = input?.controls ?? {};
  for (const control of [
    "sourceReceiptReviewed", "canonicalEventReviewed", "syntheticRecordReviewed",
    "atomicConsumeBeforeAction", "singleUseOnly", "temporaryCodeRemainsInOfficialSurface",
    "stopWithoutRetry", "campaignUnchanged", "budgetUnchanged", "audienceUnchanged",
    "noPerformanceClaim",
  ]) if (controls[control] !== true) issues.add(`permit_control_missing:${control}`);
  if (controls.realCustomerDataIncluded !== false) issues.add("real_customer_data_forbidden");
  const issuance = input?.issuance ?? {};
  for (const control of ["issued", "usable", "consumed", "executed", "eventDelivered"]) if (issuance[control] !== false) issues.add(`permit_must_not_be_issued_or_used:${control}`);
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

export function createManualPermitContract(phase25Receipt, request, now = Date.now()) {
  const validation = validateManualPermitContractRequest(request, phase25Receipt, now);
  if (!validation.approved) return { approved: false, issueCodes: validation.issueCodes, contract: null };
  const contract = {
    format: "atlas_meta_repeatability_manual_permit_contract_v1",
    phase: 26,
    environment: gate.environment,
    generatedAt: new Date(now).toISOString(),
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    rawResponsePersisted: false,
    screenshotPersisted: false,
    sourceEvidence: {
      phase25Approved: true,
      phase25Fingerprint: evidenceFingerprint(phase25Receipt),
      phase25GeneratedAt: phase25Receipt.generatedAt,
      phase25ExpiresAt: phase25Receipt.expiresAt,
      phase24Fingerprint: phase25Receipt.sourceEvidence.phase24Fingerprint,
      phase23Fingerprint: phase25Receipt.sourceEvidence.phase23Fingerprint,
      baselineEventIdFingerprint: phase25Receipt.sourceEvidence.baselineEventIdFingerprint,
      operatorReconfirmationFingerprint: phase25Receipt.humanGovernance.operatorReconfirmationFingerprint,
    },
    slot: { slotId: gate.targetSlot.slotId, sampleOrdinal: gate.targetSlot.sampleOrdinal },
    event: {
      eventName: phase25Receipt.event.eventName,
      classification: phase25Receipt.event.classification,
      eventIdFingerprint: phase25Receipt.event.eventIdFingerprint,
      syntheticRecordFingerprint: phase25Receipt.event.syntheticRecordFingerprint,
    },
    binding: {
      operatorRole: gate.operatorBinding.requiredRole,
      operatorReferenceFingerprint: sha256(request.operatorBinding.reference),
      contractReferenceFingerprint: sha256(request.contractReference),
    },
    antiReplay: {
      permitNonceFingerprint: sha256(request.antiReplay.nonce.reference),
      idempotencyFingerprint: sha256(request.antiReplay.idempotencyKey.reference),
      uniqueAndUnusedAttested: true,
      atomicLedgerRequiredBeforeIssuance: true,
    },
    permitPolicy: {
      maximumValiditySeconds: request.requestedValiditySeconds,
      singleUse: true,
      consumeBeforeAction: true,
      atomicConsumptionRequired: true,
      reuseForbidden: true,
      mustExpireBeforeSourceReceipt: true,
    },
    lifecycle: {
      status: "contract_prepared_not_issued",
      issued: false,
      usable: false,
      consumed: false,
      executed: false,
      eventDelivered: false,
    },
    releaseGates: {
      manualPermitContractPrepared: true,
      phase25ReceiptLinked: true,
      permitIssuanceAllowed: false,
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
  return { approved: true, issueCodes: [], contract };
}

export function validatePhase26Contract(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_repeatability_manual_permit_contract_v1" || input?.phase !== 26 || input?.environment !== gate.environment) issues.add("phase26_contract_invalid");
  if (input?.passed !== true || input?.sanitized !== true) issues.add("permit_contract_not_approved");
  if (input?.containsSecrets !== false || input?.containsPersonalData !== false || input?.containsTemporaryCode !== false) issues.add("permit_contract_not_sanitized");
  if (input?.payloadPersisted !== false || input?.rawResponsePersisted !== false || input?.screenshotPersisted !== false) issues.add("sensitive_artifact_persisted");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");
  const source = input?.sourceEvidence ?? {};
  for (const fingerprint of [source.phase25Fingerprint, source.phase24Fingerprint, source.phase23Fingerprint, source.baselineEventIdFingerprint, source.operatorReconfirmationFingerprint]) if (!HASH.test(fingerprint ?? "")) issues.add("source_evidence_invalid");
  if (input?.slot?.slotId !== gate.targetSlot.slotId || input?.slot?.sampleOrdinal !== gate.targetSlot.sampleOrdinal) issues.add("contract_slot_invalid");
  if (!canonicalEventIsValid(input?.event)) issues.add("canonical_event_contract_invalid");
  const eventHash = input?.event?.eventIdFingerprint;
  const recordHash = input?.event?.syntheticRecordFingerprint;
  if (![eventHash, recordHash].every((value) => HASH.test(value ?? "")) || eventHash === recordHash || eventHash === source.baselineEventIdFingerprint || recordHash === source.baselineEventIdFingerprint) issues.add("event_independence_invalid");

  const binding = input?.binding ?? {};
  if (binding.operatorRole !== gate.operatorBinding.requiredRole || !HASH.test(binding.operatorReferenceFingerprint ?? "") || binding.operatorReferenceFingerprint !== source.operatorReconfirmationFingerprint || !HASH.test(binding.contractReferenceFingerprint ?? "")) issues.add("operator_binding_invalid");
  const antiReplay = input?.antiReplay ?? {};
  if (!HASH.test(antiReplay.permitNonceFingerprint ?? "") || !HASH.test(antiReplay.idempotencyFingerprint ?? "") || antiReplay.permitNonceFingerprint === antiReplay.idempotencyFingerprint) issues.add("anti_replay_fingerprint_invalid");
  const protectedFingerprints = [source.phase25Fingerprint, source.phase24Fingerprint, source.phase23Fingerprint, source.baselineEventIdFingerprint, source.operatorReconfirmationFingerprint, eventHash, recordHash, binding.contractReferenceFingerprint];
  if ([antiReplay.permitNonceFingerprint, antiReplay.idempotencyFingerprint].some((value) => protectedFingerprints.includes(value))) issues.add("anti_replay_collision_with_source");
  if (antiReplay.uniqueAndUnusedAttested !== true || antiReplay.atomicLedgerRequiredBeforeIssuance !== true) issues.add("anti_replay_contract_invalid");

  const generatedAt = Date.parse(input?.generatedAt ?? "");
  const sourceGeneratedAt = Date.parse(source.phase25GeneratedAt ?? "");
  const sourceExpiresAt = Date.parse(source.phase25ExpiresAt ?? "");
  const validitySeconds = input?.permitPolicy?.maximumValiditySeconds;
  if (![generatedAt, sourceGeneratedAt, sourceExpiresAt].every(Number.isFinite)) issues.add("contract_time_invalid");
  else {
    if (generatedAt < sourceGeneratedAt || generatedAt > now + gate.permitPolicy.clockSkewSeconds * 1000) issues.add("contract_timestamp_invalid");
    if (sourceExpiresAt <= now) issues.add("source_receipt_expired");
    if (!Number.isInteger(validitySeconds) || validitySeconds < gate.permitPolicy.minimumValiditySeconds || validitySeconds > gate.permitPolicy.maximumValiditySeconds) issues.add("permit_validity_out_of_bounds");
    else if (generatedAt + validitySeconds * 1000 > sourceExpiresAt) issues.add("permit_validity_exceeds_source_receipt");
  }
  const policy = input?.permitPolicy ?? {};
  for (const control of ["singleUse", "consumeBeforeAction", "atomicConsumptionRequired", "reuseForbidden", "mustExpireBeforeSourceReceipt"]) if (policy[control] !== true) issues.add(`permit_policy_invalid:${control}`);
  const lifecycle = input?.lifecycle ?? {};
  if (lifecycle.status !== "contract_prepared_not_issued") issues.add("permit_lifecycle_invalid");
  for (const control of ["issued", "usable", "consumed", "executed", "eventDelivered"]) if (lifecycle[control] !== false) issues.add(`permit_falsely_issued_or_used:${control}`);
  const release = input?.releaseGates ?? {};
  if (release.manualPermitContractPrepared !== true || release.phase25ReceiptLinked !== true) issues.add("contract_gate_not_prepared");
  for (const control of [
    "permitIssuanceAllowed", "authorizationActivationAllowed", "manualObservationAllowed",
    "automaticRetryAllowed", "automaticDeliveryAllowed", "productionDeliveryAllowed",
    "campaignMutationAllowed", "budgetMutationAllowed", "audienceMutationAllowed", "deploymentAllowed",
  ]) if (release[control] !== false) issues.add(`release_gate_invalid:${control}`);
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

function phase25Fixture(now = Date.now()) {
  const oldRefs = Object.fromEntries(["director", "security", "operator", "reviewer"].map((role) => [role, sha256(`draft-${role}-reference`)]));
  const newRefs = Object.fromEntries(["director", "security", "operator", "reviewer"].map((role) => [role, sha256(`${role}-sample02-jit-new`)]));
  return {
    format: "atlas_meta_repeatability_jit_confirmation_receipt_v1", phase: 25, environment: "staging_clone",
    generatedAt: new Date(now - 30_000).toISOString(), expiresAt: new Date(now + 4 * 60_000).toISOString(), passed: true, sanitized: true,
    containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false, payloadPersisted: false, rawResponsePersisted: false, screenshotPersisted: false,
    sourceEvidence: {
      phase24Approved: true, phase24Fingerprint: "1".repeat(64), phase24ExpiresAt: new Date(now + 20 * 60_000).toISOString(), phase23Fingerprint: "2".repeat(64), baselineEventIdFingerprint: "3".repeat(64),
      draftRoleReferenceFingerprints: oldRefs,
    },
    slot: { slotId: "repeatability_02", sampleOrdinal: 2 },
    event: { eventName: "QualifiedLead", classification: "commercial_progress", eventIdFingerprint: "4".repeat(64), syntheticRecordFingerprint: "5".repeat(64) },
    humanGovernance: {
      confirmationReferenceFingerprint: "6".repeat(64), directorReconfirmed: true, securityReconfirmed: true, operatorReconfirmed: true, reviewerReconfirmed: true,
      directorReconfirmationFingerprint: newRefs.director, securityReconfirmationFingerprint: newRefs.security, operatorReconfirmationFingerprint: newRefs.operator, reviewerReconfirmationFingerprint: newRefs.reviewer,
      fourDistinctReconfirmations: true, draftReferencesNotReusedVerified: true,
    },
    activation: { status: "just_in_time_confirmed_activation_gate_closed", singleUse: true, consumed: false, authorizationActivated: false, manualObservationAllowed: false },
    releaseGates: { jitConfirmationReceiptPrepared: true, phase24DraftLinked: true, authorizationActivationAllowed: false, manualObservationAllowed: false, automaticRetryAllowed: false, automaticDeliveryAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
}

function requestFixture(receipt, now = Date.now()) {
  return {
    format: "atlas_meta_repeatability_manual_permit_contract_request_v1", phase: 26, environment: "staging_clone",
    contractReference: "sample02-permit-contract", requestedAt: new Date(now - 5_000).toISOString(), sourceReceiptFingerprint: evidenceFingerprint(receipt), requestedValiditySeconds: 120,
    slot: { slotId: "repeatability_02", sampleOrdinal: 2 },
    event: { eventName: receipt.event.eventName, classification: receipt.event.classification, eventIdFingerprint: receipt.event.eventIdFingerprint, syntheticRecordFingerprint: receipt.event.syntheticRecordFingerprint },
    operatorBinding: { role: "operator", reference: "operator-sample02-jit-new" },
    antiReplay: { nonce: { reference: "sample02-permit-nonce-unique" }, idempotencyKey: { reference: "sample02-idempotency-unique" }, uniqueAndUnusedAttested: true },
    controls: { sourceReceiptReviewed: true, canonicalEventReviewed: true, syntheticRecordReviewed: true, atomicConsumeBeforeAction: true, singleUseOnly: true, realCustomerDataIncluded: false, temporaryCodeRemainsInOfficialSurface: true, stopWithoutRetry: true, campaignUnchanged: true, budgetUnchanged: true, audienceUnchanged: true, noPerformanceClaim: true },
    issuance: { issued: false, usable: false, consumed: false, executed: false, eventDelivered: false },
  };
}

function runSelfTest() {
  const now = Date.now();
  const receipt = phase25Fixture(now);
  const request = requestFixture(receipt, now);
  const created = createManualPermitContract(receipt, request, now);
  const validation = validatePhase26Contract(created.contract, now);
  const tests = [
    { id: "approved_sanitized_contract", passed: created.approved && validation.approved, issueCodes: validation.issueCodes },
    { id: "contract_not_issued", passed: created.contract?.lifecycle?.issued === false && created.contract?.releaseGates?.permitIssuanceAllowed === false },
    { id: "atomic_consumption_required", passed: created.contract?.permitPolicy?.atomicConsumptionRequired === true && created.contract?.permitPolicy?.consumeBeforeAction === true },
    { id: "raw_operator_reference_not_persisted", passed: !canonicalJson(created.contract).includes("operator-sample02-jit-new") },
  ];
  const requestTest = (id, mutate, code) => {
    const source = phase25Fixture(now); const value = requestFixture(source, now); mutate(value, source);
    const result = createManualPermitContract(source, value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  requestTest("source_fingerprint_required", (v) => { v.sourceReceiptFingerprint = "9".repeat(64); }, "source_receipt_fingerprint_mismatch");
  requestTest("slot_must_match", (v) => { v.slot.slotId = "repeatability_03"; }, "permit_slot_mismatch");
  requestTest("event_name_must_match", (v) => { v.event.eventName = "Contact"; }, "source_event_mismatch:eventName");
  requestTest("event_hash_must_match", (v) => { v.event.eventIdFingerprint = "a".repeat(64); }, "source_event_mismatch:eventIdFingerprint");
  requestTest("operator_role_required", (v) => { v.operatorBinding.role = "reviewer"; }, "operator_binding_invalid");
  requestTest("operator_must_match_reconfirmation", (v) => { v.operatorBinding.reference = "different-operator-reference"; }, "operator_reconfirmation_mismatch");
  requestTest("nonce_required", (v) => { v.antiReplay.nonce.reference = "x"; }, "anti_replay_reference_invalid");
  requestTest("idempotency_required", (v) => { v.antiReplay.idempotencyKey.reference = "x"; }, "anti_replay_reference_invalid");
  requestTest("nonce_and_idempotency_must_differ", (v) => { v.antiReplay.idempotencyKey.reference = v.antiReplay.nonce.reference; }, "nonce_and_idempotency_must_differ");
  requestTest("nonce_source_collision_blocked", (v, source) => { v.antiReplay.nonce.reference = "collision-nonce"; source.humanGovernance.confirmationReferenceFingerprint = sha256("collision-nonce"); v.sourceReceiptFingerprint = evidenceFingerprint(source); }, "anti_replay_collision_with_source");
  requestTest("contract_reference_anti_replay_collision", (v) => { v.contractReference = v.antiReplay.nonce.reference; }, "anti_replay_collision_with_source");
  requestTest("contract_reference_source_collision", (v, source) => { v.contractReference = "collision-contract-reference"; source.humanGovernance.confirmationReferenceFingerprint = sha256("collision-contract-reference"); v.sourceReceiptFingerprint = evidenceFingerprint(source); }, "contract_reference_collision_with_source");
  requestTest("unique_unused_attestation_required", (v) => { v.antiReplay.uniqueAndUnusedAttested = false; }, "anti_replay_uniqueness_attestation_required");
  requestTest("minimum_validity_required", (v) => { v.requestedValiditySeconds = 14; }, "permit_validity_out_of_bounds");
  requestTest("maximum_validity_enforced", (v) => { v.requestedValiditySeconds = 121; }, "permit_validity_out_of_bounds");
  requestTest("source_expiry_caps_permit", (v, source) => { source.expiresAt = new Date(now + 60_000).toISOString(); v.sourceReceiptFingerprint = evidenceFingerprint(source); }, "permit_validity_exceeds_source_receipt");
  requestTest("real_customer_data_blocked", (v) => { v.controls.realCustomerDataIncluded = true; }, "real_customer_data_forbidden");
  requestTest("atomic_consume_ack_required", (v) => { v.controls.atomicConsumeBeforeAction = false; }, "permit_control_missing");
  requestTest("temporary_code_must_remain_off_atlas", (v) => { v.controls.temporaryCodeRemainsInOfficialSurface = false; }, "permit_control_missing");
  requestTest("retry_block_required", (v) => { v.controls.stopWithoutRetry = false; }, "permit_control_missing");
  requestTest("pre_issuance_blocked", (v) => { v.issuance.issued = true; }, "permit_must_not_be_issued_or_used:issued");
  requestTest("pre_consumption_blocked", (v) => { v.issuance.consumed = true; }, "permit_must_not_be_issued_or_used:consumed");
  requestTest("email_blocked", (v) => { v.operatorBinding.reference = "person@example.com"; }, "forbidden_material_detected");

  const invalidReceipt = phase25Fixture(now); invalidReceipt.releaseGates.productionDeliveryAllowed = true;
  const invalidResult = createManualPermitContract(invalidReceipt, requestFixture(invalidReceipt, now), now);
  tests.push({ id: "valid_phase25_receipt_required", passed: !invalidResult.approved && invalidResult.issueCodes.some((issue) => issue.includes("phase25:")) });

  const contractTest = (id, mutate, code) => {
    const value = structuredClone(created.contract); mutate(value);
    const result = validatePhase26Contract(value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  contractTest("permit_issuance_blocked", (v) => { v.lifecycle.issued = true; }, "permit_falsely_issued_or_used:issued");
  contractTest("permit_usability_blocked", (v) => { v.lifecycle.usable = true; }, "permit_falsely_issued_or_used:usable");
  contractTest("manual_observation_blocked", (v) => { v.releaseGates.manualObservationAllowed = true; }, "release_gate_invalid:manualObservationAllowed");
  contractTest("automatic_delivery_blocked", (v) => { v.releaseGates.automaticDeliveryAllowed = true; }, "release_gate_invalid:automaticDeliveryAllowed");
  contractTest("production_blocked", (v) => { v.releaseGates.productionDeliveryAllowed = true; }, "release_gate_invalid:productionDeliveryAllowed");
  contractTest("operator_binding_immutable", (v) => { v.binding.operatorReferenceFingerprint = "b".repeat(64); }, "operator_binding_invalid");
  contractTest("nonce_idempotency_distinct", (v) => { v.antiReplay.idempotencyFingerprint = v.antiReplay.permitNonceFingerprint; }, "anti_replay_fingerprint_invalid");
  contractTest("nonce_source_collision", (v) => { v.antiReplay.permitNonceFingerprint = v.sourceEvidence.phase25Fingerprint; }, "anti_replay_collision_with_source");
  contractTest("atomic_ledger_required", (v) => { v.antiReplay.atomicLedgerRequiredBeforeIssuance = false; }, "anti_replay_contract_invalid");
  contractTest("single_use_required", (v) => { v.permitPolicy.singleUse = false; }, "permit_policy_invalid:singleUse");
  contractTest("validity_cannot_expand", (v) => { v.permitPolicy.maximumValiditySeconds = 121; }, "permit_validity_out_of_bounds");
  contractTest("baseline_event_reuse_blocked", (v) => { v.event.eventIdFingerprint = v.sourceEvidence.baselineEventIdFingerprint; }, "event_independence_invalid");
  contractTest("canonical_event_required", (v) => { v.event.eventName = "UnknownEvent"; }, "canonical_event_contract_invalid");
  contractTest("source_receipt_must_remain_live", (v) => { v.sourceEvidence.phase25ExpiresAt = new Date(now - 1).toISOString(); }, "source_receipt_expired");

  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = readJson(process.argv[2] ?? "config/fixtures/meta-repeatability-sample-02-manual-permit-contract-template.json");
    const result = validatePhase26Contract(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
