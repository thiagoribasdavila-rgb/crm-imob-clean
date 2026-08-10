import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-040.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.executionPacketGate));
const template = JSON.parse(read(config.executionPacketTemplate));
const preflight = read(config.preflight);
const builder = read(config.executionPacketBuilder);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 40 && config.mode === "sample_02_isolated_staging_replay_execution_packet", "configuracao da Fase 40 invalida");
expect(config.status === "execution_packet_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 40 abriu gate indevido");
expect(previous.phase === 39 && previous.status === "staging_replay_contract_prepared_source_evidence_missing", "baseline da Fase 39 invalido");
expect(config.packetScope.requiredSources === 4 && config.packetScope.orderedReplayStages === 12, "fontes ou estagios invalidos");
expect(config.packetScope.maximumExecutionApprovalHours === 4 && config.packetScope.maximumWindowMinutes === 120, "limites temporais invalidos");
expect(config.packetScope.isolatedDisposableStagingRequired === true && config.packetScope.sanitizedDataOnly === true, "isolamento de staging incompleto");
expect(config.packetScope.credentialValuesForbiddenInArtifacts === true, "credenciais poderiam ser persistidas");
expect(config.packetScope.separateHumanExecutionApprovalRequired === true && config.packetScope.oneTimeImmediateConfirmationStillRequired === true, "aprovacoes nao separadas");
expect(config.packetScope.successfulPacketDoesNotExecuteReplay === true, "pacote autorizou replay indevido");
expect(config.environmentAudit.staticPacketApproved === true && config.environmentAudit.offlinePacketBuilderPrepared === true, "builder offline incompleto");
expect(config.environmentAudit.phase39ContractReceived === false && config.environmentAudit.operationalWindowReceived === false, "contrato ou janela inexistente alegados");
expect(config.environmentAudit.credentialAttestationReceived === false && config.environmentAudit.humanExecutionApprovalReceived === false, "atestacao ou aprovacao inexistente alegada");
expect(config.environmentAudit.executionPacketBuilt === false && config.environmentAudit.replayExecuted === false, "pacote ou replay inexistente alegado");
expect(config.environmentAudit.databaseTouched === false && config.environmentAudit.remoteDatabaseTouched === false && config.environmentAudit.stagingTouched === false, "toque operacional alegado");
expect(config.environmentAudit.productionTouched === false && config.environmentAudit.metaTouched === false && config.environmentAudit.buildExecuted === false, "producao, Meta ou build tocado");
expect(config.releaseGate.packetBuilderPrepared === true && config.releaseGate.sourceEvidenceReceived === false && config.releaseGate.executionPacketPrepared === false, "gate do pacote invalido");
expect(config.releaseGate.oneTimeExecutionConfirmationReceived === false && config.releaseGate.replayExecutionAllowed === false, "confirmacao ou replay liberado");
expect(config.releaseGate.stagingMigrationAllowed === false && config.releaseGate.productionMigrationAllowed === false, "staging ou producao liberado");
expect(config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "producao ou proxima fase liberada");
expect(config.governance.databaseAccess === false && config.governance.dockerExecution === false && config.governance.remoteDatabaseAccess === false, "governanca offline invalida");
expect(config.governance.stagingAccess === false && config.governance.productionAccess === false && config.governance.supabaseDbPush === false, "acesso remoto indevido");
expect(config.governance.credentialCollection === false && config.governance.credentialPersistence === false, "credenciais coletadas ou persistidas");
expect(config.governance.realMetaEventDelivery === false && config.governance.deployment === false && config.governance.buildExecuted === false, "Meta, deploy ou build liberado");

