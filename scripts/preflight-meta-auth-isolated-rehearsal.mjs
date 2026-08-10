import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

export function validateIsolatedRehearsalEvidence(input) {
  const empty = input?.emptyCloneGate ?? {};
  const lifecycle = input?.fixtureLifecycle ?? {};
  const cleanup = lifecycle.cleanup ?? {};
  const auth = input?.authJwtDataApi ?? {};
  const prohibited = input?.prohibitedActions ?? {};
  const issues = new Set();

  if (input?.phase !== 15 || input?.environment !== "staging_clone") issues.add("isolated_staging_environment_required");
  if (input?.sanitized !== true || input?.containsSecrets !== false || input?.containsPersonalData !== false) issues.add("evidence_not_sanitized");
  if (input?.passed !== true || input?.productionProject !== false) issues.add("isolated_rehearsal_not_passed");
  if (empty.required !== true || empty.passed !== true) issues.add("empty_clone_gate_not_verified");
  const initialCounts = empty.initialCounts ?? {};
  if (![initialCounts.organizations, initialCounts.profiles, initialCounts.leads, initialCounts.authUsers].every((count) => count === 0)) issues.add("clone_not_empty_before_rehearsal");
  if (lifecycle.provisioned !== true || lifecycle.organizationsCreated !== 2) issues.add("tenant_fixtures_incomplete");
  if (lifecycle.authUsersCreated !== 9 || lifecycle.profilesCreated !== 9) issues.add("hierarchy_fixtures_incomplete");
  if (lifecycle.leadsCreated !== 4) issues.add("lead_fixtures_incomplete");
  if (lifecycle.credentialsPersisted !== false) issues.add("credentials_persisted");
  if (cleanup.complete !== true || cleanup.zeroResidual !== true) issues.add("fixture_cleanup_incomplete");
  if ((cleanup.errorCodes ?? []).length !== 0) issues.add("fixture_cleanup_errors");
  const residual = cleanup.residual ?? {};
  if (![residual.organizations, residual.profiles, residual.leads, residual.authUsers].every((count) => count === 0)) issues.add("fixture_residual_detected");
  if (auth.passed !== true || auth.realSignedJwt !== true) issues.add("signed_jwt_rehearsal_not_verified");
  if (auth.scenarioCount < 15) issues.add("auth_scenario_coverage_incomplete");
  if (auth.hierarchyAndTenantIsolation !== true) issues.add("rls_hierarchy_or_tenant_isolation_failed");
  if (auth.anonymousDenied !== true) issues.add("anonymous_boundary_failed");
  if (auth.serviceRoleServerOnly !== true) issues.add("service_role_boundary_failed");
  if (auth.refreshRevocation !== true) issues.add("refresh_revocation_failed");
  if (auth.tokensPersisted !== false || input?.projectIdentifiersPersisted !== false) issues.add("sensitive_runtime_material_persisted");
  if (input?.errorCode) issues.add("runtime_error_present");
  if (prohibited.productionMutation === true) issues.add("production_mutation_forbidden");
  if (prohibited.realMetaEventDelivery === true) issues.add("real_meta_event_delivery_forbidden");
  if (prohibited.campaignMutation === true || prohibited.budgetMutation === true || prohibited.audienceMutation === true) issues.add("meta_mutation_forbidden");

  return { approved: issues.size === 0, issueCodes: [...issues].sort(), stagingOnly: true, productionAllowed: false };
}

function approvedFixture() {
  return {
    format: "atlas_meta_auth_isolated_rehearsal_evidence_v1",
    phase: 15,
    environment: "staging_clone",
    passed: true,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    productionProject: false,
    emptyCloneGate: { required: true, passed: true, initialCounts: { organizations: 0, profiles: 0, leads: 0, authUsers: 0 } },
    fixtureLifecycle: {
      provisioned: true,
      organizationsCreated: 2,
      authUsersCreated: 9,
      profilesCreated: 9,
      leadsCreated: 4,
      credentialsPersisted: false,
      cleanup: { complete: true, zeroResidual: true, residual: { organizations: 0, profiles: 0, leads: 0, authUsers: 0 }, errorCodes: [] },
    },
    authJwtDataApi: {
      passed: true,
      scenarioCount: 18,
      realSignedJwt: true,
      hierarchyAndTenantIsolation: true,
      anonymousDenied: true,
      serviceRoleServerOnly: true,
      refreshRevocation: true,
      tokensPersisted: false,
    },
    errorCode: null,
    prohibitedActions: { productionMutation: false, realMetaEventDelivery: false, campaignMutation: false, budgetMutation: false, audienceMutation: false },
  };
}

