import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-034.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.readinessGate));
const template = JSON.parse(read(config.readinessTemplate));
const preflight = read(config.preflight);
const assessor = read(config.assessor);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 34 && config.mode === "sample_02_evidence_driven_migration_readiness_matrix", "configuracao da Fase 34 invalida");
expect(config.status === "migration_readiness_matrix_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 34 abriu gate indevido");
expect(previous.phase === 33 && previous.status === "cross_major_reconciliation_prepared_runtime_evidence_missing", "baseline da Fase 33 invalido");
expect(config.environmentAudit.staticReadinessContractApproved === true && config.environmentAudit.readOnlyAssessmentRunnerPrepared === true, "preparacao da matriz incompleta");
expect(config.environmentAudit.phase33ReceiptReceived === false && config.environmentAudit.readinessAssessmentExecuted === false, "evidencia ou avaliacao inexistente foi alegada");
expect(config.environmentAudit.currentEvidenceCoveragePercent === 0 && config.environmentAudit.databaseMutationExecuted === false && config.environmentAudit.metaMutationExecuted === false && config.environmentAudit.buildExecuted === false, "cobertura, mutacao ou build indevido");
expect(config.releaseGate.staticReadinessContractApproved === true && config.releaseGate.sourceEvidenceReceived === false && config.releaseGate.sourceEvidenceApproved === false, "gate de evidencia invalido");
expect(config.releaseGate.currentEvidenceCoveragePercent === 0 && config.releaseGate.stagingMigrationAllowed === false && config.releaseGate.productionMigrationAllowed === false, "gate de migracao liberado");
expect(config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "producao ou proxima fase liberada");
expect(config.governance.evidenceReadOnlyAssessment === true && config.governance.localDatabaseAccess === false && config.governance.containerRuntimeAccess === false, "avaliacao nao e somente leitura");
expect(config.governance.remoteDatabaseAccess === false && config.governance.productionAccess === false && config.governance.realMetaEventDelivery === false && config.governance.buildExecuted === false, "producao, Meta ou build liberado");

expect(gate.phase === 34 && gate.sourcePhase === 33 && gate.schemaVersion === "phase34.migration-readiness.v1", "gate da Fase 34 invalido");
expect(gate.verifiedFromPhase33.length === 5 && gate.requiredBeforeProduction.length === 10, "matriz de controles invalida");
expect(new Set([...gate.verifiedFromPhase33, ...gate.requiredBeforeProduction]).size === 15, "controles duplicados");
expect(gate.evidenceCoverage.verifiedControls === 5 && gate.evidenceCoverage.requiredControls === 15 && gate.evidenceCoverage.percent === 33, "cobertura maxima invalida");
expect(template.status === "not_assessed" && Object.values(template.controls).every((value) => value === false), "template alegou avaliacao");
expect(template.evidenceCoverage.percent === 0 && template.stagingMigrationAllowed === false && template.productionMigrationAllowed === false, "template liberou gate");

for (const marker of [
  "validatePhase34SourceReceipt", "evaluatePhase34MigrationReadiness", "phase33_source_fingerprint_set_mismatch",
  "phase33_production_claim_invalid", "findSensitiveEvidence", "selfTestPhase34MigrationReadiness"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase34_source_reconciliation_path_required", "phase34_source_reconciliation_rejected",
  "sourceReceiptFingerprint", "assessment_complete_blocked", "productionMigrationAllowed: false", "writeFileSync"
]) expect(assessor.includes(marker), `avaliador incompleto: ${marker}`);
expect(workflow.includes("Assess migration readiness without production access") && workflow.includes("ATLAS_PHASE34_READINESS_FILE"), "workflow nao executa a Fase 34");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-034:audit", "audit-meta-repeatability-sample-02-migration-readiness.mjs"],
  ["meta:phase-034:preflight", "preflight-meta-repeatability-sample-02-migration-readiness.mjs"],
  ["meta:phase-034:assess", "run-meta-repeatability-sample-02-migration-readiness.mjs"],
  ["meta:phase-034:check", "check-meta-intelligence-phase-034.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 34/100", "5/15 = 33%", "0/15 = 0%", "não recebido", "não foi executada",
  "não tocados", "stagingMigrationAllowed", "productionMigrationAllowed", "não executado"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-migration-readiness.mjs"], "auditoria da matriz");
run(["scripts/preflight-meta-repeatability-sample-02-migration-readiness.mjs", "--self-test"], "autoteste da matriz");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-migration-readiness.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase34_source_reconciliation_path_required"), "avaliador nao falhou fechado sem recibo");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 34: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 34: aprovada — matriz de 15 controles preparada; sem recibo real a cobertura permanece 0% e staging, producao, banco, Meta, permissoes e build continuam bloqueados.");
