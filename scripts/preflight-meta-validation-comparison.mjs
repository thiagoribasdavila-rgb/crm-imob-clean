import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildValidationOnlyPayload,
  validatePhase18Evidence,
} from "./preflight-meta-validation-only-payload.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const gate = readJson("config/meta-payload-quality-gate.json");
const signalContract = readJson(gate.sourceSignalContract);
const HASH = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalize(value));

function inspectPayload(payload, eventInput, phase18Evidence) {
  const issues = new Set();
  const events = payload?.data;
  if (!Array.isArray(events) || events.length !== 1) issues.add("single_canonical_event_required");
  const event = events?.[0] ?? {};
  const canonical = signalContract.canonicalEvents[event.event_name];
  if (!canonical || canonical.metaEligible === false) issues.add("canonical_meta_event_required");
  if (event.event_id !== eventInput.eventId || event.event_id?.includes("@") || /\d{10,}/.test(event.event_id ?? "")) issues.add("stable_non_personal_event_id_required");
  if (!Number.isInteger(event.event_time) || event.event_time <= 0) issues.add("event_time_invalid");
  if (!signalContract.payload.allowedActionSources.includes(event.action_source)) issues.add("action_source_invalid");

  const userData = event.user_data ?? {};
  const userKeys = Object.keys(userData).sort();
  if (!userKeys.every((key) => signalContract.payload.allowedUserDataKeys.includes(key))) issues.add("user_data_key_not_allowed");
  if (!Array.isArray(userData.external_id) || !HASH.test(userData.external_id[0] ?? "")) issues.add("external_id_missing");
  if (![...(userData.em ?? []), ...(userData.ph ?? [])].some((value) => HASH.test(value))) issues.add("hashed_match_key_missing");

  const customData = event.custom_data ?? {};
  const customKeys = Object.keys(customData).sort();
  if (!customKeys.every((key) => signalContract.payload.allowedCustomDataKeys.includes(key))) issues.add("custom_data_key_not_allowed");
  if (canonical?.requiredEvidence?.some((key) => eventInput?.evidence?.[key] !== true)) issues.add("commercial_evidence_incomplete");
  if (eventInput?.consent?.dataSharingConsent !== true) issues.add("consent_not_approved");

  const rawInputValues = [eventInput?.match?.email, eventInput?.match?.phone].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  const serializedPayload = canonicalJson(payload).toLowerCase();
  if (rawInputValues.some((value) => value && serializedPayload.includes(value))) issues.add("raw_identifier_detected");
  if (/(cpf|document_number|street_address|income|religion|ethnicity|political_opinion|health_data)/i.test(serializedPayload)) issues.add("sensitive_data_detected");

  const financialKeys = ["currency", "value"].filter((key) => Object.hasOwn(customData, key));
  if (financialKeys.length) {
    if (!gate.financialSignal.allowedEvents.includes(event.event_name)) issues.add("financial_signal_not_allowed_for_event");
    if (!new RegExp(gate.financialSignal.currencyPattern).test(customData.currency ?? "")) issues.add("currency_invalid");
    if (!Number.isFinite(customData.value) || customData.value < 0) issues.add("value_invalid");
  }
  const phase18Validation = validatePhase18Evidence(phase18Evidence);
  if (!phase18Validation.approved) for (const issue of phase18Validation.issueCodes) issues.add(`phase18:${issue}`);
  return {
    approved: issues.size === 0,
    issueCodes: [...issues].sort(),
    event,
    definition: canonical,
    userKeys,
    customKeys,
    financialKeys,
  };
}

