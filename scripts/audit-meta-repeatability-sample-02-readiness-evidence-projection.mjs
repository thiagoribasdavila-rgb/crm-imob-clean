import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-readiness-evidence-projection-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-readiness-evidence-projection-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-readiness-evidence-projection.mjs");
const runner = read("scripts/run-meta-repeatability-sample-02-readiness-evidence-projection.mjs");
const assertions = [];
const check = (name, condition) => assertions.push({ name, passed: Boolean(condition) });

check("phase38_gate", gate.phase === 38 && gate.sourcePhase === 37 && gate.baselinePhase === 34);
check("gate_schema", gate.schemaVersion === "phase38.readiness-evidence-projection.v1");
check("offline_only", gate.environment === "offline_readiness_projection");
check("readiness_source", gate.requiredSources.readiness.schemaVersion === "phase34.migration-readiness.v1");
check("readiness_status", gate.requiredSources.readiness.status === "assessment_complete_blocked");
check("contract_source", gate.requiredSources.restoreContract.schemaVersion === "phase35.restore-rehearsal-contract.v1");
check("contract_status", gate.requiredSources.restoreContract.status === "contract_prepared_execution_blocked");
check("reconciliation_source", gate.requiredSources.reconciliation.schemaVersion === "phase37.local-restore-reconciliation-receipt.v1");
check("reconciliation_status", gate.requiredSources.reconciliation.status === "reconciled_local_restore_only");
check("reconciliation_approved", gate.requiredSources.reconciliation.sourceEvidenceAccepted === true && gate.requiredSources.reconciliation.localRestoreHomologated === true);
check("control_count", gate.requiredControlOrder.length === 15 && new Set(gate.requiredControlOrder).size === 15);
check("inherited_count", gate.inheritedVerifiedControls.length === 5);
check("promotion_count", gate.allowedPromotions.length === 3);
check("promotion_exact", JSON.stringify(gate.allowedPromotions) === JSON.stringify(["immutable_backup_verified", "restore_drill_verified", "data_integrity_verified"]));
check("confirmation_exact", JSON.stringify(gate.confirmationOnlyControls) === JSON.stringify(["security_equivalence"]));
check("blocked_count", gate.blockedControlsAfterProjection.length === 7);
check("staging_blocked", gate.blockedControlsAfterProjection.includes("isolated_staging_replay_verified"));
check("human_blocked", gate.blockedControlsAfterProjection.includes("human_change_approval_verified"));
check("coverage", gate.projectedCoverage.verifiedControls === 8 && gate.projectedCoverage.requiredControls === 15 && gate.projectedCoverage.percent === 53);
for (const [name, field] of [
  ["fingerprints", "exactSourceFingerprints"], ["control_set", "exactControlSet"],
  ["allowlist", "exactPromotionAllowlist"], ["no_false_inheritance", "falseBaselineControlsCannotBeInherited"],
  ["candidate_not_auth", "candidateDoesNotEqualAuthorization"], ["security_confirm_only", "securityEquivalenceIsConfirmationOnly"],
  ["staging_independent", "stagingRequiresIndependentEvidence"], ["human_not_inferred", "humanApprovalCannotBeInferred"],
  ["sensitive_rejected", "sensitiveEvidenceRejected"], ["rows_rejected", "dataRowsRejected"],
  ["projection_not_migration", "projectionDoesNotAuthorizeMigration"]
]) check(name, gate.projectionRules[field] === true);
check("blocked_state", Object.values(gate.requiredBlockedState).every((value) => value === false));
for (const [name, field] of [
  ["no_database", "databaseAccess"], ["no_docker", "dockerExecution"],
  ["no_remote", "remoteDatabaseAccess"], ["no_linked", "linkedProjectAccess"],
  ["no_staging", "stagingMutation"], ["no_production", "productionMutation"],
  ["no_push", "supabaseDbPush"], ["no_linked_reset", "supabaseDbResetLinked"],
  ["no_permit_reservation", "permitReservation"], ["no_permit_issuance", "permitIssuance"],
  ["no_permit_consumption", "permitConsumption"], ["no_real_meta", "realMetaEventDelivery"],
  ["no_test_meta", "testMetaEventDelivery"], ["no_campaign", "campaignMutation"],
  ["no_deploy", "deployment"], ["no_build", "buildExecution"]
]) check(name, gate.prohibitedActions[field] === true);
check("template_schema", template.schemaVersion === "phase38.readiness-projection-receipt.v1");
check("template_blocked", template.status === "not_projected" && template.projectionApproved === false);
check("template_sources_false", template.sourceReadinessAccepted === false && template.sourceContractAccepted === false && template.sourceReconciliationAccepted === false);
check("template_chain_false", template.chainIntegrityApproved === false);
check("template_promotions_empty", template.promotedControls.length === 0 && template.confirmationOnlyControls.length === 0);
check("template_controls_false", Object.values(template.controls).every((value) => value === false));
check("template_coverage_zero", template.evidenceCoverage.verifiedControls === 0 && template.evidenceCoverage.percent === 0);
check("template_release_closed", Object.values(template.releaseGates).every((value) => value === false));
check("template_no_touch", template.databaseTouched === false && template.dockerTouched === false && template.remoteDatabaseTouched === false);
check("template_no_meta_build", template.metaTouched === false && template.buildExecuted === false);
for (const marker of [
  "validatePhase38ReadinessProjectionSources", "projectPhase38Readiness", "phase35_readiness_fingerprint_mismatch",
  "phase37_contract_fingerprint_mismatch", "phase34_control_set_mismatch", "phase34_unverified_control_claimed",
  "phase37_candidate_set_mismatch", "allowedPromotions", "confirmationOnlyControls", "remainingBlockedControls",
  "projected_readiness_blocked", "stagingMigrationAllowed", "sensitive_key", "data_rows_key",
  "selfTestPhase38ReadinessProjection"
]) check(`preflight_${marker}`, preflight.includes(marker));
for (const marker of [
  "phase38_readiness_contract_and_reconciliation_paths_required", "phase38_path_outside_workspace",
  "phase38_source_file_unsafe", "phase38_source_receipt_permissions_too_open", "phase38_source_json_invalid",
  "phase38_projection_rejected", "projectPhase38Readiness", "promotedControls", "remainingBlockedControls",
  "stagingMigrationAllowed", "remoteDatabaseTouched", "metaTouched", "buildExecuted", "chmodSync(outputFile, 0o600)"
]) check(`runner_${marker}`, runner.includes(marker));
check("runner_read_only", !runner.includes("docker") && !runner.includes("supabase") && !runner.includes("psql"));
check("runner_no_http", !runner.includes("fetch(") && !runner.includes("https://") && !runner.includes("http://"));
check("runner_no_process_spawn", !runner.includes("child_process") && !runner.includes("spawnSync(") && !runner.includes("spawn("));

const failures = assertions.filter((item) => !item.passed);
console.log(JSON.stringify({
  phase: 38,
  passed: failures.length === 0,
  assertionCount: assertions.length,
  failedAssertions: failures.map((item) => item.name),
  projectionExecuted: false,
  databaseTouched: false,
  dockerTouched: false,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
}, null, 2));
if (failures.length) process.exit(1);
