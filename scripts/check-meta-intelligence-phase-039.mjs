import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-039.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.contractGate));
const template = JSON.parse(read(config.contractTemplate));
const preflight = read(config.preflight);
const builder = read(config.contractBuilder);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 39 && config.mode === "sample_02_isolated_staging_replay_contract", "configuracao da Fase 39 invalida");
expect(config.status === "staging_replay_contract_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 39 abriu gate indevido");
expect(previous.phase === 38 && previous.status === "readiness_projection_prepared_source_evidence_missing", "baseline da Fase 38 invalido");
expect(config.contractScope.requiredSources === 4 && config.contractScope.projectedVerifiedControlsRequired === 8, "fontes ou cobertura invalidas");
expect(config.contractScope.requiredControls === 15 && config.contractScope.requiredCoveragePercent === 53, "matriz ou percentual invalido");
expect(config.contractScope.isolatedDisposableStagingRequired === true && config.contractScope.productionDataForbidden === true, "isolamento de staging incompleto");
expect(config.contractScope.explicitHumanContractApprovalRequired === true && config.contractScope.separateExecutionApprovalRequired === true, "aprovacoes nao separadas");
expect(config.contractScope.successfulContractDoesNotAuthorizeReplay === true, "contrato autorizou replay indevido");
expect(config.environmentAudit.staticContractApproved === true && config.environmentAudit.offlineContractBuilderPrepared === true, "builder offline incompleto");
expect(config.environmentAudit.phase38ProjectionReceived === false && config.environmentAudit.stagingTargetManifestReceived === false, "origem inexistente foi alegada");
expect(config.environmentAudit.rollbackPlanReceived === false && config.environmentAudit.humanContractApprovalReceived === false, "rollback ou aprovacao inexistente alegado");
expect(config.environmentAudit.contractBuilt === false && config.environmentAudit.replayExecuted === false, "contrato ou replay inexistente alegado");
expect(config.environmentAudit.databaseTouched === false && config.environmentAudit.remoteDatabaseTouched === false && config.environmentAudit.stagingTouched === false, "toque operacional alegado");
expect(config.environmentAudit.productionTouched === false && config.environmentAudit.metaTouched === false && config.environmentAudit.buildExecuted === false, "producao, Meta ou build tocado");
expect(config.releaseGate.contractBuilderPrepared === true && config.releaseGate.sourceEvidenceReceived === false && config.releaseGate.contractPrepared === false, "gate do contrato invalido");
expect(config.releaseGate.replayExecutionAllowed === false && config.releaseGate.stagingMigrationAllowed === false, "replay ou staging liberado");
expect(config.releaseGate.productionMigrationAllowed === false && config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "producao ou proxima fase liberada");
expect(config.governance.databaseAccess === false && config.governance.dockerExecution === false && config.governance.remoteDatabaseAccess === false, "governanca offline invalida");
expect(config.governance.stagingAccess === false && config.governance.productionAccess === false && config.governance.supabaseDbPush === false, "acesso remoto indevido");
expect(config.governance.realMetaEventDelivery === false && config.governance.deployment === false && config.governance.buildExecuted === false, "Meta, deploy ou build liberado");

expect(gate.phase === 39 && gate.sourcePhase === 38, "gate da Fase 39 invalido");
expect(gate.requiredSources.readinessProjection.status === "projected_readiness_blocked", "projecao exigida invalida");
expect(gate.requiredSources.stagingTarget.environment === "staging", "alvo de staging invalido");
expect(gate.requiredSources.humanApproval.decision === "APPROVE_CONTRACT_ONLY", "escopo da aprovacao invalido");
expect(gate.requiredControlOrder.length === 15 && gate.requiredVerifiedControls.length === 8 && gate.requiredBlockedControls.length === 7, "matriz de controles incompleta");
expect(gate.requiredTargetProperties.isolated === true && gate.requiredTargetProperties.disposable === true, "staging nao isolado ou descartavel");
expect(gate.requiredTargetProperties.productionTarget === false && gate.requiredTargetProperties.containsProductionData === false, "alvo ou dados de producao permitidos");
expect(gate.requiredRollbackProperties.rollbackOnFailure === true && gate.requiredRollbackProperties.targetDestructionAfterReplay === true, "rollback incompleto");
expect(gate.contractRules.executionRequiresSeparateApproval === true && gate.contractRules.contractDoesNotAuthorizeReplay === true, "limites do contrato ausentes");
expect(Object.values(gate.requiredBlockedState).every((value) => value === false), "estado bloqueado invalido");
expect(gate.prohibitedActions.stagingMutation === true && gate.prohibitedActions.productionMutation === true && gate.prohibitedActions.buildExecution === true, "acoes operacionais liberadas");
expect(template.status === "not_prepared" && template.contractPrepared === false && template.replayExecuted === false, "template alegou contrato ou replay");
expect(Object.values(template.releaseGates).every((value) => value === false), "template abriu release gate");

for (const marker of [
  "validatePhase39StagingReplayContractSources", "preparePhase39StagingReplayContract", "phase38_required_control_missing",
  "staging_target_property_mismatch", "rollback_plan_property_mismatch", "human_approval_projection_fingerprint_mismatch",
  "human_approval_expired_or_future", "contract_prepared_replay_blocked", "replayExecutionAllowed",
  "selfTestPhase39StagingReplayContract"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase39_projection_target_rollback_and_approval_paths_required", "phase39_source_receipt_permissions_too_open",
  "phase39_contract_rejected", "preparePhase39StagingReplayContract", "chmodSync(outputFile, 0o600)",
  "replayExecuted", "replayExecutionAllowed", "remoteDatabaseTouched", "buildExecuted"
]) expect(builder.includes(marker), `builder incompleto: ${marker}`);
expect(!builder.includes("child_process") && !builder.includes("fetch(") && !builder.includes("https://"), "builder nao e offline");
expect(workflow.includes("Validate Phase 39 isolated staging replay contract without building it"), "workflow nao valida a Fase 39");
expect(!workflow.includes("run-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs"), "workflow prepara contrato sem evidencias reais");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-039:audit", "audit-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs"],
  ["meta:phase-039:preflight", "preflight-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs"],
  ["meta:phase-039:prepare", "run-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs"],
  ["meta:phase-039:check", "check-meta-intelligence-phase-039.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 39/100", "8 de 15", "53%", "staging isolado", "APPROVE_CONTRACT_ONLY",
  "Nenhuma evidência real foi recebida", "replay foi executado: não", "build executado: não", "Fase 40"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs"], "auditoria do contrato");
run(["scripts/preflight-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs", "--self-test"], "autoteste do contrato");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-isolated-staging-replay-contract.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase39_projection_target_rollback_and_approval_paths_required"), "builder nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 39: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 39: aprovada — contrato offline de replay em staging isolado preparado com projecao 8/15, alvo descartavel, rollback e aprovacao humana vinculados por fingerprints; execucao, staging, producao, Meta e build continuam bloqueados.");
