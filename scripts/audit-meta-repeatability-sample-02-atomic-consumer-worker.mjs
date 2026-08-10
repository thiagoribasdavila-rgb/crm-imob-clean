import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-atomic-consumer-worker-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-atomic-consumer-worker-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-atomic-consumer-worker.mjs");
const runner = read("scripts/run-meta-repeatability-sample-02-atomic-consumer-worker.mjs");
const assertions = [];
const check = (name, passed) => assertions.push({ name, passed: Boolean(passed) });

check("phase44_gate", gate.phase === 44 && gate.sourcePhase === 43);
check("gate_schema", gate.schemaVersion === "phase44.atomic-consumer-ephemeral-worker-gate.v1");
check("offline_environment", gate.environment === "offline_atomic_consumer_ephemeral_worker");
check("input_limit", gate.maximumInputBytes === 1048576);
check("permit_age", gate.maximumPermitAgeSeconds === 120);
check("attestation_age", gate.maximumConsumerAttestationAgeSeconds === 86400);
check("attestation_validity", gate.maximumConsumerAttestationValiditySeconds === 86400);
check("authorization_age", gate.maximumHumanAuthorizationAgeSeconds === 60);
check("authorization_validity", gate.maximumHumanAuthorizationValiditySeconds === 120);
check("plan_validity", gate.maximumConsumerPlanValiditySeconds === 120);

const permit = gate.requiredSources.atomicReplayExecutionPermit;
check("permit_schema", permit.schemaVersion === "phase43.atomic-staging-replay-execution-permit.v1");
check("permit_phase", permit.phase === 43 && permit.sourcePhase === 42);
check("permit_status", permit.status === "atomic_permit_prepared_consumption_blocked");
check("permit_state", permit.currentState === "ATOMIC_PERMIT_PREPARED_CONSUMPTION_BLOCKED");
check("permit_reason", permit.blockedReason === "reviewed_atomic_consumer_missing");

const attestation = gate.requiredSources.reviewedAtomicConsumerWorkerAttestation;
check("attestation_schema", attestation.schemaVersion === "phase44.reviewed-atomic-consumer-worker-attestation.v1");
check("attestation_status", attestation.status === "reviewed_for_atomic_consumer_preparation");
check("attestation_scope", attestation.scope === "phase44_atomic_consumer_ephemeral_worker");
check("attestation_reviewer", attestation.reviewerRole === "SECURITY_REVIEWER");
check("attestation_staging", attestation.environment === "staging");

const authorization = gate.requiredSources.immediateHumanAuthorization;
check("authorization_schema", authorization.schemaVersion === "phase44.immediate-human-consumer-preparation-authorization.v1");
check("authorization_status", authorization.status === "confirmed_for_atomic_consumer_preparation");
check("authorization_scope", authorization.scope === "prepare_phase44_atomic_consumer_worker_only");
check("authorization_decision", authorization.decision === "CONFIRM_ATOMIC_CONSUMER_PREPARATION_ONLY");
check("authorization_role", authorization.approverRole === "DIRETOR_DECISOR");
check("authorization_staging", authorization.environment === "staging");

for (const [name, field] of [
  ["permit_supervisor", "supervisorAccepted"], ["permit_worker", "workerAttestationAccepted"],
  ["permit_human", "humanAuthorizationAccepted"], ["permit_prepared", "atomicExecutionPermitPrepared"],
  ["permit_cas", "atomicCompareAndSwapRequired"], ["permit_all_or_nothing", "allOrNothingReservationRequired"]
]) check(name, gate.requiredPermitState[field] === true);
for (const [name, field] of [
  ["permit_unavailable", "executionPermitAvailable"], ["permit_unconsumed", "executionPermitConsumed"],
  ["nonce_unconsumed", "oneTimeExecutionNonceConsumed"], ["supervisor_unstarted", "supervisorStarted"],
  ["adapter_unexecuted", "adapterExecuted"], ["replay_unexecuted", "replayExecuted"]
]) check(name, gate.requiredPermitState[field] === false);
check("permit_consumption_state", gate.requiredPermitState.consumptionState === "UNCONSUMED");
check("permit_consumption_version", gate.requiredPermitState.consumptionVersion === 0);
check("permit_single_use", gate.requiredPermitState.maximumConsumptionCount === 1);

