import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

export function validateRlsJwtEvidence(input) {
  const local = input?.localSemanticRun ?? {};
  const staging = input?.supabaseStagingRun ?? {};
  const evidence = input?.evidence ?? {};
  const issues = new Set();

  if (input?.environment !== "staging_clone") issues.add("environment_not_staging_clone");
  if (input?.sanitized !== true || input?.containsSecrets !== false || input?.containsPersonalData !== false) issues.add("evidence_not_sanitized");
  if (local.status !== "passed" || local.exactHierarchyMigrationExecuted !== true) issues.add("local_postgres_semantics_not_verified");
  if (local.scenarioCount < 24 || local.assertionCount < 44) issues.add("local_semantic_coverage_incomplete");
  if (staging.status !== "completed") issues.add("supabase_staging_run_not_completed");
  if (staging.productionProject !== false) issues.add("production_target_forbidden");
  if (staging.isolatedStack !== true || !evidence.isolatedProjectReference) issues.add("isolated_supabase_stack_not_verified");
  if (staging.sanitizedSeedOnly !== true) issues.add("staging_seed_not_sanitized");
  if (staging.realSignedJwtSessions !== true || !evidence.jwtRlsReport) issues.add("real_signed_jwt_not_verified");
  if (staging.sessionRefreshVerified !== true) issues.add("jwt_session_refresh_not_verified");
  if (staging.authenticatedJwtRlsPassed !== true) issues.add("authenticated_jwt_rls_not_verified");
  if (staging.crossTenantReadPassed !== true) issues.add("cross_tenant_read_not_verified");
  if (staging.crossTenantWritePassed !== true) issues.add("cross_tenant_write_not_verified");
  if (staging.hierarchyScopePassed !== true) issues.add("commercial_hierarchy_not_verified");
  if (staging.inactiveProfileDenied !== true) issues.add("inactive_profile_boundary_not_verified");
  if (staging.editableMetadataEscalationDenied !== true) issues.add("editable_metadata_escalation_not_verified");
  if (staging.anonPrivilegeBoundaryPassed !== true) issues.add("anon_privilege_boundary_not_verified");
  if (staging.serviceRoleBoundaryPassed !== true) issues.add("service_role_boundary_not_verified");
  if (staging.dataApiRuntimePassed !== true || !evidence.dataApiReport) issues.add("data_api_runtime_not_verified");
  if (staging.databaseLintPassed !== true || !evidence.databaseLintReport) issues.add("database_lint_not_verified");
  if (staging.pgTapPassed !== true || !evidence.pgTapReport) issues.add("pgtap_not_verified");
  if (staging.mutationProbeRestored !== true) issues.add("mutation_probe_not_restored");
  if (staging.rollbackDryRunPassed !== true || !evidence.rollbackEvidence) issues.add("staging_rollback_not_verified");
  if (!evidence.schemaFingerprint) issues.add("schema_fingerprint_missing");
  if (staging.directorApproved !== true || !evidence.directorApproval) issues.add("director_approval_missing");
  if (staging.securityReviewerApproved !== true || !evidence.securityApproval) issues.add("security_approval_missing");
  if (!evidence.approvedAt) issues.add("approval_timestamp_missing");
  if (staging.realMetaEventDelivery === true) issues.add("real_meta_event_delivery_forbidden");
  if (staging.campaignMutation === true) issues.add("campaign_mutation_forbidden");
  if (staging.budgetMutation === true) issues.add("budget_mutation_forbidden");
  if (staging.audienceMutation === true) issues.add("audience_mutation_forbidden");

  return {
    approved: issues.size === 0,
    issueCodes: [...issues].sort(),
    stagingOnly: true,
    productionAllowed: false,
  };
}

function approvedFixture() {
  return {
    format: "atlas_meta_rls_jwt_evidence_v1",
    environment: "staging_clone",
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    localSemanticRun: {
      status: "passed",
      exactHierarchyMigrationExecuted: true,
      scenarioCount: 24,
      assertionCount: 44,
    },
    supabaseStagingRun: {
      status: "completed",
      productionProject: false,
      isolatedStack: true,
      sanitizedSeedOnly: true,
      realSignedJwtSessions: true,
      sessionRefreshVerified: true,
      authenticatedJwtRlsPassed: true,
      crossTenantReadPassed: true,
      crossTenantWritePassed: true,
      hierarchyScopePassed: true,
      inactiveProfileDenied: true,
      editableMetadataEscalationDenied: true,
      anonPrivilegeBoundaryPassed: true,
      serviceRoleBoundaryPassed: true,
      dataApiRuntimePassed: true,
      databaseLintPassed: true,
      pgTapPassed: true,
      mutationProbeRestored: true,
      rollbackDryRunPassed: true,
      directorApproved: true,
      securityReviewerApproved: true,
      realMetaEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
    },
    evidence: {
      isolatedProjectReference: "isolated-staging-reference",
      schemaFingerprint: "sha256:sanitized-catalog",
      jwtRlsReport: "jwt-rls-report.json",
      dataApiReport: "data-api-report.json",
      databaseLintReport: "database-lint-report.json",
      pgTapReport: "pgtap-report.json",
      rollbackEvidence: "rollback-report.json",
      directorApproval: "director-approval-reference",
      securityApproval: "security-review-reference",
      approvedAt: "2026-07-19T00:00:00Z",
    },
  };
}

