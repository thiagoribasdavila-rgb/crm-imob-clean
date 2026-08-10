import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

export function validateCanonicalMigrationEvidence(input) {
  const run = input?.run ?? {};
  const evidence = input?.evidence ?? {};
  const issues = new Set();

  if (input?.environment !== "staging_clone") issues.add("environment_not_staging_clone");
  if (run.status !== "completed") issues.add("canonical_migration_run_not_completed");
  if (run.productionProject !== false) issues.add("production_target_forbidden");
  if (run.isolatedStaging !== true) issues.add("isolated_staging_not_verified");
  if (run.sanitizedSeedOnly !== true) issues.add("sanitized_seed_not_verified");
  if (run.backupVerified !== true || !evidence.backupReference) issues.add("backup_not_verified");
  if (run.remoteFingerprintMatched !== true || !evidence.schemaFingerprint) issues.add("remote_fingerprint_not_matched");
  if (run.draftReviewed !== true || !evidence.draftReviewReference) issues.add("draft_review_missing");
  if (run.migrationPromotedAfterApproval !== true || !evidence.promotedMigrationFile) issues.add("migration_promotion_not_approved");
  if (run.localModelTestsPassed !== true || !evidence.localTestReport) issues.add("local_model_tests_not_verified");
  if (run.staticAuditPassed !== true || !evidence.staticAuditReport) issues.add("static_audit_not_verified");
  if (run.databaseContractTestsPassed !== true || !evidence.databaseContractReport) issues.add("database_contract_tests_not_verified");
  if (run.scoreBackfillVerified !== true || !evidence.backfillReport) issues.add("score_backfill_not_verified");
  if (run.ownerDualWriteVerified !== true) issues.add("owner_dual_write_not_verified");
  if (run.projectDualWriteVerified !== true) issues.add("project_dual_write_not_verified");
  if (run.scoreDualWriteVerified !== true || !evidence.dualWriteReport) issues.add("score_dual_write_not_verified");
  if (run.unknownRoleMappingApproved !== true || !evidence.roleMappingApproval) issues.add("unknown_role_mapping_not_approved");
  if (run.reportsToMappingApproved !== true || !evidence.reportsToMappingApproval) issues.add("reports_to_mapping_not_approved");
  if (run.explicitDataApiGrantsVerified !== true || !evidence.grantMatrixEvidence) issues.add("explicit_data_api_grants_not_verified");
  if (run.rlsIsolationVerified !== true || !evidence.rlsEvidenceFile) issues.add("rls_isolation_not_verified");
  if (run.rollbackDryRunPassed !== true || !evidence.rollbackEvidence) issues.add("rollback_dry_run_missing");
  if (run.directorApproved !== true) issues.add("director_approval_missing");
  if (run.securityReviewerApproved !== true) issues.add("security_approval_missing");
  if (!evidence.approvedAt) issues.add("approval_timestamp_missing");
  if (run.realEventDelivery === true) issues.add("real_event_delivery_forbidden");
  if (run.campaignMutation === true) issues.add("campaign_mutation_forbidden");
  if (run.budgetMutation === true) issues.add("budget_mutation_forbidden");
  if (run.audienceMutation === true) issues.add("audience_mutation_forbidden");

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
    run: {
      status: "completed",
      productionProject: false,
      isolatedStaging: true,
      sanitizedSeedOnly: true,
      backupVerified: true,
      remoteFingerprintMatched: true,
      draftReviewed: true,
      migrationPromotedAfterApproval: true,
      localModelTestsPassed: true,
      staticAuditPassed: true,
      databaseContractTestsPassed: true,
      scoreBackfillVerified: true,
      ownerDualWriteVerified: true,
      projectDualWriteVerified: true,
      scoreDualWriteVerified: true,
      unknownRoleMappingApproved: true,
      reportsToMappingApproved: true,
      explicitDataApiGrantsVerified: true,
      rlsIsolationVerified: true,
      rollbackDryRunPassed: true,
      directorApproved: true,
      securityReviewerApproved: true,
      realEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
    },
    evidence: {
      backupReference: "staging-backup-proof",
      schemaFingerprint: "catalog-sha256",
      draftReviewReference: "approved-draft-review",
      promotedMigrationFile: "supabase/migrations/approved.sql",
      localTestReport: "local-model-tests.json",
      staticAuditReport: "static-audit.json",
      databaseContractReport: "database-contract-tests.json",
      backfillReport: "score-backfill.json",
      dualWriteReport: "dual-write.json",
      roleMappingApproval: "role-map-review",
      reportsToMappingApproval: "hierarchy-map-review",
      grantMatrixEvidence: "grants.json",
      rlsEvidenceFile: "rls-proof.json",
      rollbackEvidence: "rollback-proof.json",
      approvedAt: "2026-07-19T00:00:00Z",
    },
  };
}

