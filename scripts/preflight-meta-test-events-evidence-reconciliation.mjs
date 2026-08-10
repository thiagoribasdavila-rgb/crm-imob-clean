import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePhase19Evidence } from "./preflight-meta-validation-comparison.mjs";
import { validatePhase20Evidence } from "./preflight-meta-test-events-rehearsal.mjs";
import { validatePhase21Receipt } from "./preflight-meta-test-events-observation.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const gate = readJson("config/meta-test-events-evidence-reconciliation-gate.json");
const signalContract = readJson(gate.sourceSignalContract);
const HASH = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));

function evidenceFingerprint(value) {
  return sha256(canonicalJson(value));
}

function validateChain(phase19, phase20, phase21, now = Date.now()) {
  const issues = new Set();
  const phase19Validation = validatePhase19Evidence(phase19);
  const phase20Validation = validatePhase20Evidence(phase20, now);
  const phase21Validation = validatePhase21Receipt(phase21, now);
  if (!phase19Validation.approved) for (const issue of phase19Validation.issueCodes) issues.add(`phase19:${issue}`);
  if (!phase20Validation.approved) for (const issue of phase20Validation.issueCodes) issues.add(`phase20:${issue}`);
  if (!phase21Validation.approved) for (const issue of phase21Validation.issueCodes) issues.add(`phase21:${issue}`);

  const phase19Fingerprint = evidenceFingerprint(phase19);
  const phase20Fingerprint = evidenceFingerprint(phase20);
  if (phase20?.sourceEvidence?.phase19Fingerprint !== phase19Fingerprint) issues.add("phase19_to_phase20_link_mismatch");
  if (phase21?.sourceEvidence?.phase20Fingerprint !== phase20Fingerprint) issues.add("phase20_to_phase21_link_mismatch");

  const environments = [phase19?.environment, phase20?.environment, phase21?.environment];
  if (!environments.every((value) => value === gate.environment)) issues.add("environment_chain_mismatch");
  const eventNames = [phase19?.event?.eventName, phase20?.scope?.eventName, phase21?.event?.eventName];
  if (!eventNames.every((value) => value && value === eventNames[0])) issues.add("event_name_chain_mismatch");
  const canonicalEvent = signalContract.canonicalEvents?.[phase19?.event?.eventName];
  if (!canonicalEvent || canonicalEvent.metaEligible === false || phase19?.event?.classification !== canonicalEvent.classification) issues.add("event_classification_mismatch");
  const eventFingerprints = [phase19?.event?.eventIdFingerprint, phase20?.scope?.eventIdFingerprint, phase21?.event?.eventIdFingerprint];
  if (!eventFingerprints.every((value) => HASH.test(value ?? "") && value === eventFingerprints[0])) issues.add("event_fingerprint_chain_mismatch");

  const phase19GeneratedAt = Date.parse(phase19?.generatedAt ?? "");
  const phase20GeneratedAt = Date.parse(phase20?.generatedAt ?? "");
  const phase21ObservedAt = Date.parse(phase21?.observedAt ?? "");
  const phase21GeneratedAt = Date.parse(phase21?.generatedAt ?? "");
  if (![phase19GeneratedAt, phase20GeneratedAt, phase21ObservedAt, phase21GeneratedAt].every(Number.isFinite)) issues.add("evidence_chronology_invalid");
  else if (!(phase19GeneratedAt <= phase20GeneratedAt && phase20GeneratedAt <= phase21ObservedAt && phase21ObservedAt <= phase21GeneratedAt && phase21GeneratedAt <= now + 300_000)) issues.add("evidence_chronology_mismatch");

  const roleFingerprints = [
    phase20?.humanApprovals?.directorApprovalFingerprint,
    phase20?.humanApprovals?.securityApprovalFingerprint,
    phase21?.humanAttestations?.operatorReferenceFingerprint,
    phase21?.humanAttestations?.reviewerReferenceFingerprint,
  ];
  if (
    phase20?.humanApprovals?.directorApproved !== true ||
    phase20?.humanApprovals?.securityApproved !== true ||
    phase21?.humanAttestations?.operatorConfirmed !== true ||
    phase21?.humanAttestations?.reviewerConfirmed !== true ||
    !roleFingerprints.every((value) => HASH.test(value ?? "")) ||
    new Set(roleFingerprints).size !== gate.scope.minimumIndependentHumanRoles
  ) issues.add("four_role_governance_incomplete");
  if (phase21?.observation?.deliveryCount !== gate.scope.maximumObservedDeliveries) issues.add("single_observed_delivery_required");
  if (phase21?.observation?.syntheticRecordUsed !== true) issues.add("synthetic_observation_required");

  return {
    approved: issues.size === 0,
    issueCodes: [...issues].sort(),
    fingerprints: {
      phase19: phase19Fingerprint,
      phase20: phase20Fingerprint,
      phase21: evidenceFingerprint(phase21),
    },
  };
}

