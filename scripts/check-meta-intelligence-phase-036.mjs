import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-036.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.executionGate));
const template = JSON.parse(read(config.evidenceTemplate));
const compose = read(config.composeFile);
const preflight = read(config.preflight);
const executor = read(config.executor);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 36 && config.mode === "sample_02_local_ephemeral_restore_execution", "configuracao da Fase 36 invalida");
expect(config.status === "local_restore_executor_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 36 abriu gate indevido");
expect(previous.phase === 35 && previous.status === "restore_rehearsal_contract_prepared_source_evidence_missing", "baseline da Fase 35 invalido");
expect(config.environmentAudit.staticExecutionContractApproved === true && config.environmentAudit.localOnlyExecutorPrepared === true, "executor local incompleto");
expect(config.environmentAudit.networkIsolatedComposePrepared === true && config.environmentAudit.postRestoreValidationPrepared === true && config.environmentAudit.mandatoryCleanupPrepared === true, "isolamento, validacao ou limpeza incompleta");
expect(config.environmentAudit.phase35ContractReceived === false && config.environmentAudit.logicalBackupFileReceived === false && config.environmentAudit.humanApprovalReceived === false, "evidencia ou aprovacao inexistente foi alegada");
expect(config.environmentAudit.restoreExecuted === false && config.environmentAudit.localDatabaseTouched === false && config.environmentAudit.remoteDatabaseTouched === false, "restore ou banco tocado nesta entrega");
expect(config.environmentAudit.metaTouched === false && config.environmentAudit.buildExecuted === false, "Meta ou build executado");
expect(config.releaseGate.executorPrepared === true && config.releaseGate.sourceEvidenceReceived === false && config.releaseGate.backupContentVerified === false, "gate de evidencia invalido");
expect(config.releaseGate.localRestoreApproved === false && config.releaseGate.stagingMigrationAllowed === false && config.releaseGate.productionMigrationAllowed === false, "restore ou migracao indevidamente aprovado");
expect(config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "compatibilidade ou proxima fase liberada");
expect(config.governance.remoteDatabaseAccess === false && config.governance.linkedProjectAccess === false && config.governance.physicalBackupRestore === false, "governanca remota invalida");
expect(config.governance.realMetaEventDelivery === false && config.governance.deployment === false && config.governance.buildExecuted === false, "Meta, deploy ou build liberado");

expect(gate.phase === 36 && gate.sourcePhase === 35 && gate.schemaVersion === "phase36.local-restore-execution.v1", "gate da Fase 36 invalido");
expect(gate.approval.exactValue === "EXECUTE_PHASE36_LOCAL_EPHEMERAL_RESTORE_ONLY", "aprovacao exata ausente");
expect(gate.backup.supportedType === "logical" && gate.prohibitedActions.physicalBackupRestore === true, "tipo de backup inseguro");
expect(gate.runtime.networkMode === "none" && gate.runtime.publishedPorts === false, "runtime possui rede ou portas");
expect(gate.runtime.linkedProject === false && gate.runtime.remoteTarget === false && gate.runtime.productionTarget === false, "runtime aponta para alvo externo");
expect(gate.runtime.destroyVolumesAfterRun === true && gate.requiredPostRestoreChecks.targetDestructionVerified === true, "destruicao nao e obrigatoria");
expect(gate.requiredValidationExpectations.length === 10 && gate.requiredValidationExpectations.includes("catalogFingerprint"), "expectativas de validacao incompletas");
expect(template.status === "not_executed" && template.restore.attempted === false && template.restore.approved === false, "template alegou restore");
expect(template.releaseGates.localRestoreApproved === false && template.releaseGates.productionMigrationAllowed === false, "template abriu gate");
expect(compose.includes('network_mode: "none"') && !compose.includes("ports:"), "compose nao esta isolado");
expect(compose.includes("supabase/postgres:17.6.1.149") && compose.includes("phase36-postgres-data"), "imagem ou volume invalido");

for (const marker of [
  "validatePhase36SourceContract", "validatePhase36BackupManifest", "validatePhase36ExecutionRequest",
  "phase36_human_approval_missing", "phase36_backup_content_hash_mismatch", "phase36_source_security_baseline_failed",
  "scanPhase36LogicalBackupText", "copy_from_program", "dblink_connect", "selfTestPhase36RestoreExecution"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase36_contract_readiness_manifest_and_backup_paths_required", "phase36_explicit_human_approval_required",
  "inspectLogicalBackup", "phase36_logical_backup_safety_rejected", "--single-transaction",
  "catalogFingerprintMatches", "publicTablesWithoutRls", "storageMetadataCountsMatch",
  "runtime_and_volumes_destroyed", "approved_local_restore_only", "productionMigrationAllowed: false",
  "remoteDatabaseTouched: false", "buildExecuted: false", "chmodSync(evidenceFile, 0o600)"
]) expect(executor.includes(marker), `executor incompleto: ${marker}`);
expect(workflow.includes("Validate Phase 36 local restore executor without restoring"), "workflow nao valida a Fase 36");
expect(!workflow.includes("run-meta-repeatability-sample-02-ephemeral-restore-execution.mjs"), "workflow executa restore sem evidencia real");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-036:audit", "audit-meta-repeatability-sample-02-ephemeral-restore-execution.mjs"],
  ["meta:phase-036:preflight", "preflight-meta-repeatability-sample-02-ephemeral-restore-execution.mjs"],
  ["meta:phase-036:restore", "run-meta-repeatability-sample-02-ephemeral-restore-execution.mjs"],
  ["meta:phase-036:check", "check-meta-intelligence-phase-036.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 36/100", "network_mode: none", "SHA-256", "RLS", "Auth", "Storage",
  "não foi executado", "não recebido", "não tocado", "não executado", "Fase 37"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-ephemeral-restore-execution.mjs"], "auditoria do executor de restore");
run(["scripts/preflight-meta-repeatability-sample-02-ephemeral-restore-execution.mjs", "--self-test"], "autoteste do executor de restore");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-ephemeral-restore-execution.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase36_contract_readiness_manifest_and_backup_paths_required"), "executor nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 36: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 36: aprovada — executor de restore logico local preparado com rede bloqueada, hashes, validacao de catalogo, RLS, Auth, Storage, migrations e destruicao obrigatoria; sem evidencias reais, aprovacao, restore, banco, Meta ou build.");
