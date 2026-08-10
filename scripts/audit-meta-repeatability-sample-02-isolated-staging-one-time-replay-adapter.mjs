import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs");
const runner = read("scripts/run-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs");
const assertions = [];
const check = (name, condition) => assertions.push({ name, passed: Boolean(condition) });

check("phase41_gate", gate.phase === 41 && gate.sourcePhase === 40);
check("gate_schema", gate.schemaVersion === "phase41.isolated-staging-one-time-replay-adapter-gate.v1");
check("offline_only", gate.environment === "offline_isolated_staging_one_time_replay_adapter");
check("packet_source", gate.requiredSources.executionPacket.schemaVersion === "phase40.isolated-staging-replay-execution-packet.v1");
check("packet_status", gate.requiredSources.executionPacket.status === "execution_packet_prepared_replay_blocked");
check("confirmation_source", gate.requiredSources.immediateHumanConfirmation.schemaVersion === "phase41.immediate-human-execution-confirmation.v1");
check("confirmation_scope", gate.requiredSources.immediateHumanConfirmation.scope === "prepare_phase41_one_time_staging_replay_adapter");
check("confirmation_decision", gate.requiredSources.immediateHumanConfirmation.decision === "CONFIRM_STAGING_REPLAY_ONCE");
check("confirmation_role", gate.requiredSources.immediateHumanConfirmation.approverRole === "DIRETOR_DECISOR");
check("confirmation_staging", gate.requiredSources.immediateHumanConfirmation.environment === "staging");
check("confirmation_age", gate.maximumConfirmationAgeSeconds === 300);
check("confirmation_validity", gate.maximumConfirmationValiditySeconds === 600);
check("nonce_size", gate.requiredNonceHexCharacters === 64);
check("ordered_stages", gate.orderedReplayStages.length === 12 && gate.orderedReplayStages[0] === "verify_source_fingerprints" && gate.orderedReplayStages.at(-1) === "destroy_disposable_target");
check("packet_ready_but_blocked", gate.requiredPacketState.executionPacketPrepared === true && gate.requiredPacketState.replayExecuted === false);
check("packet_confirmation_unused", gate.requiredPacketState.oneTimeExecutionConfirmationReceived === false && gate.requiredPacketState.oneTimeExecutionNonceConsumed === false);
check("confirmation_human_single", gate.requiredConfirmationProperties.humanConfirmed === true && gate.requiredConfirmationProperties.singleUse === true);
check("confirmation_staging_only", gate.requiredConfirmationProperties.stagingReplayConfirmed === true && gate.requiredConfirmationProperties.productionConfirmed === false);
check("confirmation_no_meta_build", gate.requiredConfirmationProperties.metaConfirmed === false && gate.requiredConfirmationProperties.buildConfirmed === false);
check("nonce_runtime", gate.requiredConfirmationProperties.nonceDelivery === "secure_runtime_environment");
check("nonce_not_persisted", gate.requiredConfirmationProperties.noncePersisted === false && gate.requiredConfirmationProperties.nonceLogged === false);
for (const [name, field] of [
  ["exact_packet", "exactPacketFingerprint"], ["exact_target", "exactStagingTargetFingerprint"],
  ["confirmation_binds_all", "confirmationMustBindPacketTargetAndNonce"], ["confirmation_fresh", "confirmationMustBeImmediateAndUnexpired"],
  ["nonce_runtime_only", "nonceMustBeProvidedOnlyAtRuntime"], ["nonce_value_forbidden", "nonceValueForbiddenInArtifacts"],
  ["future_consumption_only", "nonceMayBeConsumedOnlyByFutureRuntimeExecutor"], ["adapter_immutable", "adapterIsImmutable"],
  ["no_freeform", "adapterCannotContainFreeformCommands"], ["allowlisted_stages", "stagePlanUsesAllowlistedIdentifiersOnly"],
  ["no_linked_project", "linkedProjectForbidden"], ["no_database_url", "databaseUrlsForbidden"],
  ["no_production_target", "productionTargetForbidden"], ["no_production_credential", "productionCredentialsForbidden"],
  ["sensitive_rejected", "sensitiveEvidenceRejected"], ["rows_rejected", "dataRowsRejected"],
  ["adapter_not_replay", "adapterDoesNotExecuteReplay"], ["destruction_mandatory", "targetDestructionRemainsMandatory"]
]) check(name, gate.adapterRules[field] === true);
check("blocked_state", Object.values(gate.requiredBlockedState).every((value) => value === false));
for (const [name, field] of [
  ["no_database", "databaseAccess"], ["no_network", "networkAccess"], ["no_process", "processSpawning"],
  ["no_shell", "shellExecution"], ["no_docker", "dockerExecution"], ["no_remote", "remoteDatabaseAccess"],
  ["no_linked", "linkedProjectAccess"], ["no_staging_mutation", "stagingMutation"], ["no_production_mutation", "productionMutation"],
  ["no_push", "supabaseDbPush"], ["no_linked_reset", "supabaseDbResetLinked"], ["no_credential_collection", "credentialCollection"],
  ["no_credential_persistence", "credentialPersistence"], ["no_nonce_persistence", "noncePersistence"], ["no_nonce_logging", "nonceLogging"],
  ["no_permit_consumption", "permitConsumption"], ["no_real_meta", "realMetaEventDelivery"], ["no_test_meta", "testMetaEventDelivery"],
  ["no_campaign", "campaignMutation"], ["no_deploy", "deployment"], ["no_build", "buildExecution"]
]) check(name, gate.prohibitedActions[field] === true);
check("template_schema", template.schemaVersion === "phase41.isolated-staging-one-time-replay-adapter.v1");
check("template_blocked", template.status === "not_prepared" && template.executionAdapterPrepared === false && template.adapterExecuted === false && template.replayExecuted === false);
check("template_sources_false", template.executionPacketAccepted === false && template.immediateHumanConfirmationAccepted === false && template.oneTimeExecutionNonceVerified === false);
check("template_nonce_unconsumed", template.oneTimeExecutionNonceConsumed === false && template.oneTimeExecutionConfirmationReceived === false);
check("template_no_fingerprints", template.executionPacketFingerprint === null && template.nonceFingerprint === null && template.adapterSessionFingerprint === null);
check("template_release_closed", Object.values(template.releaseGates).every((value) => value === false));
check("template_no_touch", template.databaseTouched === false && template.networkTouched === false && template.processSpawned === false && template.remoteDatabaseTouched === false && template.stagingTouched === false && template.productionTouched === false);
check("template_no_meta_build", template.metaTouched === false && template.buildExecuted === false);
for (const marker of [
  "validatePhase41OneTimeReplayAdapterSources", "preparePhase41OneTimeReplayAdapter",
  "phase40_execution_packet_stage_order_mismatch", "immediate_confirmation_packet_fingerprint_mismatch",
  "immediate_confirmation_target_fingerprint_mismatch", "immediate_confirmation_nonce_fingerprint_mismatch",
  "immediate_confirmation_not_immediate", "immediate_confirmation_validity_invalid",
  "one_time_execution_nonce_invalid", "one_time_execution_nonce_entropy_too_low",
  "adapter_prepared_execution_blocked", "ephemeral_runtime_supervisor_missing",
  "future_ephemeral_supervisor", "sensitive_key", "data_rows_key", "selfTestPhase41OneTimeReplayAdapter"
]) check(`preflight_${marker}`, preflight.includes(marker));
for (const marker of [
  "phase41_packet_confirmation_and_runtime_nonce_required", "phase41_path_outside_workspace",
  "phase41_source_file_unsafe", "phase41_source_receipt_permissions_too_open", "phase41_source_json_invalid",
  "phase41_replay_adapter_rejected", "phase41_nonce_persistence_guard_triggered",
  "preparePhase41OneTimeReplayAdapter", "chmodSync(outputFile, 0o600)",
  "oneTimeExecutionNonceVerified", "oneTimeExecutionNonceConsumed", "executionAdapterPrepared",
  "adapterExecuted", "replayExecuted", "replayExecutionAllowed", "stagingMigrationAllowed",
  "productionMigrationAllowed", "remoteDatabaseTouched", "networkTouched", "processSpawned", "metaTouched", "buildExecuted"
]) check(`runner_${marker}`, runner.includes(marker));
check("runner_no_http", !runner.includes("fetch(") && !runner.includes("https://") && !runner.includes("http://"));
check("runner_no_process_spawn", !runner.includes("child_process") && !runner.includes("spawnSync(") && !runner.includes("spawn(") && !runner.includes("execSync("));
check("runner_no_operational_client", !runner.includes("createClient(") && !runner.includes("postgres(") && !runner.includes("pg.Pool"));
check("runner_no_supabase_command", !runner.includes("supabase db push") && !runner.includes("supabase db reset") && !runner.includes("--linked"));
check("runner_nonce_not_argument", !runner.includes("process.argv") && runner.includes("ATLAS_PHASE41_ONE_TIME_EXECUTION_NONCE"));

const failures = assertions.filter((item) => !item.passed);
console.log(JSON.stringify({
  phase: 41,
  passed: failures.length === 0,
  assertionCount: assertions.length,
  failedAssertions: failures.map((item) => item.name),
  executionAdapterBuilt: false,
  adapterExecuted: false,
  nonceConsumed: false,
  replayExecuted: false,
  databaseTouched: false,
  networkTouched: false,
  processSpawned: false,
  remoteDatabaseTouched: false,
  stagingTouched: false,
  productionTouched: false,
  metaTouched: false,
  buildExecuted: false
}, null, 2));
if (failures.length) process.exit(1);
