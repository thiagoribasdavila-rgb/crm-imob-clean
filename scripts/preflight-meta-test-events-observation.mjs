import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePhase20Evidence } from "./preflight-meta-test-events-rehearsal.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const gate = readJson("config/meta-test-events-observation-gate.json");
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

function containsForbiddenMaterial(input) {
  const forbiddenKeys = new Set([
    "accessToken", "authorization", "password", "secretKey", "serviceRoleKey",
    "testEventCode", "payload", "rawPayload", "rawResponse", "responseBody",
    "email", "phone", "cpf", "address", "income", "projectRef", "supabaseUrl",
  ]);
  const visit = (value) => {
    if (typeof value === "string") {
      const normalized = value.trim();
      return /Bearer\s+|sb_secret_|\.supabase\.co|eyJ[a-zA-Z0-9_-]{10,}\./i.test(normalized) || EMAIL.test(normalized);
    }
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(visit);
    return Object.entries(value).some(([key, nested]) => forbiddenKeys.has(key) || visit(nested));
  };
  return visit(input);
}

function validReference(value) {
  return SAFE_REFERENCE.test(value ?? "") && !EMAIL.test(value ?? "") && !/\d{10,}/.test(value ?? "");
}

export function validateObservationInput(input, phase20Evidence, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_test_events_observation_input_v1" || input?.phase !== 21) issues.add("observation_contract_invalid");
  if (input?.environment !== "staging_clone") issues.add("isolated_staging_required");
  if (!validReference(input?.observationReference)) issues.add("observation_reference_invalid");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");

  const attestations = input?.attestations ?? {};
  if (attestations.operatorConfirmed !== true || !validReference(attestations.operatorReference)) issues.add("operator_attestation_missing");
  if (attestations.reviewerConfirmed !== true || !validReference(attestations.reviewerReference)) issues.add("reviewer_attestation_missing");
  if (attestations.operatorReference === attestations.reviewerReference) issues.add("distinct_attestation_references_required");

  const execution = input?.execution ?? {};
  if (execution.manualExecutionConfirmed !== true || execution.officialTestSurfaceUsed !== true) issues.add("manual_official_execution_not_confirmed");
  if (execution.syntheticRecordUsed !== true) issues.add("synthetic_record_required");
  if (execution.realCustomerDataUsed !== false || execution.productionDatasetUsed !== false) issues.add("real_or_production_data_forbidden");
  if (execution.automaticDeliveryUsed !== false) issues.add("automatic_delivery_forbidden");
  if (execution.deliveryCount !== 1) issues.add("single_delivery_required");

  const event = input?.event ?? {};
  if (event.eventName !== phase20Evidence?.scope?.eventName) issues.add("event_name_mismatch");
  if (!HASH.test(event.eventIdFingerprint ?? "") || event.eventIdFingerprint !== phase20Evidence?.scope?.eventIdFingerprint) issues.add("event_fingerprint_mismatch");

  const outcome = input?.outcome ?? {};
  if (outcome.eventVisible !== true || !gate.persistedOutcome.allowedNormalizedStatuses.includes(outcome.normalizedStatus)) issues.add("official_event_not_observed");
  if (outcome.warningDetected !== false) issues.add("warning_requires_review");
  if (outcome.errorDetected !== false) issues.add("error_requires_review");
  if (outcome.unexpectedResultDetected !== false) issues.add("unexpected_result_requires_review");

  const artifacts = input?.sensitiveArtifacts ?? {};
  for (const control of [
    "temporaryCodeCopied", "payloadCopied", "rawResponseCopied", "screenshotStored",
    "personalIdentifiersStored", "projectIdentifiersStored",
  ]) if (artifacts[control] !== false) issues.add(`sensitive_artifact_forbidden:${control}`);

  const acknowledgements = input?.acknowledgements ?? {};
  for (const control of [
    "stopWithoutRetry", "campaignUnchanged", "budgetUnchanged", "audienceUnchanged",
    "noPerformanceClaim", "noProductionRelease",
  ]) if (acknowledgements[control] !== true) issues.add(`acknowledgement_missing:${control}`);

  const executedAt = Date.parse(input?.timing?.executedAt ?? "");
  const observedAt = Date.parse(input?.timing?.observedAt ?? "");
  const packetGeneratedAt = Date.parse(phase20Evidence?.generatedAt ?? "");
  const packetExpiresAt = Date.parse(phase20Evidence?.expiresAt ?? "");
  const skewMs = gate.observationWindow.clockSkewSeconds * 1000;
  const maximumDelayMs = gate.observationWindow.maximumObservationDelayMinutes * 60 * 1000;
  const maximumReceiptAgeMs = gate.observationWindow.maximumReceiptAgeMinutes * 60 * 1000;
  if (![executedAt, observedAt, packetGeneratedAt, packetExpiresAt].every(Number.isFinite)) issues.add("observation_timing_invalid");
  else {
    if (executedAt < packetGeneratedAt - skewMs || executedAt > packetExpiresAt) issues.add("execution_outside_phase20_authorization");
    if (observedAt < executedAt || observedAt - executedAt > maximumDelayMs) issues.add("observation_delay_exceeded");
    if (observedAt > now + skewMs) issues.add("observation_timestamp_in_future");
    if (now - observedAt > maximumReceiptAgeMs) issues.add("observation_receipt_stale");
    if (now > packetExpiresAt) issues.add("phase20_authorization_expired");
  }
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

export function createObservationReceipt(phase20Evidence, input, now = Date.now()) {
  const issues = new Set();
  const phase20 = validatePhase20Evidence(phase20Evidence, now);
  if (!phase20.approved) for (const issue of phase20.issueCodes) issues.add(`phase20:${issue}`);
  const observation = validateObservationInput(input, phase20Evidence, now);
  for (const issue of observation.issueCodes) issues.add(`observation:${issue}`);
  if (issues.size) return { approved: false, issueCodes: [...issues].sort(), receipt: null };

  const executedAt = Date.parse(input.timing.executedAt);
  const observedAt = Date.parse(input.timing.observedAt);
  const receipt = {
    format: "atlas_meta_test_events_observation_receipt_v1",
    phase: 21,
    environment: "staging_clone",
    generatedAt: new Date(now).toISOString(),
    observedAt: new Date(observedAt).toISOString(),
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    rawResponsePersisted: false,
    screenshotPersisted: false,
    sourceEvidence: {
      phase20Approved: true,
      phase20Fingerprint: sha256(canonicalJson(phase20Evidence)),
    },
    humanAttestations: {
      operatorConfirmed: true,
      reviewerConfirmed: true,
      operatorReferenceFingerprint: sha256(input.attestations.operatorReference),
      reviewerReferenceFingerprint: sha256(input.attestations.reviewerReference),
      observationReferenceFingerprint: sha256(input.observationReference),
    },
    event: {
      eventName: input.event.eventName,
      eventIdFingerprint: input.event.eventIdFingerprint,
    },
    observation: {
      manualExecutionConfirmed: true,
      officialTestSurfaceUsed: true,
      syntheticRecordUsed: true,
      eventVisible: true,
      normalizedStatus: "observed",
      deliveryCount: 1,
      observationDelaySeconds: Math.floor((observedAt - executedAt) / 1000),
      warningDetected: false,
      errorDetected: false,
      unexpectedResultDetected: false,
    },
    governance: {
      eventMatchQualityEstimated: false,
      optimizationImpactClaimed: false,
    },
    releaseGates: {
      officialTestObservationApproved: true,
      automaticDeliveryAllowed: false,
      automaticRetryAllowed: false,
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

export function validatePhase21Receipt(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_test_events_observation_receipt_v1" || input?.phase !== 21 || input?.environment !== "staging_clone") issues.add("phase21_receipt_contract_invalid");
  if (input?.passed !== true || input?.sanitized !== true) issues.add("observation_receipt_not_approved");
  if (input?.containsSecrets !== false || input?.containsPersonalData !== false || input?.containsTemporaryCode !== false) issues.add("receipt_not_sanitized");
  if (input?.payloadPersisted !== false || input?.rawResponsePersisted !== false || input?.screenshotPersisted !== false) issues.add("sensitive_artifact_persisted");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");
  for (const fingerprint of [
    input?.sourceEvidence?.phase20Fingerprint,
    input?.humanAttestations?.operatorReferenceFingerprint,
    input?.humanAttestations?.reviewerReferenceFingerprint,
    input?.humanAttestations?.observationReferenceFingerprint,
    input?.event?.eventIdFingerprint,
  ]) if (!HASH.test(fingerprint ?? "")) issues.add("fingerprint_invalid");
  if (input?.sourceEvidence?.phase20Approved !== true) issues.add("phase20_source_not_approved");
  if (input?.humanAttestations?.operatorConfirmed !== true || input?.humanAttestations?.reviewerConfirmed !== true) issues.add("human_attestation_not_approved");
  if (
    input?.humanAttestations?.operatorReferenceFingerprint ===
    input?.humanAttestations?.reviewerReferenceFingerprint
  ) issues.add("distinct_attestation_fingerprints_required");
  const generatedAt = Date.parse(input?.generatedAt ?? "");
  const observedAt = Date.parse(input?.observedAt ?? "");
  if (!Number.isFinite(generatedAt) || !Number.isFinite(observedAt) || observedAt > generatedAt || generatedAt > now + gate.observationWindow.clockSkewSeconds * 1000) issues.add("receipt_timing_invalid");
  const observation = input?.observation ?? {};
  if (observation.manualExecutionConfirmed !== true || observation.officialTestSurfaceUsed !== true || observation.syntheticRecordUsed !== true) issues.add("manual_observation_invalid");
  if (observation.eventVisible !== true || observation.normalizedStatus !== "observed" || observation.deliveryCount !== 1) issues.add("observed_event_invalid");
  if (!Number.isInteger(observation.observationDelaySeconds) || observation.observationDelaySeconds < 0 || observation.observationDelaySeconds > gate.observationWindow.maximumObservationDelayMinutes * 60) issues.add("observation_delay_invalid");
  if (observation.warningDetected !== false || observation.errorDetected !== false || observation.unexpectedResultDetected !== false) issues.add("unclean_observation_claimed_approved");
  if (input?.governance?.eventMatchQualityEstimated !== false || input?.governance?.optimizationImpactClaimed !== false) issues.add("unsupported_performance_claim");
  const release = input?.releaseGates ?? {};
  if (release.officialTestObservationApproved !== true) issues.add("official_observation_not_approved");
  for (const control of [
    "automaticDeliveryAllowed", "automaticRetryAllowed", "productionDeliveryAllowed",
    "campaignMutationAllowed", "budgetMutationAllowed", "audienceMutationAllowed", "deploymentAllowed",
  ]) if (release[control] !== false) issues.add(`release_gate_invalid:${control}`);
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

function approvedPhase20Fixture(now = Date.now()) {
  return {
    format: "atlas_meta_test_events_rehearsal_evidence_v1", phase: 20, environment: "staging_clone",
    generatedAt: new Date(now - 5 * 60_000).toISOString(), expiresAt: new Date(now + 60 * 60_000).toISOString(),
    passed: true, sanitized: true, containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false,
    payloadPersisted: false, responsePersisted: false,
    sourceEvidence: { phase17Approved: true, phase19Approved: true, phase17Fingerprint: "a".repeat(64), phase19Fingerprint: "b".repeat(64) },
    humanApprovals: { directorApproved: true, securityApproved: true, directorApprovalFingerprint: "c".repeat(64), securityApprovalFingerprint: "d".repeat(64), requestFingerprint: "e".repeat(64) },
    scope: { syntheticRecordOnly: true, realCustomerDataAllowed: false, singleCanonicalEvent: true, maximumDeliveries: 1, eventName: "QualifiedLead", eventIdFingerprint: "f".repeat(64) },
    manualChecklist: [],
    officialExecution: { executed: false, eventDelivered: false, responseObserved: false },
    releaseGates: { manualOperatorRehearsalAllowed: true, automaticDeliveryAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
}

function approvedObservationFixture(now = Date.now()) {
  return {
    format: "atlas_meta_test_events_observation_input_v1", phase: 21, environment: "staging_clone",
    observationReference: "observation-synthetic-0001",
    attestations: { operatorConfirmed: true, operatorReference: "operator-attestation-0001", reviewerConfirmed: true, reviewerReference: "reviewer-attestation-0001" },
    timing: { executedAt: new Date(now - 2 * 60_000).toISOString(), observedAt: new Date(now - 60_000).toISOString() },
    execution: { manualExecutionConfirmed: true, officialTestSurfaceUsed: true, syntheticRecordUsed: true, realCustomerDataUsed: false, productionDatasetUsed: false, automaticDeliveryUsed: false, deliveryCount: 1 },
    event: { eventName: "QualifiedLead", eventIdFingerprint: "f".repeat(64) },
    outcome: { eventVisible: true, normalizedStatus: "observed", warningDetected: false, errorDetected: false, unexpectedResultDetected: false },
    sensitiveArtifacts: { temporaryCodeCopied: false, payloadCopied: false, rawResponseCopied: false, screenshotStored: false, personalIdentifiersStored: false, projectIdentifiersStored: false },
    acknowledgements: { stopWithoutRetry: true, campaignUnchanged: true, budgetUnchanged: true, audienceUnchanged: true, noPerformanceClaim: true, noProductionRelease: true },
  };
}

function runSelfTest() {
  const now = Date.now();
  const tests = [];
  const phase20 = approvedPhase20Fixture(now);
  const approved = createObservationReceipt(phase20, approvedObservationFixture(now), now);
  const validation = validatePhase21Receipt(approved.receipt, now);
  tests.push({ id: "approved_sanitized_receipt", passed: approved.approved && validation.approved, issueCodes: validation.issueCodes });
  tests.push({ id: "production_stays_blocked", passed: approved.receipt?.releaseGates?.productionDeliveryAllowed === false && approved.receipt?.releaseGates?.automaticDeliveryAllowed === false });
  tests.push({ id: "no_sensitive_artifact_persisted", passed: approved.receipt?.containsTemporaryCode === false && approved.receipt?.payloadPersisted === false && approved.receipt?.rawResponsePersisted === false && approved.receipt?.screenshotPersisted === false });

  const observationTest = (id, mutate, code) => {
    const input = approvedObservationFixture(now); mutate(input);
    const result = createObservationReceipt(approvedPhase20Fixture(now), input, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  observationTest("operator_attestation_required", (i) => { i.attestations.operatorConfirmed = false; }, "operator_attestation_missing");
  observationTest("reviewer_attestation_required", (i) => { i.attestations.reviewerConfirmed = false; }, "reviewer_attestation_missing");
  observationTest("distinct_attestations_required", (i) => { i.attestations.reviewerReference = i.attestations.operatorReference; }, "distinct_attestation_references_required");
  observationTest("single_delivery_required", (i) => { i.execution.deliveryCount = 2; }, "single_delivery_required");
  observationTest("automatic_delivery_blocked", (i) => { i.execution.automaticDeliveryUsed = true; }, "automatic_delivery_forbidden");
  observationTest("real_customer_blocked", (i) => { i.execution.realCustomerDataUsed = true; }, "real_or_production_data_forbidden");
  observationTest("production_dataset_blocked", (i) => { i.execution.productionDatasetUsed = true; }, "real_or_production_data_forbidden");
  observationTest("event_name_must_match", (i) => { i.event.eventName = "Purchase"; }, "event_name_mismatch");
  observationTest("event_fingerprint_must_match", (i) => { i.event.eventIdFingerprint = "9".repeat(64); }, "event_fingerprint_mismatch");
  observationTest("event_visibility_required", (i) => { i.outcome.eventVisible = false; }, "official_event_not_observed");
  observationTest("warning_requires_review", (i) => { i.outcome.warningDetected = true; }, "warning_requires_review");
  observationTest("error_requires_review", (i) => { i.outcome.errorDetected = true; }, "error_requires_review");
  observationTest("unexpected_result_requires_review", (i) => { i.outcome.unexpectedResultDetected = true; }, "unexpected_result_requires_review");
  observationTest("raw_response_blocked", (i) => { i.sensitiveArtifacts.rawResponseCopied = true; }, "sensitive_artifact_forbidden:rawResponseCopied");
  observationTest("temporary_code_blocked", (i) => { i.sensitiveArtifacts.temporaryCodeCopied = true; }, "sensitive_artifact_forbidden:temporaryCodeCopied");
  observationTest("payload_blocked", (i) => { i.sensitiveArtifacts.payloadCopied = true; }, "sensitive_artifact_forbidden:payloadCopied");
  observationTest("observation_delay_bounded", (i) => { i.timing.observedAt = new Date(now + 31 * 60_000).toISOString(); }, "observation_delay_exceeded");
  observationTest("stale_observation_blocked", (i) => { i.timing.executedAt = new Date(now - 130 * 60_000).toISOString(); i.timing.observedAt = new Date(now - 129 * 60_000).toISOString(); }, "observation_receipt_stale");
  const expired = approvedPhase20Fixture(now); expired.expiresAt = new Date(now - 1).toISOString();
  tests.push({ id: "expired_phase20_blocked", passed: !createObservationReceipt(expired, approvedObservationFixture(now), now).approved });
  const falseClaim = structuredClone(approved.receipt); falseClaim.governance.optimizationImpactClaimed = true;
  tests.push({ id: "performance_claim_blocked", passed: validatePhase21Receipt(falseClaim, now).issueCodes.includes("unsupported_performance_claim") });
  const retryOpened = structuredClone(approved.receipt); retryOpened.releaseGates.automaticRetryAllowed = true;
  tests.push({ id: "automatic_retry_stays_blocked", passed: validatePhase21Receipt(retryOpened, now).issueCodes.includes("release_gate_invalid:automaticRetryAllowed") });
  const copiedAttestation = structuredClone(approved.receipt);
  copiedAttestation.humanAttestations.reviewerReferenceFingerprint = copiedAttestation.humanAttestations.operatorReferenceFingerprint;
  tests.push({ id: "distinct_receipt_attestations_required", passed: validatePhase21Receipt(copiedAttestation, now).issueCodes.includes("distinct_attestation_fingerprints_required") });
  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = readJson(process.argv[2] ?? "config/fixtures/meta-test-events-observation-receipt-template.json");
    const result = validatePhase21Receipt(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
