import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-044.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.consumerGate));
const template = JSON.parse(read(config.consumerTemplate));
const preflight = read(config.preflight);
const builder = read(config.consumerBuilder);
const audit = read(config.staticAudit);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 44 && config.mode === "sample_02_atomic_consumer_ephemeral_worker", "configuracao da Fase 44 invalida");
expect(config.status === "atomic_consumer_plan_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 44 abriu gate indevido");
expect(previous.phase === 43 && previous.status === "atomic_permit_prepared_source_evidence_missing", "baseline da Fase 43 invalido");
expect(config.consumerScope.requiredSourceFiles === 3 && config.consumerScope.futureAtomicTransactionSteps === 12, "fontes ou etapas atomicas invalidas");
expect(config.consumerScope.workerLifecycleStates === 7 && config.consumerScope.atomicReservationFieldCount === 5, "ciclo do worker ou reserva invalida");
expect(config.consumerScope.maximumPermitAgeSeconds === 120 && config.consumerScope.maximumConsumerAttestationAgeSeconds === 86400, "validade do permit ou atestado invalida");
expect(config.consumerScope.maximumHumanAuthorizationAgeSeconds === 60 && config.consumerScope.maximumHumanAuthorizationValiditySeconds === 120, "autorizacao humana nao e imediata");
expect(config.consumerScope.maximumConsumerPlanValiditySeconds === 120 && config.consumerScope.maximumConsumptionCount === 1, "plano nao e curto ou unico");
expect(config.consumerScope.exactlyOneReservationRequired === true && config.consumerScope.ambiguousCommitRetryForbidden === true, "reserva unica ou bloqueio de retry ausente");
expect(config.consumerScope.aal2Required === true && config.consumerScope.trustedAuthorizationSourceRequired === true, "AAL2 ou fonte confiavel ausente");
expect(config.consumerScope.successfulPreparationDoesNotConsumeArmOrExecute === true, "preparacao consome, arma ou executa");

expect(config.environmentAudit.staticConsumerContractApproved === true && config.environmentAudit.negativeConsumerSelfTestsPrepared === true, "contrato ou testes offline incompletos");
expect(config.environmentAudit.offlineConsumerBuilderPrepared === true && config.environmentAudit.atomicTransactionBoundaryContractPrepared === true, "builder ou fronteira atomica incompleta");
expect(config.environmentAudit.commitUnknownReconciliationPrepared === true && config.environmentAudit.aal2AndTrustedAuthorizationValidationPrepared === true, "reconciliacao ou autorizacao incompleta");
for (const field of [
  "phase43PermitReceived", "reviewedConsumerWorkerAttestationReceived", "immediateHumanAuthorizationReceived",
  "atomicConsumerPlanPrepared", "atomicConsumerAvailable", "consumerArmed", "executionPermitAvailable",
  "executionPermitConsumed", "oneTimeExecutionNonceConsumed", "supervisorStarted", "adapterExecuted", "replayExecuted",
  "databaseTouched", "networkTouched", "processSpawned", "dockerTouched", "remoteDatabaseTouched",
  "stagingTouched", "productionTouched", "metaTouched", "buildExecuted"
]) expect(config.environmentAudit[field] === false, `estado operacional indevido: ${field}`);

expect(config.releaseGate.consumerBuilderPrepared === true && config.releaseGate.sourceEvidenceReceived === false, "gate de fontes invalido");
for (const field of [
  "atomicConsumerPlanPrepared", "runtimeTransactionBoundaryAvailable", "finalExecutionAuthorizationAvailable",
  "atomicConsumerAvailable", "consumerArmed", "executionPermitAvailable", "executionPermitConsumed",
  "oneTimeExecutionNonceConsumed", "supervisorStarted", "adapterExecuted", "replayExecutionAllowed",
  "stagingMigrationAllowed", "productionMigrationAllowed", "productionCompatibilityApproved", "nextPhaseAllowed"
]) expect(config.releaseGate[field] === false, `release gate aberto: ${field}`);

for (const field of [
  "databaseAccess", "networkAccess", "processSpawning", "shellExecution", "dockerExecution", "remoteDatabaseAccess",
  "linkedProjectAccess", "stagingAccess", "productionAccess", "databaseFunctionCreation", "migrationCreation",
  "credentialCollection", "credentialPersistence", "rawSessionPersistence", "authorizationClaimsPersistence",
  "nonceCollection", "noncePersistence", "permitValueCollection", "executionPermitConsumption", "adapterConsumption",
  "supervisorStart", "workerArm", "workerStart", "supabaseDbPush", "supabaseDbResetLinked",
  "realMetaEventDelivery", "testMetaEventDelivery", "campaignMutation", "deployment", "buildExecuted"
]) expect(config.governance[field] === false, `governanca permitiu operacao: ${field}`);
expect(config.governance.sourceFilesMustRemainInsideWorkspace === true && config.governance.symbolicLinksRejected === true, "isolamento de arquivos invalido");
expect(config.governance.sourceReceiptPermissions === "0600" && config.governance.consumerPlanPermissions === "0600", "permissoes de arquivo invalidas");

