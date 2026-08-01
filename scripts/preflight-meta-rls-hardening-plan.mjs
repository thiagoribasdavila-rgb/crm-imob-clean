import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

export function validateMetaHardeningEvidence(input) {
  const run = input?.run ?? {};
  const evidence = input?.evidence ?? {};
  const issues = new Set();

  if (input?.environment !== "staging_clone") issues.add("environment_not_staging_clone");
  if (run.status !== "completed") issues.add("hardening_run_not_completed");
  if (run.productionProject !== false) issues.add("production_target_forbidden");
  if (run.isolatedStaging !== true) issues.add("isolated_staging_not_verified");
  if (run.sanitizedSeedOnly !== true) issues.add("sanitized_seed_not_verified");
  if (run.backupVerified !== true || !evidence.backupReference) issues.add("backup_not_verified");
  if (run.remoteFingerprintMatched !== true || !evidence.schemaFingerprint) issues.add("remote_fingerprint_not_matched");
  if (run.migrationDriftReconciled !== true) issues.add("migration_drift_not_reconciled");
  if (run.newMigrationGeneratedWithSupabaseCli !== true || !evidence.migrationFile) issues.add("new_cli_migration_missing");
  if (run.legacyMigrationReplayAttempted !== false) issues.add("legacy_migration_replay_forbidden");
  if (run.privilegedFunctionSignatureKnown !== true) issues.add("privileged_function_signature_unknown");
  if (run.privilegedFunctionDefinitionVersioned !== true) issues.add("privileged_function_definition_not_versioned");
  if (run.rollbackDryRunPassed !== true || !evidence.rollbackEvidence) issues.add("rollback_dry_run_missing");
  if (run.authLeakedPasswordProtectionEnabled !== true || !evidence.authRecoveryEvidence) issues.add("leaked_password_protection_not_verified");
  if (run.runtimeRlsEvidenceApproved !== true || !evidence.rlsEvidenceFile) issues.add("runtime_rls_evidence_not_approved");
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
      migrationDriftReconciled: true,
      newMigrationGeneratedWithSupabaseCli: true,
      legacyMigrationReplayAttempted: false,
      privilegedFunctionSignatureKnown: true,
      privilegedFunctionDefinitionVersioned: true,
      rollbackDryRunPassed: true,
      authLeakedPasswordProtectionEnabled: true,
      runtimeRlsEvidenceApproved: true,
      directorApproved: true,
      securityReviewerApproved: true,
      realEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
    },
    evidence: {
      backupReference: "sanitized-backup-proof",
      schemaFingerprint: "catalog-sha256",
      migrationFile: "supabase/migrations/generated_by_cli.sql",
      rollbackEvidence: "rollback-proof",
      rlsEvidenceFile: "sanitized-rls-proof.json",
      authRecoveryEvidence: "auth-recovery-proof",
      approvedAt: "2026-07-19T00:00:00Z",
    },
  };
}

function runSelfTest() {
  const tests = [];
  const test = (id, mutate, expectedCode) => {
    const fixture = structuredClone(approvedFixture());
    mutate(fixture);
    const result = validateMetaHardeningEvidence(fixture);
    tests.push({ id, passed: !result.approved && result.issueCodes.includes(expectedCode) });
  };

  const approved = validateMetaHardeningEvidence(approvedFixture());
  tests.push({ id: "approved_staging_fixture", passed: approved.approved && approved.productionAllowed === false });
  test("production_rejected", (f) => { f.run.productionProject = true; }, "production_target_forbidden");
  test("isolated_staging_required", (f) => { f.run.isolatedStaging = false; }, "isolated_staging_not_verified");
  test("sanitized_seed_required", (f) => { f.run.sanitizedSeedOnly = false; }, "sanitized_seed_not_verified");
  test("backup_required", (f) => { f.run.backupVerified = false; }, "backup_not_verified");
  test("fingerprint_required", (f) => { f.run.remoteFingerprintMatched = false; }, "remote_fingerprint_not_matched");
  test("drift_reconciliation_required", (f) => { f.run.migrationDriftReconciled = false; }, "migration_drift_not_reconciled");
  test("cli_migration_required", (f) => { f.run.newMigrationGeneratedWithSupabaseCli = false; }, "new_cli_migration_missing");
  test("legacy_replay_rejected", (f) => { f.run.legacyMigrationReplayAttempted = true; }, "legacy_migration_replay_forbidden");
  test("function_signature_required", (f) => { f.run.privilegedFunctionSignatureKnown = false; }, "privileged_function_signature_unknown");
  test("function_version_required", (f) => { f.run.privilegedFunctionDefinitionVersioned = false; }, "privileged_function_definition_not_versioned");
  test("rollback_required", (f) => { f.run.rollbackDryRunPassed = false; }, "rollback_dry_run_missing");
  test("password_protection_required", (f) => { f.run.authLeakedPasswordProtectionEnabled = false; }, "leaked_password_protection_not_verified");
  test("rls_runtime_required", (f) => { f.run.runtimeRlsEvidenceApproved = false; }, "runtime_rls_evidence_not_approved");
  test("security_approval_required", (f) => { f.run.securityReviewerApproved = false; }, "security_approval_missing");
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
    const phase = readJson("config/meta-intelligence-phase-009.json");
    const evidence = readJson(phase.executionEvidenceTemplate);
    const result = validateMetaHardeningEvidence(evidence);
    console.log(JSON.stringify(result, null, 2));
    if (process.argv.includes("--strict-ready") && !result.approved) process.exit(1);
  }
}
