import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-local-restore-evidence-reconciliation-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-local-restore-reconciliation-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs");
const runner = read("scripts/run-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs");
const assertions = [];
const check = (name, condition) => assertions.push({ name, passed: Boolean(condition) });

check("phase37_gate", gate.phase === 37 && gate.sourcePhase === 36 && gate.schemaVersion === "phase37.local-restore-reconciliation.v1");
check("offline_only", gate.environment === "offline_evidence_reconciliation" && gate.prohibitedActions.databaseAccess === true && gate.prohibitedActions.dockerExecution === true);
check("source_schema", gate.sourceEvidence.schemaVersion === "phase36.local-restore-evidence.v1");
check("source_status", gate.sourceEvidence.status === "approved_local_restore_only" && gate.sourceEvidence.localRestoreApproved === true);
check("source_no_staging", gate.sourceEvidence.stagingMigrationAllowed === false && gate.sourceEvidence.productionMigrationAllowed === false);
check("source_no_compatibility", gate.sourceEvidence.productionCompatibilityApproved === false);
check("source_freshness", gate.sourceEvidence.maximumAgeHours === 24);
check("restore_duration", gate.sourceEvidence.maximumRestoreDurationMs === 1800000);
check("validation_count", gate.requiredValidationChecks.length === 12);
check("validation_security", gate.requiredValidationChecks.includes("securityApproved") && gate.requiredValidationChecks.includes("targetDestructionVerified"));
check("event_count", gate.requiredOrderedEvents.length === 5);
check("event_order", gate.requiredOrderedEvents[0] === "isolated_runtime_started" && gate.requiredOrderedEvents.at(-1) === "runtime_and_volumes_destroyed");
check("metric_count", gate.requiredMetricFields.length === 10);
check("metric_security", gate.requiredMetricFields.includes("publicTablesWithoutRls") && gate.requiredMetricFields.includes("invalidConstraintCount"));
check("logical_only", gate.requiredSourceChain.backupType === "logical");
check("pg17_pinned", gate.requiredSourceChain.postgresMajor === 17 && gate.requiredSourceChain.postgresImage === "supabase/postgres:17.6.1.149");
for (const [name, field] of [
  ["exact_source", "exactSourceFingerprints"], ["exact_content", "exactBackupContentFingerprint"],
  ["exact_expected", "exactExpectedMetrics"], ["exact_actual", "exactActualMetrics"],
  ["time_order", "timestampsMustBeOrdered"], ["event_ordering", "eventsMustBeOrderedAndUnique"],
  ["network_isolation", "runtimeMustBeNetworkIsolated"], ["no_ports", "publishedPortsMustBeDisabled"],
  ["destroyed", "targetMustBeDestroyed"], ["rls_zero", "publicTablesWithoutRlsMustEqualZero"],
  ["constraints_zero", "invalidConstraintCountMustEqualZero"], ["sensitive_rejected", "sensitiveEvidenceRejected"],
  ["rows_rejected", "dataRowsRejected"], ["local_not_migration", "localApprovalDoesNotAuthorizeMigration"]
]) check(name, gate.reconciliationRules[field] === true);
for (const [name, field] of [
  ["no_remote", "remoteDatabaseAccess"], ["no_linked", "linkedProjectAccess"],
  ["no_staging_mutation", "stagingMutation"], ["no_production", "productionMutation"],
  ["no_push", "supabaseDbPush"], ["no_linked_reset", "supabaseDbResetLinked"],
  ["no_permit", "permitIssuance"], ["no_real_meta", "realMetaEventDelivery"],
  ["no_test_meta", "testMetaEventDelivery"], ["no_campaign", "campaignMutation"],
  ["no_deploy", "deployment"], ["no_build", "buildExecution"]
]) check(name, gate.prohibitedActions[field] === true);
check("template_schema", template.schemaVersion === "phase37.local-restore-reconciliation-receipt.v1");
check("template_blocked", template.status === "not_reconciled" && template.sourceEvidenceAccepted === false);
check("template_not_homologated", template.localRestoreHomologated === false);
check("template_candidates_false", Object.values(template.readinessControlCandidates).every((value) => value === false));
check("template_release_closed", Object.values(template.releaseGates).every((value) => value === false));
check("template_no_touch", template.databaseTouched === false && template.dockerTouched === false && template.remoteDatabaseTouched === false);
check("template_no_meta_build", template.metaTouched === false && template.buildExecuted === false);
for (const marker of [
  "validatePhase37RestoreEvidence", "reconcilePhase37RestoreEvidence", "validatePhase36BackupManifest",
  "phase36_contract_fingerprint_mismatch", "phase36_manifest_fingerprint_mismatch", "phase36_backup_content_fingerprint_mismatch",
  "phase36_runtime_not_isolated", "phase36_validation_failed", "phase36_target_not_destroyed",
  "phase36_expected_metrics_manifest_mismatch", "phase36_actual_metrics_mismatch", "phase36_event_sequence_mismatch",
  "phase36_migration_gate_open", "sensitive_key", "data_rows_key", "selfTestPhase37RestoreReconciliation"
]) check(`preflight_${marker}`, preflight.includes(marker));
for (const marker of [
  "phase37_evidence_contract_and_manifest_paths_required", "phase37_path_outside_workspace",
  "phase37_source_file_unsafe", "phase37_restore_evidence_permissions_too_open", "phase37_source_json_invalid",
  "phase37_reconciliation_rejected", "localRestoreHomologated", "stagingMigrationAllowed",
  "databaseTouched", "remoteDatabaseTouched", "metaTouched", "buildExecuted", "chmodSync(outputFile, 0o600)"
]) check(`runner_${marker}`, runner.includes(marker));
check("runner_read_only", !runner.includes("docker") && !runner.includes("supabase") && !runner.includes("psql"));
check("runner_no_http", !runner.includes("fetch(") && !runner.includes("https://") && !runner.includes("http://"));
check("runner_no_process_spawn", !runner.includes("spawn(") && !runner.includes("spawnSync("));

const failures = assertions.filter((item) => !item.passed);
console.log(JSON.stringify({
  phase: 37,
  passed: failures.length === 0,
  assertionCount: assertions.length,
  failedAssertions: failures.map((item) => item.name),
  reconciliationExecuted: false,
  databaseTouched: false,
  dockerTouched: false,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
}, null, 2));
if (failures.length) process.exit(1);
