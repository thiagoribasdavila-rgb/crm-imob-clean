import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-atomic-replay-execution-permit-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-atomic-replay-execution-permit-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs");
const runner = read("scripts/run-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs");
const assertions = [];
const check = (name, passed) => assertions.push({ name, passed: Boolean(passed) });

check("phase43_gate", gate.phase === 43 && gate.sourcePhase === 42);
check("gate_schema", gate.schemaVersion === "phase43.atomic-staging-replay-execution-permit-gate.v1");
check("offline_environment", gate.environment === "offline_atomic_staging_replay_execution_permit");
check("input_limit", gate.maximumInputBytes === 1048576);
check("supervisor_age", gate.maximumSupervisorAgeSeconds === 300);
check("worker_age", gate.maximumWorkerAttestationAgeSeconds === 86400);
check("worker_validity", gate.maximumWorkerAttestationValiditySeconds === 86400);
check("authorization_age", gate.maximumHumanAuthorizationAgeSeconds === 60);
check("authorization_validity", gate.maximumHumanAuthorizationValiditySeconds === 120);
check("permit_validity", gate.maximumPermitValiditySeconds === 120);

const supervisor = gate.requiredSources.ephemeralReplaySupervisor;
check("supervisor_schema", supervisor.schemaVersion === "phase42.ephemeral-staging-replay-supervisor.v1");
check("supervisor_machine", supervisor.stateMachineVersion === "phase42.staging-replay-state-machine.v1");
check("supervisor_phase", supervisor.phase === 42 && supervisor.sourcePhase === 41);
check("supervisor_status", supervisor.status === "supervisor_prepared_execution_blocked");
check("supervisor_state", supervisor.currentState === "SUPERVISOR_PREPARED_EXECUTION_BLOCKED");
check("supervisor_reason", supervisor.blockedReason === "runtime_worker_and_atomic_execution_permit_missing");

const worker = gate.requiredSources.reviewedRuntimeWorkerAttestation;
check("worker_schema", worker.schemaVersion === "phase43.reviewed-runtime-worker-attestation.v1");
check("worker_status", worker.status === "reviewed_for_atomic_staging_permit_preparation");
check("worker_scope", worker.scope === "phase43_atomic_staging_permit");
check("worker_reviewer", worker.reviewerRole === "SECURITY_REVIEWER");
check("worker_staging", worker.environment === "staging");

const authorization = gate.requiredSources.immediateHumanAuthorization;
check("authorization_schema", authorization.schemaVersion === "phase43.immediate-human-atomic-permit-authorization.v1");
check("authorization_status", authorization.status === "confirmed_for_atomic_permit_preparation");
check("authorization_scope", authorization.scope === "prepare_phase43_atomic_staging_execution_permit");
check("authorization_decision", authorization.decision === "CONFIRM_ATOMIC_PERMIT_PREPARATION_ONLY");
check("authorization_role", authorization.approverRole === "DIRETOR_DECISOR");
check("authorization_staging", authorization.environment === "staging");

check("stage_count", gate.orderedReplayStages.length === 12);
check("stage_unique", new Set(gate.orderedReplayStages).size === 12);
check("stage_fingerprints", gate.orderedReplayStages[0] === "verify_source_fingerprints");
check("stage_snapshot", gate.orderedReplayStages.includes("capture_pre_replay_snapshot"));
check("stage_migrations", gate.orderedReplayStages.includes("apply_migrations_stop_on_error"));
check("stage_lint", gate.orderedReplayStages.includes("run_database_lint"));
check("stage_rls", gate.orderedReplayStages.includes("run_pgtap_rls_negative_tests"));
check("stage_services", gate.orderedReplayStages.includes("verify_auth_storage_realtime_data_api"));
check("stage_performance", gate.orderedReplayStages.includes("capture_performance_baseline"));
check("stage_advisors", gate.orderedReplayStages.includes("run_security_and_performance_advisors"));
check("stage_rollback", gate.orderedReplayStages.includes("execute_rollback_dry_run"));
check("stage_reconcile", gate.orderedReplayStages.includes("reconcile_evidence"));
check("stage_destruction_last", gate.orderedReplayStages.at(-1) === "destroy_disposable_target");

