import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-042.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.supervisorGate));
const template = JSON.parse(read(config.supervisorTemplate));
const preflight = read(config.preflight);
const builder = read(config.supervisorBuilder);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 42 && config.mode === "sample_02_ephemeral_isolated_staging_replay_supervisor", "configuracao da Fase 42 invalida");
expect(config.status === "supervisor_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 42 abriu gate indevido");
expect(previous.phase === 41 && previous.status === "adapter_prepared_source_evidence_missing", "baseline da Fase 41 invalido");
expect(config.supervisorScope.requiredSourceFiles === 2 && config.supervisorScope.orderedReplayStages === 12, "fontes ou estagios do supervisor invalidos");
expect(config.supervisorScope.stateMachineVersion === "phase42.staging-replay-state-machine.v1", "versao da maquina de estados invalida");
expect(config.supervisorScope.maximumAdapterAgeSeconds === 600 && config.supervisorScope.maximumFinalValidationAgeSeconds === 300, "validade das evidencias invalida");
expect(config.supervisorScope.maximumFinalValidationValiditySeconds === 600 && config.supervisorScope.maximumStageDurationSeconds === 900, "validade ou timeout invalido");
expect(config.supervisorScope.maximumAttemptsPerStage === 1 && config.supervisorScope.stopOnError === true, "retry ou stop-on-error invalido");
expect(config.supervisorScope.rollbackAfterFailure === true && config.supervisorScope.destroyAfterEveryOutcome === true, "rollback ou destruicao incompletos");
expect(config.supervisorScope.isolatedDisposableStagingRequired === true && config.supervisorScope.freeformCommandsForbidden === true, "isolamento ou comandos livres invalidos");
expect(config.supervisorScope.successfulPreparationDoesNotExecuteReplay === true, "preparacao autorizou replay");
expect(config.environmentAudit.staticSupervisorApproved === true && config.environmentAudit.offlineSupervisorBuilderPrepared === true, "supervisor offline incompleto");
expect(config.environmentAudit.stateTransitionValidationPrepared === true && config.environmentAudit.adapterAndPolicyFingerprintValidationPrepared === true, "validacao do supervisor incompleta");
expect(config.environmentAudit.phase41ReplayAdapterReceived === false && config.environmentAudit.finalHumanValidationReceived === false, "evidencias inexistentes alegadas");
expect(config.environmentAudit.supervisorBuilt === false && config.environmentAudit.executionPermitReceived === false, "supervisor ou permissao inexistente alegada");
expect(config.environmentAudit.executionPermitConsumed === false && config.environmentAudit.oneTimeExecutionNonceConsumed === false, "permissao ou nonce consumido");
expect(config.environmentAudit.supervisorStarted === false && config.environmentAudit.adapterExecuted === false && config.environmentAudit.replayExecuted === false, "execucao inexistente alegada");
expect(config.environmentAudit.databaseTouched === false && config.environmentAudit.networkTouched === false && config.environmentAudit.processSpawned === false, "toque operacional alegado");
expect(config.environmentAudit.remoteDatabaseTouched === false && config.environmentAudit.stagingTouched === false && config.environmentAudit.productionTouched === false, "ambiente remoto alegado");
expect(config.environmentAudit.metaTouched === false && config.environmentAudit.buildExecuted === false, "Meta ou build tocado");
expect(config.releaseGate.supervisorBuilderPrepared === true && config.releaseGate.sourceEvidenceReceived === false && config.releaseGate.supervisorPrepared === false, "gate de entrada invalido");
expect(config.releaseGate.runtimeWorkerAvailable === false && config.releaseGate.executionPermitAvailable === false && config.releaseGate.executionPermitConsumed === false, "worker ou permissao liberada");
expect(config.releaseGate.oneTimeExecutionNonceConsumed === false && config.releaseGate.replayExecutionAllowed === false && config.releaseGate.stagingMigrationAllowed === false, "nonce, replay ou staging liberado");
expect(config.releaseGate.productionMigrationAllowed === false && config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "producao ou proxima fase liberada");
expect(config.governance.databaseAccess === false && config.governance.networkAccess === false && config.governance.processSpawning === false && config.governance.shellExecution === false, "governanca offline invalida");
expect(config.governance.linkedProjectAccess === false && config.governance.stagingAccess === false && config.governance.productionAccess === false, "acesso remoto indevido");
expect(config.governance.credentialPersistence === false && config.governance.nonceCollection === false && config.governance.noncePersistence === false, "segredo ou nonce permitido");
expect(config.governance.executionPermitConsumption === false && config.governance.supabaseDbPush === false && config.governance.supabaseDbResetLinked === false, "consumo ou comando remoto permitido");
expect(config.governance.realMetaEventDelivery === false && config.governance.deployment === false && config.governance.buildExecuted === false, "Meta, deploy ou build liberado");