function runSelfTest() {
  const tests = [];
  const test = (id, mutate, expectedCode) => {
    const fixture = structuredClone(approvedFixture());
    mutate(fixture);
    const result = validateCanonicalMigrationEvidence(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(expectedCode) });
  };
  const approved = validateCanonicalMigrationEvidence(approvedFixture());
  tests.push({ id: "approved_staging_fixture", passed: approved.approved && approved.productionAllowed === false });
  test("environment_required", (f) => { f.environment = "production"; }, "environment_not_staging_clone");
  test("completed_run_required", (f) => { f.run.status = "not_run"; }, "canonical_migration_run_not_completed");
  test("production_rejected", (f) => { f.run.productionProject = true; }, "production_target_forbidden");
  test("isolated_staging_required", (f) => { f.run.isolatedStaging = false; }, "isolated_staging_not_verified");
  test("sanitized_seed_required", (f) => { f.run.sanitizedSeedOnly = false; }, "sanitized_seed_not_verified");
  test("backup_required", (f) => { f.run.backupVerified = false; }, "backup_not_verified");
  test("fingerprint_required", (f) => { f.run.remoteFingerprintMatched = false; }, "remote_fingerprint_not_matched");
  test("draft_review_required", (f) => { f.run.draftReviewed = false; }, "draft_review_missing");
  test("promotion_approval_required", (f) => { f.run.migrationPromotedAfterApproval = false; }, "migration_promotion_not_approved");
  test("model_tests_required", (f) => { f.run.localModelTestsPassed = false; }, "local_model_tests_not_verified");
  test("static_audit_required", (f) => { f.run.staticAuditPassed = false; }, "static_audit_not_verified");
  test("database_contract_required", (f) => { f.run.databaseContractTestsPassed = false; }, "database_contract_tests_not_verified");
  test("score_backfill_required", (f) => { f.run.scoreBackfillVerified = false; }, "score_backfill_not_verified");
  test("owner_sync_required", (f) => { f.run.ownerDualWriteVerified = false; }, "owner_dual_write_not_verified");
  test("project_sync_required", (f) => { f.run.projectDualWriteVerified = false; }, "project_dual_write_not_verified");
  test("score_sync_required", (f) => { f.run.scoreDualWriteVerified = false; }, "score_dual_write_not_verified");
  test("role_approval_required", (f) => { f.run.unknownRoleMappingApproved = false; }, "unknown_role_mapping_not_approved");
  test("hierarchy_approval_required", (f) => { f.run.reportsToMappingApproved = false; }, "reports_to_mapping_not_approved");
  test("grants_required", (f) => { f.run.explicitDataApiGrantsVerified = false; }, "explicit_data_api_grants_not_verified");
  test("rls_required", (f) => { f.run.rlsIsolationVerified = false; }, "rls_isolation_not_verified");
  test("rollback_required", (f) => { f.run.rollbackDryRunPassed = false; }, "rollback_dry_run_missing");
  test("director_required", (f) => { f.run.directorApproved = false; }, "director_approval_missing");
  test("security_required", (f) => { f.run.securityReviewerApproved = false; }, "security_approval_missing");
  test("real_delivery_rejected", (f) => { f.run.realEventDelivery = true; }, "real_event_delivery_forbidden");
  test("campaign_mutation_rejected", (f) => { f.run.campaignMutation = true; }, "campaign_mutation_forbidden");

  const passed = tests.every((item) => item.passed);
  console.log(JSON.stringify({ passed, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}

const phase = readJson("config/meta-intelligence-phase-011.json");
if (process.argv.includes("--self-test")) runSelfTest();
else {
  const file = process.argv[2] ?? phase.executionEvidenceTemplate;
  const result = validateCanonicalMigrationEvidence(readJson(file));
  console.log(JSON.stringify(result, null, 2));
  if (!result.approved || process.argv.includes("--strict-ready")) process.exit(1);
}