export function createEvidenceReconciliation(phase19, phase20, phase21, now = Date.now()) {
  const chain = validateChain(phase19, phase20, phase21, now);
  if (!chain.approved) return { approved: false, issueCodes: chain.issueCodes, evidence: null };
  const evidence = {
    format: "atlas_meta_test_events_evidence_reconciliation_v1",
    phase: 22,
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
      phase19Approved: true,
      phase20Approved: true,
      phase21Approved: true,
      phase19Fingerprint: chain.fingerprints.phase19,
      phase20Fingerprint: chain.fingerprints.phase20,
      phase21Fingerprint: chain.fingerprints.phase21,
    },
    chain: {
      phase19ToPhase20Linked: true,
      phase20ToPhase21Linked: true,
      environmentConsistent: true,
      eventNameConsistent: true,
      eventFingerprintConsistent: true,
      chronologyConsistent: true,
    },
    event: {
      eventName: phase19.event.eventName,
      classification: phase19.event.classification,
      eventIdFingerprint: phase19.event.eventIdFingerprint,
    },
    humanGovernance: {
      directorApproved: true,
      securityApproved: true,
      operatorConfirmed: true,
      reviewerConfirmed: true,
      distinctRolesVerified: true,
    },
    observation: {
      officialTestSurfaceUsed: true,
      normalizedStatus: "observed",
      deliveryCount: 1,
      qualitySampleCount: 1,
      sufficientForAutomation: false,
      sufficientForOptimizationClaim: false,
    },
    governance: {
      eventMatchQualityEstimated: false,
      optimizationImpactClaimed: false,
    },
    releaseGates: {
      evidenceChainReconciled: true,
      officialTestEvidenceReconciled: true,
      automaticRetryAllowed: false,
      automaticDeliveryAllowed: false,
      nextControlledTestAllowed: false,
      productionDeliveryAllowed: false,
      campaignMutationAllowed: false,
      budgetMutationAllowed: false,
      audienceMutationAllowed: false,
      deploymentAllowed: false,
    },
    issueCodes: [],
    errorCode: null,
  };
  return { approved: true, issueCodes: [], evidence };
}