export function createValidationComparison(phase17Evidence, eventInput) {
  const built = buildValidationOnlyPayload(phase17Evidence, eventInput);
  if (!built.approved || !built.payload || !built.evidence) {
    return { approved: false, issueCodes: built.issueCodes, evidence: null };
  }
  const inspected = inspectPayload(built.payload, eventInput, built.evidence);
  if (!inspected.approved) return { approved: false, issueCodes: inspected.issueCodes, evidence: null };
  const optionalAttributionKeys = gate.matchReadiness.optionalAttributionKeys.filter((key) => inspected.userKeys.includes(key) || inspected.customKeys.includes(key));
  const evidence = {
    format: "atlas_meta_validation_comparison_evidence_v1",
    phase: 19,
    environment: "staging_clone",
    generatedAt: new Date().toISOString(),
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    payloadPersisted: false,
    matchValuesPersisted: false,
    remoteExecutionPerformed: false,
    sourceEvidence: {
      phase17Approved: true,
      phase18Approved: true,
      phase18EvidenceFingerprint: sha256(canonicalJson(built.evidence)),
    },
    event: {
      eventName: inspected.event.event_name,
      classification: inspected.definition.classification,
      eventIdFingerprint: built.evidence.event.eventIdFingerprint,
    },
    localComparison: {
      approved: true,
      requiredChecks: [...gate.requiredLocalChecks],
      matchKeyPresence: inspected.userKeys,
      optionalAttributionKeyPresence: optionalAttributionKeys,
      financialSignalPresence: inspected.financialKeys,
      eventMatchQualityEstimated: false,
      optimizationImpactClaimed: false,
    },
    officialMetaComparison: {
      executed: false,
      status: "pending",
      testEventCodePersisted: false,
      responsePersisted: false,
    },
    execution: {
      payloadBuiltInMemory: true,
      networkCallExecuted: false,
      metaRequestDelivered: false,
      databaseMutationExecuted: false,
    },
    releaseGates: {
      localComparisonApproved: true,
      officialComparisonApproved: false,
      testEventDeliveryAllowed: false,
      productionAllowed: false,
      deploymentAllowed: false,
    },
    issueCodes: [],
    errorCode: null,
  };
  return { approved: true, issueCodes: [], evidence };
}

export function validatePhase19Evidence(input) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_validation_comparison_evidence_v1" || input?.phase !== 19 || input?.environment !== "staging_clone") issues.add("phase19_evidence_contract_invalid");
  if (input?.passed !== true || input?.localComparison?.approved !== true) issues.add("local_comparison_not_approved");
  if (input?.sanitized !== true || input?.containsSecrets !== false || input?.containsPersonalData !== false) issues.add("evidence_not_sanitized");
  if (input?.payloadPersisted !== false || input?.matchValuesPersisted !== false) issues.add("payload_or_match_values_persisted");
  if (input?.sourceEvidence?.phase17Approved !== true || input?.sourceEvidence?.phase18Approved !== true || !HASH.test(input?.sourceEvidence?.phase18EvidenceFingerprint ?? "")) issues.add("source_evidence_invalid");
  if (!HASH.test(input?.event?.eventIdFingerprint ?? "")) issues.add("event_fingerprint_invalid");
  if (input?.localComparison?.eventMatchQualityEstimated !== false || input?.localComparison?.optimizationImpactClaimed !== false) issues.add("unsupported_performance_claim");
  if (input?.officialMetaComparison?.executed !== false || input?.officialMetaComparison?.status !== "pending") issues.add("official_comparison_falsely_claimed");
  if (input?.execution?.networkCallExecuted !== false || input?.execution?.metaRequestDelivered !== false || input?.execution?.databaseMutationExecuted !== false) issues.add("external_execution_detected");
  if (input?.releaseGates?.officialComparisonApproved !== false || input?.releaseGates?.testEventDeliveryAllowed !== false || input?.releaseGates?.productionAllowed !== false) issues.add("release_gate_invalid");
  const serialized = canonicalJson(input);
  if (/Bearer\s+|sb_secret_|\.supabase\.co|^[^\s@]+@[^\s@]+\.[^\s@]+$/im.test(serialized)) issues.add("identifier_or_secret_detected");
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

