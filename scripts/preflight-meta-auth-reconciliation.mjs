import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const HASH = /^[a-f0-9]{64}$/;

function containsForbiddenMaterial(input) {
  const serialized = JSON.stringify(input);
  const forbiddenValue = /sb_secret_|service_role|Bearer\s+|\.supabase\.co|@example\.|eyJ[a-zA-Z0-9_-]{10,}\./i;
  if (forbiddenValue.test(serialized)) return true;
  const forbiddenKeys = new Set(["password", "accessToken", "refreshToken", "authorization", "supabaseUrl", "projectRef", "secretKey", "publishableKey", "email"]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return false;
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) return true;
      if (visit(nested)) return true;
    }
    return false;
  };
  return visit(input);
}

export function validateMetaAuthReconciliationEvidence(input) {
  const issues = new Set();
  const source = input?.sourceEvidence ?? {};
  const expected = input?.contract?.expected ?? {};
  const observed = input?.contract?.observed ?? {};
  const reconciliation = input?.reconciliation ?? {};
  const cleanup = input?.cleanup ?? {};
  const residual = cleanup.residual ?? {};
  const gates = input?.releaseGates ?? {};
  const prohibited = input?.prohibitedActions ?? {};

  if (input?.format !== "atlas_meta_auth_reconciliation_evidence_v1" || input?.phase !== 16) issues.add("phase16_evidence_contract_invalid");
  if (input?.environment !== "staging_clone" || input?.remoteExecutionPerformed !== true) issues.add("isolated_remote_execution_missing");
  if (input?.passed !== true || reconciliation.approved !== true) issues.add("reconciliation_not_approved");
  if (input?.sanitized !== true || input?.containsSecrets !== false || input?.containsPersonalData !== false) issues.add("reconciliation_evidence_not_sanitized");
  if (input?.projectIdentifiersPersisted !== false || input?.rawLogsPersisted !== false) issues.add("sensitive_runtime_material_persisted");
  if (containsForbiddenMaterial(input)) issues.add("forbidden_material_detected");
  if (source.format !== "atlas_meta_auth_isolated_rehearsal_evidence_v1" || source.phase !== 15 || source.approved !== true) issues.add("phase15_source_not_approved");
  if (!HASH.test(source.sha256 ?? "")) issues.add("source_evidence_hash_invalid");
  if (expected.organizationsCreated !== 2 || expected.authUsersCreated !== 9 || expected.profilesCreated !== 9 || expected.leadsCreated !== 4 || expected.minimumScenarioCount !== 15) issues.add("expected_contract_drift");
  if (observed.organizationsCreated !== 2 || observed.authUsersCreated !== 9 || observed.profilesCreated !== 9 || observed.leadsCreated !== 4 || observed.scenarioCount < 15) issues.add("observed_contract_drift");
  if (reconciliation.driftCount !== 0 || (reconciliation.issueCodes ?? []).length !== 0) issues.add("unresolved_reconciliation_drift");
  if (cleanup.complete !== true || cleanup.zeroResidual !== true || (cleanup.errorCodes ?? []).length !== 0) issues.add("cleanup_not_approved");
  if (![residual.organizations, residual.profiles, residual.leads, residual.authUsers].every((count) => count === 0)) issues.add("residual_inventory_detected");
  if (gates.isolatedAuthJwtRlsEvidenceApproved !== true) issues.add("isolated_auth_gate_not_approved");
  if (gates.productionAllowed !== false || gates.metaEventDeliveryAllowed !== false || gates.deploymentAllowed !== false) issues.add("downstream_release_improperly_opened");
  if (input?.errorCode) issues.add("runtime_error_present");
  if (prohibited.productionMutation === true || prohibited.realMetaEventDelivery === true) issues.add("external_mutation_forbidden");
  if (prohibited.campaignMutation === true || prohibited.budgetMutation === true || prohibited.audienceMutation === true) issues.add("meta_configuration_mutation_forbidden");

  return { approved: issues.size === 0, issueCodes: [...issues].sort(), stagingOnly: true, productionAllowed: false };
}

