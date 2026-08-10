import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-ephemeral-staging-replay-supervisor-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-ephemeral-staging-replay-supervisor-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs");
const runner = read("scripts/run-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs");
const assertions = [];
const check = (name, passed) => assertions.push({ name, passed: Boolean(passed) });

check("phase42_gate", gate.phase === 42 && gate.sourcePhase === 41);
check("gate_schema", gate.schemaVersion === "phase42.ephemeral-staging-replay-supervisor-gate.v1");
check("state_machine_version", gate.stateMachineVersion === "phase42.staging-replay-state-machine.v1");
check("adapter_source", gate.requiredSources.oneTimeReplayAdapter.schemaVersion === "phase41.isolated-staging-one-time-replay-adapter.v1");
check("adapter_status", gate.requiredSources.oneTimeReplayAdapter.status === "adapter_prepared_execution_blocked");
check("adapter_block", gate.requiredSources.oneTimeReplayAdapter.blockedReason === "ephemeral_runtime_supervisor_missing");
check("validation_source", gate.requiredSources.finalHumanValidation.schemaVersion === "phase42.final-human-supervisor-validation.v1");
check("validation_scope", gate.requiredSources.finalHumanValidation.scope === "prepare_phase42_ephemeral_staging_replay_supervisor");
check("validation_decision", gate.requiredSources.finalHumanValidation.decision === "CONFIRM_SUPERVISOR_PREPARATION_ONLY");
check("validation_role", gate.requiredSources.finalHumanValidation.approverRole === "DIRETOR_DECISOR");
check("validation_staging", gate.requiredSources.finalHumanValidation.environment === "staging");
check("adapter_age", gate.maximumAdapterAgeSeconds === 600);
check("validation_age", gate.maximumFinalValidationAgeSeconds === 300);
check("validation_validity", gate.maximumFinalValidationValiditySeconds === 600);
check("stage_timeout", gate.maximumStageDurationSeconds === 900);
check("stage_count", gate.orderedReplayStages.length === 12 && gate.stageStates.length === 12);
check("stage_unique", new Set(gate.orderedReplayStages).size === 12 && new Set(gate.stageStates).size === 12);
check("migration_stop", gate.orderedReplayStages.includes("apply_migrations_stop_on_error"));
check("rls_negative", gate.orderedReplayStages.includes("run_pgtap_rls_negative_tests"));
check("advisors", gate.orderedReplayStages.includes("run_security_and_performance_advisors"));
check("rollback_dry_run", gate.orderedReplayStages.includes("execute_rollback_dry_run"));
check("destruction_last", gate.orderedReplayStages.at(-1) === "destroy_disposable_target");
check("initial_state", gate.stateMachine.initialState === "SEALED");
check("prepared_blocked", gate.stateMachine.preparedState === "SUPERVISOR_PREPARED_EXECUTION_BLOCKED");
check("failure_state", gate.stateMachine.failureState === "HALTED_ROLLBACK_REQUIRED");
check("rollback_state", gate.stateMachine.rollbackState === "EMERGENCY_ROLLBACK_REQUIRED");
check("cleanup_state", gate.stateMachine.cleanupState === "DESTROYING_TARGET_REQUIRED");
check("terminal_state", gate.stateMachine.terminalState === "DESTROYED");
check("single_attempt", gate.stateMachine.maximumAttemptsPerStage === 1);
check("stop_on_error_timeout", gate.stateMachine.stopOnError === true && gate.stateMachine.stopOnTimeout === true);
check("rollback_failure", gate.stateMachine.rollbackAfterFailure === true);
check("destroy_all_outcomes", gate.stateMachine.destroyAfterSuccess === true && gate.stateMachine.destroyAfterFailure === true);
check("no_skip_retry", gate.stateMachine.stageSkippingForbidden === true && gate.stateMachine.automaticRetryForbidden === true);
check("adapter_unconsumed", gate.requiredAdapterState.oneTimeExecutionNonceConsumed === false && gate.requiredAdapterState.adapterExecuted === false);
check("adapter_not_replayed", gate.requiredAdapterState.replayExecuted === false);
check("validation_human", gate.requiredFinalValidationProperties.humanConfirmed === true);
check("validation_preparation_only", gate.requiredFinalValidationProperties.preparationOnly === true && gate.requiredFinalValidationProperties.executionConfirmed === false);
check("validation_single_session", gate.requiredFinalValidationProperties.singleSupervisorSession === true);
check("validation_no_escalation", gate.requiredFinalValidationProperties.productionConfirmed === false && gate.requiredFinalValidationProperties.metaConfirmed === false && gate.requiredFinalValidationProperties.buildConfirmed === false);

for (const [name, field] of [
  ["adapter_fingerprint", "exactAdapterFingerprint"], ["session_fingerprint", "exactAdapterSessionFingerprint"],
  ["target_fingerprint", "exactStagingTargetFingerprint"], ["validation_binding", "finalValidationMustBindAdapterTargetAndPolicy"],
  ["validation_fresh", "finalValidationMustBeImmediateAndUnexpired"], ["adapter_stays_unconsumed", "adapterMustRemainUnconsumed"],
  ["nonce_forbidden", "nonceValueForbidden"], ["supervisor_immutable", "supervisorIsImmutable"],
  ["states_allowlisted", "stateIdentifiersAreAllowlisted"], ["no_freeform", "freeformCommandsForbidden"],
  ["no_shell", "shellFragmentsForbidden"], ["no_linked", "linkedProjectForbidden"],
  ["no_db_urls", "databaseUrlsForbidden"], ["no_credentials", "credentialsForbidden"],
  ["no_data_rows", "dataRowsForbidden"], ["stop_error", "stopOnErrorMandatory"],
  ["rollback_mandatory", "rollbackMandatoryAfterFailure"], ["destruction_mandatory", "targetDestructionMandatory"],
  ["no_replay", "supervisorDoesNotExecuteReplay"]
]) check(name, gate.supervisorRules[field] === true);

