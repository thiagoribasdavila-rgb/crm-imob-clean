import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

export function validateMetaSchemaReconciliationEvidence(input, requiredTestIds = []) {
  const run = input?.run ?? {};
  const evidence = input?.evidence ?? {};
  const tests = Array.isArray(input?.contractTests) ? input.contractTests : [];
  const issues = new Set();

  if (input?.environment !== "staging_clone") issues.add("environment_not_staging_clone");
  if (run.status !== "completed") issues.add("reconciliation_run_not_completed");
  if (run.productionProject !== false) issues.add("production_target_forbidden");
  if (run.isolatedStaging !== true) issues.add("isolated_staging_not_verified");
  if (run.sanitizedSeedOnly !== true) issues.add("sanitized_seed_not_verified");
  if (run.backupVerified !== true || !evidence.backupReference) issues.add("backup_not_verified");
  if (run.remoteFingerprintMatched !== true || !evidence.schemaFingerprint) issues.add("remote_fingerprint_not_matched");
  if (run.correctedCliMigrationCreated !== true || !evidence.migrationFile) issues.add("corrected_cli_migration_missing");
  if (run.historicalBridgeModified !== false) issues.add("historical_bridge_modified_forbidden");
  if (run.historicalBridgeReplayAttempted !== false) issues.add("historical_bridge_replay_forbidden");
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

  for (const id of requiredTestIds) {
    const match = tests.find((item) => item?.id === id);
    if (!match) issues.add(`required_contract_test_missing:${id}`);
    else if (match.status !== "passed") issues.add(`required_contract_test_not_passed:${id}`);
  }

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

function approvedFixture(requiredTestIds) {
  return {
    environment: "staging_clone",
    run: {
      status: "completed",
      productionProject: false,
      isolatedStaging: true,
      sanitizedSeedOnly: true,
      backupVerified: true,
      remoteFingerprintMatched: true,
      correctedCliMigrationCreated: true,
      historicalBridgeModified: false,
      historicalBridgeReplayAttempted: false,
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
      audienceMutation: false
    },
    evidence: {
      backupReference: "staging-backup-proof",
      schemaFingerprint: "catalog-sha256",
      migrationFile: "supabase/migrations/created_by_cli.sql",
      backfillReport: "score-and-row-count-proof.json",
      dualWriteReport: "compatibility-sync-proof.json",
      roleMappingApproval: "reviewed-role-map",
      reportsToMappingApproval: "reviewed-hierarchy-map",
      grantMatrixEvidence: "least-privilege-grants.json",
      rlsEvidenceFile: "tenant-isolation-proof.json",
      rollbackEvidence: "rollback-proof",
      approvedAt: "2026-07-19T00:00:00Z"
    },
    contractTests: requiredTestIds.map((id) => ({ id, status: "passed" }))
  };
}

function runSelfTest() {
  const phase = readJson("config/meta-intelligence-phase-010.json");
  const manifest = readJson(phase.reconciliationManifest);
  const required = manifest.requiredContractTests;
  const tests = [];
  const test = (id, mutate, expectedCode) => {
    const fixture = structuredClone(approvedFixture(required));
    mutate(fixture);
    const result = validateMetaSchemaReconciliationEvidence(fixture, required);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(expectedCode) });
  };

  const approved = validateMetaSchemaReconciliationEvidence(approvedFixture(required), required);
  tests.push({ id: "approved_staging_fixture", passed: approved.approved && approved.productionAllowed === false });
  test("environment_required", (f) => { f.environment = "production"; }, "environment_not_staging_clone");
  test("completed_run_required", (f) => { f.run.status = "not_run"; }, "reconciliation_run_not_completed");
  test("production_rejected", (f) => { f.run.productionProject = true; }, "production_target_forbidden");
  test("isolated_staging_required", (f) => { f.run.isolatedStaging = false; }, "isolated_staging_not_verified");
  test("sanitized_seed_required", (f) => { f.run.sanitizedSeedOnly = false; }, "sanitized_seed_not_verified");
  test("backup_required", (f) => { f.run.backupVerified = false; }, "backup_not_verified");
  test("fingerprint_required", (f) => { f.run.remoteFingerprintMatched = false; }, "remote_fingerprint_not_matched");
  test("cli_migration_required", (f) => { f.run.correctedCliMigrationCreated = false; }, "corrected_cli_migration_missing");
  test("bridge_edit_rejected", (f) => { f.run.historicalBridgeModified = true; }, "historical_bridge_modified_forbidden");
  test("bridge_replay_rejected", (f) => { f.run.historicalBridgeReplayAttempted = true; }, "historical_bridge_replay_forbidden");
  test("score_backfill_required", (f) => { f.run.scoreBackfillVerified = false; }, "score_backfill_not_verified");
  test("owner_sync_required", (f) => { f.run.ownerDualWriteVerified = false; }, "owner_dual_write_not_verified");
  test("project_sync_required", (f) => { f.run.projectDualWriteVerified = false; }, "project_dual_write_not_verified");
  test("score_sync_required", (f) => { f.run.scoreDualWriteVerified = false; }, "score_dual_write_not_verified");
  test("role_mapping_required", (f) => { f.run.unknownRoleMappingApproved = false; }, "unknown_role_mapping_not_approved");
  test("hierarchy_mapping_required", (f) => { f.run.reportsToMappingApproved = false; }, "reports_to_mapping_not_approved");
  test("explicit_grants_required", (f) => { f.run.explicitDataApiGrantsVerified = false; }, "explicit_data_api_grants_not_verified");
  test("rls_required", (f) => { f.run.rlsIsolationVerified = false; }, "rls_isolation_not_verified");
  test("rollback_required", (f) => { f.run.rollbackDryRunPassed = false; }, "rollback_dry_run_missing");
  test("director_approval_required", (f) => { f.run.directorApproved = false; }, "director_approval_missing");
  test("security_approval_required", (f) => { f.run.securityReviewerApproved = false; }, "security_approval_missing");
  test("required_test_missing", (f) => { f.contractTests.shift(); }, `required_contract_test_missing:${required[0]}`);
  test("required_test_must_pass", (f) => { f.contractTests[0].status = "failed"; }, `required_contract_test_not_passed:${required[0]}`);
  test("real_event_rejected", (f) => { f.run.realEventDelivery = true; }, "real_event_delivery_forbidden");
  test("campaign_mutation_rejected", (f) => { f.run.campaignMutation = true; }, "campaign_mutation_forbidden");
  test("budget_mutation_rejected", (f) => { f.run.budgetMutation = true; }, "budget_mutation_forbidden");
  test("audience_mutation_rejected", (f) => { f.run.audienceMutation = true; }, "audience_mutation_forbidden");

  const passed = tests.every((item) => item.passed);
  console.log(JSON.stringify({ passed, tests }, null, 2));
  if (!passed) process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    const phase = readJson("config/meta-intelligence-phase-010.json");
    const manifest = readJson(phase.reconciliationManifest);
    const evidence = readJson(phase.executionEvidenceTemplate);
    const result = validateMetaSchemaReconciliationEvidence(evidence, manifest.requiredContractTests);
    console.log(JSON.stringify(result, null, 2));
    if (process.argv.includes("--strict-ready") && !result.approved) process.exit(1);
  }
}
