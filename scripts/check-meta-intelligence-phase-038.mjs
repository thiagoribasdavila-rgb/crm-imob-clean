import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-038.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.projectionGate));
const template = JSON.parse(read(config.projectionTemplate));
const preflight = read(config.preflight);
const projector = read(config.projector);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 38 && config.mode === "sample_02_readiness_evidence_projection", "configuracao da Fase 38 invalida");
expect(config.status === "readiness_projection_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 38 abriu gate indevido");
expect(previous.phase === 37 && previous.status === "local_restore_reconciliation_prepared_source_evidence_missing", "baseline da Fase 37 invalido");
expect(config.projectionContract.allowedPromotions === 3 && config.projectionContract.confirmationOnlyControls === 1, "escopo de promocao invalido");
expect(config.projectionContract.projectedVerifiedControls === 8 && config.projectionContract.requiredControls === 15, "cobertura projetada invalida");
expect(config.projectionContract.projectedCoveragePercent === 53 && config.projectionContract.successfulProjectionDoesNotAuthorizeMigration === true, "percentual ou limite da projecao invalido");
expect(config.environmentAudit.staticProjectionContractApproved === true && config.environmentAudit.offlineReadOnlyProjectorPrepared === true, "projetor offline incompleto");
expect(config.environmentAudit.fingerprintChainValidationPrepared === true && config.environmentAudit.exactPromotionAllowlistPrepared === true, "cadeia ou allowlist incompleta");
expect(config.environmentAudit.phase34ReadinessReceiptReceived === false && config.environmentAudit.phase37ReconciliationReceiptReceived === false, "evidencia inexistente foi alegada");
expect(config.environmentAudit.projectionExecuted === false && config.environmentAudit.projectedCoveragePercent === 0, "projecao inexistente foi alegada");
expect(config.environmentAudit.databaseTouched === false && config.environmentAudit.dockerTouched === false && config.environmentAudit.remoteDatabaseTouched === false, "toque operacional alegado");
expect(config.environmentAudit.metaTouched === false && config.environmentAudit.buildExecuted === false, "Meta ou build tocado");
expect(config.releaseGate.projectorPrepared === true && config.releaseGate.sourceEvidenceReceived === false, "gate de origem invalido");
expect(config.releaseGate.projectionApproved === false && config.releaseGate.stagingMigrationAllowed === false, "projecao ou staging liberado");
expect(config.releaseGate.productionMigrationAllowed === false && config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "producao ou proxima fase liberada");
expect(config.governance.databaseAccess === false && config.governance.dockerExecution === false && config.governance.remoteDatabaseAccess === false, "governanca offline invalida");
expect(config.governance.realMetaEventDelivery === false && config.governance.deployment === false && config.governance.buildExecuted === false, "Meta, deploy ou build liberado");

expect(gate.phase === 38 && gate.sourcePhase === 37 && gate.baselinePhase === 34, "gate da Fase 38 invalido");
expect(gate.requiredSources.readiness.status === "assessment_complete_blocked", "readiness de origem invalido");
expect(gate.requiredSources.restoreContract.status === "contract_prepared_execution_blocked", "contrato de origem invalido");
expect(gate.requiredSources.reconciliation.status === "reconciled_local_restore_only", "conciliacao de origem invalida");
expect(gate.requiredControlOrder.length === 15 && gate.inheritedVerifiedControls.length === 5, "matriz de controles incompleta");
expect(gate.allowedPromotions.length === 3 && gate.confirmationOnlyControls.length === 1, "promocoes ou confirmacoes invalidas");
expect(gate.projectedCoverage.verifiedControls === 8 && gate.projectedCoverage.percent === 53, "cobertura final invalida");
expect(gate.blockedControlsAfterProjection.length === 7 && gate.blockedControlsAfterProjection.includes("isolated_staging_replay_verified"), "bloqueios restantes invalidos");
expect(gate.projectionRules.exactSourceFingerprints === true && gate.projectionRules.exactPromotionAllowlist === true, "fingerprints ou allowlist nao exigidos");
expect(gate.projectionRules.humanApprovalCannotBeInferred === true && gate.projectionRules.projectionDoesNotAuthorizeMigration === true, "limites da projecao ausentes");
expect(gate.prohibitedActions.databaseAccess === true && gate.prohibitedActions.dockerExecution === true, "projecao possui acesso operacional");
expect(gate.prohibitedActions.realMetaEventDelivery === true && gate.prohibitedActions.buildExecution === true, "Meta ou build nao bloqueado");
expect(template.status === "not_projected" && template.projectionApproved === false, "template alegou projecao");
expect(Object.values(template.controls).every((value) => value === false), "template promoveu controles");
expect(Object.values(template.releaseGates).every((value) => value === false), "template abriu release gate");

for (const marker of [
  "validatePhase38ReadinessProjectionSources", "projectPhase38Readiness", "phase35_readiness_fingerprint_mismatch",
  "phase37_contract_fingerprint_mismatch", "phase34_unverified_control_claimed", "phase37_candidate_set_mismatch",
  "promotedControls", "confirmationOnlyControls", "remainingBlockedControls", "projected_readiness_blocked",
  "stagingMigrationAllowed", "selfTestPhase38ReadinessProjection"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase38_readiness_contract_and_reconciliation_paths_required", "phase38_source_receipt_permissions_too_open",
  "phase38_projection_rejected", "projectPhase38Readiness", "chmodSync(outputFile, 0o600)",
  "evidenceCoverage", "remainingBlockedControls", "stagingMigrationAllowed", "remoteDatabaseTouched", "buildExecuted"
]) expect(projector.includes(marker), `projetor incompleto: ${marker}`);
expect(!projector.includes("child_process") && !projector.includes("fetch(") && !projector.includes("https://"), "projetor nao e offline");
expect(workflow.includes("Validate Phase 38 readiness evidence projector without projecting"), "workflow nao valida a Fase 38");
expect(!workflow.includes("run-meta-repeatability-sample-02-readiness-evidence-projection.mjs"), "workflow projeta sem evidencia real");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-038:audit", "audit-meta-repeatability-sample-02-readiness-evidence-projection.mjs"],
  ["meta:phase-038:preflight", "preflight-meta-repeatability-sample-02-readiness-evidence-projection.mjs"],
  ["meta:phase-038:project", "run-meta-repeatability-sample-02-readiness-evidence-projection.mjs"],
  ["meta:phase-038:check", "check-meta-intelligence-phase-038.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 38/100", "8 de 15", "53%", "security_equivalence", "isolated_staging_replay_verified",
  "Nenhuma evidência real foi recebida", "projeção foi executada: não", "build executado: não", "Fase 39"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-readiness-evidence-projection.mjs"], "auditoria da projecao");
run(["scripts/preflight-meta-repeatability-sample-02-readiness-evidence-projection.mjs", "--self-test"], "autoteste da projecao");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-readiness-evidence-projection.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase38_readiness_contract_and_reconciliation_paths_required"), "projetor nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 38: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 38: aprovada — projetor offline preparado com cadeia integral de fingerprints e allowlist exata; somente 3 controles podem elevar a matriz para 8/15 (53%), mantendo staging, producao, Meta e build bloqueados ate evidencia real.");
