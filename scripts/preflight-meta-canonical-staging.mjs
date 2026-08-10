import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

export function validateCanonicalStagingEvidence(input) {
  const ephemeral = input?.ephemeralSemanticRun ?? {};
  const staging = input?.supabaseStagingRun ?? {};
  const evidence = input?.evidence ?? {};
  const issues = new Set();

  if (input?.environment !== "staging_clone") issues.add("environment_not_staging_clone");
  if (ephemeral.status !== "passed" || !ephemeral.report) issues.add("ephemeral_postgres_not_verified");
  if (ephemeral.sanitizedSeedOnly !== true || ephemeral.containsPersonalData !== false) issues.add("ephemeral_seed_not_sanitized");
  if (ephemeral.scenarioCount < 6 || ephemeral.assertionCount < 41) issues.add("ephemeral_coverage_incomplete");
  if (ephemeral.rollbackVerified !== true) issues.add("ephemeral_rollback_not_verified");
  if (staging.status !== "completed") issues.add("supabase_staging_run_not_completed");
  if (staging.productionProject !== false) issues.add("production_target_forbidden");
  if (staging.isolatedStack !== true || !evidence.isolatedProjectReference) issues.add("isolated_supabase_stack_not_verified");
  if (staging.containerRuntimeVerified !== true) issues.add("container_runtime_not_verified");
  if (staging.sanitizedSeedOnly !== true) issues.add("staging_seed_not_sanitized");
  if (staging.backupRestoreVerified !== true || !evidence.backupReference || !evidence.restoreEvidence) issues.add("backup_restore_not_verified");
  if (staging.remoteFingerprintMatched !== true || !evidence.schemaFingerprint) issues.add("remote_fingerprint_not_matched");
  if (staging.migrationPromotedAfterApproval !== true || !evidence.promotedMigrationFile) issues.add("migration_promotion_not_approved");
  if (staging.databaseLintPassed !== true || !evidence.databaseLintReport) issues.add("database_lint_not_verified");
  if (staging.pgTapPassed !== true || !evidence.pgTapReport) issues.add("pgtap_not_verified");
  if (staging.authenticatedJwtRlsPassed !== true || !evidence.jwtRlsReport) issues.add("authenticated_jwt_rls_not_verified");
  if (staging.crossTenantRlsPassed !== true || !evidence.crossTenantReport) issues.add("cross_tenant_rls_not_verified");
  if (staging.anonPrivilegeBoundaryPassed !== true) issues.add("anon_privilege_boundary_not_verified");
  if (staging.serviceRoleBoundaryPassed !== true) issues.add("service_role_boundary_not_verified");
  if (staging.dataApiRuntimePassed !== true || !evidence.dataApiReport) issues.add("data_api_runtime_not_verified");
  if (staging.rollbackDryRunPassed !== true || !evidence.rollbackEvidence) issues.add("staging_rollback_not_verified");
  if (staging.directorApproved !== true || !evidence.directorApproval) issues.add("director_approval_missing");
  if (staging.securityReviewerApproved !== true || !evidence.securityApproval) issues.add("security_approval_missing");
  if (!evidence.approvedAt) issues.add("approval_timestamp_missing");
  if (staging.realEventDelivery === true) issues.add("real_event_delivery_forbidden");
  if (staging.campaignMutation === true) issues.add("campaign_mutation_forbidden");
  if (staging.budgetMutation === true) issues.add("budget_mutation_forbidden");
  if (staging.audienceMutation === true) issues.add("audience_mutation_forbidden");

  return {
    approved: issues.size === 0,
    issueCodes: [...issues].sort(),
    productionAllowed: false,
    stagingOnly: true,
  };
}

function approvedFixture() {
  return {
    environment: "staging_clone",
    ephemeralSemanticRun: {
      status: "passed",
      engine: "PGlite PostgreSQL WASM 17.5",
      sanitizedSeedOnly: true,
      containsPersonalData: false,
      scenarioCount: 6,
      assertionCount: 41,
      rollbackVerified: true,
      report: "semantic-postgres-report.json",
    },
    supabaseStagingRun: {
      status: "completed",
      productionProject: false,
      isolatedStack: true,
      containerRuntimeVerified: true,
      sanitizedSeedOnly: true,
      backupRestoreVerified: true,
      remoteFingerprintMatched: true,
      migrationPromotedAfterApproval: true,
      databaseLintPassed: true,
      pgTapPassed: true,
      authenticatedJwtRlsPassed: true,
      crossTenantRlsPassed: true,
      anonPrivilegeBoundaryPassed: true,
      serviceRoleBoundaryPassed: true,
      dataApiRuntimePassed: true,
      rollbackDryRunPassed: true,
      directorApproved: true,
      securityReviewerApproved: true,
      realEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
    },
    evidence: {
      isolatedProjectReference: "isolated-staging-ref",
      backupReference: "backup-ref",
      restoreEvidence: "restore-report.json",
      schemaFingerprint: "sha256:catalog",
      promotedMigrationFile: "supabase/migrations/approved.sql",
      databaseLintReport: "db-lint.json",
      pgTapReport: "pgtap.json",
      jwtRlsReport: "jwt-rls.json",
      crossTenantReport: "cross-tenant.json",
      dataApiReport: "data-api.json",
      rollbackEvidence: "rollback.json",
      directorApproval: "director-approval",
      securityApproval: "security-approval",
      approvedAt: "2026-07-19T00:00:00Z",
    },
  };
}

