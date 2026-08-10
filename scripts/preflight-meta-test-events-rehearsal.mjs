import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateMetaDataApiAccessEvidence } from "./preflight-meta-data-api-access.mjs";
import { validatePhase19Evidence } from "./preflight-meta-validation-comparison.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const gate = readJson("config/meta-test-events-rehearsal-gate.json");
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
    "testEventCode", "payload", "rawPayload", "rawResponse", "email", "phone",
    "cpf", "address", "income", "projectRef", "supabaseUrl",
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

export function validateRehearsalRequest(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_test_events_rehearsal_request_v1" || input?.phase !== 20) issues.add("request_contract_invalid");
  if (input?.environment !== "staging_clone") issues.add("isolated_staging_required");
  if (!validReference(input?.rehearsalReference)) issues.add("rehearsal_reference_invalid");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");

  const approvals = input?.approvals ?? {};
  if (approvals.directorApproved !== true || !validReference(approvals.directorApprovalReference)) issues.add("director_approval_missing");
  if (approvals.securityApproved !== true || !validReference(approvals.securityApprovalReference)) issues.add("security_approval_missing");
  if (approvals.directorApprovalReference === approvals.securityApprovalReference) issues.add("distinct_approval_references_required");
  const approvedAt = Date.parse(approvals.approvedAt ?? "");
  const expiresAt = Date.parse(approvals.expiresAt ?? "");
  const maxValidityMs = gate.authorization.maximumValidityHours * 60 * 60 * 1000;
  if (!Number.isFinite(approvedAt) || !Number.isFinite(expiresAt)) issues.add("approval_window_invalid");
  else {
    if (approvedAt > now + 300_000) issues.add("approval_timestamp_in_future");
    if (expiresAt <= now) issues.add("approval_expired");
    if (expiresAt <= approvedAt || expiresAt - approvedAt > maxValidityMs) issues.add("approval_window_exceeds_limit");
  }

  const record = input?.record ?? {};
  if (record.synthetic !== true || record.syntheticRecordConfirmed !== true) issues.add("synthetic_record_not_confirmed");
  if (record.realCustomerDataIncluded !== false) issues.add("real_customer_data_forbidden");
  if (record.singleCanonicalEvent !== true || record.maximumDeliveries !== 1) issues.add("single_event_scope_required");

  const operator = input?.operator ?? {};
  if (operator.temporaryCodeAvailableInOfficialSurface !== true) issues.add("official_test_surface_not_ready");
  if (operator.temporaryCodeCopiedToAtlas !== false) issues.add("temporary_code_must_not_enter_atlas");
  if (operator.authorizedSingleDelivery !== true) issues.add("single_delivery_not_authorized");

  const acknowledgements = input?.acknowledgements ?? {};
  for (const control of [
    "manualExecutionOnly", "stopWithoutRetryOnUnexpectedResult", "campaignMutationProhibited",
    "budgetMutationProhibited", "audienceMutationProhibited", "productionDeliveryProhibited",
    "noPerformanceClaim",
  ]) if (acknowledgements[control] !== true) issues.add(`acknowledgement_missing:${control}`);
  if (input?.officialExecution?.executed !== false || input?.officialExecution?.eventDelivered !== false) issues.add("execution_must_not_precede_packet");
  return { approved: issues.size === 0, issueCodes: [...issues].sort() };
}

