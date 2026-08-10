import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-012.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const evidence = JSON.parse(read(config.stagingEvidenceTemplate));
const packageJson = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const runner = read(config.semanticRunner);
const preflight = read("scripts/preflight-meta-canonical-staging.mjs");
const report = read("docs/META_CANONICAL_POSTGRES_SEMANTIC_TEST.md");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 12 && config.mode === "ephemeral_postgres_semantics_and_fail_closed_staging_gate", "configuracao da Fase 12 invalida");
expect(config.status === "ephemeral_postgres_verified" && config.safeToApply === false, "execucao efemera liberou aplicacao indevidamente");
expect(previous.phase === 11 && previous.safeToApply === false, "baseline da Fase 11 invalido");
expect(config.runtime.package === "@electric-sql/pglite" && config.runtime.version === "0.4.1", "runtime PostgreSQL efemero nao fixado");
expect(config.runtime.postgresVersion === "17.5" && config.runtime.ephemeral === true, "versao ou modo efemero invalido");
expect(config.runtime.fullSupabaseStack === false && config.runtime.containerRuntimeAvailable === false, "stack Supabase completo foi alegado sem runtime");
expect(config.semanticEvidence.sanitized === true && config.semanticEvidence.containsPersonalData === false, "execucao semantica nao foi sanitizada");
expect(config.semanticEvidence.scenarioCount === 6 && config.semanticEvidence.assertionCount === 41, "cobertura PostgreSQL divergente");
expect(config.semanticEvidence.backfillVerified && config.semanticEvidence.legacyDualWriteVerified && config.semanticEvidence.canonicalDualWriteVerified, "backfill ou dual-write nao comprovado");
expect(config.semanticEvidence.conflictRejectionVerified && config.semanticEvidence.transactionRollbackVerified, "conflitos ou rollback nao comprovados");
expect(config.semanticEvidence.explicitGrantsVerified && config.semanticEvidence.rlsEnabledVerified && config.semanticEvidence.securityInvokerVerified, "seguranca SQL nao comprovada");
expect(config.unverifiedBoundaries.supabaseAuthJwt && config.unverifiedBoundaries.crossTenantRls && config.unverifiedBoundaries.remoteStagingMigration, "limites nao verificados foram omitidos");
expect(config.releaseGate.ephemeralPostgresPassed === true && config.releaseGate.isolatedSupabaseStagingReady === false, "gate efemero/staging inconsistente");
expect(config.releaseGate.authenticatedJwtRlsPassed === false && config.releaseGate.crossTenantRlsPassed === false, "RLS autenticado foi alegado sem prova");
expect(config.releaseGate.migrationReady === false && config.releaseGate.deploymentReady === false, "migration ou deploy foi liberado");
expect(config.governance.databaseMutation === false && config.governance.migrationApplication === false, "banco real nao pode ser alterado");
expect(config.governance.realEventDelivery === false && config.governance.campaignMutation === false, "Meta nao pode ser alterada");
expect(config.governance.buildExecuted === false, "build nao deve rodar nesta fase");

expect(packageJson.devDependencies?.["@electric-sql/pglite"] === "0.4.1", "PGlite ausente das dependencias diretas");
expect(lock.packages?.[""]?.devDependencies?.["@electric-sql/pglite"] === "0.4.1", "PGlite ausente do lock raiz");
expect(lock.packages?.["node_modules/@electric-sql/pglite"]?.version === "0.4.1", "pacote PGlite nao esta travado no lock");
expect(packageJson.scripts["meta:phase-012:postgres"]?.includes("test-meta-canonical-migration-postgres.mjs"), "comando PostgreSQL ausente");
expect(packageJson.scripts["meta:phase-012:preflight"]?.includes("--self-test"), "preflight da Fase 12 ausente");
expect(packageJson.scripts["meta:phase-012:check"]?.includes("check-meta-intelligence-phase-012.mjs"), "gate da Fase 12 ausente");

expect(evidence.environment === "staging_clone_required", "template de staging nao esta bloqueado");
expect(evidence.ephemeralSemanticRun.status === "passed" && evidence.ephemeralSemanticRun.containsPersonalData === false, "evidencia efemera invalida");
expect(evidence.supabaseStagingRun.status === "not_run", "template alegou execucao do Supabase staging");
expect(evidence.supabaseStagingRun.authenticatedJwtRlsPassed === false && evidence.supabaseStagingRun.crossTenantRlsPassed === false, "template alegou RLS/JWT remoto");
expect(evidence.supabaseStagingRun.productionProject === false && evidence.supabaseStagingRun.migrationPromotedAfterApproval === false, "template liberou producao ou migration");

for (const marker of [
  "new PGlite()",
  "atlas_reconciliation_staging_only",
  "happy_path",
  "masked_zero_backfill",
  "staging_guard_rollback",
  "unknown_role_rollback",
  "score_conflict_rollback",
  "owner_conflict_rollback",
  "authenticatedJwtRls: false",
  "crossTenantRls: false",
]) expect(runner.includes(marker), `runner PostgreSQL incompleto: ${marker}`);

for (const marker of [
  "ephemeral_postgres_not_verified",
  "isolated_supabase_stack_not_verified",
  "authenticated_jwt_rls_not_verified",
  "cross_tenant_rls_not_verified",
  "data_api_runtime_not_verified",
  "production_target_forbidden",
  "--self-test",
]) expect(preflight.includes(marker), `preflight fail-closed incompleto: ${marker}`);

for (const marker of [
  "Fase 12/100",
  "PostgreSQL 17.5",
  "6 cenários",
  "41 verificações",
  "RLS/JWT",
  "não libera",
  "Fase 13/100",
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const activeMigration = new URL("../supabase/migrations/20260719070511_reconcile_legacy_and_canonical_contracts.sql", import.meta.url);
expect(!existsSync(activeMigration), "rascunho foi promovido para fila ativa sem staging");

const run = (script, args = []) => spawnSync(process.execPath, [script, ...args], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});

const semanticExecution = run(config.semanticRunner);
expect(semanticExecution.status === 0, `execucao PostgreSQL falhou: ${semanticExecution.stderr || semanticExecution.stdout}`);
if (semanticExecution.status === 0) {
  const output = JSON.parse(semanticExecution.stdout);
  expect(output.passed === true && output.sanitized === true && output.containsPersonalData === false, "resultado PostgreSQL inseguro");
  expect(output.scenarioCount === 6 && output.assertionCount === 41, "resultado PostgreSQL com cobertura incompleta");
  expect(output.engineVersion.includes("PostgreSQL 17.5"), "engine PostgreSQL divergente");
  expect(output.limitations.fullSupabaseStack === false && output.limitations.authenticatedJwtRls === false, "runner ocultou limites do teste");
}

const preflightExecution = run("scripts/preflight-meta-canonical-staging.mjs", ["--self-test"]);
expect(preflightExecution.status === 0, `self-test do staging gate falhou: ${preflightExecution.stderr || preflightExecution.stdout}`);
if (preflightExecution.status === 0) {
  const output = JSON.parse(preflightExecution.stdout);
  expect(output.passed === true && output.testCount >= 25, "matriz fail-closed da Fase 12 incompleta");
}

const previousExecution = run("scripts/check-meta-intelligence-phase-011.mjs");
expect(previousExecution.status === 0, `regressao na Fase 11: ${previousExecution.stderr || previousExecution.stdout}`);

if (failures.length) {
  console.error("META INTELLIGENCE Fase 12: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 12: aprovada — semantica PostgreSQL efemera validada; Supabase Auth/RLS, staging, producao e build continuam bloqueados.");