function runSelfTest() {
  const tests = [];
  const test = (id, mutate, expectedCode) => {
    const fixture = structuredClone(approvedFixture());
    mutate(fixture);
    const result = validateCanonicalStagingEvidence(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(expectedCode) });
  };
  const approved = validateCanonicalStagingEvidence(approvedFixture());
  tests.push({ id: "complete_isolated_staging_fixture", passed: approved.approved && approved.productionAllowed === false });
  test("environment_required", (f) => { f.environment = "production"; }, "environment_not_staging_clone");
  test("ephemeral_required", (f) => { f.ephemeralSemanticRun.status = "not_run"; }, "ephemeral_postgres_not_verified");
  test("ephemeral_sanitization_required", (f) => { f.ephemeralSemanticRun.containsPersonalData = true; }, "ephemeral_seed_not_sanitized");
  test("ephemeral_coverage_required", (f) => { f.ephemeralSemanticRun.assertionCount = 10; }, "ephemeral_coverage_incomplete");
  test("ephemeral_rollback_required", (f) => { f.ephemeralSemanticRun.rollbackVerified = false; }, "ephemeral_rollback_not_verified");
  test("staging_run_required", (f) => { f.supabaseStagingRun.status = "not_run"; }, "supabase_staging_run_not_completed");
  test("production_rejected", (f) => { f.supabaseStagingRun.productionProject = true; }, "production_target_forbidden");
  test("isolated_stack_required", (f) => { f.supabaseStagingRun.isolatedStack = false; }, "isolated_supabase_stack_not_verified");
  test("container_required", (f) => { f.supabaseStagingRun.containerRuntimeVerified = false; }, "container_runtime_not_verified");
  test("backup_restore_required", (f) => { f.supabaseStagingRun.backupRestoreVerified = false; }, "backup_restore_not_verified");
  test("fingerprint_required", (f) => { f.supabaseStagingRun.remoteFingerprintMatched = false; }, "remote_fingerprint_not_matched");
  test("promotion_required", (f) => { f.supabaseStagingRun.migrationPromotedAfterApproval = false; }, "migration_promotion_not_approved");
  test("lint_required", (f) => { f.supabaseStagingRun.databaseLintPassed = false; }, "database_lint_not_verified");
  test("pgtap_required", (f) => { f.supabaseStagingRun.pgTapPassed = false; }, "pgtap_not_verified");
  test("jwt_rls_required", (f) => { f.supabaseStagingRun.authenticatedJwtRlsPassed = false; }, "authenticated_jwt_rls_not_verified");
  test("tenant_isolation_required", (f) => { f.supabaseStagingRun.crossTenantRlsPassed = false; }, "cross_tenant_rls_not_verified");
  test("anon_boundary_required", (f) => { f.supabaseStagingRun.anonPrivilegeBoundaryPassed = false; }, "anon_privilege_boundary_not_verified");
  test("service_boundary_required", (f) => { f.supabaseStagingRun.serviceRoleBoundaryPassed = false; }, "service_role_boundary_not_verified");
  test("data_api_required", (f) => { f.supabaseStagingRun.dataApiRuntimePassed = false; }, "data_api_runtime_not_verified");
  test("staging_rollback_required", (f) => { f.supabaseStagingRun.rollbackDryRunPassed = false; }, "staging_rollback_not_verified");
  test("director_required", (f) => { f.supabaseStagingRun.directorApproved = false; }, "director_approval_missing");
  test("security_required", (f) => { f.supabaseStagingRun.securityReviewerApproved = false; }, "security_approval_missing");
  test("real_delivery_rejected", (f) => { f.supabaseStagingRun.realEventDelivery = true; }, "real_event_delivery_forbidden");
  test("campaign_mutation_rejected", (f) => { f.supabaseStagingRun.campaignMutation = true; }, "campaign_mutation_forbidden");

  const passed = tests.every((item) => item.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const phase = readJson("config/meta-intelligence-phase-012.json");
if (process.argv.includes("--self-test")) runSelfTest();
else {
  const file = process.argv[2] ?? phase.stagingEvidenceTemplate;
  const result = validateCanonicalStagingEvidence(readJson(file));
  console.log(JSON.stringify(result, null, 2));
  if (!result.approved || process.argv.includes("--strict-ready")) process.exit(1);
}