for (const [name, field] of [
  ["consumer_reviewed", "reviewed"], ["consumer_immutable", "immutableArtifact"],
  ["consumer_boundary_reviewed", "transactionBoundaryReviewed"], ["consumer_single_boundary", "singleStatementOrDatabaseFunctionBoundaryRequired"],
  ["consumer_invoker", "securityInvokerPreferred"], ["consumer_no_definer", "securityDefinerAbsent"],
  ["consumer_privileges", "functionExecutionPrivilegesRestricted"], ["consumer_rls", "rlsAndTenantScopePreserved"],
  ["consumer_allowlist", "allowlistedStagesOnly"], ["consumer_no_freeform", "freeformCommandsAbsent"],
  ["consumer_no_linked", "linkedProjectAbsent"], ["consumer_no_production", "productionPathAbsent"],
  ["consumer_no_secrets", "runtimeSecretsNotPersisted"], ["consumer_no_claims", "rawAuthorizationClaimsNotPersisted"],
  ["consumer_single_session", "singlePermitSessionOnly"], ["consumer_no_ambiguous_retry", "automaticRetryAfterAmbiguousCommitForbidden"],
  ["consumer_reconcile", "commitUnknownReconciliationRequired"], ["consumer_cleanup", "rollbackAndDestructionMandatory"]
]) check(name, gate.requiredConsumerAttestationProperties[field] === true);

for (const [name, field] of [
  ["human_confirmed", "humanConfirmed"], ["human_single_use", "singleUse"],
  ["human_preparation_only", "consumerPreparationOnly"], ["human_reservation_reviewed", "atomicReservationReviewed"],
  ["human_staging", "stagingConfirmed"]
]) check(name, gate.requiredHumanAuthorizationProperties[field] === true);
for (const [name, field] of [
  ["human_no_execution", "executionConfirmed"], ["human_no_consumption", "permitConsumptionConfirmed"],
  ["human_no_production", "productionConfirmed"], ["human_no_meta", "metaConfirmed"],
  ["human_no_build", "buildConfirmed"], ["human_no_raw_session", "rawSessionPersisted"],
  ["human_no_claims", "authorizationClaimsPersisted"]
]) check(name, gate.requiredHumanAuthorizationProperties[field] === false);
check("human_aal2", gate.requiredHumanAuthorizationProperties.authenticationAssuranceLevel === "aal2");
check("human_trusted_source", gate.requiredHumanAuthorizationProperties.trustedAuthorizationSource === "database_or_app_metadata");

check("five_atomic_fields", gate.atomicReservationFields.length === 5 && new Set(gate.atomicReservationFields).size === 5);
for (const field of ["executionPermitConsumed", "oneTimeExecutionNonceConsumed", "supervisorStarted", "adapterExecuted", "consumptionVersion"]) {
  check(`reservation_${field}`, gate.atomicReservationFields.includes(field));
}
check("twelve_future_steps", gate.futureAtomicTransactionPlan.length === 12 && new Set(gate.futureAtomicTransactionPlan).size === 12);
check("transaction_opens", gate.futureAtomicTransactionPlan[3] === "open_single_atomic_transaction_boundary");
check("transaction_compares", gate.futureAtomicTransactionPlan[4] === "compare_unconsumed_version_zero");
check("transaction_reserves", gate.futureAtomicTransactionPlan[5] === "reserve_permit_nonce_supervisor_adapter_and_version");
check("transaction_receipt", gate.futureAtomicTransactionPlan[6] === "append_immutable_consumption_receipt");
check("transaction_exact_one", gate.futureAtomicTransactionPlan[7] === "assert_exactly_one_reservation");
check("transaction_commit", gate.futureAtomicTransactionPlan[8] === "commit_atomic_reservation");
check("worker_after_commit", gate.futureAtomicTransactionPlan[9] === "arm_ephemeral_worker_only_after_commit");
check("commit_unknown_no_retry", gate.futureAtomicTransactionPlan[10] === "reconcile_commit_unknown_without_retry");
check("cleanup_last", gate.futureAtomicTransactionPlan.at(-1) === "destroy_worker_and_disposable_target_after_outcome");
check("seven_lifecycle_states", gate.workerLifecycle.length === 7 && new Set(gate.workerLifecycle).size === 7);
check("lifecycle_sealed", gate.workerLifecycle[0] === "SEALED");
check("lifecycle_prepared", gate.workerLifecycle[1] === "ATOMIC_CONSUMER_PREPARED_EXECUTION_BLOCKED");
check("lifecycle_destroyed", gate.workerLifecycle.at(-1) === "DESTROYED_FUTURE");

