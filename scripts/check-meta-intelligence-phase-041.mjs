import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-041.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.adapterGate));
const template = JSON.parse(read(config.adapterTemplate));
const preflight = read(config.preflight);
const builder = read(config.adapterBuilder);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 41 && config.mode === "sample_02_isolated_staging_one_time_replay_adapter", "configuracao da Fase 41 invalida");
expect(config.status === "adapter_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 41 abriu gate indevido");
expect(previous.phase === 40 && previous.status === "execution_packet_prepared_source_evidence_missing", "baseline da Fase 40 invalido");
expect(config.adapterScope.requiredSourceFiles === 2 && config.adapterScope.requiredRuntimeNonce === true, "fontes do adaptador invalidas");
expect(config.adapterScope.orderedReplayStages === 12 && config.adapterScope.nonceBits === 256, "estagios ou nonce invalidos");
expect(config.adapterScope.maximumConfirmationAgeSeconds === 300 && config.adapterScope.maximumConfirmationValiditySeconds === 600, "limites da confirmacao invalidos");
expect(config.adapterScope.isolatedDisposableStagingRequired === true && config.adapterScope.freeformCommandsForbidden === true, "isolamento ou allowlist incompletos");
expect(config.adapterScope.linkedProjectForbidden === true && config.adapterScope.credentialAndNonceValuesForbiddenInArtifacts === true, "projeto vinculado ou segredo permitido");
expect(config.adapterScope.successfulAdapterDoesNotExecuteReplay === true, "adaptador autorizou replay indevido");
expect(config.environmentAudit.staticAdapterApproved === true && config.environmentAudit.offlineAdapterBuilderPrepared === true, "builder offline incompleto");
expect(config.environmentAudit.phase40ExecutionPacketReceived === false && config.environmentAudit.immediateHumanConfirmationReceived === false, "evidencias inexistentes alegadas");
expect(config.environmentAudit.oneTimeExecutionNonceReceived === false && config.environmentAudit.executionAdapterBuilt === false, "nonce ou adaptador inexistente alegado");
expect(config.environmentAudit.adapterExecuted === false && config.environmentAudit.replayExecuted === false, "adaptador ou replay inexistente alegado");
expect(config.environmentAudit.databaseTouched === false && config.environmentAudit.networkTouched === false && config.environmentAudit.processSpawned === false, "toque operacional alegado");
expect(config.environmentAudit.remoteDatabaseTouched === false && config.environmentAudit.stagingTouched === false && config.environmentAudit.productionTouched === false, "ambiente remoto alegado");
expect(config.environmentAudit.metaTouched === false && config.environmentAudit.buildExecuted === false, "Meta ou build tocado");
expect(config.releaseGate.adapterBuilderPrepared === true && config.releaseGate.sourceEvidenceReceived === false && config.releaseGate.runtimeNonceReceived === false, "gate de entrada invalido");
expect(config.releaseGate.executionAdapterPrepared === false && config.releaseGate.oneTimeExecutionNonceConsumed === false, "adaptador ou nonce liberado");
expect(config.releaseGate.replayExecutionAllowed === false && config.releaseGate.stagingMigrationAllowed === false, "replay ou staging liberado");
expect(config.releaseGate.productionMigrationAllowed === false && config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "producao ou proxima fase liberada");
expect(config.governance.databaseAccess === false && config.governance.networkAccess === false && config.governance.processSpawning === false && config.governance.shellExecution === false, "governanca offline invalida");
expect(config.governance.linkedProjectAccess === false && config.governance.stagingAccess === false && config.governance.productionAccess === false, "acesso remoto indevido");
expect(config.governance.credentialPersistence === false && config.governance.noncePersistence === false && config.governance.nonceLogging === false, "segredo persistido ou registrado");
expect(config.governance.realMetaEventDelivery === false && config.governance.deployment === false && config.governance.buildExecuted === false, "Meta, deploy ou build liberado");