expect(gate.phase === 42 && gate.sourcePhase === 41, "gate da Fase 42 invalido");
expect(gate.requiredSources.oneTimeReplayAdapter.status === "adapter_prepared_execution_blocked", "adaptador exigido invalido");
expect(gate.requiredSources.finalHumanValidation.decision === "CONFIRM_SUPERVISOR_PREPARATION_ONLY", "validacao final exigida invalida");
expect(gate.requiredSources.finalHumanValidation.environment === "staging", "validacao nao restrita a staging");
expect(gate.orderedReplayStages.length === 12 && gate.stageStates.length === 12, "ordem ou estados incompletos");
expect(gate.orderedReplayStages.at(-1) === "destroy_disposable_target", "destruicao nao e ultimo estagio");
expect(gate.stateMachine.preparedState === "SUPERVISOR_PREPARED_EXECUTION_BLOCKED", "estado preparado invalido");
expect(gate.stateMachine.failureState === "HALTED_ROLLBACK_REQUIRED" && gate.stateMachine.rollbackState === "EMERGENCY_ROLLBACK_REQUIRED", "estados de falha invalidos");
expect(gate.stateMachine.cleanupState === "DESTROYING_TARGET_REQUIRED" && gate.stateMachine.terminalState === "DESTROYED", "estados de limpeza invalidos");
expect(gate.stateMachine.maximumAttemptsPerStage === 1 && gate.stateMachine.stopOnError === true && gate.stateMachine.stopOnTimeout === true, "politica de tentativa invalida");
expect(gate.stateMachine.rollbackAfterFailure === true && gate.stateMachine.destroyAfterSuccess === true && gate.stateMachine.destroyAfterFailure === true, "rollback ou destruicao invalida");
expect(gate.requiredAdapterState.oneTimeExecutionNonceConsumed === false && gate.requiredAdapterState.adapterExecuted === false && gate.requiredAdapterState.replayExecuted === false, "adaptador consumido aceito");
expect(gate.requiredFinalValidationProperties.preparationOnly === true && gate.requiredFinalValidationProperties.executionConfirmed === false, "validacao extrapolou preparacao");
expect(gate.requiredFinalValidationProperties.productionConfirmed === false && gate.requiredFinalValidationProperties.metaConfirmed === false && gate.requiredFinalValidationProperties.buildConfirmed === false, "validacao extrapolou staging");
expect(gate.supervisorRules.freeformCommandsForbidden === true && gate.supervisorRules.shellFragmentsForbidden === true, "comando livre permitido");
expect(gate.supervisorRules.linkedProjectForbidden === true && gate.supervisorRules.databaseUrlsForbidden === true && gate.supervisorRules.credentialsForbidden === true, "alvo ou credencial permitida");
expect(gate.supervisorRules.stopOnErrorMandatory === true && gate.supervisorRules.rollbackMandatoryAfterFailure === true && gate.supervisorRules.targetDestructionMandatory === true, "seguranca de falha incompleta");
expect(gate.supervisorRules.supervisorDoesNotExecuteReplay === true, "supervisor executa replay");
expect(Object.values(gate.requiredBlockedState).every((value) => value === false), "estado bloqueado invalido");
expect(gate.prohibitedActions.networkAccess === true && gate.prohibitedActions.processSpawning === true && gate.prohibitedActions.stagingMutation === true, "acoes operacionais liberadas");
expect(gate.prohibitedActions.executionPermitConsumption === true && gate.prohibitedActions.adapterConsumption === true && gate.prohibitedActions.buildExecution === true, "consumo ou build liberado");
expect(template.status === "not_prepared" && template.supervisorPrepared === false && template.supervisorStarted === false, "template alegou supervisor");
expect(template.executionPermitConsumed === false && template.oneTimeExecutionNonceConsumed === false && template.adapterExecuted === false && template.replayExecuted === false, "template alegou consumo ou replay");
expect(template.stopOnError === true && template.rollbackRequiredAfterFailure === true && template.targetDestructionRequired === true, "template sem seguranca de falha");
expect(Object.values(template.releaseGates).every((value) => value === false), "template abriu release gate");

