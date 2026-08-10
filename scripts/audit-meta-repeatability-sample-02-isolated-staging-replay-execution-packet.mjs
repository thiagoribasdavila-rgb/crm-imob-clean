import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-isolated-staging-replay-execution-packet-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-isolated-staging-replay-execution-packet-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs");
const runner = read("scripts/run-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs");
const assertions = [];
const check = (name, condition) => assertions.push({ name, passed: Boolean(condition) });

check("phase40_gate", gate.phase === 40 && gate.sourcePhase === 39);
check("gate_schema", gate.schemaVersion === "phase40.isolated-staging-replay-execution-packet-gate.v1");
check("offline_only", gate.environment === "offline_isolated_staging_replay_execution_packet");
check("contract_source", gate.requiredSources.stagingReplayContract.schemaVersion === "phase39.isolated-staging-replay-contract.v1");
check("contract_status", gate.requiredSources.stagingReplayContract.status === "contract_prepared_replay_blocked");
check("window_source", gate.requiredSources.operationalWindow.schemaVersion === "phase40.staging-replay-window.v1");
check("attestation_source", gate.requiredSources.credentialAttestation.schemaVersion === "phase40.ephemeral-credential-attestation.v1");
check("approval_source", gate.requiredSources.humanExecutionApproval.schemaVersion === "phase40.staging-replay-execution-approval.v1");
check("approval_scope", gate.requiredSources.humanExecutionApproval.decision === "EXECUTE_ISOLATED_STAGING_ONLY" && gate.requiredSources.humanExecutionApproval.approverRole === "DIRETOR_DECISOR");
check("approval_ttl", gate.maximumApprovalValidityHours === 4);
check("window_limit", gate.maximumWindowMinutes === 120 && gate.maximumWindowLeadHours === 24);
check("ordered_stages", gate.orderedReplayStages.length === 12 && gate.orderedReplayStages[0] === "verify_source_fingerprints" && gate.orderedReplayStages.at(-1) === "destroy_disposable_target");
check("contract_ready_but_blocked", gate.requiredContractState.contractPrepared === true && gate.requiredContractState.replayExecuted === false);
check("window_isolated", gate.requiredWindowProperties.isolatedStagingOnly === true && gate.requiredWindowProperties.productionTarget === false);
check("window_sanitized", gate.requiredWindowProperties.productionDataAllowed === false && gate.requiredWindowProperties.sanitizedDataOnly === true);
check("window_rollback", gate.requiredWindowProperties.stopOnError === true && gate.requiredWindowProperties.rollbackOnFailure === true);
check("window_destruction", gate.requiredWindowProperties.abortAfterWindow === true && gate.requiredWindowProperties.destroyTargetAtEnd === true);
check("credentials_delivery", gate.requiredCredentialProperties.delivery === "secure_runtime_environment");
check("credentials_not_persisted", gate.requiredCredentialProperties.persisted === false && gate.requiredCredentialProperties.logged === false);
check("credentials_safe", gate.requiredCredentialProperties.masked === true && gate.requiredCredentialProperties.leastPrivilege === true && gate.requiredCredentialProperties.rotationAfterReplay === true);
check("credentials_not_production", gate.requiredCredentialProperties.productionCredential === false);
check("approval_human_staging", gate.requiredApprovalProperties.humanApproved === true && gate.requiredApprovalProperties.stagingExecutionApproved === true);
check("approval_no_escalation", gate.requiredApprovalProperties.productionApproved === false && gate.requiredApprovalProperties.metaApproved === false && gate.requiredApprovalProperties.buildApproved === false);
for (const [name, field] of [
  ["exact_fingerprints", "exactSourceFingerprints"], ["exact_stages", "exactReplayStageOrder"],
  ["separate_approval", "separateExecutionApprovalRequired"], ["phase39_not_execution", "approvalCannotBeInferredFromPhase39"],
  ["approval_binds_all", "approvalMustBindContractWindowAndAttestation"], ["approval_covers_window", "approvalMustCoverEntireWindow"],
  ["window_bound", "windowMustBeAuthorizedAndBound"], ["credentials_outside", "credentialsMustRemainOutsideArtifacts"],
  ["credential_values_forbidden", "credentialValuesForbidden"], ["production_credentials_forbidden", "productionCredentialsForbidden"],
  ["sensitive_rejected", "sensitiveEvidenceRejected"], ["rows_rejected", "dataRowsRejected"],
  ["packet_not_replay", "packetDoesNotExecuteReplay"], ["confirmation_required", "oneTimeImmediateConfirmationRequired"],
  ["nonce_required", "oneTimeNonceRequired"], ["destruction_mandatory", "targetDestructionMandatory"]
]) check(name, gate.packetRules[field] === true);
check("blocked_state", Object.values(gate.requiredBlockedState).every((value) => value === false));
for (const [name, field] of [
  ["no_database", "databaseAccess"], ["no_docker", "dockerExecution"], ["no_remote", "remoteDatabaseAccess"],
  ["no_linked", "linkedProjectAccess"], ["no_staging_mutation", "stagingMutation"], ["no_production_mutation", "productionMutation"],
  ["no_push", "supabaseDbPush"], ["no_linked_reset", "supabaseDbResetLinked"], ["no_credential_collection", "credentialCollection"],
  ["no_credential_persistence", "credentialPersistence"], ["no_permit_issuance", "permitIssuance"], ["no_permit_consumption", "permitConsumption"],
  ["no_real_meta", "realMetaEventDelivery"], ["no_test_meta", "testMetaEventDelivery"], ["no_campaign", "campaignMutation"],
  ["no_deploy", "deployment"], ["no_build", "buildExecution"]
]) check(name, gate.prohibitedActions[field] === true);
check("template_schema", template.schemaVersion === "phase40.isolated-staging-replay-execution-packet.v1");
check("template_blocked", template.status === "not_prepared" && template.executionPacketPrepared === false && template.replayExecuted === false);
check("template_sources_false", template.stagingReplayContractAccepted === false && template.operationalWindowAccepted === false && template.credentialAttestationAccepted === false && template.humanExecutionApprovalAccepted === false);
check("template_confirmation_missing", template.oneTimeExecutionConfirmationReceived === false && template.oneTimeExecutionNonceConsumed === false);
check("template_release_closed", Object.values(template.releaseGates).every((value) => value === false));
check("template_no_touch", template.databaseTouched === false && template.dockerTouched === false && template.remoteDatabaseTouched === false && template.stagingTouched === false && template.productionTouched === false);
check("template_no_meta_build", template.metaTouched === false && template.buildExecuted === false);
for (const marker of [
  "validatePhase40StagingReplayExecutionPacketSources", "preparePhase40StagingReplayExecutionPacket", "phase39_contract_stage_order_mismatch",
  "operational_window_contract_fingerprint_mismatch", "operational_window_duration_invalid", "credential_attestation_property_mismatch",
  "credential_attestation_does_not_cover_window", "execution_approval_attestation_fingerprint_mismatch",
  "execution_approval_does_not_cover_window", "EXECUTE_ISOLATED_STAGING_ONLY", "execution_packet_prepared_replay_blocked",
  "one_time_execution_confirmation_missing", "sensitive_key", "data_rows_key", "selfTestPhase40StagingReplayExecutionPacket"
]) check(`preflight_${marker}`, preflight.includes(marker));
for (const marker of [
  "phase40_contract_window_attestation_and_execution_approval_paths_required", "phase40_path_outside_workspace",
  "phase40_source_file_unsafe", "phase40_source_receipt_permissions_too_open", "phase40_source_json_invalid",
  "phase40_execution_packet_rejected", "preparePhase40StagingReplayExecutionPacket", "chmodSync(outputFile, 0o600)",
  "oneTimeExecutionConfirmationReceived", "oneTimeExecutionNonceConsumed", "replayExecuted", "replayExecutionAllowed",
  "stagingMigrationAllowed", "productionMigrationAllowed", "remoteDatabaseTouched", "metaTouched", "buildExecuted"
]) check(`runner_${marker}`, runner.includes(marker));
check("runner_no_http", !runner.includes("fetch(") && !runner.includes("https://") && !runner.includes("http://"));
check("runner_no_process_spawn", !runner.includes("child_process") && !runner.includes("spawnSync(") && !runner.includes("spawn("));
check("runner_no_operational_client", !runner.includes("createClient(") && !runner.includes("postgres(") && !runner.includes("pg.Pool"));

const failures = assertions.filter((item) => !item.passed);
console.log(JSON.stringify({
  phase: 40,
  passed: failures.length === 0,
  assertionCount: assertions.length,
  failedAssertions: failures.map((item) => item.name),
  executionPacketBuilt: false,
  replayExecuted: false,
  databaseTouched: false,
  dockerTouched: false,
  remoteDatabaseTouched: false,
  stagingTouched: false,
  productionTouched: false,
  metaTouched: false,
  buildExecuted: false
}, null, 2));
if (failures.length) process.exit(1);