check("blocked_state_closed", Object.values(gate.requiredBlockedState).every((value) => value === false));
for (const [name, field] of [
  ["no_db", "databaseAccess"], ["no_network", "networkAccess"], ["no_spawn", "processSpawning"],
  ["no_shell_exec", "shellExecution"], ["no_docker", "dockerExecution"], ["no_remote_db", "remoteDatabaseAccess"],
  ["no_linked_access", "linkedProjectAccess"], ["no_staging_mutation", "stagingMutation"],
  ["no_prod_mutation", "productionMutation"], ["no_push", "supabaseDbPush"], ["no_reset", "supabaseDbResetLinked"],
  ["no_credential_collection", "credentialCollection"], ["no_credential_persistence", "credentialPersistence"],
  ["no_nonce_collection", "nonceCollection"], ["no_nonce_persistence", "noncePersistence"],
  ["no_permit_consumption", "executionPermitConsumption"], ["no_adapter_consumption", "adapterConsumption"],
  ["no_real_meta", "realMetaEventDelivery"], ["no_test_meta", "testMetaEventDelivery"],
  ["no_campaign", "campaignMutation"], ["no_deploy", "deployment"], ["no_build", "buildExecution"]
]) check(name, gate.prohibitedActions[field] === true);

check("template_schema", template.schemaVersion === "phase42.ephemeral-staging-replay-supervisor.v1");
check("template_state_machine", template.stateMachineVersion === gate.stateMachineVersion);
check("template_blocked", template.status === "not_prepared" && template.supervisorPrepared === false && template.supervisorStarted === false);
check("template_unconsumed", template.executionPermitConsumed === false && template.oneTimeExecutionNonceConsumed === false && template.adapterExecuted === false);
check("template_not_replayed", template.replayExecuted === false);
check("template_no_fingerprints", template.oneTimeReplayAdapterFingerprint === null && template.supervisorSessionFingerprint === null);
check("template_stop_error", template.stopOnError === true && template.rollbackRequiredAfterFailure === true && template.targetDestructionRequired === true);
check("template_gates_closed", Object.values(template.releaseGates).every((value) => value === false));
check("template_no_touches", template.databaseTouched === false && template.networkTouched === false && template.stagingTouched === false && template.productionTouched === false && template.metaTouched === false && template.buildExecuted === false);

for (const marker of [
  "validatePhase42EphemeralStagingReplaySupervisorSources", "preparePhase42EphemeralStagingReplaySupervisor",
  "phase42SupervisorPolicyFingerprint", "phase41_replay_adapter_expired", "phase41_replay_adapter_stage_order_mismatch",
  "final_human_validation_adapter_fingerprint_mismatch", "final_human_validation_policy_fingerprint_mismatch",
  "final_human_validation_not_immediate", "supervisor_prepared_execution_blocked",
  "runtime_worker_and_atomic_execution_permit_missing", "HALTED_ROLLBACK_REQUIRED", "EMERGENCY_ROLLBACK_REQUIRED",
  "DESTROYING_TARGET_REQUIRED", "blocked_manual_escalation_required", "selfTestPhase42EphemeralStagingReplaySupervisor"
]) check(`preflight_${marker}`, preflight.includes(marker));

for (const marker of [
  "phase42_adapter_and_final_human_validation_required", "phase42_path_outside_workspace",
  "phase42_source_file_unsafe", "phase42_source_receipt_permissions_too_open", "phase42_source_json_invalid",
  "phase42_supervisor_rejected", "phase42_sensitive_persistence_guard_triggered",
  "preparePhase42EphemeralStagingReplaySupervisor", "chmodSync(outputFile, 0o600)",
  "supervisorPrepared", "currentState", "transitionCount", "executionPermitConsumed",
  "oneTimeExecutionNonceConsumed", "supervisorStarted", "adapterExecuted", "replayExecuted",
  "databaseTouched", "networkTouched", "stagingTouched", "productionTouched", "metaTouched", "buildExecuted"
]) check(`runner_${marker}`, runner.includes(marker));
check("runner_no_http", !runner.includes("fetch(") && !runner.includes("https://") && !runner.includes("http://"));
check("runner_no_process_spawn", !runner.includes("child_process") && !runner.includes("spawnSync(") && !runner.includes("spawn(") && !runner.includes("execSync("));
check("runner_no_operational_client", !runner.includes("createClient(") && !/from\s+["'](?:@supabase\/supabase-js|postgres|pg)["']/.test(runner) && !runner.includes("new Pool("));
check("runner_no_supabase_command", !runner.includes("child_process") && !runner.includes("execSync(") && !runner.includes("spawnSync("));
check("runner_no_nonce_input", !runner.includes("ATLAS_PHASE41_ONE_TIME_EXECUTION_NONCE") && !runner.includes("ATLAS_PHASE42_NONCE"));
check("runner_no_execution_permit_input", !runner.includes("ATLAS_PHASE42_EXECUTION_PERMIT"));

const failures = assertions.filter((assertion) => !assertion.passed).map((assertion) => assertion.name);
console.log(JSON.stringify({
  phase: 42,
  passed: failures.length === 0,
  assertionCount: assertions.length,
  failedAssertions: failures,
  supervisorBuilt: false,
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
