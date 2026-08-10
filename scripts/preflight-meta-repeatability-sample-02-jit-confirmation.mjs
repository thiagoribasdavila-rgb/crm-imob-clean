import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePhase24Draft } from "./preflight-meta-repeatability-sample-02-authorization.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const gate = readJson("config/meta-repeatability-sample-02-jit-confirmation-gate.json");
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

function containsForbiddenMaterial(input, allowRawRoleReferences = false) {
  const forbiddenKeys = new Set([
    "accessToken", "authorization", "password", "secretKey", "serviceRoleKey",
    "testEventCode", "payload", "rawPayload", "rawResponse", "responseBody",
    "email", "phone", "cpf", "address", "income", "projectRef", "supabaseUrl",
  ]);
  const visit = (value, parentKey = "") => {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (allowRawRoleReferences && parentKey === "reference" && validReference(normalized)) return false;
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

function draftRoleFingerprints(draft) {
  const human = draft?.humanGovernance ?? {};
  return gate.humanGovernance.roles.map((role) => human[`${role}ReferenceFingerprint`]);
}

export function validateJitConfirmationRequest(input, phase24Draft, now = Date.now()) {
  const issues = new Set();
  const source = validatePhase24Draft(phase24Draft, now);
  if (!source.approved) for (const issue of source.issueCodes) issues.add(`phase24:${issue}`);
  if (input?.format !== "atlas_meta_repeatability_jit_confirmation_request_v1" || input?.phase !== 25 || input?.environment !== gate.environment) issues.add("jit_request_contract_invalid");
  if (!validReference(input?.confirmationReference)) issues.add("confirmation_reference_invalid");
  if (containsForbiddenMaterial(input, true)) issues.add("forbidden_material_detected");
  if (!HASH.test(input?.sourceDraftFingerprint ?? "") || input?.sourceDraftFingerprint !== evidenceFingerprint(phase24Draft)) issues.add("source_draft_fingerprint_mismatch");
  if (input?.slot?.slotId !== gate.targetSlot.slotId || input?.slot?.sampleOrdinal !== gate.targetSlot.sampleOrdinal) issues.add("jit_slot_mismatch");

  const event = input?.event ?? {};
  const draftEvent = phase24Draft?.event ?? {};
  if (!canonicalEventIsValid(event)) issues.add("canonical_event_contract_invalid");
  for (const field of ["eventName", "classification", "eventIdFingerprint", "syntheticRecordFingerprint"]) if (event[field] !== draftEvent[field]) issues.add(`draft_event_mismatch:${field}`);

  const human = input?.humanReconfirmations ?? {};
  const rawReferences = [];
  const newFingerprints = [];
  for (const role of gate.humanGovernance.roles) {
    const reference = human?.[role]?.reference;
    if (human?.[role]?.confirmed !== true || !validReference(reference)) issues.add(`human_reconfirmation_missing:${role}`);
    rawReferences.push(reference);
    if (typeof reference === "string") newFingerprints.push(sha256(reference));
  }
  if (new Set(rawReferences).size !== gate.humanGovernance.minimumIndependentRoles) issues.add("four_distinct_reconfirmation_references_required");
  const oldFingerprints = draftRoleFingerprints(phase24Draft);
  if (oldFingerprints.some((value) => !HASH.test(value ?? ""))) issues.add("draft_role_fingerprints_invalid");
  if (newFingerprints.some((value) => oldFingerprints.includes(value))) issues.add("draft_role_reference_reuse_detected");
  if (human.draftReferencesNotReused !== true) issues.add("draft_reference_nonreuse_attestation_required");

  const confirmedAt = Date.parse(input?.confirmedAt ?? "");
  const expiresAt = Date.parse(input?.expiresAt ?? "");
  const sourceGeneratedAt = Date.parse(phase24Draft?.generatedAt ?? "");
  const sourceExpiresAt = Date.parse(phase24Draft?.expiresAt ?? "");
  const skewMs = gate.validity.clockSkewSeconds * 1000;
  const maximumValidityMs = gate.validity.maximumMinutes * 60 * 1000;
  if (![confirmedAt, expiresAt, sourceGeneratedAt, sourceExpiresAt].every(Number.isFinite)) issues.add("jit_window_invalid");
  else {
    if (confirmedAt < sourceGeneratedAt || confirmedAt > now + skewMs) issues.add("jit_confirmation_timestamp_invalid");
    if (expiresAt <= now) issues.add("jit_confirmation_expired");
    if (expiresAt <= confirmedAt || expiresAt - confirmedAt > maximumValidityMs) issues.add("jit_window_exceeds_limit");
    if (expiresAt > sourceExpiresAt) issues.add("jit_window_exceeds_source_draft");
  }

  const controls = input?.controls ?? {};
  for (const control of [
    "sourceDraftReviewed", "canonicalEventReviewed", "syntheticRecordReviewed",
    "singleDeliveryMaximum", "temporaryCodeRemainsInOfficialSurface", "stopWithoutRetry",
    "campaignUnchanged", "budgetUnchanged", "audienceUnchanged", "noPerformanceClaim",
  ]) if (controls[control] !== true) issues.add(`jit_control_missing:${control}`);
  if (controls.realCustomerDataIncluded !== false) issues.add("real_customer_data_forbidden");
  if (input?.execution?.executed !== false || input?.execution?.eventDelivered !== false || input?.execution?.authorizationActivated !== false) issues.add("execution_or_activation_must_not_precede_receipt");
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

export function createJitConfirmationReceipt(phase24Draft, request, now = Date.now()) {
  const validation = validateJitConfirmationRequest(request, phase24Draft, now);
  if (!validation.approved) return { approved: false, issueCodes: validation.issueCodes, receipt: null };
  const reconfirmationFingerprints = Object.fromEntries(gate.humanGovernance.roles.map((role) => [role, sha256(request.humanReconfirmations[role].reference)]));
  const draftFingerprints = Object.fromEntries(gate.humanGovernance.roles.map((role) => [role, phase24Draft.humanGovernance[`${role}ReferenceFingerprint`]]));
  const receipt = {
    format: "atlas_meta_repeatability_jit_confirmation_receipt_v1",
    phase: 25,
    environment: gate.environment,
    generatedAt: new Date(now).toISOString(),
    expiresAt: request.expiresAt,
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    rawResponsePersisted: false,
    screenshotPersisted: false,
    sourceEvidence: {
      phase24Approved: true,
      phase24Fingerprint: evidenceFingerprint(phase24Draft),
      phase24ExpiresAt: phase24Draft.expiresAt,
      phase23Fingerprint: phase24Draft.sourceEvidence.phase23Fingerprint,
      baselineEventIdFingerprint: phase24Draft.sourceEvidence.baselineEventIdFingerprint,
      draftRoleReferenceFingerprints: draftFingerprints,
    },
    slot: { slotId: gate.targetSlot.slotId, sampleOrdinal: gate.targetSlot.sampleOrdinal },
    event: {
      eventName: phase24Draft.event.eventName,
      classification: phase24Draft.event.classification,
      eventIdFingerprint: phase24Draft.event.eventIdFingerprint,
      syntheticRecordFingerprint: phase24Draft.event.syntheticRecordFingerprint,
    },
    humanGovernance: {
      confirmationReferenceFingerprint: sha256(request.confirmationReference),
      directorReconfirmed: true,
      securityReconfirmed: true,
      operatorReconfirmed: true,
      reviewerReconfirmed: true,
      directorReconfirmationFingerprint: reconfirmationFingerprints.director,
      securityReconfirmationFingerprint: reconfirmationFingerprints.security,
      operatorReconfirmationFingerprint: reconfirmationFingerprints.operator,
      reviewerReconfirmationFingerprint: reconfirmationFingerprints.reviewer,
      fourDistinctReconfirmations: true,
      draftReferencesNotReusedVerified: true,
    },
    activation: {
      status: "just_in_time_confirmed_activation_gate_closed",
      singleUse: true,
      consumed: false,
      authorizationActivated: false,
      manualObservationAllowed: false,
    },
    releaseGates: {
      jitConfirmationReceiptPrepared: true,
      phase24DraftLinked: true,
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
  return { approved: true, issueCodes: [], receipt };
}

export function validatePhase25Receipt(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_repeatability_jit_confirmation_receipt_v1" || input?.phase !== 25 || input?.environment !== gate.environment) issues.add("phase25_receipt_contract_invalid");
  if (input?.passed !== true || input?.sanitized !== true) issues.add("jit_receipt_not_approved");
  if (input?.containsSecrets !== false || input?.containsPersonalData !== false || input?.containsTemporaryCode !== false) issues.add("jit_receipt_not_sanitized");
  if (input?.payloadPersisted !== false || input?.rawResponsePersisted !== false || input?.screenshotPersisted !== false) issues.add("sensitive_artifact_persisted");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");

  const source = input?.sourceEvidence ?? {};
  if (source.phase24Approved !== true || !HASH.test(source.phase24Fingerprint ?? "") || !HASH.test(source.phase23Fingerprint ?? "") || !HASH.test(source.baselineEventIdFingerprint ?? "")) issues.add("phase24_source_invalid");
  const oldFingerprints = gate.humanGovernance.roles.map((role) => source?.draftRoleReferenceFingerprints?.[role]);
  if (!oldFingerprints.every((value) => HASH.test(value ?? "")) || new Set(oldFingerprints).size !== 4) issues.add("draft_role_fingerprint_evidence_invalid");
  if (input?.slot?.slotId !== gate.targetSlot.slotId || input?.slot?.sampleOrdinal !== gate.targetSlot.sampleOrdinal) issues.add("receipt_slot_invalid");
  if (!canonicalEventIsValid(input?.event)) issues.add("canonical_event_contract_invalid");
  const eventHash = input?.event?.eventIdFingerprint;
  const recordHash = input?.event?.syntheticRecordFingerprint;
  if (![eventHash, recordHash].every((value) => HASH.test(value ?? "")) || eventHash === recordHash || eventHash === source.baselineEventIdFingerprint || recordHash === source.baselineEventIdFingerprint) issues.add("event_independence_invalid");

  const human = input?.humanGovernance ?? {};
  for (const control of ["directorReconfirmed", "securityReconfirmed", "operatorReconfirmed", "reviewerReconfirmed", "fourDistinctReconfirmations", "draftReferencesNotReusedVerified"]) if (human[control] !== true) issues.add(`human_governance_invalid:${control}`);
  const newFingerprints = gate.humanGovernance.roles.map((role) => human[`${role}ReconfirmationFingerprint`]);
  if (!HASH.test(human.confirmationReferenceFingerprint ?? "") || !newFingerprints.every((value) => HASH.test(value ?? "")) || new Set(newFingerprints).size !== 4) issues.add("reconfirmation_fingerprint_evidence_invalid");
  if (newFingerprints.some((value) => oldFingerprints.includes(value))) issues.add("draft_role_reference_reuse_detected");

  const generatedAt = Date.parse(input?.generatedAt ?? "");
  const expiresAt = Date.parse(input?.expiresAt ?? "");
  const sourceExpiresAt = Date.parse(source.phase24ExpiresAt ?? "");
  const maximumValidityMs = gate.validity.maximumMinutes * 60 * 1000;
  if (![generatedAt, expiresAt, sourceExpiresAt].every(Number.isFinite)) issues.add("receipt_window_invalid");
  else {
    if (generatedAt > now + gate.validity.clockSkewSeconds * 1000) issues.add("receipt_timestamp_in_future");
    if (expiresAt <= now) issues.add("receipt_expired");
    if (expiresAt <= generatedAt || expiresAt - generatedAt > maximumValidityMs) issues.add("receipt_window_exceeds_limit");
    if (expiresAt > sourceExpiresAt) issues.add("receipt_window_exceeds_source_draft");
  }

  const activation = input?.activation ?? {};
  if (activation.status !== "just_in_time_confirmed_activation_gate_closed" || activation.singleUse !== true || activation.consumed !== false) issues.add("activation_contract_invalid");
  if (activation.authorizationActivated !== false || activation.manualObservationAllowed !== false) issues.add("receipt_falsely_activated");
  const release = input?.releaseGates ?? {};
  if (release.jitConfirmationReceiptPrepared !== true || release.phase24DraftLinked !== true) issues.add("receipt_gate_not_prepared");
  for (const control of [
    "authorizationActivationAllowed", "manualObservationAllowed", "automaticRetryAllowed",
    "automaticDeliveryAllowed", "productionDeliveryAllowed", "campaignMutationAllowed",
    "budgetMutationAllowed", "audienceMutationAllowed", "deploymentAllowed",
  ]) if (release[control] !== false) issues.add(`release_gate_invalid:${control}`);
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

function phase24Fixture(now = Date.now()) {
  return {
    format: "atlas_meta_repeatability_authorization_draft_v1", phase: 24, environment: "staging_clone",
    generatedAt: new Date(now - 120_000).toISOString(), expiresAt: new Date(now + 20 * 60_000).toISOString(),
    passed: true, sanitized: true, containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false,
    payloadPersisted: false, rawResponsePersisted: false, screenshotPersisted: false,
    sourceEvidence: { phase23Approved: true, phase23Fingerprint: "1".repeat(64), baselineEventIdFingerprint: "2".repeat(64) },
    slot: { slotId: "repeatability_02", sampleOrdinal: 2, sourceStatus: "awaiting_new_authorization" },
    event: { eventName: "QualifiedLead", classification: "commercial_progress", eventIdFingerprint: "3".repeat(64), syntheticRecordFingerprint: "4".repeat(64), differentFromBaseline: true },
    humanGovernance: {
      directorApproved: true, securityApproved: true, operatorApproved: true, reviewerApproved: true,
      directorReferenceFingerprint: "5".repeat(64), securityReferenceFingerprint: "6".repeat(64), operatorReferenceFingerprint: "7".repeat(64), reviewerReferenceFingerprint: "8".repeat(64),
      fourDistinctReferences: true, baselineReferencesNotReusedAttested: true,
    },
    activation: { status: "awaiting_just_in_time_confirmation", singleUse: true, authorizationActivated: false, fourRolesMustReconfirm: true, manualObservationAllowed: false },
    releaseGates: { authorizationDraftPrepared: true, phase23PlanLinked: true, authorizationActivationAllowed: false, manualObservationAllowed: false, automaticRetryAllowed: false, automaticDeliveryAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
}

function requestFixture(draft, now = Date.now()) {
  return {
    format: "atlas_meta_repeatability_jit_confirmation_request_v1", phase: 25, environment: "staging_clone",
    confirmationReference: "sample02-jit-confirmation", confirmedAt: new Date(now - 10_000).toISOString(), expiresAt: new Date(now + 4 * 60_000).toISOString(),
    sourceDraftFingerprint: evidenceFingerprint(draft),
    slot: { slotId: "repeatability_02", sampleOrdinal: 2 },
    event: { eventName: draft.event.eventName, classification: draft.event.classification, eventIdFingerprint: draft.event.eventIdFingerprint, syntheticRecordFingerprint: draft.event.syntheticRecordFingerprint },
    humanReconfirmations: {
      director: { confirmed: true, reference: "director-sample02-jit-new" }, security: { confirmed: true, reference: "security-sample02-jit-new" },
      operator: { confirmed: true, reference: "operator-sample02-jit-new" }, reviewer: { confirmed: true, reference: "reviewer-sample02-jit-new" },
      draftReferencesNotReused: true,
    },
    controls: { sourceDraftReviewed: true, canonicalEventReviewed: true, syntheticRecordReviewed: true, realCustomerDataIncluded: false, singleDeliveryMaximum: true, temporaryCodeRemainsInOfficialSurface: true, stopWithoutRetry: true, campaignUnchanged: true, budgetUnchanged: true, audienceUnchanged: true, noPerformanceClaim: true },
    execution: { executed: false, eventDelivered: false, authorizationActivated: false },
  };
}

function runSelfTest() {
  const now = Date.now();
  const draft = phase24Fixture(now);
  const request = requestFixture(draft, now);
  const created = createJitConfirmationReceipt(draft, request, now);
  const validation = validatePhase25Receipt(created.receipt, now);
  const tests = [
    { id: "approved_sanitized_receipt", passed: created.approved && validation.approved, issueCodes: validation.issueCodes },
    { id: "receipt_not_activation", passed: created.receipt?.activation?.authorizationActivated === false && created.receipt?.releaseGates?.manualObservationAllowed === false },
    { id: "four_fresh_role_hashes", passed: new Set(gate.humanGovernance.roles.map((role) => created.receipt?.humanGovernance?.[`${role}ReconfirmationFingerprint`])).size === 4 },
    { id: "raw_reconfirmations_not_persisted", passed: !canonicalJson(created.receipt).includes("director-sample02-jit-new") },
  ];
  const requestTest = (id, mutate, code) => {
    const source = phase24Fixture(now); const value = requestFixture(source, now); mutate(value, source);
    const result = createJitConfirmationReceipt(source, value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  requestTest("source_fingerprint_required", (v) => { v.sourceDraftFingerprint = "9".repeat(64); }, "source_draft_fingerprint_mismatch");
  requestTest("slot_must_match", (v) => { v.slot.slotId = "repeatability_03"; }, "jit_slot_mismatch");
  requestTest("event_name_must_match", (v) => { v.event.eventName = "Contact"; }, "draft_event_mismatch:eventName");
  requestTest("event_classification_must_match", (v) => { v.event.classification = "confirmed_outcome"; }, "draft_event_mismatch:classification");
  requestTest("event_hash_must_match", (v) => { v.event.eventIdFingerprint = "a".repeat(64); }, "draft_event_mismatch:eventIdFingerprint");
  requestTest("record_hash_must_match", (v) => { v.event.syntheticRecordFingerprint = "b".repeat(64); }, "draft_event_mismatch:syntheticRecordFingerprint");
  for (const role of gate.humanGovernance.roles) requestTest(`${role}_reconfirmation_required`, (v) => { v.humanReconfirmations[role].confirmed = false; }, `human_reconfirmation_missing:${role}`);
  requestTest("four_reconfirmations_must_differ", (v) => { v.humanReconfirmations.reviewer.reference = v.humanReconfirmations.operator.reference; }, "four_distinct_reconfirmation_references_required");
  requestTest("draft_reference_reuse_blocked", (v, source) => { v.humanReconfirmations.director.reference = "draft-director-reference"; source.humanGovernance.directorReferenceFingerprint = sha256("draft-director-reference"); v.sourceDraftFingerprint = evidenceFingerprint(source); }, "draft_role_reference_reuse_detected");
  requestTest("nonreuse_attestation_required", (v) => { v.humanReconfirmations.draftReferencesNotReused = false; }, "draft_reference_nonreuse_attestation_required");
  requestTest("confirmation_reference_required", (v) => { v.confirmationReference = "x"; }, "confirmation_reference_invalid");
  requestTest("expired_confirmation_blocked", (v) => { v.expiresAt = new Date(now - 1).toISOString(); }, "jit_confirmation_expired");
  requestTest("long_window_blocked", (v) => { v.expiresAt = new Date(now + 6 * 60_000).toISOString(); }, "jit_window_exceeds_limit");
  requestTest("source_expiry_caps_window", (v, source) => { source.expiresAt = new Date(now + 3 * 60_000).toISOString(); v.sourceDraftFingerprint = evidenceFingerprint(source); }, "jit_window_exceeds_source_draft");
  requestTest("real_customer_data_blocked", (v) => { v.controls.realCustomerDataIncluded = true; }, "real_customer_data_forbidden");
  requestTest("temporary_code_must_remain_off_atlas", (v) => { v.controls.temporaryCodeRemainsInOfficialSurface = false; }, "jit_control_missing");
  requestTest("retry_block_required", (v) => { v.controls.stopWithoutRetry = false; }, "jit_control_missing");
  requestTest("pre_execution_blocked", (v) => { v.execution.executed = true; }, "execution_or_activation_must_not_precede_receipt");
  requestTest("email_blocked", (v) => { v.humanReconfirmations.director.reference = "person@example.com"; }, "forbidden_material_detected");

  const invalidDraft = phase24Fixture(now); invalidDraft.releaseGates.productionDeliveryAllowed = true;
  const invalidDraftResult = createJitConfirmationReceipt(invalidDraft, requestFixture(invalidDraft, now), now);
  tests.push({ id: "valid_phase24_draft_required", passed: !invalidDraftResult.approved && invalidDraftResult.issueCodes.some((issue) => issue.includes("phase24:")) });

  const receiptTest = (id, mutate, code) => {
    const value = structuredClone(created.receipt); mutate(value);
    const result = validatePhase25Receipt(value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  receiptTest("receipt_activation_blocked", (v) => { v.activation.authorizationActivated = true; }, "receipt_falsely_activated");
  receiptTest("manual_observation_blocked", (v) => { v.releaseGates.manualObservationAllowed = true; }, "release_gate_invalid:manualObservationAllowed");
  receiptTest("automatic_delivery_blocked", (v) => { v.releaseGates.automaticDeliveryAllowed = true; }, "release_gate_invalid:automaticDeliveryAllowed");
  receiptTest("production_blocked", (v) => { v.releaseGates.productionDeliveryAllowed = true; }, "release_gate_invalid:productionDeliveryAllowed");
  receiptTest("new_role_hashes_must_differ", (v) => { v.humanGovernance.reviewerReconfirmationFingerprint = v.humanGovernance.operatorReconfirmationFingerprint; }, "reconfirmation_fingerprint_evidence_invalid");
  receiptTest("old_role_hashes_must_differ", (v) => { v.sourceEvidence.draftRoleReferenceFingerprints.reviewer = v.sourceEvidence.draftRoleReferenceFingerprints.operator; }, "draft_role_fingerprint_evidence_invalid");
  receiptTest("old_role_hash_reuse_blocked", (v) => { v.humanGovernance.directorReconfirmationFingerprint = v.sourceEvidence.draftRoleReferenceFingerprints.director; }, "draft_role_reference_reuse_detected");
  receiptTest("baseline_event_reuse_blocked", (v) => { v.event.eventIdFingerprint = v.sourceEvidence.baselineEventIdFingerprint; }, "event_independence_invalid");
  receiptTest("canonical_event_required", (v) => { v.event.eventName = "UnknownEvent"; }, "canonical_event_contract_invalid");
  receiptTest("expired_receipt_blocked", (v) => { v.expiresAt = new Date(now - 1).toISOString(); }, "receipt_expired");
  receiptTest("source_expiry_required", (v) => { v.sourceEvidence.phase24ExpiresAt = "invalid"; }, "receipt_window_invalid");

  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = readJson(process.argv[2] ?? "config/fixtures/meta-repeatability-sample-02-jit-confirmation-receipt-template.json");
    const result = validatePhase25Receipt(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