function runSelfTest() {
  const tests = [];
  const test = (id, mutate, expectedCode) => {
    const fixture = structuredClone(approvedFixture());
    mutate(fixture);
    const result = validateRlsJwtEvidence(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(expectedCode) });
  };
  const approved = validateRlsJwtEvidence(approvedFixture());
  tests.push({ id: "complete_isolated_staging_fixture", passed: approved.approved && !approved.productionAllowed });
  test("environment", (f) => { f.environment = "production"; }, "environment_not_staging_clone");
  test("sanitized", (f) => { f.containsSecrets = true; }, "evidence_not_sanitized");
  test("local_semantics", (f) => { f.localSemanticRun.status = "not_run"; }, "local_postgres_semantics_not_verified");
  test("local_coverage", (f) => { f.localSemanticRun.assertionCount = 10; }, "local_semantic_coverage_incomplete");
  test("staging_completed", (f) => { f.supabaseStagingRun.status = "not_run"; }, "supabase_staging_run_not_completed");
  test("production_rejected", (f) => { f.supabaseStagingRun.productionProject = true; }, "production_target_forbidden");
  test("isolated", (f) => { f.supabaseStagingRun.isolatedStack = false; }, "isolated_supabase_stack_not_verified");
  test("seed", (f) => { f.supabaseStagingRun.sanitizedSeedOnly = false; }, "staging_seed_not_sanitized");
  test("signed_jwt", (f) => { f.supabaseStagingRun.realSignedJwtSessions = false; }, "real_signed_jwt_not_verified");
  test("refresh", (f) => { f.supabaseStagingRun.sessionRefreshVerified = false; }, "jwt_session_refresh_not_verified");
  test("jwt_rls", (f) => { f.supabaseStagingRun.authenticatedJwtRlsPassed = false; }, "authenticated_jwt_rls_not_verified");
  test("tenant_read", (f) => { f.supabaseStagingRun.crossTenantReadPassed = false; }, "cross_tenant_read_not_verified");
  test("tenant_write", (f) => { f.supabaseStagingRun.crossTenantWritePassed = false; }, "cross_tenant_write_not_verified");
  test("hierarchy", (f) => { f.supabaseStagingRun.hierarchyScopePassed = false; }, "commercial_hierarchy_not_verified");
  test("inactive", (f) => { f.supabaseStagingRun.inactiveProfileDenied = false; }, "inactive_profile_boundary_not_verified");
  test("metadata", (f) => { f.supabaseStagingRun.editableMetadataEscalationDenied = false; }, "editable_metadata_escalation_not_verified");
  test("anon", (f) => { f.supabaseStagingRun.anonPrivilegeBoundaryPassed = false; }, "anon_privilege_boundary_not_verified");
  test("service", (f) => { f.supabaseStagingRun.serviceRoleBoundaryPassed = false; }, "service_role_boundary_not_verified");
  test("data_api", (f) => { f.supabaseStagingRun.dataApiRuntimePassed = false; }, "data_api_runtime_not_verified");
  test("lint", (f) => { f.supabaseStagingRun.databaseLintPassed = false; }, "database_lint_not_verified");
  test("pgtap", (f) => { f.supabaseStagingRun.pgTapPassed = false; }, "pgtap_not_verified");
  test("restore", (f) => { f.supabaseStagingRun.mutationProbeRestored = false; }, "mutation_probe_not_restored");
  test("rollback", (f) => { f.supabaseStagingRun.rollbackDryRunPassed = false; }, "staging_rollback_not_verified");
  test("fingerprint", (f) => { f.evidence.schemaFingerprint = null; }, "schema_fingerprint_missing");
  test("director", (f) => { f.supabaseStagingRun.directorApproved = false; }, "director_approval_missing");
  test("security", (f) => { f.supabaseStagingRun.securityReviewerApproved = false; }, "security_approval_missing");
  test("meta_event", (f) => { f.supabaseStagingRun.realMetaEventDelivery = true; }, "real_meta_event_delivery_forbidden");
  test("campaign", (f) => { f.supabaseStagingRun.campaignMutation = true; }, "campaign_mutation_forbidden");
  test("budget", (f) => { f.supabaseStagingRun.budgetMutation = true; }, "budget_mutation_forbidden");
  test("audience", (f) => { f.supabaseStagingRun.audienceMutation = true; }, "audience_mutation_forbidden");

  const passed = tests.every((item) => item.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

if (process.argv.includes("--self-test")) runSelfTest();
else {
  const file = process.argv[2] ?? "config/fixtures/meta-rls-jwt-evidence-template.json";
  const result = validateRlsJwtEvidence(readJson(file));
  console.log(JSON.stringify(result, null, 2));
  if (!result.approved) process.exit(1);
}