expect(config.toolAudit.currentChangelogReviewed === true && config.toolAudit.breakingChangesFiltered === true, "documentacao atual nao auditada");
expect(config.toolAudit.databaseFunctionsGuideReviewed === true && config.toolAudit.securityInvokerPreferred === true, "guia de funcoes ou invoker ausente");
expect(config.toolAudit.securityDefinerSearchPathRuleAccountedFor === true && config.toolAudit.functionPrivilegesRestrictionAccountedFor === true, "definer ou privilegios nao tratados");
expect(config.toolAudit.rowLevelSecurityGuideReviewed === true && config.toolAudit.environmentManagementGuideReviewed === true, "RLS ou ambientes nao tratados");
expect(config.toolAudit.separateStagingAndProductionAccountedFor === true && config.toolAudit.aal2AuthorizationAccountedFor === true, "isolamento ou AAL2 nao considerado");
expect(config.toolAudit.userMetadataAuthorizationForbidden === true && config.toolAudit.mandatoryCleanupAccountedFor === true, "autorizacao ou limpeza insegura");

expect(gate.phase === 44 && gate.sourcePhase === 43, "gate da Fase 44 invalido");
expect(gate.requiredSources.atomicReplayExecutionPermit.status === "atomic_permit_prepared_consumption_blocked", "permit exigido invalido");
expect(gate.requiredSources.reviewedAtomicConsumerWorkerAttestation.reviewerRole === "SECURITY_REVIEWER", "consumer sem revisao de seguranca");
expect(gate.requiredSources.immediateHumanAuthorization.decision === "CONFIRM_ATOMIC_CONSUMER_PREPARATION_ONLY", "autorizacao humana invalida");
expect(gate.requiredSources.immediateHumanAuthorization.environment === "staging", "autorizacao nao restrita a staging");
expect(gate.atomicReservationFields.length === 5 && new Set(gate.atomicReservationFields).size === 5, "reserva atomica incompleta");
expect(gate.futureAtomicTransactionPlan.length === 12 && gate.futureAtomicTransactionPlan.at(-1) === "destroy_worker_and_disposable_target_after_outcome", "transacao ou limpeza incompleta");
expect(gate.futureAtomicTransactionPlan[8] === "commit_atomic_reservation" && gate.futureAtomicTransactionPlan[9] === "arm_ephemeral_worker_only_after_commit", "worker pode iniciar antes do commit");
expect(gate.futureAtomicTransactionPlan[10] === "reconcile_commit_unknown_without_retry", "commit incerto sem reconciliacao segura");
expect(gate.workerLifecycle.length === 7 && gate.workerLifecycle.at(-1) === "DESTROYED_FUTURE", "ciclo de vida do worker invalido");
expect(gate.requiredPermitState.consumptionState === "UNCONSUMED" && gate.requiredPermitState.consumptionVersion === 0, "permit ja consumido aceito");
expect(gate.requiredPermitState.executionPermitConsumed === false && gate.requiredPermitState.oneTimeExecutionNonceConsumed === false, "permit ou nonce consumido aceito");
expect(gate.requiredConsumerAttestationProperties.securityInvokerPreferred === true && gate.requiredConsumerAttestationProperties.securityDefinerAbsent === true, "modelo de privilegio inseguro");
expect(gate.requiredConsumerAttestationProperties.functionExecutionPrivilegesRestricted === true && gate.requiredConsumerAttestationProperties.rlsAndTenantScopePreserved === true, "privilegios ou RLS inseguros");
expect(gate.requiredConsumerAttestationProperties.automaticRetryAfterAmbiguousCommitForbidden === true && gate.requiredConsumerAttestationProperties.commitUnknownReconciliationRequired === true, "commit incerto inseguro");
expect(gate.requiredHumanAuthorizationProperties.authenticationAssuranceLevel === "aal2", "AAL2 ausente");
expect(gate.requiredHumanAuthorizationProperties.trustedAuthorizationSource === "database_or_app_metadata", "fonte de autorizacao insegura");
expect(gate.requiredHumanAuthorizationProperties.executionConfirmed === false && gate.requiredHumanAuthorizationProperties.permitConsumptionConfirmed === false, "autorizacao extrapolou preparacao");
expect(Object.values(gate.requiredBlockedState).every((value) => value === false), "estado bloqueado invalido");
expect(gate.prohibitedActions.databaseFunctionCreation === true && gate.prohibitedActions.migrationCreation === true, "funcao ou migration liberada");
expect(gate.prohibitedActions.permitConsumption === true && gate.prohibitedActions.workerArm === true && gate.prohibitedActions.buildExecution === true, "consumo, worker ou build liberado");

