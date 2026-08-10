import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const HASH = /^[a-f0-9]{64}$/;
const REQUIRED_TABLES = ["organizations", "profiles", "leads"];
const REQUIRED_CONTROLS = [
  "allTablesExist",
  "rlsEnabledOnAllTables",
  "anonymousPrivilegesRevoked",
  "requiredAuthenticatedColumnPrivilegesGranted",
  "leadAuthenticatedTablePrivilegesComplete",
  "leadDeleteNotGranted",
  "serviceRoleEffectivePrivilegesComplete",
  "requiredAuthenticatedPoliciesPresent",
  "selectPoliciesHaveUsing",
  "insertPoliciesHaveWithCheck",
  "updatePoliciesHaveUsingAndWithCheck",
];

function containsForbiddenMaterial(input) {
  const serialized = JSON.stringify(input);
  if (/sb_secret_|Bearer\s+|\.supabase\.co|@example\.|eyJ[a-zA-Z0-9_-]{10,}\./i.test(serialized)) return true;
  const forbiddenKeys = new Set([
    "password", "accessToken", "refreshToken", "authorization", "supabaseUrl",
    "projectRef", "secretKey", "publishableKey", "email", "phone",
  ]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, nested]) => forbiddenKeys.has(key) || visit(nested));
  };
  return visit(input);
}

function commonEvidenceIssues(input) {
  const issues = new Set();
  if (input?.environment !== "staging_clone" || input?.remoteExecutionPerformed !== true) issues.add("isolated_catalog_execution_missing");
  if (input?.sanitized !== true || input?.containsSecrets !== false || input?.containsPersonalData !== false) issues.add("evidence_not_sanitized");
  if (input?.projectIdentifiersPersisted !== false || input?.rawLogsPersisted !== false) issues.add("sensitive_runtime_material_persisted");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");
  const gates = input?.releaseGates ?? {};
  if (gates.productionAllowed !== false || gates.metaEventDeliveryAllowed !== false || gates.deploymentAllowed !== false) issues.add("downstream_release_improperly_opened");
  return issues;
}

export function validateMetaDataApiCatalogEvidence(input) {
  const issues = commonEvidenceIssues(input);
  if (input?.format !== "atlas_meta_data_api_catalog_evidence_v1" || input?.phase !== 17) issues.add("phase17_catalog_contract_invalid");
  if (input?.passed !== true || input?.queryReadOnly !== true) issues.add("catalog_evidence_not_approved");
  for (const table of REQUIRED_TABLES) {
    const evidence = input?.tables?.[table];
    if (!evidence || evidence.exists !== true || evidence.rlsEnabled !== true) issues.add(`table_contract_invalid:${table}`);
    if (evidence?.anonymousColumnPrivilegeDetected !== false) issues.add(`anonymous_column_exposure:${table}`);
  }
  for (const control of REQUIRED_CONTROLS) {
    if (input?.controls?.[control] !== true) issues.add(`control_not_approved:${control}`);
  }
  return { approved: issues.size === 0, issueCodes: [...issues].sort(), stagingOnly: true, productionAllowed: false };
}

export function validateMetaDataApiAccessEvidence(input) {
  const issues = commonEvidenceIssues(input);
  const phase16 = input?.sourceEvidence?.phase16 ?? {};
  const catalog = input?.sourceEvidence?.catalog ?? {};
  const local = input?.localContract ?? {};
  const reconciliation = input?.reconciliation ?? {};
  const gates = input?.releaseGates ?? {};
  const prohibited = input?.prohibitedActions ?? {};

  if (input?.format !== "atlas_meta_data_api_access_evidence_v1" || input?.phase !== 17) issues.add("phase17_access_contract_invalid");
  if (input?.passed !== true || reconciliation.approved !== true || (reconciliation.issueCodes ?? []).length !== 0) issues.add("data_api_reconciliation_not_approved");
  if (phase16.format !== "atlas_meta_auth_reconciliation_evidence_v1" || phase16.phase !== 16 || phase16.approved !== true || !HASH.test(phase16.sha256 ?? "")) issues.add("phase16_source_not_approved");
  if (catalog.format !== "atlas_meta_data_api_catalog_evidence_v1" || catalog.phase !== 17 || catalog.approved !== true || !HASH.test(catalog.sha256 ?? "")) issues.add("catalog_source_not_approved");
  if (!HASH.test(local.migrationDraftSha256 ?? "")) issues.add("migration_draft_hash_invalid");
  for (const control of [
    "organizationExplicitGrant", "profileNameUpdateGrant", "leadLeastPrivilegeGrant",
    "anonymousRevocation", "serviceRoleGrant", "readOnlyCatalogQuery",
  ]) if (local[control] !== true) issues.add(`local_contract_not_approved:${control}`);
  if (gates.dataApiGrantsRlsApproved !== true) issues.add("data_api_gate_not_approved");
  if (input?.errorCode) issues.add("runtime_error_present");
  if (prohibited.productionMutation === true || prohibited.realMetaEventDelivery === true) issues.add("external_mutation_forbidden");
  if (prohibited.campaignMutation === true || prohibited.budgetMutation === true || prohibited.audienceMutation === true) issues.add("meta_configuration_mutation_forbidden");

  return { approved: issues.size === 0, issueCodes: [...issues].sort(), stagingOnly: true, productionAllowed: false };
}

