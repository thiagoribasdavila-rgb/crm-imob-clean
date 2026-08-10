import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-ephemeral-restore-execution-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-ephemeral-restore-execution-template.json"));
const compose = read("infra/meta-phase36/compose.yaml");
const preflight = read("scripts/preflight-meta-repeatability-sample-02-ephemeral-restore-execution.mjs");
const runner = read("scripts/run-meta-repeatability-sample-02-ephemeral-restore-execution.mjs");
const assertions = [];
const check = (name, condition) => assertions.push({ name, passed: Boolean(condition) });

check("phase36_gate", gate.phase === 36 && gate.sourcePhase === 35 && gate.schemaVersion === "phase36.local-restore-execution.v1");
check("exact_human_approval", gate.approval.required === true && gate.approval.exactValue === "EXECUTE_PHASE36_LOCAL_EPHEMERAL_RESTORE_ONLY");
check("source_contract_blocked", gate.sourceContract.status === "contract_prepared_execution_blocked" && gate.sourceContract.restoreExecutionAllowed === false);
check("source_contract_no_migration", gate.sourceContract.stagingMigrationAllowed === false && gate.sourceContract.productionMigrationAllowed === false);
check("logical_only", gate.backup.supportedType === "logical" && gate.prohibitedActions.physicalBackupRestore === true);
check("backup_hash", gate.backup.contentHashRequired === true && gate.backup.exactSizeRequired === true);
check("backup_size_bound", gate.backup.maximumSizeBytes === 21474836480);
check("expectations_required", gate.backup.validationExpectationsRequired === true && gate.requiredValidationExpectations.length === 10);
check("catalog_required", gate.requiredValidationExpectations.includes("catalogFingerprint"));
check("auth_required", gate.requiredValidationExpectations.includes("authUserCount"));
check("storage_required", gate.requiredValidationExpectations.includes("storageObjectMetadataCount"));
check("migration_required", gate.requiredValidationExpectations.includes("migrationCount"));
check("runtime_engine", gate.runtime.engine === "docker_compose");
check("pinned_pg17", gate.runtime.postgresMajor === 17 && gate.runtime.postgresImage === "supabase/postgres:17.6.1.149");
check("network_none", gate.runtime.networkMode === "none" && gate.runtime.publishedPorts === false);
check("not_linked", gate.runtime.linkedProject === false && gate.runtime.remoteTarget === false && gate.runtime.productionTarget === false);
check("transactional", gate.runtime.singleTransaction === true && gate.runtime.stopOnError === true);
check("cleanup_required", gate.runtime.destroyVolumesAfterRun === true);
check("duration_bound", gate.runtime.maximumRestoreDurationMs === 1800000);
check("integrity_checks", gate.requiredPostRestoreChecks.catalogFingerprintMatches === true && gate.requiredPostRestoreChecks.catalogCountsMatch === true);
check("security_checks", gate.requiredPostRestoreChecks.publicTablesWithoutRlsEqualsZero === true && gate.requiredPostRestoreChecks.invalidConstraintCountEqualsZero === true);
check("destruction_check", gate.requiredPostRestoreChecks.targetDestructionVerified === true);
check("remote_prohibited", gate.prohibitedActions.remoteDatabaseAccess === true && gate.prohibitedActions.linkedProjectAccess === true);
check("production_prohibited", gate.prohibitedActions.productionMutation === true && gate.prohibitedActions.stagingMutation === true);
check("dangerous_supabase_commands_prohibited", gate.prohibitedActions.supabaseDbPush === true && gate.prohibitedActions.supabaseDbResetLinked === true);
check("meta_prohibited", gate.prohibitedActions.realMetaEventDelivery === true && gate.prohibitedActions.testMetaEventDelivery === true);
check("build_prohibited", gate.prohibitedActions.buildExecution === true && gate.prohibitedActions.deployment === true);
check("template_not_executed", template.status === "not_executed" && template.restore.attempted === false && template.restore.completed === false);
check("template_not_approved", template.restore.approved === false && template.releaseGates.localRestoreApproved === false);
check("template_no_migration", template.releaseGates.stagingMigrationAllowed === false && template.releaseGates.productionMigrationAllowed === false);
check("template_no_remote", template.remoteDatabaseTouched === false && template.metaTouched === false && template.buildExecuted === false);
check("compose_name", compose.includes("name: atlas-meta-phase36"));
check("compose_pinned_image", compose.includes("image: supabase/postgres:17.6.1.149"));
check("compose_network_none", compose.includes('network_mode: "none"'));
check("compose_no_ports", !compose.includes("ports:"));
check("compose_named_volume", compose.includes("phase36-postgres-data:/var/lib/postgresql/data"));
check("compose_no_restart", compose.includes('restart: "no"'));
check("preflight_contract_validator", preflight.includes("validatePhase36SourceContract"));
check("preflight_manifest_validator", preflight.includes("validatePhase36BackupManifest"));
check("preflight_request_validator", preflight.includes("validatePhase36ExecutionRequest"));
check("preflight_phase35_reuse", preflight.includes("validatePhase35BackupManifest") && preflight.includes("validatePhase35ReadinessReceipt"));
check("preflight_chain_hashes", preflight.includes("phase35_readiness_chain_broken") && preflight.includes("phase35_backup_chain_broken"));
check("preflight_exact_approval", preflight.includes("phase36_human_approval_missing"));
check("preflight_network_isolation", preflight.includes("phase36_runtime_network_not_isolated"));
check("preflight_backup_hash", preflight.includes("phase36_backup_content_hash_mismatch"));
check("preflight_backup_size", preflight.includes("phase36_backup_size_mismatch"));
check("preflight_source_security", preflight.includes("phase36_source_security_baseline_failed"));
check("preflight_sql_scan", preflight.includes("scanPhase36LogicalBackupText"));
check("preflight_shell_scan", preflight.includes("psql_shell_escape") && preflight.includes("copy_from_program"));
check("preflight_network_scan", preflight.includes("dblink_connect") && preflight.includes("network_http_call"));
check("preflight_cron_scan", preflight.includes("cron_schedule"));
check("preflight_selftest", preflight.includes("selfTestPhase36RestoreExecution"));
check("runner_requires_all_inputs", runner.includes("phase36_contract_readiness_manifest_and_backup_paths_required"));
check("runner_requires_approval", runner.includes("phase36_explicit_human_approval_required"));
check("runner_workspace_only", runner.includes("phase36_path_outside_workspace") && runner.includes("phase36_backup_file_unsafe"));
check("runner_stream_hash", runner.includes("inspectLogicalBackup") && runner.includes("createReadStream"));
check("runner_sql_safety", runner.includes("phase36_logical_backup_safety_rejected"));
check("runner_docker_only", runner.includes('spawnSync("docker"') && runner.includes('spawn("docker"'));
check("runner_compose_project", runner.includes("gate.runtime.composeProject"));
check("runner_single_transaction", runner.includes('"--single-transaction"') && runner.includes('"ON_ERROR_STOP=on"'));
check("runner_trigger_control", runner.includes("session_replication_role=replica"));
check("runner_catalog_fingerprint", runner.includes("catalogFingerprint") && runner.includes("information_schema.columns"));
check("runner_rls_validation", runner.includes("publicTablesWithoutRls") && runner.includes("relrowsecurity"));
check("runner_constraint_validation", runner.includes("invalidConstraintCount") && runner.includes("convalidated"));
check("runner_auth_validation", runner.includes("authUserCount") && runner.includes("auth.users"));
check("runner_storage_validation", runner.includes("storageBucketCount") && runner.includes("storage.objects"));
check("runner_migration_validation", runner.includes("migrationCount") && runner.includes("supabase_migrations.schema_migrations"));
check("runner_cleanup_finally", runner.includes("finally") && runner.includes('"down", "--volumes", "--remove-orphans"'));
check("runner_local_only_status", runner.includes("approved_local_restore_only"));
check("runner_never_opens_migration", runner.includes("stagingMigrationAllowed: false") && runner.includes("productionMigrationAllowed: false"));
check("runner_no_remote", runner.includes("remoteDatabaseTouched: false") && runner.includes("metaTouched: false"));
check("runner_no_build", runner.includes("buildExecuted: false"));
check("runner_secure_receipt", runner.includes("mode: 0o600") && runner.includes("chmodSync(evidenceFile, 0o600)"));
check("runner_no_supabase_link", !runner.includes("supabase link") && !runner.includes("--linked") && !runner.includes("db push"));
check("runner_no_http", !runner.includes("fetch(") && !runner.includes("https://") && !runner.includes("http://"));

const failures = assertions.filter((item) => !item.passed);
console.log(JSON.stringify({
  phase: 36,
  passed: failures.length === 0,
  assertionCount: assertions.length,
  failedAssertions: failures.map((item) => item.name),
  restoreExecuted: false,
  localDatabaseTouched: false,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
}, null, 2));
if (failures.length) process.exit(1);