function approvedFixture() {
  return {
    format: "atlas_meta_auth_reconciliation_evidence_v1",
    phase: 16,
    environment: "staging_clone",
    generatedAt: "2026-07-19T00:00:00.000Z",
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    rawLogsPersisted: false,
    remoteExecutionPerformed: true,
    sourceEvidence: { format: "atlas_meta_auth_isolated_rehearsal_evidence_v1", phase: 15, approved: true, sha256: "a".repeat(64) },
    contract: {
      expected: { organizationsCreated: 2, authUsersCreated: 9, profilesCreated: 9, leadsCreated: 4, minimumScenarioCount: 15 },
      observed: { organizationsCreated: 2, authUsersCreated: 9, profilesCreated: 9, leadsCreated: 4, scenarioCount: 18 },
    },
    reconciliation: { approved: true, driftCount: 0, issueCodes: [] },
    cleanup: { complete: true, zeroResidual: true, residual: { organizations: 0, profiles: 0, leads: 0, authUsers: 0 }, errorCodes: [] },
    releaseGates: { isolatedAuthJwtRlsEvidenceApproved: true, productionAllowed: false, metaEventDeliveryAllowed: false, deploymentAllowed: false },
    prohibitedActions: { productionMutation: false, realMetaEventDelivery: false, campaignMutation: false, budgetMutation: false, audienceMutation: false },
    errorCode: null,
  };
}

function runSelfTest() {
  const tests = [];
  const test = (id, mutate, code) => {
    const fixture = structuredClone(approvedFixture());
    mutate(fixture);
    const result = validateMetaAuthReconciliationEvidence(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(code) });
  };
  const approved = validateMetaAuthReconciliationEvidence(approvedFixture());
  tests.push({ id: "sanitized_zero_residual_reconciliation", passed: approved.approved && !approved.productionAllowed });
  test("format", (f) => { f.format = "invalid"; }, "phase16_evidence_contract_invalid");
  test("environment", (f) => { f.environment = "production"; }, "isolated_remote_execution_missing");
  test("execution", (f) => { f.remoteExecutionPerformed = false; }, "isolated_remote_execution_missing");
  test("approval", (f) => { f.passed = false; }, "reconciliation_not_approved");
  test("sanitization", (f) => { f.containsSecrets = true; }, "reconciliation_evidence_not_sanitized");
  test("raw_logs", (f) => { f.rawLogsPersisted = true; }, "sensitive_runtime_material_persisted");
  test("token_value", (f) => { f.note = "Bearer unsafe"; }, "forbidden_material_detected");
  test("email_key", (f) => { f.email = "redacted"; }, "forbidden_material_detected");
  test("source", (f) => { f.sourceEvidence.approved = false; }, "phase15_source_not_approved");
  test("hash", (f) => { f.sourceEvidence.sha256 = "short"; }, "source_evidence_hash_invalid");
  test("expected", (f) => { f.contract.expected.authUsersCreated = 8; }, "expected_contract_drift");
  test("observed_org", (f) => { f.contract.observed.organizationsCreated = 1; }, "observed_contract_drift");
  test("observed_user", (f) => { f.contract.observed.authUsersCreated = 8; }, "observed_contract_drift");
  test("observed_profile", (f) => { f.contract.observed.profilesCreated = 8; }, "observed_contract_drift");
  test("observed_lead", (f) => { f.contract.observed.leadsCreated = 3; }, "observed_contract_drift");
  test("coverage", (f) => { f.contract.observed.scenarioCount = 14; }, "observed_contract_drift");
  test("drift", (f) => { f.reconciliation.driftCount = 1; f.reconciliation.issueCodes = ["x"]; }, "unresolved_reconciliation_drift");
  test("cleanup", (f) => { f.cleanup.complete = false; }, "cleanup_not_approved");
  test("cleanup_error", (f) => { f.cleanup.errorCodes = ["x"]; }, "cleanup_not_approved");
  test("residual_lead", (f) => { f.cleanup.residual.leads = 1; }, "residual_inventory_detected");
  test("auth_gate", (f) => { f.releaseGates.isolatedAuthJwtRlsEvidenceApproved = false; }, "isolated_auth_gate_not_approved");
  test("production_gate", (f) => { f.releaseGates.productionAllowed = true; }, "downstream_release_improperly_opened");
  test("meta_gate", (f) => { f.releaseGates.metaEventDeliveryAllowed = true; }, "downstream_release_improperly_opened");
  test("runtime", (f) => { f.errorCode = "failure"; }, "runtime_error_present");
  test("production_mutation", (f) => { f.prohibitedActions.productionMutation = true; }, "external_mutation_forbidden");
  test("campaign_mutation", (f) => { f.prohibitedActions.campaignMutation = true; }, "meta_configuration_mutation_forbidden");
  const passed = tests.every((item) => item.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (isDirectExecution) {
  if (process.argv.includes("--self-test")) runSelfTest();
  else {
    const file = process.argv[2] ?? "config/fixtures/meta-auth-reconciliation-evidence-template.json";
    const result = validateMetaAuthReconciliationEvidence(readJson(file));
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