function runSelfTest() {
  const tests = [];
  const test = (id, mutate, expectedCode) => {
    const fixture = structuredClone(approvedFixture());
    mutate(fixture);
    const result = validateIsolatedRehearsalEvidence(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(expectedCode) });
  };
  const approved = validateIsolatedRehearsalEvidence(approvedFixture());
  tests.push({ id: "complete_ephemeral_rehearsal", passed: approved.approved && !approved.productionAllowed });
  test("environment", (f) => { f.environment = "production"; }, "isolated_staging_environment_required");
  test("sanitized", (f) => { f.containsSecrets = true; }, "evidence_not_sanitized");
  test("run", (f) => { f.passed = false; }, "isolated_rehearsal_not_passed");
  test("empty_gate", (f) => { f.emptyCloneGate.passed = false; }, "empty_clone_gate_not_verified");
  test("existing_org", (f) => { f.emptyCloneGate.initialCounts.organizations = 1; }, "clone_not_empty_before_rehearsal");
  test("existing_auth", (f) => { f.emptyCloneGate.initialCounts.authUsers = 1; }, "clone_not_empty_before_rehearsal");
  test("tenant_fixture", (f) => { f.fixtureLifecycle.organizationsCreated = 1; }, "tenant_fixtures_incomplete");
  test("auth_fixture", (f) => { f.fixtureLifecycle.authUsersCreated = 8; }, "hierarchy_fixtures_incomplete");
  test("profile_fixture", (f) => { f.fixtureLifecycle.profilesCreated = 8; }, "hierarchy_fixtures_incomplete");
  test("lead_fixture", (f) => { f.fixtureLifecycle.leadsCreated = 3; }, "lead_fixtures_incomplete");
  test("credentials", (f) => { f.fixtureLifecycle.credentialsPersisted = true; }, "credentials_persisted");
  test("cleanup", (f) => { f.fixtureLifecycle.cleanup.complete = false; }, "fixture_cleanup_incomplete");
  test("zero_residual", (f) => { f.fixtureLifecycle.cleanup.zeroResidual = false; }, "fixture_cleanup_incomplete");
  test("cleanup_error", (f) => { f.fixtureLifecycle.cleanup.errorCodes = ["x"]; }, "fixture_cleanup_errors");
  test("residual_lead", (f) => { f.fixtureLifecycle.cleanup.residual.leads = 1; }, "fixture_residual_detected");
  test("residual_auth", (f) => { f.fixtureLifecycle.cleanup.residual.authUsers = 1; }, "fixture_residual_detected");
  test("jwt", (f) => { f.authJwtDataApi.realSignedJwt = false; }, "signed_jwt_rehearsal_not_verified");
  test("coverage", (f) => { f.authJwtDataApi.scenarioCount = 2; }, "auth_scenario_coverage_incomplete");
  test("hierarchy", (f) => { f.authJwtDataApi.hierarchyAndTenantIsolation = false; }, "rls_hierarchy_or_tenant_isolation_failed");
  test("anonymous", (f) => { f.authJwtDataApi.anonymousDenied = false; }, "anonymous_boundary_failed");
  test("service_role", (f) => { f.authJwtDataApi.serviceRoleServerOnly = false; }, "service_role_boundary_failed");
  test("revocation", (f) => { f.authJwtDataApi.refreshRevocation = false; }, "refresh_revocation_failed");
  test("tokens", (f) => { f.authJwtDataApi.tokensPersisted = true; }, "sensitive_runtime_material_persisted");
  test("runtime_error", (f) => { f.errorCode = "failure"; }, "runtime_error_present");
  test("production", (f) => { f.prohibitedActions.productionMutation = true; }, "production_mutation_forbidden");
  test("meta_event", (f) => { f.prohibitedActions.realMetaEventDelivery = true; }, "real_meta_event_delivery_forbidden");
  test("campaign", (f) => { f.prohibitedActions.campaignMutation = true; }, "meta_mutation_forbidden");
  test("budget", (f) => { f.prohibitedActions.budgetMutation = true; }, "meta_mutation_forbidden");
  test("audience", (f) => { f.prohibitedActions.audienceMutation = true; }, "meta_mutation_forbidden");
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
    const file = process.argv[2] ?? "config/fixtures/meta-auth-isolated-rehearsal-evidence-template.json";
    const result = validateIsolatedRehearsalEvidence(readJson(file));
    console.log(JSON.stringify(result, null, 2));
    if (!result.approved) process.exit(1);
  }
}