expect(template.status === "not_prepared" && template.currentState === "SEALED", "template alegou consumer");
expect(template.consumptionState === "UNCONSUMED" && template.consumptionVersion === 0 && template.maximumConsumptionCount === 1, "template de consumo invalido");
expect(template.atomicConsumerPlanPrepared === false && template.atomicConsumerAvailable === false && template.consumerArmed === false, "template disponibilizou consumer");
expect(template.executionPermitConsumed === false && template.oneTimeExecutionNonceConsumed === false && template.replayExecuted === false, "template alegou consumo ou replay");
expect(Object.values(template.releaseGates).every((value) => value === false), "template abriu release gate");

for (const marker of [
  "validatePhase44AtomicConsumerWorkerSources", "preparePhase44AtomicConsumerWorker", "phase44ConsumerPolicyFingerprint",
  "phase43_permit_expired", "consumer_attestation_expired", "human_authorization_not_immediate",
  "human_authorization_policy_fingerprint_mismatch", "atomic_consumer_prepared_execution_blocked",
  "runtime_transaction_boundary_and_final_execution_authorization_missing", "BLOCK_AND_RECONCILE_WITHOUT_RETRY",
  "blocked_future_runtime_transaction", "selfTestPhase44AtomicConsumerWorker"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase44_permit_consumer_attestation_and_human_authorization_required", "phase44_source_receipt_permissions_too_open",
  "phase44_atomic_consumer_rejected", "phase44_sensitive_persistence_guard_triggered",
  "preparePhase44AtomicConsumerWorker", "chmodSync(outputFile, 0o600)",
  "atomicConsumerPlanPrepared", "futureAtomicTransactionStepCount", "ambiguousCommitPolicy",
  "atomicConsumerAvailable", "consumerArmed", "executionPermitConsumed", "oneTimeExecutionNonceConsumed",
  "supervisorStarted", "adapterExecuted", "replayExecuted", "remoteDatabaseTouched",
  "networkTouched", "processSpawned", "buildExecuted"
]) expect(builder.includes(marker), `builder incompleto: ${marker}`);
expect(!builder.includes("child_process") && !builder.includes("fetch(") && !builder.includes("https://"), "builder nao e offline");
expect(!builder.includes("createClient(") && !/from\s+["'](?:@supabase\/supabase-js|postgres|pg)["']/.test(builder) && !builder.includes("new Pool("), "builder contem cliente operacional");
expect(!builder.includes("ATLAS_PHASE44_NONCE") && !builder.includes("ATLAS_PHASE44_EXECUTION_PERMIT_VALUE") && !builder.includes("ATLAS_PHASE44_PERMIT_VALUE"), "builder coleta nonce ou valor do permit");
expect(audit.includes("assertionCount") && audit.includes("consumerPlanBuilt: false") && audit.includes("buildExecuted: false"), "auditoria estatica incompleta");
expect(workflow.includes("Validate Phase 44 atomic consumer worker without preparing, consuming, arming or executing it"), "workflow nao valida a Fase 44");
expect(!workflow.includes("run-meta-repeatability-sample-02-atomic-consumer-worker.mjs"), "workflow prepara consumer sem evidencias reais");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-044:audit", "audit-meta-repeatability-sample-02-atomic-consumer-worker.mjs"],
  ["meta:phase-044:preflight", "preflight-meta-repeatability-sample-02-atomic-consumer-worker.mjs"],
  ["meta:phase-044:prepare", "run-meta-repeatability-sample-02-atomic-consumer-worker.mjs"],
  ["meta:phase-044:check", "check-meta-intelligence-phase-044.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 44/100", "AAL2", "ATOMIC_CONSUMER_PREPARED_EXECUTION_BLOCKED", "exatamente uma reserva aceita",
  "nenhum retry automático", "consumidor disponível: **não**", "replay executado: **não**",
  "build executado: **não**", "Fase 45"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-atomic-consumer-worker.mjs"], "auditoria do consumidor");
run(["scripts/preflight-meta-repeatability-sample-02-atomic-consumer-worker.mjs", "--self-test"], "autoteste do consumidor");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-atomic-consumer-worker.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase44_permit_consumer_attestation_and_human_authorization_required"), "builder nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 44: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 44: aprovada — consumidor atomico e worker efemero preparados offline com reserva integral, worker somente apos commit confirmado e reconciliacao sem retry; consumo, armamento, replay, staging, producao, Meta e build continuam bloqueados.");