for (const [name, field] of [
  ["supervisor_adapter", "adapterAccepted"], ["supervisor_validation", "finalHumanValidationAccepted"],
  ["supervisor_prepared", "supervisorPrepared"], ["supervisor_stop", "stopOnError"],
  ["supervisor_rollback", "rollbackRequiredAfterFailure"], ["supervisor_destruction", "targetDestructionRequired"]
]) check(name, gate.requiredSupervisorState[field] === true);
for (const [name, field] of [
  ["supervisor_permit_unconsumed", "executionPermitConsumed"], ["supervisor_nonce_unconsumed", "oneTimeExecutionNonceConsumed"],
  ["supervisor_not_started", "supervisorStarted"], ["supervisor_adapter_unexecuted", "adapterExecuted"],
  ["supervisor_replay_unexecuted", "replayExecuted"]
]) check(name, gate.requiredSupervisorState[field] === false);

for (const [name, field] of [
  ["worker_reviewed", "reviewed"], ["worker_immutable", "immutableArtifact"],
  ["worker_allowlist", "allowlistedStagesOnly"], ["worker_no_freeform", "freeformCommandsAbsent"],
  ["worker_no_linked", "linkedProjectAbsent"], ["worker_no_production", "productionPathAbsent"],
  ["worker_no_secret_persistence", "runtimeSecretsNotPersisted"], ["worker_single_session", "singleSupervisorSessionOnly"],
  ["worker_atomic", "atomicCompareAndSwapRequired"], ["worker_cleanup", "rollbackAndDestructionMandatory"]
]) check(name, gate.requiredWorkerAttestationProperties[field] === true);

for (const [name, field] of [
  ["human_confirmed", "humanConfirmed"], ["human_single_use", "singleUse"],
  ["human_preparation_only", "permitPreparationOnly"], ["human_atomic", "atomicConsumptionRequired"],
  ["human_staging", "stagingConfirmed"]
]) check(name, gate.requiredHumanAuthorizationProperties[field] === true);
for (const [name, field] of [
  ["human_no_execution", "executionConfirmed"], ["human_no_production", "productionConfirmed"],
  ["human_no_meta", "metaConfirmed"], ["human_no_build", "buildConfirmed"],
  ["human_no_raw_session", "rawSessionPersisted"], ["human_no_claims", "authorizationClaimsPersisted"]
]) check(name, gate.requiredHumanAuthorizationProperties[field] === false);
check("human_aal2", gate.requiredHumanAuthorizationProperties.authenticationAssuranceLevel === "aal2");
check("human_trusted_source", gate.requiredHumanAuthorizationProperties.trustedAuthorizationSource === "database_or_app_metadata");

const atomic = gate.atomicConsumptionContract;
check("atomic_initial", atomic.initialState === "UNCONSUMED" && atomic.initialVersion === 0);
check("atomic_reserved", atomic.reservedState === "RESERVED_ATOMICALLY" && atomic.reservedVersion === 1);
check("atomic_terminal", atomic.terminalState === "CONSUMED_ONCE");
check("atomic_single", atomic.maximumConsumptionCount === 1);
check("atomic_cas", atomic.compareAndSwapRequired === true);
check("atomic_all_or_nothing", atomic.allOrNothingRequired === true);
check("atomic_no_partial", atomic.partialConsumptionForbidden === true);
check("atomic_no_start", atomic.replayStartIsNotPartOfPreparation === true);
check("atomic_reservation_count", atomic.reservationFields.length === 5 && new Set(atomic.reservationFields).size === 5);
for (const field of ["executionPermitConsumed", "oneTimeExecutionNonceConsumed", "supervisorStarted", "adapterExecuted", "consumptionVersion"]) {
  check(`atomic_field_${field}`, atomic.reservationFields.includes(field));
}

