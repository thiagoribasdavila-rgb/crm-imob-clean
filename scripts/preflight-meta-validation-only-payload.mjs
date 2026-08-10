import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateMetaDataApiAccessEvidence } from "./preflight-meta-data-api-access.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contract = JSON.parse(readFileSync(resolve(root, "config/meta-validation-only-signal-contract.json"), "utf8"));
const HASH = /^[a-f0-9]{64}$/;
const EVENT_ID = /^[A-Za-z0-9._:-]{8,200}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const forbiddenCustomKey = /(email|phone|cpf|document|address|income|message|note|religion|race|ethnicity|politic|health)/i;

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const normalizePhone = (value) => {
  let digits = String(value ?? "").replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  return digits;
};
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};

function safePrimitive(value) {
  if (["string", "number", "boolean"].includes(typeof value)) return true;
  return Array.isArray(value) && value.length <= 50 && value.every((item) => typeof item === "string" && item.length <= 200);
}

export function validatePhase17Gate(input) {
  const result = validateMetaDataApiAccessEvidence(input);
  return {
    approved: result.approved && input?.remoteExecutionPerformed === true && input?.releaseGates?.dataApiGrantsRlsApproved === true,
    issueCodes: result.approved ? [] : result.issueCodes,
  };
}

export function validateValidationEvent(input) {
  const issues = new Set();
  const definition = contract.canonicalEvents[input?.eventName];
  if (contract.matching.serverSideSha256 !== true || contract.matching.rawInputEphemeralOnly !== true) issues.add("hashing_contract_invalid");
  if (input?.format !== "atlas_meta_validation_event_input_v1" || input?.phase !== 18) issues.add("event_input_contract_invalid");
  if (input?.environment !== "staging_clone" || input?.synthetic !== true) issues.add("isolated_synthetic_input_required");
  if (!definition) issues.add("event_not_canonical");
  if (definition?.metaEligible === false) issues.add("internal_learning_event_not_meta_eligible");
  if (!EVENT_ID.test(input?.eventId ?? "") || EMAIL.test(input?.eventId ?? "") || /\d{10,}/.test(input?.eventId ?? "")) issues.add("event_id_invalid_or_personal");
  if (!contract.payload.allowedActionSources.includes(input?.actionSource)) issues.add("action_source_not_allowed");
  const eventTime = Date.parse(input?.occurredAt ?? "");
  if (!Number.isFinite(eventTime) || eventTime > Date.now() + 300_000) issues.add("event_time_invalid");
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(input?.organizationReference ?? "")) issues.add("organization_reference_invalid");
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(input?.leadReference ?? "")) issues.add("lead_reference_invalid");
  if (input?.consent?.dataSharingConsent !== true || !Number.isFinite(Date.parse(input?.consent?.capturedAt ?? ""))) issues.add("consent_snapshot_not_approved");

  const email = normalizeEmail(input?.match?.email);
  const phone = normalizePhone(input?.match?.phone);
  if (!EMAIL.test(email) && !(phone.length >= 10 && phone.length <= 15)) issues.add("match_key_missing_or_invalid");
  for (const evidence of definition?.requiredEvidence ?? []) if (input?.evidence?.[evidence] !== true) issues.add(`required_evidence_missing:${evidence}`);

  const custom = input?.customData;
  if (custom !== undefined && (!custom || typeof custom !== "object" || Array.isArray(custom))) issues.add("custom_data_invalid");
  for (const [key, value] of Object.entries(custom ?? {})) {
    if (!contract.payload.allowedCustomDataKeys.includes(key)) issues.add(`custom_data_key_not_allowed:${key}`);
    if (forbiddenCustomKey.test(key) || !safePrimitive(value)) issues.add(`custom_data_value_not_safe:${key}`);
    if (typeof value === "string" && (EMAIL.test(value) || /\d{10,}/.test(value))) issues.add(`custom_data_identifier_detected:${key}`);
  }
  return { approved: issues.size === 0, issueCodes: [...issues].sort(), definition, normalized: { email, phone } };
}