for (const [name, field] of [
  ["rule_permit_fingerprint", "exactPermitFingerprint"], ["rule_session_fingerprint", "exactPermitSessionFingerprint"],
  ["rule_target_fingerprint", "exactStagingTargetFingerprint"], ["rule_worker_fingerprint", "exactConsumerWorkerArtifactFingerprint"],
  ["rule_human_binding", "humanAuthorizationMustBindPermitWorkerTargetAndPolicy"], ["rule_human_fresh", "humanAuthorizationMustBeImmediateAndUnexpired"],
  ["rule_aal2", "humanAuthorizationRequiresAal2"], ["rule_no_user_metadata", "trustedAuthorizationMustNotUseUserMetadata"],
  ["rule_atomic_boundary", "singleAtomicBoundaryRequired"], ["rule_exact_one", "exactlyOneReservationRequired"],
  ["rule_no_partial", "partialReservationForbidden"], ["rule_worker_after_commit", "workerStartsOnlyAfterConfirmedCommit"],
  ["rule_rollback", "precommitFailureMustRollback"], ["rule_no_ambiguous_retry", "ambiguousCommitMustNotRetry"],
  ["rule_read_only_reconcile", "ambiguousCommitRequiresReadOnlyReconciliation"], ["rule_immutable", "consumerArtifactIsImmutable"],
  ["rule_no_permit_value", "permitValueForbidden"], ["rule_no_nonce_value", "nonceValueForbidden"],
  ["rule_no_freeform", "freeformCommandsForbidden"], ["rule_no_shell", "shellFragmentsForbidden"],
  ["rule_no_linked", "linkedProjectForbidden"], ["rule_no_urls", "databaseUrlsForbidden"],
  ["rule_no_credentials", "credentialsForbidden"], ["rule_no_rows", "dataRowsForbidden"],
  ["rule_offline", "consumerPreparationIsOfflineOnly"], ["rule_no_consumption", "consumerPreparationDoesNotConsumePermit"],
  ["rule_no_worker_start", "consumerPreparationDoesNotStartWorker"], ["rule_no_replay", "consumerPreparationDoesNotExecuteReplay"]
]) check(name, gate.consumerRules[field] === true);

check("blocked_state_closed", Object.values(gate.requiredBlockedState).every((value) => value === false));
for (const [name, field] of Object.entries({
  no_db: "databaseAccess", no_network: "networkAccess", no_spawn: "processSpawning", no_shell: "shellExecution",
  no_docker: "dockerExecution", no_remote_db: "remoteDatabaseAccess", no_linked: "linkedProjectAccess",
  no_staging: "stagingMutation", no_production: "productionMutation", no_db_function: "databaseFunctionCreation",
  no_migration: "migrationCreation", no_push: "supabaseDbPush", no_linked_reset: "supabaseDbResetLinked",
  no_credential_collection: "credentialCollection", no_credential_persistence: "credentialPersistence",
  no_session_persistence: "sessionPersistence", no_claims: "authorizationClaimsPersistence",
  no_nonce_collection: "nonceCollection", no_nonce_persistence: "noncePersistence", no_permit_value: "permitValueCollection",
  no_permit_consumption: "permitConsumption", no_adapter_consumption: "adapterConsumption", no_supervisor_start: "supervisorStart",
  no_worker_arm: "workerArm", no_worker_start: "workerStart", no_real_meta: "realMetaEventDelivery",
  no_test_meta: "testMetaEventDelivery", no_campaign: "campaignMutation", no_deploy: "deployment", no_build: "buildExecution"
})) check(name, gate.prohibitedActions[field] === true);

