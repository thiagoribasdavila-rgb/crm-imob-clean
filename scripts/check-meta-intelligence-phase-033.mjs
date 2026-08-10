import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-033.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.reconciliationGate));
const template = JSON.parse(read(config.reconciliationTemplate));
const preflight = read(config.preflight);
const reconciler = read(config.reconciler);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 33 && config.mode === "sample_02_pg15_pg17_evidence_reconciliation", "configuracao da Fase 33 invalida");
expect(config.status === "cross_major_reconciliation_prepared_runtime_evidence_missing" && config.safeToApply === false, "Fase 33 abriu gate indevido");
expect(previous.phase === 32 && previous.status === "pg17_compatibility_runtime_prepared_source_evidence_missing", "baseline da Fase 32 invalido");
expect(config.environmentAudit.staticComparisonContractApproved === true && config.environmentAudit.readOnlyReconciliationRunnerPrepared === true, "preparacao da conciliacao incompleta");
expect(config.environmentAudit.phase30RuntimeEvidenceReceived === false && config.environmentAudit.phase31ReconciliationReceived === false && config.environmentAudit.phase32RuntimeEvidenceReceived === false, "evidencia inexistente foi alegada");
expect(config.environmentAudit.crossMajorReconciliationExecuted === false && config.environmentAudit.databaseMutationExecuted === false && config.environmentAudit.metaMutationExecuted === false && config.environmentAudit.buildExecuted === false, "execucao, mutacao ou build indevido");
expect(config.releaseGate.staticComparisonContractApproved === true && config.releaseGate.sourceChainContractApproved === true && config.releaseGate.crossMajorArtifactContractApproved === true, "contrato estatico incompleto");
expect(config.releaseGate.sourceEvidenceReceived === false && config.releaseGate.crossMajorCompatibilityApproved === false && config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "gate futuro liberado");
expect(config.governance.evidenceReadOnlyReconciliation === true && config.governance.localDatabaseAccess === false && config.governance.containerRuntimeAccess === false, "reconciliacao nao e somente leitura");
expect(config.governance.remoteDatabaseAccess === false && config.governance.productionAccess === false && config.governance.realMetaEventDelivery === false && config.governance.buildExecuted === false, "producao, Meta ou build liberado");
expect(gate.phase === 33 && gate.sourcePhase === 32 && gate.schemaVersion === "phase33.cross-major-reconciliation.v1", "gate da Fase 33 invalido");
expect(gate.runtimes.pg15.postgresMajor === 15 && gate.runtimes.pg17.postgresMajor === 17, "matriz de major invalida");
expect(gate.runtimes.pg15.targetIdentity !== gate.runtimes.pg17.targetIdentity && Object.keys(gate.sharedArtifactMapping).length === 5, "isolamento ou mapeamento invalido");
expect(template.status === "not_received" && template.crossMajorApproved === false && template.productionCompatibilityApproved === false, "template alegou aprovacao");
for (const marker of [
  "validatePhase33CrossMajorSources", "cross_major_shared_artifact_mismatch", "runtime_targets_not_distinct",
  "extensionCompatibilityApproved", "securityEquivalent", "rollbackEquivalent", "selfTestPhase33CrossMajorReconciliation"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase33_source_evidence_paths_required", "phase33_cross_major_evidence_rejected", "sourceFingerprints",
  "crossMajorApproved: true", "productionCompatibilityApproved: false", "writeFileSync"
]) expect(reconciler.includes(marker), `reconciliador incompleto: ${marker}`);
expect(workflow.includes("Validate and reconcile PostgreSQL 15 x 17 evidence") && workflow.includes("ATLAS_PHASE33_RECONCILIATION_FILE"), "workflow nao executa a Fase 33");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-033:audit", "audit-meta-repeatability-sample-02-cross-major-reconciliation.mjs"],
  ["meta:phase-033:preflight", "preflight-meta-repeatability-sample-02-cross-major-reconciliation.mjs"],
  ["meta:phase-033:reconcile", "run-meta-repeatability-sample-02-cross-major-reconciliation.mjs"],
  ["meta:phase-033:check", "check-meta-intelligence-phase-033.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 33/100", "somente leitura", "phase33.cross-major-reconciliation.v1", "não recebida",
  "não foi executada", "não tocados", "productionCompatibilityApproved", "não executado"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-cross-major-reconciliation.mjs"], "auditoria de conciliacao");
run(["scripts/preflight-meta-repeatability-sample-02-cross-major-reconciliation.mjs", "--self-test"], "autoteste de conciliacao");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-cross-major-reconciliation.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase33_source_evidence_paths_required"), "reconciliador nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 33: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 33: aprovada — contrato de conciliacao PG15 x PG17 somente leitura, encadeado por hashes, eventos e artefatos; sem evidencias reais, producao, banco, Meta, permissao e build continuam bloqueados.");
