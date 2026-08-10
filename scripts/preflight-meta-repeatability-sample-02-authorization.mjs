import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePhase23Plan } from "./preflight-meta-test-events-repeatability-plan.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const gate = readJson("config/meta-repeatability-sample-02-authorization-gate.json");
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

function targetSlot(phase23Plan) {
  return phase23Plan?.plan?.observationSlots?.find((slot) => slot?.slotId === gate.targetSlot.slotId);
}

function canonicalEventIsValid(event) {
  const canonical = signalContract?.canonicalEvents?.[event?.eventName];
  return Boolean(canonical && canonical.metaEligible !== false && canonical.classification === event?.classification);
}

export function validateAuthorizationRequest(input, phase23Plan, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_repeatability_authorization_request_v1" || input?.phase !== 24 || input?.environment !== gate.environment) issues.add("authorization_request_contract_invalid");
  if (!validReference(input?.requestReference)) issues.add("request_reference_invalid");
  if (containsForbiddenMaterial(input, true)) issues.add("forbidden_material_detected");

  const slot = targetSlot(phase23Plan);
  if (!slot || slot.sampleOrdinal !== gate.targetSlot.sampleOrdinal || slot.status !== gate.targetSlot.requiredInitialStatus) issues.add("phase23_target_slot_invalid");
  if (input?.slot?.slotId !== gate.targetSlot.slotId || input?.slot?.sampleOrdinal !== gate.targetSlot.sampleOrdinal) issues.add("authorization_slot_mismatch");

  const baseline = phase23Plan?.baseline ?? {};
  const event = input?.event ?? {};
  if (!canonicalEventIsValid(baseline) || !canonicalEventIsValid(event)) issues.add("canonical_event_contract_invalid");
  if (event.eventName !== baseline.eventName || event.classification !== baseline.classification) issues.add("canonical_event_mismatch");
  if (!HASH.test(event.eventIdFingerprint ?? "") || event.eventIdFingerprint === baseline.eventIdFingerprint) issues.add("new_event_fingerprint_required");
  if (!HASH.test(event.syntheticRecordFingerprint ?? "") || event.syntheticRecordFingerprint === baseline.eventIdFingerprint || event.syntheticRecordFingerprint === event.eventIdFingerprint) issues.add("unique_synthetic_record_fingerprint_required");

  const human = input?.humanAuthorizations ?? {};
  const references = [];
  for (const role of gate.humanGovernance.roles) {
    if (human?.[role]?.approved !== true || !validReference(human?.[role]?.reference)) issues.add(`human_authorization_missing:${role}`);
    references.push(human?.[role]?.reference);
  }
  if (new Set(references).size !== gate.humanGovernance.minimumIndependentRoles) issues.add("four_distinct_role_references_required");
  if (human.baselineReferencesNotReused !== true) issues.add("baseline_reference_reuse_attestation_required");

  const requestedAt = Date.parse(input?.requestedAt ?? "");
  const expiresAt = Date.parse(input?.expiresAt ?? "");
  const skewMs = gate.validity.clockSkewSeconds * 1000;
  const maximumValidityMs = gate.validity.maximumMinutes * 60 * 1000;
  if (!Number.isFinite(requestedAt) || !Number.isFinite(expiresAt)) issues.add("authorization_window_invalid");
  else {
    if (requestedAt > now + skewMs) issues.add("authorization_timestamp_in_future");
    if (expiresAt <= now) issues.add("authorization_draft_expired");
    if (expiresAt <= requestedAt || expiresAt - requestedAt > maximumValidityMs) issues.add("authorization_window_exceeds_limit");
  }

  const controls = input?.controls ?? {};
  for (const control of [
    "syntheticRecordConfirmed", "singleDeliveryMaximum", "temporaryCodeRemainsInOfficialSurface",
    "stopWithoutRetry", "campaignUnchanged", "budgetUnchanged", "audienceUnchanged",
    "noPerformanceClaim", "requiresFreshJustInTimeConfirmation",
  ]) if (controls[control] !== true) issues.add(`authorization_control_missing:${control}`);
  if (controls.realCustomerDataIncluded !== false) issues.add("real_customer_data_forbidden");
  if (input?.execution?.executed !== false || input?.execution?.eventDelivered !== false || input?.execution?.authorizationActivated !== false) issues.add("execution_or_activation_must_not_precede_draft");
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

export function createAuthorizationDraft(phase23Plan, request, now = Date.now()) {
  const issues = new Set();
  const source = validatePhase23Plan(phase23Plan, now);
  if (!source.approved) for (const issue of source.issueCodes) issues.add(`phase23:${issue}`);
  const requestValidation = validateAuthorizationRequest(request, phase23Plan, now);
  for (const issue of requestValidation.issueCodes) issues.add(`request:${issue}`);
  if (issues.size) return { approved: false, issueCodes: [...issues].sort(), draft: null };

  const roleFingerprints = Object.fromEntries(gate.humanGovernance.roles.map((role) => [role, sha256(request.humanAuthorizations[role].reference)]));
  const draft = {
    format: "atlas_meta_repeatability_authorization_draft_v1",
    phase: 24,
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
      phase23Approved: true,
      phase23Fingerprint: evidenceFingerprint(phase23Plan),
      baselineEventIdFingerprint: phase23Plan.baseline.eventIdFingerprint,
    },
    slot: {
      slotId: gate.targetSlot.slotId,
      sampleOrdinal: gate.targetSlot.sampleOrdinal,
      sourceStatus: gate.targetSlot.requiredInitialStatus,
    },
    event: {
      eventName: request.event.eventName,
      classification: request.event.classification,
      eventIdFingerprint: request.event.eventIdFingerprint,
      syntheticRecordFingerprint: request.event.syntheticRecordFingerprint,
      differentFromBaseline: true,
    },
    humanGovernance: {
      directorApproved: true,
      securityApproved: true,
      operatorApproved: true,
      reviewerApproved: true,
      directorReferenceFingerprint: roleFingerprints.director,
      securityReferenceFingerprint: roleFingerprints.security,
      operatorReferenceFingerprint: roleFingerprints.operator,
      reviewerReferenceFingerprint: roleFingerprints.reviewer,
      fourDistinctReferences: true,
      baselineReferencesNotReusedAttested: true,
    },
    activation: {
      status: "awaiting_just_in_time_confirmation",
      singleUse: true,
      authorizationActivated: false,
      fourRolesMustReconfirm: true,
      manualObservationAllowed: false,
    },
    releaseGates: {
      authorizationDraftPrepared: true,
      phase23PlanLinked: true,
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
  return { approved: true, issueCodes: [], draft };
}

export function validatePhase24Draft(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_repeatability_authorization_draft_v1" || input?.phase !== 24 || input?.environment !== gate.environment) issues.add("phase24_draft_contract_invalid");
  if (input?.passed !== true || input?.sanitized !== true) issues.add("authorization_draft_not_approved");
  if (input?.containsSecrets !== false || input?.containsPersonalData !== false || input?.containsTemporaryCode !== false) issues.add("authorization_draft_not_sanitized");
  if (input?.payloadPersisted !== false || input?.rawResponsePersisted !== false || input?.screenshotPersisted !== false) issues.add("sensitive_artifact_persisted");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");
  if (input?.sourceEvidence?.phase23Approved !== true || !HASH.test(input?.sourceEvidence?.phase23Fingerprint ?? "") || !HASH.test(input?.sourceEvidence?.baselineEventIdFingerprint ?? "")) issues.add("phase23_source_invalid");
  if (input?.slot?.slotId !== gate.targetSlot.slotId || input?.slot?.sampleOrdinal !== gate.targetSlot.sampleOrdinal || input?.slot?.sourceStatus !== gate.targetSlot.requiredInitialStatus) issues.add("draft_slot_invalid");
  if (!canonicalEventIsValid(input?.event)) issues.add("canonical_event_contract_invalid");
  for (const fingerprint of [input?.event?.eventIdFingerprint, input?.event?.syntheticRecordFingerprint]) if (!HASH.test(fingerprint ?? "")) issues.add("event_or_record_fingerprint_invalid");
  if (
    input?.event?.eventIdFingerprint === input?.event?.syntheticRecordFingerprint ||
    input?.event?.eventIdFingerprint === input?.sourceEvidence?.baselineEventIdFingerprint ||
    input?.event?.syntheticRecordFingerprint === input?.sourceEvidence?.baselineEventIdFingerprint ||
    input?.event?.differentFromBaseline !== true
  ) issues.add("event_independence_invalid");

  const human = input?.humanGovernance ?? {};
  for (const control of ["directorApproved", "securityApproved", "operatorApproved", "reviewerApproved", "fourDistinctReferences", "baselineReferencesNotReusedAttested"]) if (human[control] !== true) issues.add(`human_governance_invalid:${control}`);
  const roleFingerprints = [human.directorReferenceFingerprint, human.securityReferenceFingerprint, human.operatorReferenceFingerprint, human.reviewerReferenceFingerprint];
  if (!roleFingerprints.every((value) => HASH.test(value ?? "")) || new Set(roleFingerprints).size !== gate.humanGovernance.minimumIndependentRoles) issues.add("role_fingerprint_independence_invalid");

  const generatedAt = Date.parse(input?.generatedAt ?? "");
  const expiresAt = Date.parse(input?.expiresAt ?? "");
  const maxValidityMs = gate.validity.maximumMinutes * 60 * 1000;
  if (!Number.isFinite(generatedAt) || !Number.isFinite(expiresAt)) issues.add("draft_window_invalid");
  else {
    if (generatedAt > now + gate.validity.clockSkewSeconds * 1000) issues.add("draft_timestamp_in_future");
    if (expiresAt <= now) issues.add("draft_expired");
    if (expiresAt <= generatedAt || expiresAt - generatedAt > maxValidityMs) issues.add("draft_window_exceeds_limit");
  }

  const activation = input?.activation ?? {};
  if (activation.status !== "awaiting_just_in_time_confirmation" || activation.singleUse !== true || activation.fourRolesMustReconfirm !== true) issues.add("activation_contract_invalid");
  if (activation.authorizationActivated !== false || activation.manualObservationAllowed !== false) issues.add("draft_falsely_activated");
  const release = input?.releaseGates ?? {};
  if (release.authorizationDraftPrepared !== true || release.phase23PlanLinked !== true) issues.add("draft_gate_not_prepared");
  for (const control of [
    "authorizationActivationAllowed", "manualObservationAllowed", "automaticRetryAllowed",
    "automaticDeliveryAllowed", "productionDeliveryAllowed", "campaignMutationAllowed",
    "budgetMutationAllowed", "audienceMutationAllowed", "deploymentAllowed",
  ]) if (release[control] !== false) issues.add(`release_gate_invalid:${control}`);
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

function phase23Fixture(now = Date.now()) {
  return {
    format: "atlas_meta_test_events_repeatability_plan_v1", phase: 23, environment: "staging_clone",
    generatedAt: new Date(now - 120_000).toISOString(), passed: true, sanitized: true,
    containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false,
    payloadPersisted: false, rawResponsePersisted: false, screenshotPersisted: false,
    sourceEvidence: { phase22Approved: true, phase22Fingerprint: "1".repeat(64) },
    baseline: { accepted: true, eventName: "QualifiedLead", classification: "commercial_progress", eventIdFingerprint: "2".repeat(64), approvedSampleCount: 1 },
    plan: {
      targetApprovedSamples: 3, additionalObservationsPlanned: 2, minimumTemporalSeparationMinutes: 15,
      observationSlots: [
        { slotId: "repeatability_02", sampleOrdinal: 2, status: "awaiting_new_authorization", syntheticRecordRequired: true, uniqueEventIdRequired: true, fourIndependentRolesRequired: true, authorizationGranted: false, deliveryAllowed: false, automaticRetryAllowed: false },
        { slotId: "repeatability_03", sampleOrdinal: 3, status: "awaiting_new_authorization", syntheticRecordRequired: true, uniqueEventIdRequired: true, fourIndependentRolesRequired: true, authorizationGranted: false, deliveryAllowed: false, automaticRetryAllowed: false },
      ],
    },
    controls: { sameCanonicalEventNameRequired: true, sameCanonicalClassificationRequired: true, uniqueSyntheticRecordPerObservation: true, uniqueEventIdFingerprintPerObservation: true, baselineFingerprintReuseForbidden: true, authorizationFingerprintsUniqueAcrossObservations: true, fourIndependentRolesPerObservation: true, minimumTemporalSeparationRequired: true, stopSequenceOnFirstFailure: true, automaticRetryForbidden: true, isolatedOfficialTestSurfaceOnly: true },
    assessment: { technicalRepeatabilityProven: false, automaticDeliverySupported: false, productionSupported: false, eventMatchQualityEstimated: false, optimizationImpactClaimed: false },
    releaseGates: { repeatabilityPlanPrepared: true, baselineEvidenceLinked: true, nextControlledTestAllowed: false, automaticRetryAllowed: false, automaticDeliveryAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
}

function requestFixture(now = Date.now()) {
  return {
    format: "atlas_meta_repeatability_authorization_request_v1", phase: 24, environment: "staging_clone",
    requestReference: "sample02-request-unique", requestedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 20 * 60_000).toISOString(),
    slot: { slotId: "repeatability_02", sampleOrdinal: 2 },
    event: { eventName: "QualifiedLead", classification: "commercial_progress", eventIdFingerprint: "3".repeat(64), syntheticRecordFingerprint: "4".repeat(64) },
    humanAuthorizations: {
      director: { approved: true, reference: "director-sample02-approval" },
      security: { approved: true, reference: "security-sample02-approval" },
      operator: { approved: true, reference: "operator-sample02-acceptance" },
      reviewer: { approved: true, reference: "reviewer-sample02-acceptance" },
      baselineReferencesNotReused: true,
    },
    controls: { syntheticRecordConfirmed: true, realCustomerDataIncluded: false, singleDeliveryMaximum: true, temporaryCodeRemainsInOfficialSurface: true, stopWithoutRetry: true, campaignUnchanged: true, budgetUnchanged: true, audienceUnchanged: true, noPerformanceClaim: true, requiresFreshJustInTimeConfirmation: true },
    execution: { executed: false, eventDelivered: false, authorizationActivated: false },
  };
}

function runSelfTest() {
  const now = Date.now();
  const plan = phase23Fixture(now);
  const request = requestFixture(now);
  const created = createAuthorizationDraft(plan, request, now);
  const validation = validatePhase24Draft(created.draft, now);
  const tests = [
    { id: "approved_sanitized_draft", passed: created.approved && validation.approved, issueCodes: validation.issueCodes },
    { id: "draft_not_activation", passed: created.draft?.activation?.authorizationActivated === false && created.draft?.releaseGates?.manualObservationAllowed === false },
    { id: "four_distinct_role_hashes", passed: new Set([created.draft?.humanGovernance?.directorReferenceFingerprint, created.draft?.humanGovernance?.securityReferenceFingerprint, created.draft?.humanGovernance?.operatorReferenceFingerprint, created.draft?.humanGovernance?.reviewerReferenceFingerprint]).size === 4 },
    { id: "raw_references_not_persisted", passed: !canonicalJson(created.draft).includes("director-sample02-approval") },
  ];

  const requestTest = (id, mutate, code) => {
    const value = requestFixture(now); mutate(value);
    const result = createAuthorizationDraft(phase23Fixture(now), value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  requestTest("request_reference_required", (v) => { v.requestReference = "x"; }, "request_reference_invalid");
  requestTest("sample02_slot_required", (v) => { v.slot.slotId = "repeatability_03"; }, "authorization_slot_mismatch");
  requestTest("same_event_name_required", (v) => { v.event.eventName = "Contact"; }, "canonical_event_mismatch");
  requestTest("same_classification_required", (v) => { v.event.classification = "confirmed_outcome"; }, "canonical_event_mismatch");
  requestTest("new_event_fingerprint_required", (v) => { v.event.eventIdFingerprint = "2".repeat(64); }, "new_event_fingerprint_required");
  requestTest("synthetic_record_fingerprint_required", (v) => { v.event.syntheticRecordFingerprint = v.event.eventIdFingerprint; }, "unique_synthetic_record_fingerprint_required");
  requestTest("director_required", (v) => { v.humanAuthorizations.director.approved = false; }, "human_authorization_missing:director");
  requestTest("security_required", (v) => { v.humanAuthorizations.security.approved = false; }, "human_authorization_missing:security");
  requestTest("operator_required", (v) => { v.humanAuthorizations.operator.approved = false; }, "human_authorization_missing:operator");
  requestTest("reviewer_required", (v) => { v.humanAuthorizations.reviewer.approved = false; }, "human_authorization_missing:reviewer");
  requestTest("four_roles_must_differ", (v) => { v.humanAuthorizations.reviewer.reference = v.humanAuthorizations.operator.reference; }, "four_distinct_role_references_required");
  requestTest("baseline_reuse_attestation_required", (v) => { v.humanAuthorizations.baselineReferencesNotReused = false; }, "baseline_reference_reuse_attestation_required");
  requestTest("expired_draft_blocked", (v) => { v.expiresAt = new Date(now - 1).toISOString(); }, "authorization_draft_expired");
  requestTest("long_window_blocked", (v) => { v.expiresAt = new Date(now + 31 * 60_000).toISOString(); }, "authorization_window_exceeds_limit");
  requestTest("real_customer_data_blocked", (v) => { v.controls.realCustomerDataIncluded = true; }, "real_customer_data_forbidden");
  requestTest("temporary_code_stays_outside", (v) => { v.controls.temporaryCodeRemainsInOfficialSurface = false; }, "authorization_control_missing");
  requestTest("retry_acknowledgement_required", (v) => { v.controls.stopWithoutRetry = false; }, "authorization_control_missing");
  requestTest("fresh_confirmation_required", (v) => { v.controls.requiresFreshJustInTimeConfirmation = false; }, "authorization_control_missing");
  requestTest("pre_execution_blocked", (v) => { v.execution.executed = true; }, "execution_or_activation_must_not_precede_draft");
  requestTest("email_blocked", (v) => { v.humanAuthorizations.director.reference = "person@example.com"; }, "forbidden_material_detected");

  const sourceInvalid = phase23Fixture(now); sourceInvalid.releaseGates.productionDeliveryAllowed = true;
  tests.push({ id: "phase23_plan_required", passed: !createAuthorizationDraft(sourceInvalid, requestFixture(now), now).approved });

  const draftTest = (id, mutate, code) => {
    const value = structuredClone(created.draft); mutate(value);
    const result = validatePhase24Draft(value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  draftTest("draft_activation_blocked", (v) => { v.activation.authorizationActivated = true; }, "draft_falsely_activated");
  draftTest("manual_observation_blocked", (v) => { v.releaseGates.manualObservationAllowed = true; }, "release_gate_invalid:manualObservationAllowed");
  draftTest("automatic_delivery_blocked", (v) => { v.releaseGates.automaticDeliveryAllowed = true; }, "release_gate_invalid:automaticDeliveryAllowed");
  draftTest("production_blocked", (v) => { v.releaseGates.productionDeliveryAllowed = true; }, "release_gate_invalid:productionDeliveryAllowed");
  draftTest("role_hash_independence_required", (v) => { v.humanGovernance.reviewerReferenceFingerprint = v.humanGovernance.operatorReferenceFingerprint; }, "role_fingerprint_independence_invalid");
  draftTest("phase23_fingerprint_required", (v) => { v.sourceEvidence.phase23Fingerprint = "invalid"; }, "phase23_source_invalid");
  draftTest("baseline_fingerprint_required", (v) => { v.sourceEvidence.baselineEventIdFingerprint = "invalid"; }, "phase23_source_invalid");
  draftTest("baseline_event_reuse_blocked", (v) => { v.event.eventIdFingerprint = v.sourceEvidence.baselineEventIdFingerprint; }, "event_independence_invalid");
  draftTest("draft_event_name_must_be_canonical", (v) => { v.event.eventName = "UnknownEvent"; }, "canonical_event_contract_invalid");
  draftTest("draft_classification_must_be_canonical", (v) => { v.event.classification = "confirmed_outcome"; }, "canonical_event_contract_invalid");
  draftTest("event_record_hashes_must_differ", (v) => { v.event.syntheticRecordFingerprint = v.event.eventIdFingerprint; }, "event_independence_invalid");
  draftTest("expired_output_blocked", (v) => { v.expiresAt = new Date(now - 1).toISOString(); }, "draft_expired");

  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = readJson(process.argv[2] ?? "config/fixtures/meta-repeatability-sample-02-authorization-draft-template.json");
    const result = validatePhase24Draft(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
