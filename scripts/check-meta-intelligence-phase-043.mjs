import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-043.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.permitGate));
const template = JSON.parse(read(config.permitTemplate));
const preflight = read(config.preflight);
const builder = read(config.permitBuilder);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 43 && config.mode === "sample_02_atomic_staging_replay_execution_permit", "configuracao da Fase 43 invalida");
expect(config.status === "atomic_permit_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 43 abriu gate indevido");
expect(previous.phase === 42 && previous.status === "supervisor_prepared_source_evidence_missing", "baseline da Fase 42 invalido");
expect(config.permitScope.requiredSourceFiles === 3 && config.permitScope.orderedReplayStages === 12, "fontes ou estagios do permit invalidos");
expect(config.permitScope.maximumSupervisorAgeSeconds === 300 && config.permitScope.maximumWorkerAttestationAgeSeconds === 86400, "validade do supervisor ou worker invalida");
expect(config.permitScope.maximumHumanAuthorizationAgeSeconds === 60 && config.permitScope.maximumHumanAuthorizationValiditySeconds === 120, "autorizacao humana nao e imediata");
expect(config.permitScope.maximumPermitValiditySeconds === 120 && config.permitScope.maximumConsumptionCount === 1, "permit nao e curto ou unico");
expect(config.permitScope.atomicCompareAndSwapRequired === true && config.permitScope.allOrNothingReservationRequired === true, "reserva nao e atomica");
expect(config.permitScope.aal2Required === true && config.permitScope.trustedAuthorizationSourceRequired === true, "AAL2 ou fonte confiavel ausente");
expect(config.permitScope.successfulPreparationDoesNotConsumeOrExecute === true, "preparacao consome ou executa");
expect(config.environmentAudit.staticPermitContractApproved === true && config.environmentAudit.negativePermitSelfTestsPrepared === true, "contrato ou testes offline incompletos");
expect(config.environmentAudit.offlinePermitBuilderPrepared === true && config.environmentAudit.atomicCompareAndSwapContractPrepared === true, "builder ou CAS incompleto");
expect(config.environmentAudit.aal2AndTrustedAuthorizationValidationPrepared === true, "validacao AAL2 incompleta");
expect(config.environmentAudit.phase42SupervisorReceived === false && config.environmentAudit.reviewedRuntimeWorkerAttestationReceived === false && config.environmentAudit.immediateHumanAuthorizationReceived === false, "evidencias inexistentes alegadas");
expect(config.environmentAudit.atomicExecutionPermitPrepared === false && config.environmentAudit.executionPermitAvailable === false, "permit inexistente alegado");
expect(config.environmentAudit.executionPermitConsumed === false && config.environmentAudit.oneTimeExecutionNonceConsumed === false, "permit ou nonce consumido");
expect(config.environmentAudit.supervisorStarted === false && config.environmentAudit.adapterExecuted === false && config.environmentAudit.replayExecuted === false, "execucao inexistente alegada");
expect(config.environmentAudit.databaseTouched === false && config.environmentAudit.networkTouched === false && config.environmentAudit.processSpawned === false, "toque operacional alegado");
expect(config.environmentAudit.remoteDatabaseTouched === false && config.environmentAudit.stagingTouched === false && config.environmentAudit.productionTouched === false, "ambiente remoto alegado");
expect(config.environmentAudit.metaTouched === false && config.environmentAudit.buildExecuted === false, "Meta ou build tocado");
expect(config.releaseGate.permitBuilderPrepared === true && config.releaseGate.sourceEvidenceReceived === false && config.releaseGate.atomicExecutionPermitPrepared === false, "gate de entrada invalido");
expect(config.releaseGate.atomicConsumerAvailable === false && config.releaseGate.executionPermitAvailable === false && config.releaseGate.executionPermitConsumed === false, "consumer ou permit liberado");
expect(config.releaseGate.oneTimeExecutionNonceConsumed === false && config.releaseGate.supervisorStarted === false && config.releaseGate.adapterExecuted === false, "nonce, supervisor ou adaptador consumido");
expect(config.releaseGate.replayExecutionAllowed === false && config.releaseGate.stagingMigrationAllowed === false, "replay ou staging liberado");
expect(config.releaseGate.productionMigrationAllowed === false && config.releaseGate.productionCompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "producao ou proxima fase liberada");
expect(config.governance.databaseAccess === false && config.governance.networkAccess === false && config.governance.processSpawning === false && config.governance.shellExecution === false, "governanca offline invalida");
expect(config.governance.linkedProjectAccess === false && config.governance.stagingAccess === false && config.governance.productionAccess === false, "acesso remoto indevido");
expect(config.governance.credentialPersistence === false && config.governance.rawSessionPersistence === false && config.governance.authorizationClaimsPersistence === false, "segredo ou sessao persistivel");
expect(config.governance.nonceCollection === false && config.governance.noncePersistence === false && config.governance.permitValueCollection === false, "nonce ou valor do permit coletavel");
expect(config.governance.executionPermitConsumption === false && config.governance.adapterConsumption === false && config.governance.supervisorStart === false, "consumo ou inicio permitido");
expect(config.governance.supabaseDbPush === false && config.governance.supabaseDbResetLinked === false, "comando remoto permitido");
expect(config.governance.realMetaEventDelivery === false && config.governance.deployment === false && config.governance.buildExecuted === false, "Meta, deploy ou build liberado");
expect(config.toolAudit.currentChangelogReviewed === true && config.toolAudit.breakingChangesFiltered === true, "documentacao atual nao auditada");
expect(config.toolAudit.separateStagingAndProductionAccountedFor === true && config.toolAudit.aal2AuthorizationAccountedFor === true, "isolamento ou AAL2 nao considerado");
expect(config.toolAudit.userMetadataAuthorizationForbidden === true && config.toolAudit.mandatoryCleanupAccountedFor === true, "autorizacao ou limpeza insegura");

