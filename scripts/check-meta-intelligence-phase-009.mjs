import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-009.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const plan = JSON.parse(read(config.hardeningPlan));
const evidence = JSON.parse(read(config.executionEvidenceTemplate));
const sql = read(config.catalogAuditSql);
const audit = read("scripts/audit-meta-rls-hardening-plan.mjs");
const preflight = read("scripts/preflight-meta-rls-hardening-plan.mjs");
const report = read("docs/META_RLS_HARDENING_AND_STAGING_PLAN.md");
const packageJson = JSON.parse(read("package.json"));
const hierarchyMigration = read(config.existingMigrationEvidence[0]);
const hierarchyEnforcement = read(config.existingMigrationEvidence[1]);
const rbacMigration = read(config.existingMigrationEvidence[2]);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 9 && config.mode === "offline_reversible_hardening_plan", "configuracao da Fase 9 invalida");
expect(config.status === "planned_with_blockers" && config.safeToApply === false, "fase deve permanecer bloqueada");
expect(config.observedDrift.localLeadAssigneeColumn === "assigned_to", "contrato local de responsavel divergiu");
expect(config.observedDrift.remoteLeadAssigneeColumn === "assigned_user_id", "contrato remoto de responsavel divergiu");
expect(config.observedDrift.legacyMigrationReplaySafe === false, "migration legada nao pode ser marcada como segura");
expect(config.releaseGate.planDocumented === true && config.releaseGate.deploymentReady === false, "gate de release invalido");
expect(config.governance.databaseMutation === false && config.governance.migrationCreated === false, "fase nao pode modificar o banco");
expect(config.governance.buildExecuted === false, "build deve ficar reservado ao checkpoint");
expect(previous.phase === 8 && previous.releaseGate.deploymentReady === false, "baseline da Fase 8 invalido");

expect(plan.orderedActions.length === 10, "plano deve conter dez acoes ordenadas");
expect(plan.orderedActions.every((item, index) => item.order === index + 1), "ordem do plano invalida");
expect(plan.orderedActions.every((item) => item.ready === false && Boolean(item.rollback)), "todas as acoes devem estar bloqueadas e ter rollback");
expect(plan.productionExecutionAllowed === false && plan.legacyMigrationReplayAllowed === false, "plano liberou acao proibida");
expect(plan.requiredEnvironment.kind === "staging_clone" && plan.requiredEnvironment.productionProject === false, "staging isolado nao e obrigatorio");
expect(plan.orderedActions.find((item) => item.id === "enable_leaked_password_protection")?.sqlAllowed === false, "configuracao Auth nao pode ser tratada como SQL");
expect(plan.forbiddenActions.includes("send_real_meta_event") && plan.forbiddenActions.includes("mutate_campaign"), "governanca Meta incompleta");

expect(evidence.environment === "staging_clone_required" && evidence.run.status === "not_run", "template nao pode alegar execucao");
expect(evidence.run.legacyMigrationReplayAttempted === false, "template nao pode sugerir replay legado");
expect(evidence.run.realEventDelivery === false && evidence.run.campaignMutation === false, "template permitiu mutacao externa");

expect(/begin transaction read only/i.test(sql), "SQL nao esta em modo read-only");
expect(/\brollback\s*;/i.test(sql), "SQL nao possui rollback explicito");
expect(sql.includes("information_schema.columns") && sql.includes("pg_policies") && sql.includes("has_function_privilege"), "SQL catalog-only incompleto");
expect(!/\bfrom\s+public\.(profiles|leads|crm_projects|marketing_campaigns)\b/i.test(sql), "SQL acessa linhas de negocio");
expect(sql.includes("assigned_user_id") && sql.includes("assigned_to"), "SQL nao detecta drift de responsavel");

