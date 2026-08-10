import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-045.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.controlGate));
const template = JSON.parse(read(config.controlTemplate));
const preflight = read(config.preflight);
const runner = read(config.controlBuilder);
const audit = read(config.staticAudit);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 45 && config.mode === "sample_02_commit_unknown_final_authorization", "configuracao da Fase 45 invalida");
expect(config.status === "final_execution_control_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 45 abriu gate indevido");
expect(previous.phase === 44 && previous.status === "atomic_consumer_plan_prepared_source_evidence_missing", "baseline da Fase 44 invalido");
expect(config.controlScope.requiredSourceFiles === 3 && config.controlScope.aal2Required === true && config.controlScope.readOnlyReconciliationRequired === true && config.controlScope.automaticRetryForbidden === true, "escopo de controle invalido");
expect(config.environmentAudit.staticControlContractApproved === true && config.environmentAudit.offlineControlBuilderPrepared === true && config.environmentAudit.commitUnknownReconciliationPrepared === true, "contrato offline incompleto");
for (const field of ["phase44ConsumerPlanReceived", "reviewedTransactionBoundaryAttestationReceived", "immediateFinalExecutionAuthorizationReceived", "finalExecutionControlPrepared", "commitUnknownReconcilerAvailable", "executionPermitConsumed", "consumerArmed", "supervisorStarted", "adapterExecuted", "replayExecuted", "databaseTouched", "networkTouched", "processSpawned", "stagingTouched", "productionTouched", "metaTouched", "buildExecuted"]) expect(config.environmentAudit[field] === false, `estado operacional indevido: ${field}`);
expect(config.releaseGate.controlBuilderPrepared === true && Object.entries(config.releaseGate).filter(([key]) => key !== "controlBuilderPrepared").every(([, value]) => value === false), "release gate aberto");
for (const [key, value] of Object.entries(config.governance)) if (key.endsWith("MustRemainInsideWorkspace") || key.endsWith("Rejected") || key.endsWith("Permissions") || key === "jsonMaximumBytes") continue; else expect(value === false, `governanca permitiu operacao: ${key}`);

expect(gate.phase === 45 && gate.sourcePhase === 44 && gate.environment === "offline_commit_unknown_final_authorization", "gate da Fase 45 invalido");
expect(gate.maximumConsumerPlanAgeSeconds === 120 && gate.maximumTransactionAttestationAgeSeconds === 86400 && gate.maximumFinalAuthorizationAgeSeconds === 60 && gate.maximumFinalAuthorizationValiditySeconds === 120, "janelas de validade invalidas");
expect(gate.requiredSources.atomicConsumerPlan.phase === 44 && gate.requiredSources.reviewedTransactionBoundaryAttestation.reviewerRole === "SECURITY_REVIEWER" && gate.requiredSources.immediateFinalExecutionAuthorization.approverRole === "DIRETOR_DECISOR", "fontes ou papeis invalidos");
expect(gate.requiredConsumerPlanState.consumptionState === "UNCONSUMED" && gate.requiredConsumerPlanState.consumptionVersion === 0 && gate.requiredConsumerPlanState.maximumConsumptionCount === 1 && gate.requiredConsumerPlanState.executionPermitConsumed === false, "estado do consumidor invalido");
for (const field of ["readOnlyCommitUnknownReconciliation", "automaticRetryAfterAmbiguousCommitForbidden", "reconciliationMustNotArmWorker", "reconciliationMustNotDispatchMeta", "reconciliationMustNotMutateDatabase", "exactlyOneReservationEvidenceRequired", "tenantAndRlsPreserved", "securityInvokerPreferred", "securityDefinerAbsent", "functionExecutionPrivilegesRestricted", "stagingOnly", "productionPathAbsent", "rollbackAndDestructionMandatory"]) expect(gate.requiredTransactionAttestationProperties[field] === true, `atestado ausente: ${field}`);
expect(gate.requiredFinalAuthorizationProperties.authenticationAssuranceLevel === "aal2" && gate.requiredFinalAuthorizationProperties.trustedAuthorizationSource === "database_or_app_metadata", "AAL2 ou fonte confiavel ausente");
for (const field of ["humanConfirmed", "singleUse", "finalExecutionControlPreparationOnly", "atomicBoundaryReviewed", "commitUnknownPolicyReviewed", "stagingConfirmed"]) expect(gate.requiredFinalAuthorizationProperties[field] === true, `autorizacao ausente: ${field}`);
for (const field of ["executionConsentConfirmed", "permitConsumptionConfirmed", "workerArmConfirmed", "replayConfirmed", "productionConfirmed", "metaConfirmed", "buildConfirmed", "rawSessionPersisted", "authorizationClaimsPersisted"]) expect(gate.requiredFinalAuthorizationProperties[field] === false, `autorizacao abriu operacao: ${field}`);
expect(Object.values(gate.requiredBlockedState).every((value) => value === false) && Object.values(gate.prohibitedActions).every((value) => value === true), "estado bloqueado ou proibicoes invalidos");
expect(template.phase === 45 && template.status === "not_prepared" && template.currentState === "SEALED" && template.finalExecutionControlPrepared === false && template.executionPermitConsumed === false && template.consumerArmed === false && template.replayExecuted === false && Object.values(template.releaseGates).every((value) => value === false), "template de controle invalido");

