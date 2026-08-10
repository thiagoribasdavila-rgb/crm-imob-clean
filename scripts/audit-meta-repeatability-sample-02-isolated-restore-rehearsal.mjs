import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-isolated-restore-rehearsal-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-isolated-restore-rehearsal-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs");
const preparer = read("scripts/run-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs");
const workflow = read(".github/workflows/atlas-meta-phase30-local-rehearsal.yml");
const failures = [];
let assertionCount = 0;
const expect = (condition, message) => {
  assertionCount += 1;
  if (!condition) failures.push(message);
};

expect(gate.phase === 35 && gate.sourcePhase === 34 && gate.environment === "isolated_restore_rehearsal_contract", "gate da Fase 35 invalido");
expect(gate.schemaVersion === "phase35.restore-rehearsal-contract.v1", "schema do contrato invalido");
expect(gate.maximumInputBytes === 1048576, "limite de entrada invalido");
expect(gate.sourceReadinessReceipt.schemaVersion === "phase34.migration-readiness.v1", "schema de prontidao de origem invalido");
expect(gate.sourceReadinessReceipt.status === "assessment_complete_blocked" && gate.sourceReadinessReceipt.sourceReceiptAccepted === true, "origem nao exige avaliacao valida");
expect(gate.sourceReadinessReceipt.verifiedControls === 5 && gate.sourceReadinessReceipt.requiredControls === 15 && gate.sourceReadinessReceipt.evidenceCoveragePercent === 33, "cobertura de origem invalida");
expect(gate.sourceReadinessReceipt.stagingMigrationAllowed === false && gate.sourceReadinessReceipt.productionMigrationAllowed === false && gate.sourceReadinessReceipt.productionCompatibilityApproved === false, "origem liberou migracao");
expect(gate.backupManifest.schemaVersion === "phase35.backup-manifest.v1" && gate.backupManifest.status === "verified", "contrato do manifesto invalido");
expect(JSON.stringify(gate.backupManifest.allowedBackupTypes) === JSON.stringify(["logical", "physical_download"]), "tipos de backup invalidos");
expect(gate.backupManifest.postgresMajor === 17 && gate.backupManifest.postgresImage === "supabase/postgres:17.6.1.149", "runtime do backup invalido");
expect(gate.backupManifest.maximumAgeHours === 24 && gate.backupManifest.maximumRpoMinutes === 1440, "janela de backup ou RPO invalido");
expect(gate.requiredBackupEvidence.length === 8 && new Set(gate.requiredBackupEvidence).size === 8, "evidencias do backup incompletas");
expect(gate.requiredBackupEvidence.includes("storage_objects_inventory_included"), "inventario do Storage nao exigido");
expect(gate.requiredBackupEvidence.includes("custom_roles_documented") && gate.requiredBackupEvidence.includes("replication_subscriptions_documented"), "roles ou replicacao nao tratados");
expect(gate.requiredRestorePlan.isolatedTarget === true && gate.requiredRestorePlan.disposableTarget === true && gate.requiredRestorePlan.productionTarget === false, "alvo do ensaio nao e isolado");
expect(gate.requiredRestorePlan.sourceDatabaseWriteAccess === false && gate.requiredRestorePlan.targetDestructionRequired === true, "origem ou destruicao insegura");
expect(gate.requiredRestorePlan.postRestoreIntegrityChecks === true && gate.requiredRestorePlan.postRestoreSecurityChecks === true && gate.requiredRestorePlan.postRestorePerformanceBaseline === true, "validacoes pos-restore incompletas");
expect(gate.requiredRestorePlan.humanApprovalRequiredBeforeExecution === true, "aprovacao humana nao exigida");
expect(Object.values(gate.requiredBlockedState).every((value) => value === false), "estado bloqueado abriu gate");
expect(Object.values(gate.prohibitedActions).every(Boolean), "acao proibida ausente");

expect(template.schemaVersion === gate.schemaVersion && template.status === "not_prepared", "template da Fase 35 invalido");
expect(template.backupEvidenceAccepted === false && template.restoreExecuted === false && template.restoreExecutionAllowed === false, "template alegou aceite ou execucao");
expect(template.restorePlan.isolatedTarget === true && template.restorePlan.disposableTarget === true && template.restorePlan.productionTarget === false, "template de alvo invalido");
expect(template.stagingMigrationAllowed === false && template.productionMigrationAllowed === false && template.productionCompatibilityApproved === false, "template liberou migracao");
expect(template.remoteDatabaseTouched === false && template.metaTouched === false && template.buildExecuted === false, "template alegou mutacao ou build");

for (const marker of [
  "validatePhase35ReadinessReceipt", "validatePhase35BackupManifest", "evaluatePhase35RestoreRehearsalContract",
  "findSensitiveEvidence", "phase34_control_matrix_mismatch", "backup_storage_inventory_missing",
  "backup_custom_roles_not_documented", "backup_replication_subscriptions_not_documented",
  "selfTestPhase35RestoreRehearsal"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase35_source_readiness_and_backup_manifest_paths_required", "isSymbolicLink", "maximumInputBytes",
  "phase35_restore_rehearsal_sources_rejected", "sourceReadinessFingerprint", "backupManifestFingerprint",
  "contract_prepared_execution_blocked", "phase35_output_parent_unsafe", "chmodSync",
  "restoreExecuted: false", "restoreExecutionAllowed: false", "productionMigrationAllowed: false",
  "remoteDatabaseTouched: false", "metaTouched: false", "buildExecuted: false"
]) expect(preparer.includes(marker), `preparador incompleto: ${marker}`);
expect(!preparer.includes("DATABASE_URL") && !preparer.includes("graph.facebook.com") && !preparer.includes("docker compose"), "preparador tenta acessar banco, Docker ou Meta");
expect(!preparer.includes("supabase db push") && !preparer.includes("npm run build") && !preparer.includes("psql "), "preparador tenta restaurar, publicar ou executar build");
expect(workflow.includes("Validate Phase 35 isolated restore contract without restoring"), "workflow nao valida a Fase 35");
expect(workflow.includes("audit-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs") && workflow.includes("preflight-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs --self-test"), "workflow da Fase 35 incompleto");
expect(!workflow.includes("run-meta-repeatability-sample-02-isolated-restore-rehearsal.mjs"), "workflow tentou emitir contrato sem manifesto real");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow deixou de ser manual, Node 24 ou executa build");

const report = {
  passed: failures.length === 0,
  assertionCount,
  sourceReadinessReceived: false,
  backupManifestReceived: false,
  contractIssued: false,
  restoreExecuted: false,
  databaseTouched: false,
  metaTouched: false,
  buildExecuted: false,
  failures
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