expect(hierarchyMigration.includes("add column if not exists commercial_role text"), "evidencia local de commercial_role ausente");
expect(hierarchyMigration.includes("add column if not exists reports_to uuid"), "evidencia local de reports_to ausente");
expect(hierarchyMigration.includes("private.can_view_commercial_profile") && hierarchyMigration.includes("private.can_access_commercial_lead"), "helpers locais nao detectados");
expect(hierarchyMigration.includes("assigned_to"), "dependencia legada assigned_to nao detectada");
expect(hierarchyEnforcement.includes("validate_commercial_hierarchy") && hierarchyEnforcement.includes("protect_profile_authorization_fields"), "enforcement local incompleto");
expect(rbacMigration.includes("add column if not exists access_role text"), "RBAC local nao detectado");

for (const marker of [
  "production_target_forbidden",
  "isolated_staging_not_verified",
  "backup_not_verified",
  "migration_drift_not_reconciled",
  "legacy_migration_replay_forbidden",
  "privileged_function_signature_unknown",
  "rollback_dry_run_missing",
  "leaked_password_protection_not_verified",
  "real_event_delivery_forbidden",
  "--strict-ready",
  "--self-test",
]) {
  expect(preflight.includes(marker), `preflight fail-closed incompleto: ${marker}`);
}
for (const marker of [
  "leadAssigneeContractMismatch",
  "legacyMigrationReplaySafe: false",
  "mutatingStatementDetected",
  "catalogAuditSafe",
  "deploymentReady: false",
]) {
  expect(audit.includes(marker), `auditoria offline incompleta: ${marker}`);
}
for (const marker of [
  "Fase 9/100",
  "assigned_to",
  "assigned_user_id",
  "search_knowledge_chunks",
  "READ ONLY",
  "10 de 10",
  "Fase 10/100",
]) {
  expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}
expect(packageJson.scripts["meta:phase-009:audit"]?.includes("audit-meta-rls-hardening-plan.mjs"), "comando de auditoria ausente");
expect(packageJson.scripts["meta:phase-009:preflight"]?.includes("--self-test"), "comando de preflight ausente");
expect(packageJson.scripts["meta:phase-009:check"]?.includes("check-meta-intelligence-phase-009.mjs"), "gate da Fase 9 ausente");

const auditExecution = spawnSync(process.execPath, ["scripts/audit-meta-rls-hardening-plan.mjs"], {
  cwd: root,
  encoding: "utf8",
});
expect(auditExecution.status === 0, `auditoria executavel falhou: ${auditExecution.stderr || auditExecution.stdout}`);
if (auditExecution.status === 0) {
  const output = JSON.parse(auditExecution.stdout);
  expect(output.plan.actionCount === 10 && output.plan.rollbackCount === 10, "cobertura do plano incorreta");
  expect(output.drift.hierarchyMigrationExistsLocally === true, "hierarquia local nao reconhecida");
  expect(output.drift.hierarchyMissingRemotely === true, "drift remoto nao reconhecido");
  expect(output.drift.leadAssigneeContractMismatch === true, "mismatch de responsavel nao reconhecido");
  expect(output.catalogProposal.transactionReadOnly === true && output.catalogProposal.mutatingStatementDetected === false, "SQL de auditoria nao e seguro");
  expect(output.readiness.deploymentReady === false, "auditoria nao pode liberar deploy");
}

const preflightExecution = spawnSync(process.execPath, ["scripts/preflight-meta-rls-hardening-plan.mjs", "--self-test"], {
  cwd: root,
  encoding: "utf8",
});
expect(preflightExecution.status === 0, `self-test fail-closed falhou: ${preflightExecution.stderr || preflightExecution.stdout}`);
if (preflightExecution.status === 0) {
  const output = JSON.parse(preflightExecution.stdout);
  expect(output.passed === true && output.tests.length >= 18, "matriz negativa incompleta");
}

if (failures.length) {
  console.error("META INTELLIGENCE Fase 9: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 9: aprovada — plano reversivel documentado, staging e producao continuam bloqueados.");
