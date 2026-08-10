import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-isolated-staging-replay-contract-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-isolated-staging-replay-contract-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs");
const runner = read("scripts/run-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs");
const assertions = [];
const check = (name, condition) => assertions.push({ name, passed: Boolean(condition) });

check("phase39_gate", gate.phase === 39 && gate.sourcePhase === 38);
check("gate_schema", gate.schemaVersion === "phase39.isolated-staging-replay-contract-gate.v1");
check("offline_only", gate.environment === "offline_isolated_staging_replay_contract");
check("projection_source", gate.requiredSources.readinessProjection.schemaVersion === "phase38.readiness-projection-receipt.v1");
check("projection_status", gate.requiredSources.readinessProjection.status === "projected_readiness_blocked");
check("projection_coverage", gate.requiredSources.readinessProjection.verifiedControls === 8 && gate.requiredSources.readinessProjection.coveragePercent === 53);
check("target_source", gate.requiredSources.stagingTarget.schemaVersion === "phase39.isolated-staging-target-manifest.v1");
check("rollback_source", gate.requiredSources.rollbackPlan.schemaVersion === "phase39.staging-rollback-plan.v1");
check("approval_source", gate.requiredSources.humanApproval.schemaVersion === "phase39.staging-replay-contract-approval.v1");
check("approval_scope", gate.requiredSources.humanApproval.decision === "APPROVE_CONTRACT_ONLY" && gate.requiredSources.humanApproval.approverRole === "DIRETOR_DECISOR");
check("approval_ttl", gate.maximumApprovalValidityHours === 24);
check("control_count", gate.requiredControlOrder.length === 15 && new Set(gate.requiredControlOrder).size === 15);
check("verified_count", gate.requiredVerifiedControls.length === 8);
check("blocked_count", gate.requiredBlockedControls.length === 7);
check("staging_control_blocked", gate.requiredBlockedControls.includes("isolated_staging_replay_verified"));
check("human_control_blocked", gate.requiredBlockedControls.includes("human_change_approval_verified"));
check("isolated_target", gate.requiredTargetProperties.isolated === true && gate.requiredTargetProperties.disposable === true && gate.requiredTargetProperties.separateProject === true);
check("no_production_target", gate.requiredTargetProperties.productionTarget === false && gate.requiredTargetProperties.containsProductionData === false);
check("sanitized_target", gate.requiredTargetProperties.sanitizedDataOnly === true && gate.requiredTargetProperties.credentialsEmbedded === false);
check("isolated_services", gate.requiredTargetProperties.authIsolated === true && gate.requiredTargetProperties.storageIsolated === true && gate.requiredTargetProperties.realtimeIsolated === true);
check("rollback_snapshot", gate.requiredRollbackProperties.preReplaySnapshotRequired === true && gate.requiredRollbackProperties.rollbackOnFailure === true);
check("rollback_security", gate.requiredRollbackProperties.rlsAuthStorageVerification === true && gate.requiredRollbackProperties.humanExecutionApprovalRequired === true);
check("rollback_destruction", gate.requiredRollbackProperties.targetDestructionAfterReplay === true);
check("ordered_stages", gate.orderedReplayStages.length === 12 && gate.orderedReplayStages[0] === "verify_source_fingerprints" && gate.orderedReplayStages.at(-1) === "destroy_disposable_target");
for (const [name, field] of [
  ["fingerprints", "exactSourceFingerprints"], ["control_set", "exactControlSet"],
  ["isolated_staging", "isolatedStagingRequired"], ["no_production_data", "productionDataForbidden"],
  ["sanitized_only", "sanitizedDataOnly"], ["contract_approval_only", "approvalIsContractOnly"],
  ["separate_execution_approval", "executionRequiresSeparateApproval"], ["approval_unexpired", "approvalMustBeUnexpired"],
  ["approval_not_inferred", "approvalCannotBeInferred"], ["rollback_reviewed", "rollbackMustBeReviewed"],
  ["sensitive_rejected", "sensitiveEvidenceRejected"], ["rows_rejected", "dataRowsRejected"],
  ["contract_not_replay", "contractDoesNotAuthorizeReplay"]
]) check(name, gate.contractRules[field] === true);
check("blocked_state", Object.values(gate.requiredBlockedState).every((value) => value === false));
for (const [name, field] of [
  ["no_database", "databaseAccess"], ["no_docker", "dockerExecution"], ["no_remote", "remoteDatabaseAccess"],
  ["no_linked", "linkedProjectAccess"], ["no_staging_mutation", "stagingMutation"], ["no_production_mutation", "productionMutation"],
  ["no_push", "supabaseDbPush"], ["no_linked_reset", "supabaseDbResetLinked"], ["no_credentials", "credentialCollection"],
  ["no_permit_reservation", "permitReservation"], ["no_permit_issuance", "permitIssuance"], ["no_permit_consumption", "permitConsumption"],
  ["no_real_meta", "realMetaEventDelivery"], ["no_test_meta", "testMetaEventDelivery"], ["no_campaign", "campaignMutation"],
  ["no_deploy", "deployment"], ["no_build", "buildExecution"]
]) check(name, gate.prohibitedActions[field] === true);
check("template_schema", template.schemaVersion === "phase39.isolated-staging-replay-contract.v1");
check("template_blocked", template.status === "not_prepared" && template.contractPrepared === false && template.replayExecuted === false);
check("template_sources_false", template.sourceProjectionAccepted === false && template.stagingTargetAccepted === false && template.rollbackPlanAccepted === false && template.humanApprovalAccepted === false);
check("template_stages_empty", template.orderedReplayStages.length === 0 && template.executionApprovalRequired === true);
check("template_release_closed", Object.values(template.releaseGates).every((value) => value === false));
check("template_no_touch", template.databaseTouched === false && template.dockerTouched === false && template.remoteDatabaseTouched === false && template.stagingTouched === false && template.productionTouched === false);
check("template_no_meta_build", template.metaTouched === false && template.buildExecuted === false);
for (const marker of [
  "validatePhase39StagingReplayContractSources", "preparePhase39StagingReplayContract", "phase38_control_set_mismatch",
  "phase38_required_control_missing", "phase38_blocked_control_claimed", "staging_target_property_mismatch",
  "rollback_plan_property_mismatch", "human_approval_projection_fingerprint_mismatch", "human_approval_expired_or_future",
  "human_approval_validity_window_invalid", "APPROVE_CONTRACT_ONLY", "contract_prepared_replay_blocked",
  "replayExecutionAllowed", "sensitive_key", "data_rows_key", "selfTestPhase39StagingReplayContract"
]) check(`preflight_${marker}`, preflight.includes(marker));
for (const marker of [
  "phase39_projection_target_rollback_and_approval_paths_required", "phase39_path_outside_workspace",
  "phase39_source_file_unsafe", "phase39_source_receipt_permissions_too_open", "phase39_source_json_invalid",
  "phase39_contract_rejected", "preparePhase39StagingReplayContract", "chmodSync(outputFile, 0o600)",
  "replayExecuted", "replayExecutionAllowed", "stagingMigrationAllowed", "productionMigrationAllowed",
  "remoteDatabaseTouched", "metaTouched", "buildExecuted"
]) check(`runner_${marker}`, runner.includes(marker));
check("runner_no_http", !runner.includes("fetch(") && !runner.includes("https://") && !runner.includes("http://"));
check("runner_no_process_spawn", !runner.includes("child_process") && !runner.includes("spawnSync(") && !runner.includes("spawn("));
check("runner_no_operational_client", !runner.includes("createClient(") && !runner.includes("postgres(") && !runner.includes("pg.Pool"));

const failures = assertions.filter((item) => !item.passed);
console.log(JSON.stringify({
  phase: 39,
  passed: failures.length === 0,
  assertionCount: assertions.length,
  failedAssertions: failures.map((item) => item.name),
  contractBuilt: false,
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