function approvedCatalogFixture() {
  const table = {
    exists: true,
    rlsEnabled: true,
    forceRls: false,
    effectiveTablePrivileges: { anon: [], authenticated: [], service_role: ["DELETE", "INSERT", "SELECT", "UPDATE"] },
    requiredAuthenticatedColumnPrivileges: [],
    anonymousColumnPrivilegeDetected: false,
    policies: {},
  };
  return {
    format: "atlas_meta_data_api_catalog_evidence_v1",
    phase: 17,
    environment: "staging_clone",
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    rawLogsPersisted: false,
    remoteExecutionPerformed: true,
    queryReadOnly: true,
    tables: Object.fromEntries(REQUIRED_TABLES.map((name) => [name, structuredClone(table)])),
    controls: Object.fromEntries(REQUIRED_CONTROLS.map((name) => [name, true])),
    releaseGates: { productionAllowed: false, metaEventDeliveryAllowed: false, deploymentAllowed: false },
  };
}

function approvedAccessFixture() {
  return {
    format: "atlas_meta_data_api_access_evidence_v1",
    phase: 17,
    environment: "staging_clone",
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    rawLogsPersisted: false,
    remoteExecutionPerformed: true,
    sourceEvidence: {
      phase16: { format: "atlas_meta_auth_reconciliation_evidence_v1", phase: 16, approved: true, sha256: "a".repeat(64) },
      catalog: { format: "atlas_meta_data_api_catalog_evidence_v1", phase: 17, approved: true, sha256: "b".repeat(64) },
    },
    localContract: {
      migrationDraftSha256: "c".repeat(64),
      organizationExplicitGrant: true,
      profileNameUpdateGrant: true,
      leadLeastPrivilegeGrant: true,
      anonymousRevocation: true,
      serviceRoleGrant: true,
      readOnlyCatalogQuery: true,
    },
    reconciliation: { approved: true, issueCodes: [] },
    releaseGates: { dataApiGrantsRlsApproved: true, productionAllowed: false, metaEventDeliveryAllowed: false, deploymentAllowed: false },
    prohibitedActions: { productionMutation: false, realMetaEventDelivery: false, campaignMutation: false, budgetMutation: false, audienceMutation: false },
    errorCode: null,
  };
}

function runSelfTest() {
  const tests = [];
  const catalogTest = (id, mutate, code) => {
    const fixture = structuredClone(approvedCatalogFixture());
    mutate(fixture);
    const result = validateMetaDataApiCatalogEvidence(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(code) });
  };
  const accessTest = (id, mutate, code) => {
    const fixture = structuredClone(approvedAccessFixture());
    mutate(fixture);
    const result = validateMetaDataApiAccessEvidence(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(code) });
  };
  tests.push({ id: "approved_catalog", passed: validateMetaDataApiCatalogEvidence(approvedCatalogFixture()).approved });
  tests.push({ id: "approved_access", passed: validateMetaDataApiAccessEvidence(approvedAccessFixture()).approved });
  catalogTest("catalog_format", (f) => { f.format = "invalid"; }, "phase17_catalog_contract_invalid");
  catalogTest("catalog_environment", (f) => { f.environment = "production"; }, "isolated_catalog_execution_missing");
  catalogTest("catalog_execution", (f) => { f.remoteExecutionPerformed = false; }, "isolated_catalog_execution_missing");
  catalogTest("catalog_read_only", (f) => { f.queryReadOnly = false; }, "catalog_evidence_not_approved");
  catalogTest("catalog_passed", (f) => { f.passed = false; }, "catalog_evidence_not_approved");
  catalogTest("catalog_table", (f) => { f.tables.leads.rlsEnabled = false; }, "table_contract_invalid:leads");
  catalogTest("catalog_anon_column", (f) => { f.tables.profiles.anonymousColumnPrivilegeDetected = true; }, "anonymous_column_exposure:profiles");
  catalogTest("catalog_control", (f) => { f.controls.leadDeleteNotGranted = false; }, "control_not_approved:leadDeleteNotGranted");
  catalogTest("catalog_secret", (f) => { f.note = "Bearer unsafe"; }, "forbidden_material_detected");
  catalogTest("catalog_gate", (f) => { f.releaseGates.productionAllowed = true; }, "downstream_release_improperly_opened");
  accessTest("access_format", (f) => { f.phase = 18; }, "phase17_access_contract_invalid");
  accessTest("access_passed", (f) => { f.passed = false; }, "data_api_reconciliation_not_approved");
  accessTest("access_phase16", (f) => { f.sourceEvidence.phase16.approved = false; }, "phase16_source_not_approved");
  accessTest("access_catalog", (f) => { f.sourceEvidence.catalog.sha256 = "short"; }, "catalog_source_not_approved");
  accessTest("access_migration_hash", (f) => { f.localContract.migrationDraftSha256 = "short"; }, "migration_draft_hash_invalid");
  accessTest("access_local_grant", (f) => { f.localContract.organizationExplicitGrant = false; }, "local_contract_not_approved:organizationExplicitGrant");
  accessTest("access_gate", (f) => { f.releaseGates.dataApiGrantsRlsApproved = false; }, "data_api_gate_not_approved");
  accessTest("access_runtime", (f) => { f.errorCode = "failure"; }, "runtime_error_present");
  accessTest("access_meta_mutation", (f) => { f.prohibitedActions.campaignMutation = true; }, "meta_configuration_mutation_forbidden");
  accessTest("access_personal_data", (f) => { f.phone = "redacted"; }, "forbidden_material_detected");
  const passed = tests.every((test) => test.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const file = process.argv[2] ?? "config/fixtures/meta-data-api-access-evidence-template.json";
    const input = readJson(file);
    const result = input?.format === "atlas_meta_data_api_catalog_evidence_v1"
      ? validateMetaDataApiCatalogEvidence(input)
      : validateMetaDataApiAccessEvidence(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