function approvedPhase17Fixture() {
  return {
    format: "atlas_meta_data_api_access_evidence_v1", phase: 17, environment: "staging_clone", passed: true,
    sanitized: true, containsSecrets: false, containsPersonalData: false, projectIdentifiersPersisted: false, rawLogsPersisted: false,
    remoteExecutionPerformed: true,
    sourceEvidence: {
      phase16: { format: "atlas_meta_auth_reconciliation_evidence_v1", phase: 16, approved: true, sha256: "a".repeat(64) },
      catalog: { format: "atlas_meta_data_api_catalog_evidence_v1", phase: 17, approved: true, sha256: "b".repeat(64) },
    },
    localContract: {
      migrationDraftSha256: "c".repeat(64), organizationExplicitGrant: true, profileNameUpdateGrant: true,
      leadLeastPrivilegeGrant: true, anonymousRevocation: true, serviceRoleGrant: true, readOnlyCatalogQuery: true,
    },
    reconciliation: { approved: true, issueCodes: [] },
    releaseGates: { dataApiGrantsRlsApproved: true, productionAllowed: false, metaEventDeliveryAllowed: false, deploymentAllowed: false },
    prohibitedActions: { productionMutation: false, realMetaEventDelivery: false, campaignMutation: false, budgetMutation: false, audienceMutation: false },
    errorCode: null,
  };
}
const validEventFixture = () => readJson("config/fixtures/meta-validation-event-template.json");

function runSelfTest() {
  const tests = [];
  const approved = createValidationComparison(approvedPhase17Fixture(), validEventFixture());
  const evidenceValidation = validatePhase19Evidence(approved.evidence);
  tests.push({ id: "approved_local_comparison", passed: approved.approved && evidenceValidation.approved, issueCodes: evidenceValidation.issueCodes });
  tests.push({ id: "official_comparison_stays_pending", passed: approved.evidence?.officialMetaComparison?.status === "pending" && approved.evidence?.releaseGates?.officialComparisonApproved === false });
  tests.push({ id: "no_payload_or_match_values_persisted", passed: approved.evidence?.payloadPersisted === false && approved.evidence?.matchValuesPersisted === false });
  const blocked = approvedPhase17Fixture(); blocked.remoteExecutionPerformed = false;
  tests.push({ id: "phase17_gate_propagated", passed: !createValidationComparison(blocked, validEventFixture()).approved });

  const mutateEvent = (id, mutate, code) => {
    const event = validEventFixture(); mutate(event);
    const result = createValidationComparison(approvedPhase17Fixture(), event);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  mutateEvent("raw_identifier_in_custom_data", (e) => { e.customData.campaign_id = e.match.email; }, "custom_data_identifier_detected");
  mutateEvent("missing_match_key", (e) => { e.match = {}; }, "match_key_missing_or_invalid");
  mutateEvent("activity_not_qualification", (e) => { e.evidence.structuredQualification = false; }, "required_evidence_missing:structuredQualification");
  mutateEvent("external_buyer_profile_blocked", (e) => { e.eventName = "BuyerProfile"; }, "internal_learning_event_not_meta_eligible");
  mutateEvent("financial_signal_wrong_event", (e) => { e.customData.currency = "BRL"; e.customData.value = 100; }, "financial_signal_not_allowed_for_event");
  mutateEvent("invalid_currency", (e) => { e.eventName = "SubmitApplication"; e.eventId = "synthetic-crm-stage-lead-0001-proposta"; e.evidence.formalProposalSubmitted = true; e.customData.currency = "real"; e.customData.value = 100; }, "currency_invalid");
  const falseClaim = structuredClone(approved.evidence); falseClaim.localComparison.eventMatchQualityEstimated = true;
  tests.push({ id: "match_quality_claim_blocked", passed: validatePhase19Evidence(falseClaim).issueCodes.includes("unsupported_performance_claim") });
  const falseOfficial = structuredClone(approved.evidence); falseOfficial.officialMetaComparison.executed = true;
  tests.push({ id: "false_official_comparison_blocked", passed: validatePhase19Evidence(falseOfficial).issueCodes.includes("official_comparison_falsely_claimed") });
  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = readJson(process.argv[2] ?? "config/fixtures/meta-validation-comparison-evidence-template.json");
    const result = validatePhase19Evidence(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