export function validatePhase22Evidence(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_test_events_evidence_reconciliation_v1" || input?.phase !== 22 || input?.environment !== gate.environment) issues.add("phase22_evidence_contract_invalid");
  if (input?.passed !== true || input?.sanitized !== true) issues.add("reconciliation_not_approved");
  if (input?.containsSecrets !== false || input?.containsPersonalData !== false || input?.containsTemporaryCode !== false) issues.add("reconciliation_not_sanitized");
  if (input?.payloadPersisted !== false || input?.rawResponsePersisted !== false || input?.screenshotPersisted !== false) issues.add("sensitive_artifact_persisted");
  for (const fingerprint of [
    input?.sourceEvidence?.phase19Fingerprint,
    input?.sourceEvidence?.phase20Fingerprint,
    input?.sourceEvidence?.phase21Fingerprint,
    input?.event?.eventIdFingerprint,
  ]) if (!HASH.test(fingerprint ?? "")) issues.add("fingerprint_invalid");
  if (input?.sourceEvidence?.phase19Approved !== true || input?.sourceEvidence?.phase20Approved !== true || input?.sourceEvidence?.phase21Approved !== true) issues.add("source_evidence_not_approved");
  const chain = input?.chain ?? {};
  for (const control of [
    "phase19ToPhase20Linked", "phase20ToPhase21Linked", "environmentConsistent",
    "eventNameConsistent", "eventFingerprintConsistent", "chronologyConsistent",
  ]) if (chain[control] !== true) issues.add(`evidence_chain_not_reconciled:${control}`);
  const human = input?.humanGovernance ?? {};
  for (const control of [
    "directorApproved", "securityApproved", "operatorConfirmed", "reviewerConfirmed", "distinctRolesVerified",
  ]) if (human[control] !== true) issues.add(`human_governance_not_reconciled:${control}`);
  const canonicalEvent = signalContract.canonicalEvents?.[input?.event?.eventName];
  if (!canonicalEvent || canonicalEvent.metaEligible === false || input?.event?.classification !== canonicalEvent.classification) issues.add("event_classification_invalid");
  if (input?.observation?.officialTestSurfaceUsed !== true || input?.observation?.normalizedStatus !== "observed" || input?.observation?.deliveryCount !== 1 || input?.observation?.qualitySampleCount !== 1) issues.add("observation_summary_invalid");
  if (input?.observation?.sufficientForAutomation !== false || input?.observation?.sufficientForOptimizationClaim !== false) issues.add("single_sample_overclaimed");
  if (input?.governance?.eventMatchQualityEstimated !== false || input?.governance?.optimizationImpactClaimed !== false) issues.add("unsupported_performance_claim");
  const generatedAt = Date.parse(input?.generatedAt ?? "");
  if (!Number.isFinite(generatedAt) || generatedAt > now + 300_000) issues.add("reconciliation_timestamp_invalid");
  const release = input?.releaseGates ?? {};
  if (release.evidenceChainReconciled !== true || release.officialTestEvidenceReconciled !== true) issues.add("reconciliation_gate_not_approved");
  for (const control of [
    "automaticRetryAllowed", "automaticDeliveryAllowed", "nextControlledTestAllowed",
    "productionDeliveryAllowed", "campaignMutationAllowed", "budgetMutationAllowed",
    "audienceMutationAllowed", "deploymentAllowed",
  ]) if (release[control] !== false) issues.add(`release_gate_invalid:${control}`);
  const serialized = canonicalJson(input);
  if (/Bearer\s+|sb_secret_|\.supabase\.co|test_event_code|testEventCode|@/i.test(serialized)) issues.add("secret_or_identifier_detected");
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

function fixtures(now = Date.now()) {
  const phase19 = {
    format: "atlas_meta_validation_comparison_evidence_v1", phase: 19, environment: "staging_clone",
    generatedAt: new Date(now - 12 * 60_000).toISOString(), passed: true, sanitized: true,
    containsSecrets: false, containsPersonalData: false, payloadPersisted: false, matchValuesPersisted: false, remoteExecutionPerformed: false,
    sourceEvidence: { phase17Approved: true, phase18Approved: true, phase18EvidenceFingerprint: "a".repeat(64) },
    event: { eventName: "QualifiedLead", classification: "commercial_progress", eventIdFingerprint: "b".repeat(64) },
    localComparison: { approved: true, requiredChecks: [], matchKeyPresence: ["em", "external_id"], optionalAttributionKeyPresence: [], financialSignalPresence: [], eventMatchQualityEstimated: false, optimizationImpactClaimed: false },
    officialMetaComparison: { executed: false, status: "pending", testEventCodePersisted: false, responsePersisted: false },
    execution: { payloadBuiltInMemory: true, networkCallExecuted: false, metaRequestDelivered: false, databaseMutationExecuted: false },
    releaseGates: { localComparisonApproved: true, officialComparisonApproved: false, testEventDeliveryAllowed: false, productionAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
  const phase20 = {
    format: "atlas_meta_test_events_rehearsal_evidence_v1", phase: 20, environment: "staging_clone",
    generatedAt: new Date(now - 10 * 60_000).toISOString(), expiresAt: new Date(now + 60 * 60_000).toISOString(), passed: true, sanitized: true,
    containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false, payloadPersisted: false, responsePersisted: false,
    sourceEvidence: { phase17Approved: true, phase19Approved: true, phase17Fingerprint: "c".repeat(64), phase19Fingerprint: evidenceFingerprint(phase19) },
    humanApprovals: { directorApproved: true, securityApproved: true, directorApprovalFingerprint: "d".repeat(64), securityApprovalFingerprint: "e".repeat(64), requestFingerprint: "f".repeat(64) },
    scope: { syntheticRecordOnly: true, realCustomerDataAllowed: false, singleCanonicalEvent: true, maximumDeliveries: 1, eventName: "QualifiedLead", eventIdFingerprint: "b".repeat(64) },
    manualChecklist: [], officialExecution: { executed: false, eventDelivered: false, responseObserved: false },
    releaseGates: { manualOperatorRehearsalAllowed: true, automaticDeliveryAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
  const phase21 = {
    format: "atlas_meta_test_events_observation_receipt_v1", phase: 21, environment: "staging_clone",
    generatedAt: new Date(now - 2 * 60_000).toISOString(), observedAt: new Date(now - 3 * 60_000).toISOString(), passed: true, sanitized: true,
    containsSecrets: false, containsPersonalData: false, containsTemporaryCode: false, payloadPersisted: false, rawResponsePersisted: false, screenshotPersisted: false,
    sourceEvidence: { phase20Approved: true, phase20Fingerprint: evidenceFingerprint(phase20) },
    humanAttestations: { operatorConfirmed: true, reviewerConfirmed: true, operatorReferenceFingerprint: "1".repeat(64), reviewerReferenceFingerprint: "2".repeat(64), observationReferenceFingerprint: "3".repeat(64) },
    event: { eventName: "QualifiedLead", eventIdFingerprint: "b".repeat(64) },
    observation: { manualExecutionConfirmed: true, officialTestSurfaceUsed: true, syntheticRecordUsed: true, eventVisible: true, normalizedStatus: "observed", deliveryCount: 1, observationDelaySeconds: 60, warningDetected: false, errorDetected: false, unexpectedResultDetected: false },
    governance: { eventMatchQualityEstimated: false, optimizationImpactClaimed: false },
    releaseGates: { officialTestObservationApproved: true, automaticDeliveryAllowed: false, automaticRetryAllowed: false, productionDeliveryAllowed: false, campaignMutationAllowed: false, budgetMutationAllowed: false, audienceMutationAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
  return { phase19, phase20, phase21 };
}

function runSelfTest() {
  const now = Date.now();
  const tests = [];
  const clean = fixtures(now);
  const approved = createEvidenceReconciliation(clean.phase19, clean.phase20, clean.phase21, now);
  const validation = validatePhase22Evidence(approved.evidence, now);
  tests.push({ id: "approved_sanitized_chain", passed: approved.approved && validation.approved, issueCodes: validation.issueCodes });
  tests.push({ id: "production_stays_blocked", passed: approved.evidence?.releaseGates?.productionDeliveryAllowed === false && approved.evidence?.releaseGates?.automaticDeliveryAllowed === false });
  tests.push({ id: "single_sample_not_overclaimed", passed: approved.evidence?.observation?.qualitySampleCount === 1 && approved.evidence?.observation?.sufficientForAutomation === false && approved.evidence?.observation?.sufficientForOptimizationClaim === false });
  tests.push({ id: "no_sensitive_artifacts", passed: approved.evidence?.containsTemporaryCode === false && approved.evidence?.payloadPersisted === false && approved.evidence?.rawResponsePersisted === false });

  const chainTest = (id, mutate, code) => {
    const set = fixtures(now); mutate(set);
    const result = createEvidenceReconciliation(set.phase19, set.phase20, set.phase21, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  chainTest("phase19_approval_required", (s) => { s.phase19.passed = false; }, "phase19:");
  chainTest("phase20_approval_required", (s) => { s.phase20.passed = false; }, "phase20:");
  chainTest("phase21_approval_required", (s) => { s.phase21.passed = false; }, "phase21:");
  chainTest("phase19_link_required", (s) => { s.phase20.sourceEvidence.phase19Fingerprint = "9".repeat(64); s.phase21.sourceEvidence.phase20Fingerprint = evidenceFingerprint(s.phase20); }, "phase19_to_phase20_link_mismatch");
  chainTest("phase20_link_required", (s) => { s.phase21.sourceEvidence.phase20Fingerprint = "8".repeat(64); }, "phase20_to_phase21_link_mismatch");
  chainTest("phase20_event_name_match", (s) => { s.phase20.scope.eventName = "Contact"; s.phase21.sourceEvidence.phase20Fingerprint = evidenceFingerprint(s.phase20); }, "event_name_chain_mismatch");
  chainTest("phase21_event_name_match", (s) => { s.phase21.event.eventName = "Contact"; }, "event_name_chain_mismatch");
  chainTest("phase20_event_fingerprint_match", (s) => { s.phase20.scope.eventIdFingerprint = "7".repeat(64); s.phase21.sourceEvidence.phase20Fingerprint = evidenceFingerprint(s.phase20); }, "event_fingerprint_chain_mismatch");
  chainTest("phase21_event_fingerprint_match", (s) => { s.phase21.event.eventIdFingerprint = "6".repeat(64); }, "event_fingerprint_chain_mismatch");
  chainTest("canonical_classification_required", (s) => { s.phase19.event.classification = "confirmed_outcome"; s.phase20.sourceEvidence.phase19Fingerprint = evidenceFingerprint(s.phase19); s.phase21.sourceEvidence.phase20Fingerprint = evidenceFingerprint(s.phase20); }, "event_classification_mismatch");
  chainTest("same_environment_required", (s) => { s.phase21.environment = "production"; }, "environment_chain_mismatch");
  chainTest("chronology_required", (s) => { s.phase19.generatedAt = new Date(now - 60_000).toISOString(); s.phase20.sourceEvidence.phase19Fingerprint = evidenceFingerprint(s.phase19); }, "evidence_chronology_mismatch");
  chainTest("synthetic_observation_required", (s) => { s.phase21.observation.syntheticRecordUsed = false; }, "synthetic_observation_required");
  chainTest("single_delivery_required", (s) => { s.phase21.observation.deliveryCount = 2; }, "single_observed_delivery_required");
  chainTest("unexpired_authorization_required", (s) => { s.phase20.expiresAt = new Date(now - 1).toISOString(); s.phase21.sourceEvidence.phase20Fingerprint = evidenceFingerprint(s.phase20); }, "phase20:packet_expired");
  chainTest("four_roles_required", (s) => { s.phase21.humanAttestations.reviewerConfirmed = false; }, "four_role_governance_incomplete");
  chainTest("four_roles_must_be_independent", (s) => { s.phase21.humanAttestations.operatorReferenceFingerprint = s.phase20.humanApprovals.directorApprovalFingerprint; }, "four_role_governance_incomplete");

  const openedRetry = structuredClone(approved.evidence); openedRetry.releaseGates.automaticRetryAllowed = true;
  tests.push({ id: "automatic_retry_blocked", passed: validatePhase22Evidence(openedRetry, now).issueCodes.includes("release_gate_invalid:automaticRetryAllowed") });
  const openedProduction = structuredClone(approved.evidence); openedProduction.releaseGates.productionDeliveryAllowed = true;
  tests.push({ id: "production_release_blocked", passed: validatePhase22Evidence(openedProduction, now).issueCodes.includes("release_gate_invalid:productionDeliveryAllowed") });
  const overclaimed = structuredClone(approved.evidence); overclaimed.observation.sufficientForAutomation = true;
  tests.push({ id: "automation_claim_blocked", passed: validatePhase22Evidence(overclaimed, now).issueCodes.includes("single_sample_overclaimed") });
  const performanceClaim = structuredClone(approved.evidence); performanceClaim.governance.optimizationImpactClaimed = true;
  tests.push({ id: "performance_claim_blocked", passed: validatePhase22Evidence(performanceClaim, now).issueCodes.includes("unsupported_performance_claim") });
  const tamperedFingerprint = structuredClone(approved.evidence); tamperedFingerprint.sourceEvidence.phase21Fingerprint = "invalid";
  tests.push({ id: "tampered_fingerprint_blocked", passed: validatePhase22Evidence(tamperedFingerprint, now).issueCodes.includes("fingerprint_invalid") });
  const nextTestOpened = structuredClone(approved.evidence); nextTestOpened.releaseGates.nextControlledTestAllowed = true;
  tests.push({ id: "next_test_requires_new_authorization", passed: validatePhase22Evidence(nextTestOpened, now).issueCodes.includes("release_gate_invalid:nextControlledTestAllowed") });
  const missingChainControl = structuredClone(approved.evidence); delete missingChainControl.chain.phase20ToPhase21Linked;
  tests.push({ id: "missing_chain_control_blocked", passed: validatePhase22Evidence(missingChainControl, now).issueCodes.includes("evidence_chain_not_reconciled:phase20ToPhase21Linked") });
  const missingHumanControl = structuredClone(approved.evidence); delete missingHumanControl.humanGovernance.reviewerConfirmed;
  tests.push({ id: "missing_human_control_blocked", passed: validatePhase22Evidence(missingHumanControl, now).issueCodes.includes("human_governance_not_reconciled:reviewerConfirmed") });
  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = readJson(process.argv[2] ?? "config/fixtures/meta-test-events-evidence-reconciliation-template.json");
    const result = validatePhase22Evidence(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