for (const [name, field] of [
  ["rule_supervisor_fingerprint", "exactSupervisorFingerprint"], ["rule_session_fingerprint", "exactSupervisorSessionFingerprint"],
  ["rule_target_fingerprint", "exactStagingTargetFingerprint"], ["rule_worker_fingerprint", "exactWorkerArtifactFingerprint"],
  ["rule_human_binding", "humanAuthorizationMustBindSupervisorWorkerTargetAndPolicy"],
  ["rule_human_fresh", "humanAuthorizationMustBeImmediateAndUnexpired"], ["rule_aal2", "humanAuthorizationRequiresAal2"],
  ["rule_no_user_metadata", "trustedAuthorizationMustNotUseUserMetadata"], ["rule_supervisor_unstarted", "supervisorMustRemainUnstarted"],
  ["rule_adapter_unconsumed", "adapterAndNonceMustRemainUnconsumed"], ["rule_immutable", "permitIsImmutable"],
  ["rule_no_permit_value", "permitValueForbidden"], ["rule_no_nonce_value", "nonceValueForbidden"],
  ["rule_no_freeform", "freeformCommandsForbidden"], ["rule_no_shell", "shellFragmentsForbidden"],
  ["rule_no_linked", "linkedProjectForbidden"], ["rule_no_urls", "databaseUrlsForbidden"],
  ["rule_no_credentials", "credentialsForbidden"], ["rule_no_rows", "dataRowsForbidden"],
  ["rule_future_atomic", "atomicConsumptionIsFutureOnly"], ["rule_no_start", "permitDoesNotStartSupervisor"],
  ["rule_no_replay", "permitDoesNotExecuteReplay"]
]) check(name, gate.permitRules[field] === true);

check("blocked_state_closed", Object.values(gate.requiredBlockedState).every((value) => value === false));
for (const [name, field] of Object.entries({
  no_db: "databaseAccess", no_network: "networkAccess", no_spawn: "processSpawning", no_shell_exec: "shellExecution",
  no_docker: "dockerExecution", no_remote_db: "remoteDatabaseAccess", no_linked_access: "linkedProjectAccess",
  no_staging: "stagingMutation", no_production: "productionMutation", no_push: "supabaseDbPush",
  no_linked_reset: "supabaseDbResetLinked", no_credential_collection: "credentialCollection",
  no_credential_persistence: "credentialPersistence", no_session_persistence: "sessionPersistence",
  no_claims_persistence: "authorizationClaimsPersistence", no_nonce_collection: "nonceCollection",
  no_nonce_persistence: "noncePersistence", no_permit_value: "permitValueCollection", no_permit_consumption: "permitConsumption",
  no_adapter_consumption: "adapterConsumption", no_supervisor_start: "supervisorStart", no_real_meta: "realMetaEventDelivery",
  no_test_meta: "testMetaEventDelivery", no_campaign: "campaignMutation", no_deploy: "deployment", no_build: "buildExecution"
})) check(name, gate.prohibitedActions[field] === true);

check("template_schema", template.schemaVersion === "phase43.atomic-staging-replay-execution-permit.v1");
check("template_phase", template.phase === 43 && template.sourcePhase === 42);
check("template_sealed", template.status === "not_prepared" && template.currentState === "SEALED");
check("template_unconsumed", template.consumptionState === "UNCONSUMED" && template.consumptionVersion === 0);
check("template_single", template.maximumConsumptionCount === 1);
check("template_atomic", template.atomicCompareAndSwapRequired === true && template.allOrNothingReservationRequired === true);
check("template_no_evidence", template.supervisorAccepted === false && template.workerAttestationAccepted === false && template.humanAuthorizationAccepted === false);
check("template_no_permit", template.atomicExecutionPermitPrepared === false && template.executionPermitAvailable === false && template.executionPermitConsumed === false);
check("template_no_execution", template.oneTimeExecutionNonceConsumed === false && template.supervisorStarted === false && template.adapterExecuted === false && template.replayExecuted === false);
check("template_gates_closed", Object.values(template.releaseGates).every((value) => value === false));
check("template_no_touches", template.databaseTouched === false && template.networkTouched === false && template.processSpawned === false && template.stagingTouched === false && template.productionTouched === false && template.metaTouched === false && template.buildExecuted === false);