expect(gate.phase === 43 && gate.sourcePhase === 42, "gate da Fase 43 invalido");
expect(gate.requiredSources.ephemeralReplaySupervisor.status === "supervisor_prepared_execution_blocked", "supervisor exigido invalido");
expect(gate.requiredSources.reviewedRuntimeWorkerAttestation.reviewerRole === "SECURITY_REVIEWER", "worker sem revisao de seguranca");
expect(gate.requiredSources.immediateHumanAuthorization.decision === "CONFIRM_ATOMIC_PERMIT_PREPARATION_ONLY", "autorizacao humana invalida");
expect(gate.requiredSources.immediateHumanAuthorization.environment === "staging", "autorizacao nao restrita a staging");
expect(gate.orderedReplayStages.length === 12 && gate.orderedReplayStages.at(-1) === "destroy_disposable_target", "ordem ou destruicao incompleta");
expect(gate.requiredSupervisorState.supervisorPrepared === true && gate.requiredSupervisorState.supervisorStarted === false, "supervisor iniciado aceito");
expect(gate.requiredSupervisorState.executionPermitConsumed === false && gate.requiredSupervisorState.oneTimeExecutionNonceConsumed === false && gate.requiredSupervisorState.adapterExecuted === false, "fonte consumida aceita");
expect(gate.requiredWorkerAttestationProperties.reviewed === true && gate.requiredWorkerAttestationProperties.immutableArtifact === true, "worker nao revisado ou mutavel");
expect(gate.requiredWorkerAttestationProperties.atomicCompareAndSwapRequired === true && gate.requiredWorkerAttestationProperties.rollbackAndDestructionMandatory === true, "worker sem atomicidade ou limpeza");
expect(gate.requiredHumanAuthorizationProperties.authenticationAssuranceLevel === "aal2", "AAL2 ausente");
expect(gate.requiredHumanAuthorizationProperties.trustedAuthorizationSource === "database_or_app_metadata", "fonte de autorizacao insegura");
expect(gate.requiredHumanAuthorizationProperties.permitPreparationOnly === true && gate.requiredHumanAuthorizationProperties.executionConfirmed === false, "autorizacao extrapolou preparacao");
expect(gate.requiredHumanAuthorizationProperties.rawSessionPersisted === false && gate.requiredHumanAuthorizationProperties.authorizationClaimsPersisted === false, "sessao ou claims persistidos");
expect(gate.atomicConsumptionContract.maximumConsumptionCount === 1 && gate.atomicConsumptionContract.compareAndSwapRequired === true, "permit reutilizavel ou sem CAS");
expect(gate.atomicConsumptionContract.allOrNothingRequired === true && gate.atomicConsumptionContract.partialConsumptionForbidden === true, "consumo parcial permitido");
expect(gate.atomicConsumptionContract.reservationFields.length === 5 && new Set(gate.atomicConsumptionContract.reservationFields).size === 5, "reserva atomica incompleta");
expect(gate.permitRules.humanAuthorizationMustBindSupervisorWorkerTargetAndPolicy === true && gate.permitRules.humanAuthorizationRequiresAal2 === true, "vinculo ou AAL2 incompleto");
expect(gate.permitRules.trustedAuthorizationMustNotUseUserMetadata === true && gate.permitRules.atomicConsumptionIsFutureOnly === true, "user_metadata ou consumo atual permitido");
expect(gate.permitRules.permitDoesNotStartSupervisor === true && gate.permitRules.permitDoesNotExecuteReplay === true, "permit inicia replay");
expect(Object.values(gate.requiredBlockedState).every((value) => value === false), "estado bloqueado invalido");
expect(gate.prohibitedActions.networkAccess === true && gate.prohibitedActions.processSpawning === true && gate.prohibitedActions.stagingMutation === true, "acoes operacionais liberadas");
expect(gate.prohibitedActions.permitConsumption === true && gate.prohibitedActions.supervisorStart === true && gate.prohibitedActions.buildExecution === true, "consumo, inicio ou build liberado");

