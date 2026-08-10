import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-035.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.rehearsalGate));
const template = JSON.parse(read(config.rehearsalTemplate));
const preflight = read(config.preflight);
const preparer = read(config.contractPreparer);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 35 && config.mode === "sample_02_isolated_restore_rehearsal_contract", "configuracao da Fase 35 invalida");
expect(config.status === "restore_rehearsal_contract_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 35 abriu gate indevido");
expect(previous.phase === 34 && previous.status === "migration_readiness_matrix_prepared_source_evidence_missing", "baseline da Fase 34 invalido");
expect(config.environmentAudit.staticRehearsalContractApproved === true && config.environmentAudit.readOnlyContractPreparerPrepared === true, "preparacao do contrato incompleta");
expect(config.environmentAudit.phase34ReadinessReceiptReceived === false && config.environmentAudit.verifiedBackupManifestReceived === false && config.environmentAudit.rehearsalContractIssued === false, "evidencia ou contrato inexistente foi alegado");
expect(config.environmentAudit.restoreExecuted === false && config.environmentAudit.databaseMutationExecuted === false && config.environmentAudit.metaMutationExecuted === false && config.environmentAudit.buildExecuted === false, "restauracao, mutacao ou build indevido");
expect(config.releaseGate.staticRehearsalContractApproved === true && config.releaseGate.sourceReadinessReceived === false && config.releaseGate.backupManifestReceived === false, "gate de origem invalido");
expect(config.releaseGate.backupEvidenceApproved === false && config.releaseGate.restoreContractIssued === false && config.releaseGate.restoreExecutionAllowed === false, "gate de restore liberado");
expect(config.releaseGate.stagingMigrationAllowed === false && config.releaseGate.productionMigrationAllowed === false && config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "migracao ou proxima fase liberada");
expect(config.governance.evidenceReadOnlyPreparation === true && config.governance.localDatabaseAccess === false && config.governance.containerRuntimeAccess === false && config.governance.restoreExecution === false, "preparacao nao e somente leitura");
expect(config.governance.remoteDatabaseAccess === false && config.governance.productionAccess === false && config.governance.realMetaEventDelivery === false && config.governance.buildExecuted === false, "producao, Meta ou build liberado");

expect(gate.phase === 35 && gate.sourcePhase === 34 && gate.schemaVersion === "phase35.restore-rehearsal-contract.v1", "gate da Fase 35 invalido");
expect(gate.sourceReadinessReceipt.schemaVersion === "phase34.migration-readiness.v1" && gate.sourceReadinessReceipt.evidenceCoveragePercent === 33, "origem da Fase 34 invalida");
expect(gate.requiredBackupEvidence.length === 8 && gate.requiredBackupEvidence.includes("storage_objects_inventory_included"), "evidencias do backup incompletas");
expect(gate.requiredRestorePlan.isolatedTarget === true && gate.requiredRestorePlan.disposableTarget === true && gate.requiredRestorePlan.productionTarget === false, "alvo de restore invalido");
expect(gate.requiredRestorePlan.humanApprovalRequiredBeforeExecution === true && gate.requiredRestorePlan.targetDestructionRequired === true, "aprovacao ou destruicao ausente");
expect(template.status === "not_prepared" && template.backupEvidenceAccepted === false && template.restoreExecutionAllowed === false, "template alegou preparo ou execucao");
expect(template.stagingMigrationAllowed === false && template.productionMigrationAllowed === false && template.productionCompatibilityApproved === false, "template liberou migracao");

for (const marker of [
  "validatePhase35ReadinessReceipt", "validatePhase35BackupManifest", "evaluatePhase35RestoreRehearsalContract",
  "backup_storage_inventory_missing", "backup_custom_roles_not_documented",
  "backup_replication_subscriptions_not_documented", "findSensitiveEvidence", "selfTestPhase35RestoreRehearsal"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase35_source_readiness_and_backup_manifest_paths_required", "phase35_restore_rehearsal_sources_rejected",
  "sourceReadinessFingerprint", "backupManifestFingerprint", "contract_prepared_execution_blocked",
  "restoreExecutionAllowed: false", "productionMigrationAllowed: false", "writeFileSync"
]) expect(preparer.includes(marker), `preparador incompleto: ${marker}`);
expect(workflow.includes("Validate Phase 35 isolated restore contract without restoring"), "workflow nao valida a Fase 35");
expect(!workflow.includes("run-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs"), "workflow emitiu contrato sem backup real");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-035:audit", "audit-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs"],
  ["meta:phase-035:preflight", "preflight-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs"],
  ["meta:phase-035:prepare", "run-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs"],
  ["meta:phase-035:check", "check-meta-intelligence-phase-035.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 35/100", "Storage", "papéis personalizados", "não recebido", "não emitido",
  "não executada", "não tocados", "restoreExecutionAllowed", "não executado"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs"], "auditoria do contrato de restore");
run(["scripts/preflight-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs", "--self-test"], "autoteste do contrato de restore");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase35_source_readiness_and_backup_manifest_paths_required"), "preparador nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 35: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 35: aprovada — contrato de ensaio isolado preparado com backup, Storage, roles, replicacao, validacoes e destruicao obrigatoria; sem evidencias reais, restauracao, banco, producao, Meta e build continuam bloqueados.");