for (const marker of ["validatePhase45FinalExecutionControl", "preparePhase45FinalExecutionControl", "phase45ControlPolicyFingerprint", "expired_by_age", "${label}_expired", "final_authorization_control_policy_mismatch", "FINAL_EXECUTION_CONTROL_PREPARED_EXECUTION_BLOCKED", "READ_ONLY_RECONCILE_AND_HALT_WITHOUT_RETRY", "selfTestPhase45FinalExecutionControl"]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of ["phase45_consumer_plan_transaction_attestation_and_final_authorization_required", "phase45_source_receipt_permissions_too_open", "phase45_final_execution_control_rejected", "phase45_sensitive_persistence_guard_triggered", "preparePhase45FinalExecutionControl", "finalExecutionControlPrepared", "commitUnknownReconcilerAvailable", "executionPermitConsumed", "consumerArmed", "replayExecuted", "buildExecuted"]) expect(runner.includes(marker), `runner incompleto: ${marker}`);
expect(!runner.includes("fetch(") && !runner.includes("child_process") && !runner.includes("createClient(") && !runner.includes("https://"), "runner nao e offline");
expect(audit.includes("assertionCount") && audit.includes("commitUnknownReconcilerAvailable: false") && audit.includes("buildExecuted: false"), "auditoria estatica incompleta");
expect(workflow.includes("Validate Phase 45 commit-unknown reconciler and final authorization without preparing or executing it") && !workflow.includes("run-meta-repeatability-sample-02-commit-unknown-final-authorization.mjs"), "workflow da Fase 45 invalido");
for (const [script, marker] of [["meta:phase-045:audit", "audit-meta-repeatability-sample-02-commit-unknown-final-authorization.mjs"], ["meta:phase-045:preflight", "preflight-meta-repeatability-sample-02-commit-unknown-final-authorization.mjs"], ["meta:phase-045:prepare", "run-meta-repeatability-sample-02-commit-unknown-final-authorization.mjs"], ["meta:phase-045:check", "check-meta-intelligence-phase-045.mjs"]]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of ["Fase 45/100", "AAL2", "FINAL_EXECUTION_CONTROL_PREPARED_EXECUTION_BLOCKED", "nenhum retry automático", "reconciliador disponível: **não**", "replay executado: **não**", "Fase 46"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => { const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" }); if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1200)}`); };
run([config.staticAudit], "auditoria do controle");
run([config.preflight, "--self-test"], "autoteste do controle");
const blocked = spawnSync(process.execPath, [config.controlBuilder], { cwd: root, env: { PATH: process.env.PATH ?? "" }, encoding: "utf8" });
expect(blocked.status !== 0 && blocked.stderr.includes("phase45_consumer_plan_transaction_attestation_and_final_authorization_required"), "runner nao falhou fechado sem evidencias");

if (failures.length) { console.error("META INTELLIGENCE Fase 45: REPROVADA"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log("META INTELLIGENCE Fase 45: aprovada — reconciliacao de commit incerto e autorizacao final preparadas offline, com leitura somente e sem retry; consumo, armamento, replay, staging, producao, Meta e build continuam bloqueados.");