expect(template.status === "not_prepared" && template.atomicExecutionPermitPrepared === false && template.currentState === "SEALED", "template alegou permit");
expect(template.consumptionState === "UNCONSUMED" && template.consumptionVersion === 0 && template.maximumConsumptionCount === 1, "template de consumo invalido");
expect(template.executionPermitAvailable === false && template.executionPermitConsumed === false && template.oneTimeExecutionNonceConsumed === false, "template disponibilizou ou consumiu permit");
expect(template.supervisorStarted === false && template.adapterExecuted === false && template.replayExecuted === false, "template alegou execucao");
expect(Object.values(template.releaseGates).every((value) => value === false), "template abriu release gate");

for (const marker of [
  "validatePhase43AtomicReplayExecutionPermitSources", "preparePhase43AtomicReplayExecutionPermit",
  "phase43PermitPolicyFingerprint", "phase42_supervisor_expired", "worker_attestation_expired",
  "human_authorization_not_immediate", "human_authorization_property_mismatch",
  "human_authorization_policy_fingerprint_mismatch",
  "atomic_permit_prepared_consumption_blocked", "reviewed_atomic_consumer_missing",
  "blocked_future_atomic_consumer", "selfTestPhase43AtomicReplayExecutionPermit"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase43_supervisor_worker_attestation_and_human_authorization_required", "phase43_source_receipt_permissions_too_open",
  "phase43_atomic_permit_rejected", "phase43_sensitive_persistence_guard_triggered",
  "preparePhase43AtomicReplayExecutionPermit", "chmodSync(outputFile, 0o600)",
  "atomicExecutionPermitPrepared", "consumptionState", "consumptionVersion", "maximumConsumptionCount",
  "atomicCompareAndSwapRequired", "allOrNothingReservationRequired", "executionPermitAvailable", "executionPermitConsumed",
  "oneTimeExecutionNonceConsumed", "supervisorStarted", "adapterExecuted", "replayExecuted",
  "remoteDatabaseTouched", "networkTouched", "processSpawned", "buildExecuted"
]) expect(builder.includes(marker), `builder incompleto: ${marker}`);
expect(!builder.includes("child_process") && !builder.includes("fetch(") && !builder.includes("https://"), "builder nao e offline");
expect(!builder.includes("createClient(") && !/from\s+["'](?:@supabase\/supabase-js|postgres|pg)["']/.test(builder) && !builder.includes("new Pool("), "builder contem cliente operacional");
expect(!builder.includes("ATLAS_PHASE43_NONCE") && !builder.includes("ATLAS_PHASE43_EXECUTION_PERMIT_VALUE") && !builder.includes("ATLAS_PHASE43_PERMIT_VALUE"), "builder coleta nonce ou valor do permit");
expect(workflow.includes("Validate Phase 43 atomic staging replay permit without issuing or consuming it"), "workflow nao valida a Fase 43");
expect(!workflow.includes("run-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs"), "workflow prepara permit sem evidencias reais");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-043:audit", "audit-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs"],
  ["meta:phase-043:preflight", "preflight-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs"],
  ["meta:phase-043:prepare", "run-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs"],
  ["meta:phase-043:check", "check-meta-intelligence-phase-043.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 43/100", "cinco minutos", "um minuto", "dois minutos", "AAL2",
  "ATOMIC_PERMIT_PREPARED_CONSUMPTION_BLOCKED", "compare-and-swap", "Nenhuma evidência real foi recebida",
  "replay foi executado: **não**", "build executado: **não**", "Fase 44"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs"], "auditoria do permit");
run(["scripts/preflight-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs", "--self-test"], "autoteste do permit");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-atomic-replay-execution-permit.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase43_supervisor_worker_attestation_and_human_authorization_required"), "builder nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 43: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 43: aprovada — permit atomico offline preparado com AAL2, fonte confiavel, validade curta e reserva compare-and-swap integral; consumo, supervisor, adaptador, replay, staging, producao, Meta e build continuam bloqueados.");