for (const marker of [
  "validatePhase42EphemeralStagingReplaySupervisorSources", "preparePhase42EphemeralStagingReplaySupervisor",
  "phase42SupervisorPolicyFingerprint", "phase41_replay_adapter_expired", "phase41_replay_adapter_stage_order_mismatch",
  "final_human_validation_adapter_fingerprint_mismatch", "final_human_validation_policy_fingerprint_mismatch",
  "final_human_validation_not_immediate", "supervisor_prepared_execution_blocked",
  "runtime_worker_and_atomic_execution_permit_missing", "HALTED_ROLLBACK_REQUIRED", "EMERGENCY_ROLLBACK_REQUIRED",
  "DESTROYING_TARGET_REQUIRED", "blocked_manual_escalation_required", "selfTestPhase42EphemeralStagingReplaySupervisor"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase42_adapter_and_final_human_validation_required", "phase42_source_receipt_permissions_too_open",
  "phase42_supervisor_rejected", "phase42_sensitive_persistence_guard_triggered",
  "preparePhase42EphemeralStagingReplaySupervisor", "chmodSync(outputFile, 0o600)",
  "supervisorPrepared", "executionPermitConsumed", "oneTimeExecutionNonceConsumed", "supervisorStarted",
  "adapterExecuted", "replayExecuted", "remoteDatabaseTouched", "networkTouched", "processSpawned", "buildExecuted"
]) expect(builder.includes(marker), `builder incompleto: ${marker}`);
expect(!builder.includes("child_process") && !builder.includes("fetch(") && !builder.includes("https://"), "builder nao e offline");
expect(!builder.includes("createClient(") && !/from\s+["'](?:@supabase\/supabase-js|postgres|pg)["']/.test(builder) && !builder.includes("child_process"), "builder contem cliente ou comando operacional");
expect(!builder.includes("ATLAS_PHASE41_ONE_TIME_EXECUTION_NONCE") && !builder.includes("ATLAS_PHASE42_EXECUTION_PERMIT"), "builder coleta nonce ou permissao");
expect(workflow.includes("Validate Phase 42 ephemeral staging replay supervisor without building or executing it"), "workflow nao valida a Fase 42");
expect(!workflow.includes("run-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs"), "workflow prepara supervisor sem evidencias reais");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-042:audit", "audit-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs"],
  ["meta:phase-042:preflight", "preflight-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs"],
  ["meta:phase-042:prepare", "run-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs"],
  ["meta:phase-042:check", "check-meta-intelligence-phase-042.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 42/100", "cinco minutos", "dez minutos", "quinze minutos", "SUPERVISOR_PREPARED_EXECUTION_BLOCKED",
  "Nenhuma evidência real foi recebida", "replay foi executado: **não**", "build executado: **não**", "Fase 43"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs"], "auditoria do supervisor");
run(["scripts/preflight-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs", "--self-test"], "autoteste do supervisor");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-ephemeral-staging-replay-supervisor.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase42_adapter_and_final_human_validation_required"), "builder nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 42: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 42: aprovada — supervisor efemero offline preparado com maquina de estados, stop-on-error, rollback e destruicao obrigatoria; worker, permissao, consumo, replay, staging, producao, Meta e build continuam bloqueados.");
