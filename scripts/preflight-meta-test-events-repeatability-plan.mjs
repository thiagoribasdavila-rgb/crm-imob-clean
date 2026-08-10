import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePhase22Evidence } from "./preflight-meta-test-events-evidence-reconciliation.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const gate = readJson("config/meta-test-events-repeatability-plan-gate.json");
const signalContract = readJson(gate.sourceSignalContract);
const HASH = /^[a-f0-9]{64}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));
const evidenceFingerprint = (value) => sha256(canonicalJson(value));

function containsForbiddenMaterial(input) {
  const forbiddenKeys = new Set([
    "accessToken", "authorization", "password", "secretKey", "serviceRoleKey",
    "testEventCode", "payload", "rawPayload", "rawResponse", "responseBody",
    "email", "phone", "cpf", "address", "income", "projectRef", "supabaseUrl",
    "futureEventIdFingerprint", "approvalFingerprint",
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

function canonicalEvent(eventName, classification) {
  const event = signalContract.canonicalEvents?.[eventName];
  return Boolean(event && event.metaEligible !== false && event.classification === classification);
}

function plannedSlot(sampleOrdinal) {
  return {
    slotId: `repeatability_${String(sampleOrdinal).padStart(2, "0")}`,
    sampleOrdinal,
    status: "awaiting_new_authorization",
    syntheticRecordRequired: true,
    uniqueEventIdRequired: true,
    fourIndependentRolesRequired: true,
    authorizationGranted: false,
    deliveryAllowed: false,
    automaticRetryAllowed: false,
  };
}

export function createRepeatabilityPlan(phase22Evidence, now = Date.now()) {
  const source = validatePhase22Evidence(phase22Evidence, now);
  const issues = new Set(source.issueCodes.map((issue) => `phase22:${issue}`));
  if (phase22Evidence?.observation?.qualitySampleCount !== gate.sampling.baselineApprovedSamples) issues.add("baseline_sample_count_invalid");
  if (!canonicalEvent(phase22Evidence?.event?.eventName, phase22Evidence?.event?.classification)) issues.add("baseline_canonical_event_invalid");
  if (phase22Evidence?.releaseGates?.officialTestEvidenceReconciled !== true) issues.add("baseline_reconciliation_required");
  if (containsForbiddenMaterial(phase22Evidence)) issues.add("source_contains_forbidden_material");
  if (issues.size) return { approved: false, issueCodes: [...issues].sort(), plan: null };

  const plan = {
    format: "atlas_meta_test_events_repeatability_plan_v1",
    phase: 23,
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
      phase22Approved: true,
      phase22Fingerprint: evidenceFingerprint(phase22Evidence),
    },
    baseline: {
      accepted: true,
      eventName: phase22Evidence.event.eventName,
      classification: phase22Evidence.event.classification,
      eventIdFingerprint: phase22Evidence.event.eventIdFingerprint,
      approvedSampleCount: gate.sampling.baselineApprovedSamples,
    },
    plan: {
      targetApprovedSamples: gate.sampling.targetApprovedSamples,
      additionalObservationsPlanned: gate.sampling.additionalObservationsPlanned,
      minimumTemporalSeparationMinutes: gate.sampling.minimumTemporalSeparationMinutes,
      observationSlots: [plannedSlot(2), plannedSlot(3)],
    },
    controls: {
      sameCanonicalEventNameRequired: true,
      sameCanonicalClassificationRequired: true,
      uniqueSyntheticRecordPerObservation: true,
      uniqueEventIdFingerprintPerObservation: true,
      baselineFingerprintReuseForbidden: true,
      authorizationFingerprintsUniqueAcrossObservations: true,
      fourIndependentRolesPerObservation: true,
      minimumTemporalSeparationRequired: true,
      stopSequenceOnFirstFailure: true,
      automaticRetryForbidden: true,
      isolatedOfficialTestSurfaceOnly: true,
    },
    assessment: {
      technicalRepeatabilityProven: false,
      automaticDeliverySupported: false,
      productionSupported: false,
      eventMatchQualityEstimated: false,
      optimizationImpactClaimed: false,
    },
    releaseGates: {
      repeatabilityPlanPrepared: true,
      baselineEvidenceLinked: true,
      nextControlledTestAllowed: false,
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
  return { approved: true, issueCodes: [], plan };
}

export function validatePhase23Plan(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_test_events_repeatability_plan_v1" || input?.phase !== 23 || input?.environment !== gate.environment) issues.add("phase23_plan_contract_invalid");
  if (input?.passed !== true || input?.sanitized !== true) issues.add("repeatability_plan_not_approved");
  if (input?.containsSecrets !== false || input?.containsPersonalData !== false || input?.containsTemporaryCode !== false) issues.add("repeatability_plan_not_sanitized");
  if (input?.payloadPersisted !== false || input?.rawResponsePersisted !== false || input?.screenshotPersisted !== false) issues.add("sensitive_artifact_persisted");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");
  if (input?.sourceEvidence?.phase22Approved !== true || !HASH.test(input?.sourceEvidence?.phase22Fingerprint ?? "")) issues.add("phase22_source_invalid");

  const baseline = input?.baseline ?? {};
  if (baseline.accepted !== true || baseline.approvedSampleCount !== gate.sampling.baselineApprovedSamples) issues.add("baseline_not_accepted");
  if (!HASH.test(baseline.eventIdFingerprint ?? "")) issues.add("baseline_event_fingerprint_invalid");
  if (!canonicalEvent(baseline.eventName, baseline.classification)) issues.add("baseline_event_contract_invalid");

  const plan = input?.plan ?? {};
  if (plan.targetApprovedSamples !== gate.sampling.targetApprovedSamples) issues.add("target_sample_count_invalid");
  if (plan.additionalObservationsPlanned !== gate.sampling.additionalObservationsPlanned) issues.add("additional_observation_count_invalid");
  if (plan.minimumTemporalSeparationMinutes !== gate.sampling.minimumTemporalSeparationMinutes) issues.add("temporal_separation_invalid");
  if (baseline.approvedSampleCount + plan.additionalObservationsPlanned !== plan.targetApprovedSamples) issues.add("sample_arithmetic_invalid");
  const slots = Array.isArray(plan.observationSlots) ? plan.observationSlots : [];
  if (slots.length !== gate.sampling.additionalObservationsPlanned) issues.add("observation_slot_count_invalid");
  if (new Set(slots.map((slot) => slot?.slotId)).size !== slots.length) issues.add("observation_slot_id_duplicate");
  slots.forEach((slot, index) => {
    const ordinal = gate.sampling.baselineApprovedSamples + index + 1;
    if (slot?.slotId !== `repeatability_${String(ordinal).padStart(2, "0")}` || slot?.sampleOrdinal !== ordinal) issues.add(`observation_slot_identity_invalid:${index}`);
    if (slot?.status !== "awaiting_new_authorization") issues.add(`observation_slot_status_invalid:${index}`);
    for (const control of ["syntheticRecordRequired", "uniqueEventIdRequired", "fourIndependentRolesRequired"]) if (slot?.[control] !== true) issues.add(`observation_slot_control_invalid:${index}:${control}`);
    for (const control of ["authorizationGranted", "deliveryAllowed", "automaticRetryAllowed"]) if (slot?.[control] !== false) issues.add(`observation_slot_gate_open:${index}:${control}`);
  });

  const controls = input?.controls ?? {};
  for (const control of [
    "sameCanonicalEventNameRequired", "sameCanonicalClassificationRequired", "uniqueSyntheticRecordPerObservation",
    "uniqueEventIdFingerprintPerObservation", "baselineFingerprintReuseForbidden",
    "authorizationFingerprintsUniqueAcrossObservations", "fourIndependentRolesPerObservation",
    "minimumTemporalSeparationRequired", "stopSequenceOnFirstFailure", "automaticRetryForbidden",
    "isolatedOfficialTestSurfaceOnly",
  ]) if (controls[control] !== true) issues.add(`repeatability_control_missing:${control}`);

  const assessment = input?.assessment ?? {};
  for (const control of [
    "technicalRepeatabilityProven", "automaticDeliverySupported", "productionSupported",
    "eventMatchQualityEstimated", "optimizationImpactClaimed",
  ]) if (assessment[control] !== false) issues.add(`unsupported_assessment:${control}`);

  const release = input?.releaseGates ?? {};
  if (release.repeatabilityPlanPrepared !== true || release.baselineEvidenceLinked !== true) issues.add("repeatability_plan_gate_not_prepared");
  for (const control of [
    "nextControlledTestAllowed", "automaticRetryAllowed", "automaticDeliveryAllowed",
    "productionDeliveryAllowed", "campaignMutationAllowed", "budgetMutationAllowed",
    "audienceMutationAllowed", "deploymentAllowed",
  ]) if (release[control] !== false) issues.add(`release_gate_invalid:${control}`);

  const generatedAt = Date.parse(input?.generatedAt ?? "");
  if (!Number.isFinite(generatedAt) || generatedAt > now + 300_000) issues.add("repeatability_plan_timestamp_invalid");
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

function phase22Fixture(now = Date.now()) {
  return {
    format: "atlas_meta_test_events_evidence_reconciliation_v1", phase: 22, environment: "staging_clone",
    generatedAt: new Date(now - 60_000).toISOString(), passed: true, sanitized: true,
    containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false,
    payloadPersisted: false, rawResponsePersisted: false, screenshotPersisted: false,
    sourceEvidence: { phase19Approved: true, phase20Approved: true, phase21Approved: true, phase19Fingerprint: "1".repeat(64), phase20Fingerprint: "2".repeat(64), phase21Fingerprint: "3".repeat(64) },
    chain: { phase19ToPhase20Linked: true, phase20ToPhase21Linked: true, environmentConsistent: true, eventNameConsistent: true, eventFingerprintConsistent: true, chronologyConsistent: true },
    event: { eventName: "QualifiedLead", classification: "commercial_progress", eventIdFingerprint: "4".repeat(64) },
    humanGovernance: { directorApproved: true, securityApproved: true, operatorConfirmed: true, reviewerConfirmed: true, distinctRolesVerified: true },
    observation: { officialTestSurfaceUsed: true, normalizedStatus: "observed", deliveryCount: 1, qualitySampleCount: 1, sufficientForAutomation: false, sufficientForOptimizationClaim: false },
    governance: { eventMatchQualityEstimated: false, optimizationImpactClaimed: false },
    releaseGates: { evidenceChainReconciled: true, officialTestEvidenceReconciled: true, automaticRetryAllowed: false, automaticDeliveryAllowed: false, nextControlledTestAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
}

function runSelfTest() {
  const now = Date.now();
  const source = phase22Fixture(now);
  const created = createRepeatabilityPlan(source, now);
  const valid = validatePhase23Plan(created.plan, now);
  const tests = [
    { id: "approved_sanitized_plan", passed: created.approved && valid.approved, issueCodes: valid.issueCodes },
    { id: "one_baseline_plus_two_planned", passed: created.plan?.baseline?.approvedSampleCount === 1 && created.plan?.plan?.additionalObservationsPlanned === 2 && created.plan?.plan?.targetApprovedSamples === 3 },
    { id: "all_future_slots_blocked", passed: created.plan?.plan?.observationSlots?.every((slot) => slot.status === "awaiting_new_authorization" && slot.authorizationGranted === false && slot.deliveryAllowed === false) },
    { id: "no_performance_claim", passed: Object.values(created.plan?.assessment ?? {}).every((value) => value === false) },
  ];
  const sourceTest = (id, mutate, code) => {
    const value = phase22Fixture(now); mutate(value);
    const result = createRepeatabilityPlan(value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  sourceTest("phase22_approval_required", (v) => { v.passed = false; }, "phase22:");
  sourceTest("reconciled_source_required", (v) => { v.releaseGates.officialTestEvidenceReconciled = false; }, "baseline_reconciliation_required");
  sourceTest("single_baseline_required", (v) => { v.observation.qualitySampleCount = 2; }, "baseline_sample_count_invalid");
  sourceTest("canonical_event_required", (v) => { v.event.classification = "confirmed_outcome"; }, "baseline_canonical_event_invalid");
  sourceTest("sensitive_source_blocked", (v) => { v.email = "person@example.com"; }, "source_contains_forbidden_material");

  const planTest = (id, mutate, code) => {
    const value = structuredClone(created.plan); mutate(value);
    const result = validatePhase23Plan(value, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  planTest("target_is_fixed", (v) => { v.plan.targetApprovedSamples = 4; }, "target_sample_count_invalid");
  planTest("additional_count_is_fixed", (v) => { v.plan.additionalObservationsPlanned = 3; }, "additional_observation_count_invalid");
  planTest("sample_arithmetic_checked", (v) => { v.baseline.approvedSampleCount = 2; }, "sample_arithmetic_invalid");
  planTest("two_slots_required", (v) => { v.plan.observationSlots.pop(); }, "observation_slot_count_invalid");
  planTest("slot_ids_unique", (v) => { v.plan.observationSlots[1].slotId = v.plan.observationSlots[0].slotId; }, "observation_slot_id_duplicate");
  planTest("slot_identity_fixed", (v) => { v.plan.observationSlots[0].sampleOrdinal = 3; }, "observation_slot_identity_invalid");
  planTest("future_slot_not_preapproved", (v) => { v.plan.observationSlots[0].authorizationGranted = true; }, "observation_slot_gate_open");
  planTest("future_delivery_blocked", (v) => { v.plan.observationSlots[0].deliveryAllowed = true; }, "observation_slot_gate_open");
  planTest("automatic_retry_blocked", (v) => { v.plan.observationSlots[0].automaticRetryAllowed = true; }, "observation_slot_gate_open");
  planTest("synthetic_record_required", (v) => { v.plan.observationSlots[0].syntheticRecordRequired = false; }, "observation_slot_control_invalid");
  planTest("temporal_separation_fixed", (v) => { v.plan.minimumTemporalSeparationMinutes = 0; }, "temporal_separation_invalid");
  planTest("missing_control_blocked", (v) => { delete v.controls.stopSequenceOnFirstFailure; }, "repeatability_control_missing");
  planTest("technical_repeatability_not_preclaimed", (v) => { v.assessment.technicalRepeatabilityProven = true; }, "unsupported_assessment");
  planTest("optimization_not_preclaimed", (v) => { v.assessment.optimizationImpactClaimed = true; }, "unsupported_assessment");
  planTest("next_test_stays_blocked", (v) => { v.releaseGates.nextControlledTestAllowed = true; }, "release_gate_invalid:nextControlledTestAllowed");
  planTest("production_stays_blocked", (v) => { v.releaseGates.productionDeliveryAllowed = true; }, "release_gate_invalid:productionDeliveryAllowed");
  planTest("campaign_mutation_stays_blocked", (v) => { v.releaseGates.campaignMutationAllowed = true; }, "release_gate_invalid:campaignMutationAllowed");
  planTest("source_fingerprint_required", (v) => { v.sourceEvidence.phase22Fingerprint = "invalid"; }, "phase22_source_invalid");
  planTest("future_fingerprint_not_persisted", (v) => { v.plan.observationSlots[0].futureEventIdFingerprint = "5".repeat(64); }, "forbidden_material_detected");
  planTest("future_approval_not_persisted", (v) => { v.plan.observationSlots[0].approvalFingerprint = "6".repeat(64); }, "forbidden_material_detected");
  planTest("future_timestamp_blocked", (v) => { v.generatedAt = new Date(now + 600_000).toISOString(); }, "repeatability_plan_timestamp_invalid");

  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = readJson(process.argv[2] ?? "config/fixtures/meta-test-events-repeatability-plan-template.json");
    const result = validatePhase23Plan(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
