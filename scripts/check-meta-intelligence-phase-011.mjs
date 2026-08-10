import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-011.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const fixture = JSON.parse(read(config.localTestFixture));
const evidence = JSON.parse(read(config.executionEvidenceTemplate));
const migration = read(config.cli.draftPath);
const auditSource = read("scripts/audit-meta-canonical-migration.mjs");
const preflightSource = read("scripts/preflight-meta-canonical-migration.mjs");
const modelSource = read("scripts/test-meta-canonical-contract-model.mjs");
const report = read("docs/META_CANONICAL_MIGRATION_DRAFT.md");
const packageJson = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 11 && config.mode === "versioned_draft_and_local_contract_tests", "configuracao da Fase 11 invalida");
expect(config.status === "draft_verified_offline" && config.safeToApply === false, "rascunho foi liberado indevidamente");
expect(previous.phase === 10 && previous.releaseGate.deploymentReady === false, "baseline da Fase 10 invalido");
expect(config.cli.package === "supabase" && config.cli.version === "2.109.1" && config.cli.pinned === true, "Supabase CLI nao esta fixado");
expect(config.cli.generationCommand.includes("supabase migration new"), "migration nao foi criada pelo fluxo oficial");
expect(config.cli.draftPath.includes("migration-drafts/") && config.cli.promotedToActiveQueue === false, "migration saiu da quarentena");
expect(config.observedContract.activeMigrationQueueClean === true && config.observedContract.stagingGuardSpecified === true, "fila ou trava de staging invalida");
expect(config.observedContract.scoreBackfillSafeByConstruction === true, "ordem segura do score nao registrada");
expect(config.observedContract.ownerDualWriteSpecified && config.observedContract.projectDualWriteSpecified && config.observedContract.scoreDualWriteSpecified, "dual-write incompleto");
expect(config.observedContract.unknownRoleBlocked === true && config.observedContract.reportsToNotInferred === true, "governanca de papel/hierarquia invalida");
expect(config.observedContract.databaseSemanticsExecuted === false && config.observedContract.stagingExecutionApproved === false, "execucao de banco foi alegada sem evidencia");
expect(config.releaseGate.localModelTestsPassed === true && config.releaseGate.staticAuditPassed === true, "testes offline nao reconhecidos");
expect(config.releaseGate.migrationReady === false && config.releaseGate.deploymentReady === false, "gate final foi liberado");
expect(config.governance.databaseMutation === false && config.governance.migrationApplication === false, "fase nao pode aplicar migration");
expect(config.governance.realEventDelivery === false && config.governance.campaignMutation === false, "fase nao pode alterar Meta");
expect(config.governance.buildExecuted === false, "build nao deve rodar nesta fase");

expect(packageJson.devDependencies?.supabase === "2.109.1", "versao do Supabase CLI em package.json invalida");
expect(lock.packages?.[""]?.devDependencies?.supabase === "2.109.1", "versao do Supabase CLI em package-lock invalida");
expect(fixture.sanitized === true && fixture.containsPersonalData === false, "fixture local possui risco de PII");
expect(Array.isArray(fixture.pairCases) && Array.isArray(fixture.scoreCases) && Array.isArray(fixture.roleCases), "matriz local incompleta");
expect(evidence.environment === "staging_clone_required" && evidence.run.status === "not_run", "template alegou execucao");
expect(evidence.run.productionProject === false && evidence.run.migrationPromotedAfterApproval === false, "template liberou producao ou promocao");

for (const marker of [
  "begin;",
  "atlas_reconciliation_staging_only",
  "alter column score drop default",
  "set score = score_ia",
  "alter column score set default 0",
  "lead_contract_conflict:owner",
  "lead_contract_conflict:project",
  "lead_contract_conflict:score",
  "before insert or update of assigned_user_id, assigned_to, project_id, development_id, score_ia, score",
  "enable row level security",
  "revoke all on table public.profiles, public.leads from authenticated",
  "grant select, insert, update on table public.leads to authenticated",
  "commit;"
]) expect(migration.includes(marker), `migration canonica incompleta: ${marker}`);
expect(!/set\s+reports_to\s*=/i.test(migration.replace(/--.*$/gm, "")), "reports_to foi inferido automaticamente");
expect(!/\b(drop\s+table|drop\s+column|truncate|delete\s+from)\b/i.test(migration.replace(/--.*$/gm, "")), "migration contem operacao destrutiva");

for (const marker of [
  "activeQueueClean",
  "scoreDefaultDroppedBeforeBackfill",
  "reportsToNotInferred",
  "explicitPrivilegesVersioned",
  "databaseSemanticsExecuted: false",
  "deploymentReady: false"
]) expect(auditSource.includes(marker), `auditoria estatica incompleta: ${marker}`);

for (const marker of [
  "production_target_forbidden",
  "migration_promotion_not_approved",
  "database_contract_tests_not_verified",
  "explicit_data_api_grants_not_verified",
  "rollback_dry_run_missing",
  "--self-test"
]) expect(preflightSource.includes(marker), `preflight fail-closed incompleto: ${marker}`);

for (const marker of ["syncPair", "syncScore", "mapCommercialRole", "expected_rejection"]) {
  expect(modelSource.includes(marker), `modelo local incompleto: ${marker}`);
}

for (const marker of [
  "Fase 11/100",
  "Supabase CLI",
  "migration-drafts/",
  "19 testes",
  "26 cenários",
  "Fase 12/100"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

expect(packageJson.scripts["meta:phase-011:model"]?.includes("test-meta-canonical-contract-model.mjs"), "comando de modelo ausente");
expect(packageJson.scripts["meta:phase-011:audit"]?.includes("audit-meta-canonical-migration.mjs"), "comando de auditoria ausente");
expect(packageJson.scripts["meta:phase-011:preflight"]?.includes("--self-test"), "comando de preflight ausente");
expect(packageJson.scripts["meta:phase-011:check"]?.includes("check-meta-intelligence-phase-011.mjs"), "gate da Fase 11 ausente");

const run = (script, args = []) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
const modelExecution = run("scripts/test-meta-canonical-contract-model.mjs");
expect(modelExecution.status === 0, `testes locais falharam: ${modelExecution.stderr || modelExecution.stdout}`);
if (modelExecution.status === 0) {
  const output = JSON.parse(modelExecution.stdout);
  expect(output.passed === true && output.sanitized === true && output.testCount === 19, "resultado dos testes locais invalido");
}

const auditExecution = run("scripts/audit-meta-canonical-migration.mjs");
expect(auditExecution.status === 0, `auditoria estatica falhou: ${auditExecution.stderr || auditExecution.stdout}`);
if (auditExecution.status === 0) {
  const output = JSON.parse(auditExecution.stdout);
  expect(output.staticAuditPassed === true && output.migration.promotedToActiveQueue === false, "auditoria liberou migration");
  expect(output.databaseSemanticsExecuted === false && output.deploymentReady === false, "auditoria alegou readiness remoto");
}

const preflightExecution = run("scripts/preflight-meta-canonical-migration.mjs", ["--self-test"]);
expect(preflightExecution.status === 0, `self-test do preflight falhou: ${preflightExecution.stderr || preflightExecution.stdout}`);
if (preflightExecution.status === 0) {
  const output = JSON.parse(preflightExecution.stdout);
  expect(output.passed === true && output.testCount >= 26, "matriz fail-closed incompleta");
}

if (failures.length) {
  console.error("META INTELLIGENCE Fase 11: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 11: aprovada — rascunho versionado e testes locais aprovados; banco, staging, producao e build continuam bloqueados.");