export function buildValidationOnlyPayload(phase17Evidence, input) {
  const phase17 = validatePhase17Gate(phase17Evidence);
  const event = validateValidationEvent(input);
  const issues = [...phase17.issueCodes.map((code) => `phase17:${code}`), ...event.issueCodes];
  if (!phase17.approved) issues.unshift("phase17_gate_closed");
  if (issues.length) return { approved: false, issueCodes: [...new Set(issues)].sort(), payload: null, evidence: null };

  const userData = {
    external_id: [sha256(`atlas:${input.organizationReference}:${input.leadReference}`)],
  };
  if (EMAIL.test(event.normalized.email)) userData.em = [sha256(event.normalized.email)];
  if (event.normalized.phone.length >= 10 && event.normalized.phone.length <= 15) userData.ph = [sha256(event.normalized.phone)];
  if (typeof input.match?.fbc === "string" && input.match.fbc.length <= 300) userData.fbc = input.match.fbc;
  if (typeof input.match?.fbp === "string" && input.match.fbp.length <= 300) userData.fbp = input.match.fbp;
  const customData = { ...(input.customData ?? {}), atlas_signal_version: contract.payload.signalVersion };
  const payload = {
    data: [{
      event_name: input.eventName,
      event_time: Math.floor(Date.parse(input.occurredAt) / 1000),
      event_id: input.eventId,
      action_source: input.actionSource,
      user_data: userData,
      custom_data: customData,
    }],
  };
  const evidence = {
    format: "atlas_meta_validation_only_evidence_v1",
    phase: 18,
    environment: "staging_clone",
    generatedAt: new Date().toISOString(),
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    rawLogsPersisted: false,
    remoteExecutionPerformed: false,
    phase17EvidenceApproved: true,
    event: {
      eventName: input.eventName,
      classification: event.definition.classification,
      requiredEvidenceApproved: true,
      eventIdFingerprint: sha256(input.eventId),
    },
    payloadStructure: {
      actionSource: input.actionSource,
      userDataKeys: Object.keys(userData).sort(),
      customDataKeys: Object.keys(customData).sort(),
      rawIdentifiersPersisted: false,
      hashedIdentifiersPersisted: false,
      payloadPersisted: false,
    },
    execution: {
      payloadBuiltInMemory: true,
      metaRequestPrepared: false,
      metaRequestDelivered: false,
      networkCallExecuted: false,
    },
    releaseGates: {
      validationOnlyApproved: true,
      testEventDeliveryAllowed: false,
      productionAllowed: false,
      deploymentAllowed: false,
    },
    prohibitedActions: {
      productionMutation: false,
      realMetaEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
    },
    issueCodes: [],
    errorCode: null,
  };
  return { approved: true, issueCodes: [], payload, evidence };
}

export function validatePhase18Evidence(input) {
  const issues = new Set();
  if (input?.format !== "atlas_meta_validation_only_evidence_v1" || input?.phase !== 18 || input?.environment !== "staging_clone") issues.add("phase18_evidence_contract_invalid");
  if (input?.passed !== true || input?.phase17EvidenceApproved !== true) issues.add("validation_not_approved");
  if (input?.sanitized !== true || input?.containsSecrets !== false || input?.containsPersonalData !== false) issues.add("evidence_not_sanitized");
  if (!HASH.test(input?.event?.eventIdFingerprint ?? "") || input?.event?.requiredEvidenceApproved !== true) issues.add("event_evidence_invalid");
  if (input?.payloadStructure?.rawIdentifiersPersisted !== false || input?.payloadStructure?.hashedIdentifiersPersisted !== false || input?.payloadStructure?.payloadPersisted !== false) issues.add("payload_material_persisted");
  if (input?.execution?.payloadBuiltInMemory !== true || input?.execution?.networkCallExecuted !== false || input?.execution?.metaRequestDelivered !== false) issues.add("execution_contract_invalid");
  if (input?.releaseGates?.validationOnlyApproved !== true || input?.releaseGates?.testEventDeliveryAllowed !== false || input?.releaseGates?.productionAllowed !== false) issues.add("release_gate_invalid");
  const forbiddenEvidenceKeys = new Set(["email", "phone", "rawEmail", "rawPhone", "accessToken", "authorization", "secretKey", "supabaseUrl"]);
  const containsIdentifierOrSecret = (value) => {
    if (typeof value === "string") {
      return /Bearer\s+|sb_secret_|\.supabase\.co|^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)
        || /^\+?\d{10,15}$/.test(value);
    }
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, nested]) => forbiddenEvidenceKeys.has(key) || containsIdentifierOrSecret(nested));
  };
  if (containsIdentifierOrSecret(canonicalize(input))) issues.add("identifier_or_secret_detected");
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

