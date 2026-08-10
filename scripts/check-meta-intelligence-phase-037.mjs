import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-037.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.reconciliationGate));
const template = JSON.parse(read(config.receiptTemplate));
const preflight = read(config.preflight);
const reconciler = read(config.reconciler);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 37 && config.mode === "sample_02_local_restore_evidence_reconciliation", "configuracao da Fase 37 invalida");
expect(config.status === "local_restore_reconciliation_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 37 abriu gate indevido");
expect(previous.phase === 36 && previous.status === "local_restore_executor_prepared_source_evidence_missing", "baseline da Fase 36 invalido");
expect(config.environmentAudit.staticReconciliationContractApproved === true && config.environmentAudit.offlineReadOnlyReconcilerPrepared === true, "reconciliador offline incompleto");
expect(config.environmentAudit.sourceChainValidationPrepared === true && config.environmentAudit.metricEqualityValidationPrepared === true, "validacao de cadeia ou metricas incompleta");
expect(config.environmentAudit.securityAndLifecycleValidationPrepared === true, "validacao de seguranca e ciclo incompleta");
expect(config.environmentAudit.phase36RestoreEvidenceReceived === false && config.environmentAudit.reconciliationExecuted === false, "evidencia ou conciliacao inexistente foi alegada");
expect(config.environmentAudit.localRestoreHomologated === false && config.environmentAudit.databaseTouched === false && config.environmentAudit.dockerTouched === false, "restore homologado ou runtime tocado indevidamente");
expect(config.environmentAudit.remoteDatabaseTouched === false && config.environmentAudit.metaTouched === false && config.environmentAudit.buildExecuted === false, "remoto, Meta ou build tocado");
expect(config.releaseGate.reconcilerPrepared === true && config.releaseGate.sourceEvidenceReceived === false, "gate de origem invalido");
expect(config.releaseGate.localRestoreHomologated === false && config.releaseGate.readinessProjectionAllowed === false, "homologacao ou readiness indevidamente liberado");
expect(config.releaseGate.stagingMigrationAllowed === false && config.releaseGate.productionMigrationAllowed === false, "migracao indevidamente liberada");
expect(config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "compatibilidade ou proxima fase liberada");
expect(config.governance.databaseAccess === false && config.governance.dockerExecution === false && config.governance.remoteDatabaseAccess === false, "governanca offline invalida");
expect(config.governance.realMetaEventDelivery === false && config.governance.deployment === false && config.governance.buildExecuted === false, "Meta, deploy ou build liberado");

expect(gate.phase === 37 && gate.sourcePhase === 36 && gate.schemaVersion === "phase37.local-restore-reconciliation.v1", "gate da Fase 37 invalido");
expect(gate.sourceEvidence.status === "approved_local_restore_only" && gate.sourceEvidence.localRestoreApproved === true, "fonte aprovada local ausente");
expect(gate.sourceEvidence.stagingMigrationAllowed === false && gate.sourceEvidence.productionMigrationAllowed === false, "fonte abre migracao");
expect(gate.requiredValidationChecks.length === 12 && gate.requiredOrderedEvents.length === 5 && gate.requiredMetricFields.length === 10, "matriz de conciliacao incompleta");
expect(gate.reconciliationRules.exactSourceFingerprints === true && gate.reconciliationRules.exactActualMetrics === true, "igualdade exata nao exigida");
expect(gate.reconciliationRules.sensitiveEvidenceRejected === true && gate.reconciliationRules.dataRowsRejected === true, "evidencia sensivel nao bloqueada");
expect(gate.prohibitedActions.databaseAccess === true && gate.prohibitedActions.dockerExecution === true, "conciliacao possui acesso operacional");
expect(gate.prohibitedActions.realMetaEventDelivery === true && gate.prohibitedActions.buildExecution === true, "Meta ou build nao bloqueado");
expect(template.status === "not_reconciled" && template.sourceEvidenceAccepted === false && template.localRestoreHomologated === false, "template alegou homologacao");
expect(Object.values(template.readinessControlCandidates).every((value) => value === false), "template promoveu controles");
expect(Object.values(template.releaseGates).every((value) => value === false), "template abriu release gate");
expect(template.databaseTouched === false && template.dockerTouched === false && template.remoteDatabaseTouched === false, "template alegou toque operacional");

for (const marker of [
  "validatePhase37RestoreEvidence", "reconcilePhase37RestoreEvidence", "validatePhase36BackupManifest",
  "phase36_contract_fingerprint_mismatch", "phase36_expected_metrics_manifest_mismatch",
  "phase36_actual_metrics_mismatch", "phase36_event_sequence_mismatch", "phase36_target_not_destroyed",
  "data_rows_key", "reconciled_local_restore_only", "stagingMigrationAllowed: false",
  "databaseTouched: false", "selfTestPhase37RestoreReconciliation"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase37_evidence_contract_and_manifest_paths_required", "phase37_restore_evidence_permissions_too_open",
  "phase37_reconciliation_rejected", "reconcilePhase37RestoreEvidence", "chmodSync(outputFile, 0o600)",
  "localRestoreHomologated", "stagingMigrationAllowed", "remoteDatabaseTouched", "buildExecuted"
]) expect(reconciler.includes(marker), `reconciliador incompleto: ${marker}`);
expect(!reconciler.includes("child_process") && !reconciler.includes("fetch(") && !reconciler.includes("https://"), "reconciliador nao e offline");
expect(workflow.includes("Validate Phase 37 restore evidence reconciler without reconciling"), "workflow nao valida a Fase 37");
expect(!workflow.includes("run-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs"), "workflow concilia sem evidencia real");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-037:audit", "audit-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs"],
  ["meta:phase-037:preflight", "preflight-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs"],
  ["meta:phase-037:reconcile", "run-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs"],
  ["meta:phase-037:check", "check-meta-intelligence-phase-037.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 37/100", "fingerprints", "RLS", "Auth", "Storage", "reconciled_local_restore_only",
  "Nenhuma evidência real foi recebida", "conciliação foi executada", "build executado: não", "Fase 38"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs"], "auditoria da conciliacao");
run(["scripts/preflight-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs", "--self-test"], "autoteste da conciliacao");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-local-restore-evidence-reconciliation.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase37_evidence_contract_and_manifest_paths_required"), "reconciliador nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 37: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 37: aprovada — conciliador offline preparado com fingerprints, metricas exatas, RLS, Auth, Storage, migrations, ordem temporal e destruicao verificavel; sem evidencia real, conciliacao, banco, Docker, Meta ou build.");