for (const marker of [
  "validatePhase43AtomicReplayExecutionPermitSources", "preparePhase43AtomicReplayExecutionPermit",
  "phase43PermitPolicyFingerprint", "phase42_supervisor_expired", "worker_attestation_expired",
  "human_authorization_not_immediate", "human_authorization_property_mismatch",
  "human_authorization_policy_fingerprint_mismatch",
  "atomic_permit_prepared_consumption_blocked", "reviewed_atomic_consumer_missing",
  "blocked_future_atomic_consumer", "selfTestPhase43AtomicReplayExecutionPermit"
]) check(`preflight_${marker}`, preflight.includes(marker));

for (const marker of [
  "phase43_supervisor_worker_attestation_and_human_authorization_required", "phase43_path_outside_workspace",
  "phase43_source_file_unsafe", "phase43_source_receipt_permissions_too_open", "phase43_source_json_invalid",
  "phase43_atomic_permit_rejected", "phase43_sensitive_persistence_guard_triggered",
  "preparePhase43AtomicReplayExecutionPermit", "chmodSync(outputFile, 0o600)",
  "atomicExecutionPermitPrepared", "consumptionState", "consumptionVersion", "maximumConsumptionCount",
  "atomicCompareAndSwapRequired", "allOrNothingReservationRequired", "executionPermitAvailable", "executionPermitConsumed",
  "oneTimeExecutionNonceConsumed", "supervisorStarted", "adapterExecuted", "replayExecuted",
  "databaseTouched", "networkTouched", "processSpawned", "stagingTouched", "productionTouched", "metaTouched", "buildExecuted"
]) check(`runner_${marker}`, runner.includes(marker));
check("runner_no_http", !runner.includes("fetch(") && !runner.includes("https://") && !runner.includes("http://"));
check("runner_no_process_spawn", !runner.includes("child_process") && !runner.includes("spawnSync(") && !runner.includes("spawn(") && !runner.includes("execSync("));
check("runner_no_operational_client", !runner.includes("createClient(") && !/from\s+["'](?:@supabase\/supabase-js|postgres|pg)["']/.test(runner) && !runner.includes("new Pool("));
check("runner_no_nonce_input", !runner.includes("ATLAS_PHASE43_NONCE") && !runner.includes("ATLAS_PHASE41_ONE_TIME_EXECUTION_NONCE"));
check("runner_no_execution_permit_value_input", !runner.includes("ATLAS_PHASE43_EXECUTION_PERMIT_VALUE") && !runner.includes("ATLAS_PHASE43_PERMIT_VALUE"));

const failures = assertions.filter((assertion) => !assertion.passed).map((assertion) => assertion.name);
console.log(JSON.stringify({
  phase: 43,
  passed: failures.length === 0,
  assertionCount: assertions.length,
  failedAssertions: failures,
  permitBuilt: false,
  executionPermitAvailable: false,
  executionPermitConsumed: false,
  nonceConsumed: false,
  supervisorStarted: false,
  adapterExecuted: false,
  replayExecuted: false,
  databaseTouched: false,
  networkTouched: false,
  processSpawned: false,
  stagingTouched: false,
  productionTouched: false,
  metaTouched: false,
  buildExecuted: false
}, null, 2));
if (failures.length) process.exit(1);