expect(gate.phase === 41 && gate.sourcePhase === 40, "gate da Fase 41 invalido");
expect(gate.requiredSources.executionPacket.status === "execution_packet_prepared_replay_blocked", "pacote exigido invalido");
expect(gate.requiredSources.immediateHumanConfirmation.decision === "CONFIRM_STAGING_REPLAY_ONCE", "confirmacao exigida invalida");
expect(gate.requiredSources.immediateHumanConfirmation.environment === "staging", "confirmacao nao restrita a staging");
expect(gate.orderedReplayStages.length === 12, "ordem de replay incompleta");
expect(gate.requiredPacketState.oneTimeExecutionConfirmationReceived === false && gate.requiredPacketState.oneTimeExecutionNonceConsumed === false, "pacote ja consumido aceito");
expect(gate.requiredConfirmationProperties.noncePersisted === false && gate.requiredConfirmationProperties.nonceLogged === false, "nonce persistido ou logado");
expect(gate.requiredConfirmationProperties.productionConfirmed === false && gate.requiredConfirmationProperties.metaConfirmed === false && gate.requiredConfirmationProperties.buildConfirmed === false, "confirmacao extrapolou staging");
expect(gate.adapterRules.adapterCannotContainFreeformCommands === true && gate.adapterRules.stagePlanUsesAllowlistedIdentifiersOnly === true, "comando livre permitido");
expect(gate.adapterRules.linkedProjectForbidden === true && gate.adapterRules.databaseUrlsForbidden === true, "alvo remoto persistente permitido");
expect(gate.adapterRules.nonceValueForbiddenInArtifacts === true && gate.adapterRules.adapterDoesNotExecuteReplay === true, "nonce ou replay inseguro");
expect(Object.values(gate.requiredBlockedState).every((value) => value === false), "estado bloqueado invalido");
expect(gate.prohibitedActions.networkAccess === true && gate.prohibitedActions.processSpawning === true && gate.prohibitedActions.stagingMutation === true, "acoes operacionais liberadas");
expect(template.status === "not_prepared" && template.executionAdapterPrepared === false && template.adapterExecuted === false && template.replayExecuted === false, "template alegou adaptador ou replay");
expect(template.oneTimeExecutionNonceConsumed === false && Object.values(template.releaseGates).every((value) => value === false), "template abriu release gate");

for (const marker of [
  "validatePhase41OneTimeReplayAdapterSources", "preparePhase41OneTimeReplayAdapter",
  "phase40_execution_packet_stage_order_mismatch", "immediate_confirmation_packet_fingerprint_mismatch",
  "immediate_confirmation_nonce_fingerprint_mismatch", "immediate_confirmation_not_immediate",
  "one_time_execution_nonce_entropy_too_low", "adapter_prepared_execution_blocked",
  "ephemeral_runtime_supervisor_missing", "selfTestPhase41OneTimeReplayAdapter"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase41_packet_confirmation_and_runtime_nonce_required", "phase41_source_receipt_permissions_too_open",
  "phase41_replay_adapter_rejected", "phase41_nonce_persistence_guard_triggered",
  "preparePhase41OneTimeReplayAdapter", "chmodSync(outputFile, 0o600)",
  "oneTimeExecutionNonceVerified", "oneTimeExecutionNonceConsumed", "executionAdapterPrepared",
  "adapterExecuted", "replayExecuted", "remoteDatabaseTouched", "networkTouched", "processSpawned", "buildExecuted"
]) expect(builder.includes(marker), `builder incompleto: ${marker}`);
expect(!builder.includes("child_process") && !builder.includes("fetch(") && !builder.includes("https://"), "builder nao e offline");
expect(!builder.includes("createClient(") && !builder.includes("postgres(") && !builder.includes("supabase db push"), "builder contem cliente ou comando operacional");
expect(workflow.includes("Validate Phase 41 one-time staging replay adapter without building or executing it"), "workflow nao valida a Fase 41");
expect(!workflow.includes("run-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs"), "workflow prepara adaptador sem evidencias reais");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-041:audit", "audit-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs"],
  ["meta:phase-041:preflight", "preflight-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs"],
  ["meta:phase-041:prepare", "run-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs"],
  ["meta:phase-041:check", "check-meta-intelligence-phase-041.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 41/100", "cinco minutos", "dez minutos", "256 bits", "nonce não pode existir em arquivo",
  "Nenhuma evidência real foi recebida", "replay foi executado: **não**", "build executado: **não**", "Fase 42"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs"], "auditoria do adaptador");
run(["scripts/preflight-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs", "--self-test"], "autoteste do adaptador");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-isolated-staging-one-time-replay-adapter.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase41_packet_confirmation_and_runtime_nonce_required"), "builder nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 41: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 41: aprovada — adaptador offline de uso unico preparado com pacote, confirmacao humana imediata e nonce de 256 bits vinculados por fingerprints; consumo, replay, staging, producao, Meta e build continuam bloqueados.");