check("template_schema", template.schemaVersion === "phase44.atomic-consumer-ephemeral-worker-plan.v1");
check("template_phase", template.phase === 44 && template.sourcePhase === 43);
check("template_sealed", template.status === "not_prepared" && template.currentState === "SEALED");
check("template_unconsumed", template.consumptionState === "UNCONSUMED" && template.consumptionVersion === 0);
check("template_single", template.maximumConsumptionCount === 1);
check("template_policy", template.ambiguousCommitPolicy === "BLOCK_AND_RECONCILE_WITHOUT_RETRY");
check("template_no_evidence", template.permitAccepted === false && template.consumerWorkerAttestationAccepted === false && template.humanAuthorizationAccepted === false);
check("template_no_consumer", template.atomicConsumerPlanPrepared === false && template.atomicConsumerAvailable === false && template.consumerArmed === false);
check("template_no_execution", template.executionPermitConsumed === false && template.oneTimeExecutionNonceConsumed === false && template.supervisorStarted === false && template.adapterExecuted === false && template.replayExecuted === false);
check("template_gates_closed", Object.values(template.releaseGates).every((value) => value === false));
check("template_no_touches", template.databaseTouched === false && template.networkTouched === false && template.processSpawned === false && template.stagingTouched === false && template.productionTouched === false && template.metaTouched === false && template.buildExecuted === false);

for (const marker of [
  "validatePhase44AtomicConsumerWorkerSources", "preparePhase44AtomicConsumerWorker", "phase44ConsumerPolicyFingerprint",
  "phase43_permit_expired", "consumer_attestation_expired", "human_authorization_not_immediate",
  "human_authorization_policy_fingerprint_mismatch", "atomic_consumer_prepared_execution_blocked",
  "runtime_transaction_boundary_and_final_execution_authorization_missing", "BLOCK_AND_RECONCILE_WITHOUT_RETRY",
  "blocked_future_runtime_transaction", "selfTestPhase44AtomicConsumerWorker"
]) check(`preflight_${marker}`, preflight.includes(marker));
for (const marker of [
  "phase44_permit_consumer_attestation_and_human_authorization_required", "phase44_path_outside_workspace",
  "phase44_source_file_unsafe", "phase44_source_receipt_permissions_too_open", "phase44_source_json_invalid",
  "phase44_atomic_consumer_rejected", "phase44_sensitive_persistence_guard_triggered", "preparePhase44AtomicConsumerWorker",
  "chmodSync(outputFile, 0o600)", "atomicConsumerPlanPrepared", "futureAtomicTransactionStepCount",
  "ambiguousCommitPolicy", "atomicConsumerAvailable", "consumerArmed", "executionPermitConsumed",
  "oneTimeExecutionNonceConsumed", "supervisorStarted", "adapterExecuted", "replayExecuted",
  "databaseTouched", "networkTouched", "processSpawned", "stagingTouched", "productionTouched", "metaTouched", "buildExecuted"
]) check(`runner_${marker}`, runner.includes(marker));
check("runner_no_http", !runner.includes("fetch(") && !runner.includes("https://") && !runner.includes("http://"));
check("runner_no_process_spawn", !runner.includes("child_process") && !runner.includes("spawnSync(") && !runner.includes("spawn(") && !runner.includes("execSync("));
check("runner_no_operational_client", !runner.includes("createClient(") && !/from\s+["'](?:@supabase\/supabase-js|postgres|pg)["']/.test(runner) && !runner.includes("new Pool("));
check("runner_no_nonce_input", !runner.includes("ATLAS_PHASE44_NONCE") && !runner.includes("ATLAS_PHASE41_ONE_TIME_EXECUTION_NONCE"));
check("runner_no_permit_value_input", !runner.includes("ATLAS_PHASE44_EXECUTION_PERMIT_VALUE") && !runner.includes("ATLAS_PHASE44_PERMIT_VALUE"));

const failures = assertions.filter((assertion) => !assertion.passed).map((assertion) => assertion.name);
console.log(JSON.stringify({
  phase: 44,
  passed: failures.length === 0,
  assertionCount: assertions.length,
  failedAssertions: failures,
  consumerPlanBuilt: false,
  atomicConsumerAvailable: false,
  consumerArmed: false,
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