function validEventFixture() {
  return JSON.parse(readFileSync(resolve(root, "config/fixtures/meta-validation-event-template.json"), "utf8"));
}

function runSelfTest() {
  const tests = [];
  const eventTest = (id, mutate, code) => {
    const fixture = validEventFixture();
    mutate(fixture);
    const result = validateValidationEvent(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(code) });
  };
  const approved = buildValidationOnlyPayload(approvedPhase17Fixture(), validEventFixture());
  const approvedEvidenceValidation = validatePhase18Evidence(approved.evidence);
  tests.push({ id: "approved_validation_only_payload", passed: approved.approved && approvedEvidenceValidation.approved, issueCodes: approvedEvidenceValidation.issueCodes });
  tests.push({ id: "payload_has_hashed_match_only", passed: approved.payload?.data?.[0]?.user_data?.em?.[0]?.length === 64 && !JSON.stringify(approved.evidence).includes("validation@example.invalid") });
  const closed = approvedPhase17Fixture(); closed.remoteExecutionPerformed = false;
  tests.push({ id: "phase17_gate_closed", passed: buildValidationOnlyPayload(closed, validEventFixture()).issueCodes.includes("phase17_gate_closed") });
  eventTest("non_synthetic", (f) => { f.synthetic = false; }, "isolated_synthetic_input_required");
  eventTest("unknown_event", (f) => { f.eventName = "Purchase"; }, "event_not_canonical");
  eventTest("buyer_profile_internal", (f) => { f.eventName = "BuyerProfile"; }, "internal_learning_event_not_meta_eligible");
  eventTest("personal_event_id", (f) => { f.eventId = "cliente@example.com"; }, "event_id_invalid_or_personal");
  eventTest("action_source", (f) => { f.actionSource = "website"; }, "action_source_not_allowed");
  eventTest("consent", (f) => { f.consent.dataSharingConsent = false; }, "consent_snapshot_not_approved");
  eventTest("match", (f) => { f.match = {}; }, "match_key_missing_or_invalid");
  eventTest("qualification_evidence", (f) => { f.evidence.structuredQualification = false; }, "required_evidence_missing:structuredQualification");
  eventTest("custom_key", (f) => { f.customData.notes = "texto"; }, "custom_data_key_not_allowed:notes");
  eventTest("custom_identifier", (f) => { f.customData.campaign_id = "pessoa@example.com"; }, "custom_data_identifier_detected:campaign_id");
  const converted = validEventFixture(); converted.eventName = "ConvertedLead"; converted.eventId = "synthetic-crm-stage-lead-0001-ganho";
  tests.push({ id: "sale_needs_confirmed_outcome", passed: validateValidationEvent(converted).issueCodes.includes("required_evidence_missing:confirmedCommercialOutcome") });
  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const input = JSON.parse(readFileSync(resolve(root, process.argv[2] ?? "config/fixtures/meta-validation-event-template.json"), "utf8"));
    const result = input?.format === "atlas_meta_validation_only_evidence_v1" ? validatePhase18Evidence(input) : validateValidationEvent(input);
    console.log(JSON.stringify({ approved: result.approved, issueCodes: result.issueCodes }, null, 2));
    if (!result.approved) process.exit(1);
  }
}