expect(gate.phase === 40 && gate.sourcePhase === 39, "gate da Fase 40 invalido");
expect(gate.requiredSources.stagingReplayContract.status === "contract_prepared_replay_blocked", "contrato exigido invalido");
expect(gate.requiredSources.operationalWindow.environment === "staging", "janela de staging invalida");
expect(gate.requiredSources.credentialAttestation.status === "verified_in_memory_only", "atestacao exigida invalida");
expect(gate.requiredSources.humanExecutionApproval.decision === "EXECUTE_ISOLATED_STAGING_ONLY", "escopo da aprovacao invalido");
expect(gate.orderedReplayStages.length === 12, "ordem de replay incompleta");
expect(gate.requiredWindowProperties.productionTarget === false && gate.requiredWindowProperties.productionDataAllowed === false, "alvo ou dados de producao permitidos");
expect(gate.requiredWindowProperties.destroyTargetAtEnd === true && gate.requiredWindowProperties.rollbackOnFailure === true, "rollback ou destruicao incompletos");
expect(gate.requiredCredentialProperties.persisted === false && gate.requiredCredentialProperties.logged === false, "credenciais persistidas ou registradas");
expect(gate.requiredCredentialProperties.productionCredential === false && gate.requiredCredentialProperties.leastPrivilege === true, "credencial insegura permitida");
expect(gate.requiredApprovalProperties.stagingExecutionApproved === true && gate.requiredApprovalProperties.productionApproved === false, "aprovacao extrapolou staging");
expect(gate.packetRules.approvalCannotBeInferredFromPhase39 === true && gate.packetRules.packetDoesNotExecuteReplay === true, "limites do pacote ausentes");
expect(gate.packetRules.oneTimeImmediateConfirmationRequired === true && gate.packetRules.oneTimeNonceRequired === true, "confirmacao de uso unico ausente");
expect(Object.values(gate.requiredBlockedState).every((value) => value === false), "estado bloqueado invalido");
expect(gate.prohibitedActions.stagingMutation === true && gate.prohibitedActions.productionMutation === true && gate.prohibitedActions.buildExecution === true, "acoes operacionais liberadas");
expect(template.status === "not_prepared" && template.executionPacketPrepared === false && template.replayExecuted === false, "template alegou pacote ou replay");
expect(template.oneTimeExecutionConfirmationReceived === false && template.oneTimeExecutionNonceConsumed === false, "template alegou confirmacao");
expect(Object.values(template.releaseGates).every((value) => value === false), "template abriu release gate");

for (const marker of [
  "validatePhase40StagingReplayExecutionPacketSources", "preparePhase40StagingReplayExecutionPacket",
  "phase39_contract_stage_order_mismatch", "operational_window_duration_invalid",
  "credential_attestation_does_not_cover_window", "execution_approval_attestation_fingerprint_mismatch",
  "execution_approval_does_not_cover_window", "execution_packet_prepared_replay_blocked",
  "one_time_execution_confirmation_missing", "selfTestPhase40StagingReplayExecutionPacket"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase40_contract_window_attestation_and_execution_approval_paths_required", "phase40_source_receipt_permissions_too_open",
  "phase40_execution_packet_rejected", "preparePhase40StagingReplayExecutionPacket", "chmodSync(outputFile, 0o600)",
  "oneTimeExecutionConfirmationReceived", "oneTimeExecutionNonceConsumed", "replayExecuted", "replayExecutionAllowed",
  "remoteDatabaseTouched", "buildExecuted"
]) expect(builder.includes(marker), `builder incompleto: ${marker}`);
expect(!builder.includes("child_process") && !builder.includes("fetch(") && !builder.includes("https://"), "builder nao e offline");
expect(workflow.includes("Validate Phase 40 isolated staging replay execution packet without building or executing it"), "workflow nao valida a Fase 40");
expect(!workflow.includes("run-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs"), "workflow prepara pacote sem evidencias reais");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-040:audit", "audit-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs"],
  ["meta:phase-040:preflight", "preflight-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs"],
  ["meta:phase-040:prepare", "run-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs"],
  ["meta:phase-040:check", "check-meta-intelligence-phase-040.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 40/100", "120 minutos", "EXECUTE_ISOLATED_STAGING_ONLY", "nonce de uso único",
  "Nenhuma evidência real foi recebida", "replay foi executado: **não**", "build executado: **não**", "Fase 41"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs"], "auditoria do pacote");
run(["scripts/preflight-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs", "--self-test"], "autoteste do pacote");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-isolated-staging-replay-execution-packet.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase40_contract_window_attestation_and_execution_approval_paths_required"), "builder nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 40: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 40: aprovada — pacote offline de execucao preparado com contrato, janela, atestacao de credenciais e aprovacao humana vinculados por fingerprints; confirmacao de uso unico, replay, staging, producao, Meta e build continuam bloqueados.");