export function createTestEventsRehearsalPacket(phase17Evidence, phase19Evidence, request, now = Date.now()) {
  const issues = new Set();
  const phase17 = validateMetaDataApiAccessEvidence(phase17Evidence);
  const phase19 = validatePhase19Evidence(phase19Evidence);
  const requestValidation = validateRehearsalRequest(request, now);
  if (!phase17.approved) for (const issue of phase17.issueCodes) issues.add(`phase17:${issue}`);
  if (!phase19.approved) for (const issue of phase19.issueCodes) issues.add(`phase19:${issue}`);
  for (const issue of requestValidation.issueCodes) issues.add(`request:${issue}`);
  if (issues.size) return { approved: false, issueCodes: [...issues].sort(), evidence: null };

  const evidence = {
    format: "atlas_meta_test_events_rehearsal_evidence_v1",
    phase: 20,
    environment: "staging_clone",
    generatedAt: new Date(now).toISOString(),
    expiresAt: request.approvals.expiresAt,
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    containsTemporaryCode: false,
    payloadPersisted: false,
    responsePersisted: false,
    sourceEvidence: {
      phase17Approved: true,
      phase19Approved: true,
      phase17Fingerprint: sha256(canonicalJson(phase17Evidence)),
      phase19Fingerprint: sha256(canonicalJson(phase19Evidence)),
    },
    humanApprovals: {
      directorApproved: true,
      securityApproved: true,
      directorApprovalFingerprint: sha256(request.approvals.directorApprovalReference),
      securityApprovalFingerprint: sha256(request.approvals.securityApprovalReference),
      requestFingerprint: sha256(canonicalJson(request)),
    },
    scope: {
      syntheticRecordOnly: true,
      realCustomerDataAllowed: false,
      singleCanonicalEvent: true,
      maximumDeliveries: 1,
      eventName: phase19Evidence.event.eventName,
      eventIdFingerprint: phase19Evidence.event.eventIdFingerprint,
    },
    manualChecklist: [...gate.manualChecklist],
    officialExecution: {
      executed: false,
      eventDelivered: false,
      responseObserved: false,
    },
    releaseGates: {
      manualOperatorRehearsalAllowed: true,
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
  return { approved: true, issueCodes: [], evidence };
}

export function validatePhase20Evidence(input, now = Date.now()) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_test_events_rehearsal_evidence_v1" || input?.phase !== 20 || input?.environment !== "staging_clone") issues.add("phase20_evidence_contract_invalid");
  if (input?.passed !== true || input?.sanitized !== true) issues.add("rehearsal_packet_not_approved");
  if (input?.containsSecrets !== false || input?.containsPersonalData !== false || input?.containsTemporaryCode !== false) issues.add("evidence_not_sanitized");
  if (input?.payloadPersisted !== false || input?.responsePersisted !== false) issues.add("payload_or_response_persisted");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");
  for (const fingerprint of [
    input?.sourceEvidence?.phase17Fingerprint, input?.sourceEvidence?.phase19Fingerprint,
    input?.humanApprovals?.directorApprovalFingerprint, input?.humanApprovals?.securityApprovalFingerprint,
    input?.humanApprovals?.requestFingerprint, input?.scope?.eventIdFingerprint,
  ]) if (!HASH.test(fingerprint ?? "")) issues.add("fingerprint_invalid");
  if (input?.sourceEvidence?.phase17Approved !== true || input?.sourceEvidence?.phase19Approved !== true) issues.add("source_evidence_not_approved");
  if (input?.humanApprovals?.directorApproved !== true || input?.humanApprovals?.securityApproved !== true) issues.add("human_approval_not_approved");
  if (!Number.isFinite(Date.parse(input?.expiresAt ?? "")) || Date.parse(input.expiresAt) <= now) issues.add("packet_expired");
  if (input?.scope?.syntheticRecordOnly !== true || input?.scope?.realCustomerDataAllowed !== false || input?.scope?.singleCanonicalEvent !== true || input?.scope?.maximumDeliveries !== 1) issues.add("scope_invalid");
  if (input?.officialExecution?.executed !== false || input?.officialExecution?.eventDelivered !== false || input?.officialExecution?.responseObserved !== false) issues.add("official_execution_falsely_claimed");
  const release = input?.releaseGates ?? {};
  if (release.manualOperatorRehearsalAllowed !== true) issues.add("manual_rehearsal_not_authorized");
  for (const control of ["automaticDeliveryAllowed", "productionDeliveryAllowed", "campaignMutationAllowed", "budgetMutationAllowed", "audienceMutationAllowed", "deploymentAllowed"]) {
    if (release[control] !== false) issues.add(`release_gate_invalid:${control}`);
  }
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

function approvedPhase19Fixture() {
  return {
    format: "atlas_meta_validation_comparison_evidence_v1", phase: 19, environment: "staging_clone", generatedAt: new Date().toISOString(), passed: true,
    sanitized: true, containsSecrets: false, containsPersonalData: false, payloadPersisted: false, matchValuesPersisted: false, remoteExecutionPerformed: false,
    sourceEvidence: { phase17Approved: true, phase18Approved: true, phase18EvidenceFingerprint: "d".repeat(64) },
    event: { eventName: "QualifiedLead", classification: "qualified_commercial_signal", eventIdFingerprint: "e".repeat(64) },
    localComparison: { approved: true, requiredChecks: [], matchKeyPresence: ["em", "external_id"], optionalAttributionKeyPresence: [], financialSignalPresence: [], eventMatchQualityEstimated: false, optimizationImpactClaimed: false },
    officialMetaComparison: { executed: false, status: "pending", testEventCodePersisted: false, responsePersisted: false },
    execution: { payloadBuiltInMemory: true, networkCallExecuted: false, metaRequestDelivered: false, databaseMutationExecuted: false },
    releaseGates: { localComparisonApproved: true, officialComparisonApproved: false, testEventDeliveryAllowed: false, productionAllowed: false, deploymentAllowed: false },
    issueCodes: [], errorCode: null,
  };
}

function approvedRequestFixture(now = Date.now()) {
  return {
    format: "atlas_meta_test_events_rehearsal_request_v1", phase: 20, environment: "staging_clone", rehearsalReference: "rehearsal-synthetic-0001",
    approvals: {
      directorApproved: true, directorApprovalReference: "director-approval-0001",
      securityApproved: true, securityApprovalReference: "security-approval-0001",
      approvedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
    },
    record: { synthetic: true, syntheticRecordConfirmed: true, realCustomerDataIncluded: false, singleCanonicalEvent: true, maximumDeliveries: 1 },
    operator: { temporaryCodeAvailableInOfficialSurface: true, temporaryCodeCopiedToAtlas: false, authorizedSingleDelivery: true },
    acknowledgements: {
      manualExecutionOnly: true, stopWithoutRetryOnUnexpectedResult: true, campaignMutationProhibited: true,
      budgetMutationProhibited: true, audienceMutationProhibited: true, productionDeliveryProhibited: true, noPerformanceClaim: true,
    },
    officialExecution: { executed: false, eventDelivered: false },
  };
}

function runSelfTest() {
  const now = Date.now();
  const tests = [];
  const approved = createTestEventsRehearsalPacket(approvedPhase17Fixture(), approvedPhase19Fixture(), approvedRequestFixture(now), now);
  const validation = validatePhase20Evidence(approved.evidence, now);
  tests.push({ id: "approved_manual_packet", passed: approved.approved && validation.approved, issueCodes: validation.issueCodes });
  tests.push({ id: "no_official_execution_claim", passed: approved.evidence?.officialExecution?.executed === false && approved.evidence?.releaseGates?.automaticDeliveryAllowed === false });
  tests.push({ id: "no_sensitive_material_persisted", passed: approved.evidence?.containsTemporaryCode === false && approved.evidence?.payloadPersisted === false && approved.evidence?.responsePersisted === false });

  const requestTest = (id, mutate, code) => {
    const request = approvedRequestFixture(now); mutate(request);
    const result = createTestEventsRehearsalPacket(approvedPhase17Fixture(), approvedPhase19Fixture(), request, now);
    tests.push({ id, passed: !result.approved && result.issueCodes.some((issue) => issue.includes(code)) });
  };
  requestTest("director_approval_required", (r) => { r.approvals.directorApproved = false; }, "director_approval_missing");
  requestTest("security_approval_required", (r) => { r.approvals.securityApproved = false; }, "security_approval_missing");
  requestTest("distinct_approvals_required", (r) => { r.approvals.securityApprovalReference = r.approvals.directorApprovalReference; }, "distinct_approval_references_required");
  requestTest("expired_request_blocked", (r) => { r.approvals.expiresAt = new Date(now - 1).toISOString(); }, "approval_expired");
  requestTest("long_approval_window_blocked", (r) => { r.approvals.expiresAt = new Date(now + 25 * 60 * 60 * 1000).toISOString(); }, "approval_window_exceeds_limit");
  requestTest("real_customer_data_blocked", (r) => { r.record.realCustomerDataIncluded = true; }, "real_customer_data_forbidden");
  requestTest("synthetic_confirmation_required", (r) => { r.record.syntheticRecordConfirmed = false; }, "synthetic_record_not_confirmed");
  requestTest("temporary_code_must_stay_outside", (r) => { r.operator.temporaryCodeCopiedToAtlas = true; }, "temporary_code_must_not_enter_atlas");
  requestTest("multiple_deliveries_blocked", (r) => { r.record.maximumDeliveries = 2; }, "single_event_scope_required");
  requestTest("campaign_acknowledgement_required", (r) => { r.acknowledgements.campaignMutationProhibited = false; }, "campaignMutationProhibited");
  const phase17Blocked = approvedPhase17Fixture(); phase17Blocked.remoteExecutionPerformed = false;
  tests.push({ id: "phase17_evidence_required", passed: !createTestEventsRehearsalPacket(phase17Blocked, approvedPhase19Fixture(), approvedRequestFixture(now), now).approved });
  const phase19Blocked = approvedPhase19Fixture(); phase19Blocked.localComparison.approved = false;
  tests.push({ id: "phase19_evidence_required", passed: !createTestEventsRehearsalPacket(approvedPhase17Fixture(), phase19Blocked, approvedRequestFixture(now), now).approved });
  const falseExecution = structuredClone(approved.evidence); falseExecution.officialExecution.executed = true;
  tests.push({ id: "false_official_execution_blocked", passed: validatePhase20Evidence(falseExecution, now).issueCodes.includes("official_execution_falsely_claimed") });
  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = readJson(process.argv[2] ?? "config/fixtures/meta-test-events-rehearsal-evidence-template.json");
    const result = validatePhase20Evidence(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
