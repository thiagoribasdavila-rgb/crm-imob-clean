import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-013.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const evidence = JSON.parse(read(config.stagingEvidenceTemplate));
const remote = JSON.parse(read(config.remoteEvidence.source));
const packageJson = JSON.parse(read("package.json"));
const runner = read(config.semanticRunner);
const audit = read(config.staticAudit);
const stagingRunner = read(config.stagingRunner);
const preflight = read(config.stagingPreflight);
const pgTap = read(config.pgTapSuite);
const report = read("docs/META_RLS_JWT_HOMOLOGATION.md");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 13 && config.mode === "local_postgres_rls_claim_semantics_and_isolated_supabase_gate", "configuracao da Fase 13 invalida");
expect(config.status === "local_rls_claim_semantics_verified" && config.safeToApply === false, "Fase 13 liberou aplicacao indevida");
expect(previous.phase === 12 && previous.safeToApply === false, "baseline da Fase 12 invalido");
expect(config.runtime.postgresVersion === "17.5" && config.runtime.fullSupabaseStack === false, "runtime ou limite Supabase invalido");
expect(config.semanticEvidence.sanitized === true && config.semanticEvidence.containsPersonalData === false, "evidencia semantica nao sanitizada");
expect(config.semanticEvidence.scenarioCount === 24 && config.semanticEvidence.assertionCount === 44, "cobertura RLS local divergente");
expect(config.semanticEvidence.crossTenantReadDenied && config.semanticEvidence.crossTenantWriteDenied, "isolamento local nao comprovado");
expect(config.semanticEvidence.editableUserMetadataEscalationDenied && config.semanticEvidence.updateWithCheckVerified, "escalacao ou WITH CHECK nao comprovados");
expect(config.semanticEvidence.explicitGrantsVerified && config.semanticEvidence.serviceRoleBoundaryVerified, "privilegios locais incompletos");
expect(config.remoteEvidence.hierarchyHelperReferences === 0 && config.remoteEvidence.roleHierarchyApproved === false, "evidencia remota foi superestimada");
expect(remote.runtimeEvidence.roleHierarchyApproved === false && remote.projects.separateStagingDetected === false, "snapshot remoto inesperado");
expect(config.unverifiedBoundaries.realSignedSupabaseJwt && config.unverifiedBoundaries.supabaseDataApi, "limites JWT/Data API omitidos");
expect(config.releaseGate.localPostgresRlsPassed === true && config.releaseGate.realSignedJwtPassed === false, "gate local/remoto inconsistente");
expect(config.releaseGate.migrationReady === false && config.releaseGate.deploymentReady === false, "migration ou deploy liberado");
expect(config.governance.databaseMutation === false && config.governance.migrationApplication === false, "banco real nao pode ser alterado");
expect(config.governance.realMetaEventDelivery === false && config.governance.campaignMutation === false, "Meta nao pode ser alterada");
expect(config.governance.buildExecuted === false, "build nao deve rodar nesta fase");

for (const [script, marker] of [
  ["meta:phase-013:postgres", "test-meta-rls-jwt-postgres.mjs"],
  ["meta:phase-013:audit", "audit-meta-rls-jwt-contract.mjs"],
  ["meta:phase-013:staging", "run-meta-rls-jwt-supabase-staging.mjs"],
  ["meta:phase-013:preflight", "--self-test"],
  ["meta:phase-013:check", "check-meta-intelligence-phase-013.mjs"],
]) expect(packageJson.scripts[script]?.includes(marker), `comando ausente: ${script}`);

for (const marker of [
  "new PGlite()",
  "set role ${role}",
  "editable_user_metadata_cannot_escalate",
  "broker_cross_tenant_insert_denied",
  "manager_cross_team_transfer_denied",
  "service_role_boundary",
  "localPostgresClaimSemantics: true",
]) expect(runner.includes(marker), `runner local incompleto: ${marker}`);

for (const marker of [
  "remote_policy_snapshot_contains_tenant_scope_only",
  "commercial_hierarchy_requires_isolated_staging_proof",
  "remoteHierarchyProven",
]) expect(audit.includes(marker), `auditoria estatica incompleta: ${marker}`);

for (const marker of [
  "ATLAS_RLS_TEST_ENVIRONMENT",
  "staging_clone_required",
  "production_target_forbidden",
  "real_signed_supabase_jwt",
  "restoredAfterMutationProbe: true",
  "realMetaEventDelivery: false",
]) expect(stagingRunner.includes(marker), `runner staging inseguro ou incompleto: ${marker}`);

for (const marker of [
  "real_signed_jwt_not_verified",
  "cross_tenant_read_not_verified",
  "cross_tenant_write_not_verified",
  "editable_metadata_escalation_not_verified",
  "mutation_probe_not_restored",
  "productionAllowed: false",
]) expect(preflight.includes(marker), `preflight fail-closed incompleto: ${marker}`);

expect(pgTap.includes("select plan(31)"), "plano pgTAP divergente");
for (const marker of ["relrowsecurity", "leads_commercial_update", "with_check", "has_table_privilege", "has_function_privilege", "user_metadata"])
  expect(pgTap.includes(marker), `contrato pgTAP incompleto: ${marker}`);

expect(evidence.environment === "staging_clone_required" && evidence.supabaseStagingRun.status === "not_run", "template alegou staging executado");
expect(evidence.localSemanticRun.scenarioCount === 24 && evidence.localSemanticRun.assertionCount === 44, "template local divergente");
expect(evidence.supabaseStagingRun.realSignedJwtSessions === false && evidence.supabaseStagingRun.dataApiRuntimePassed === false, "template alegou JWT/Data API");
expect(evidence.supabaseStagingRun.productionProject === false && evidence.supabaseStagingRun.realMetaEventDelivery === false, "template liberou producao ou Meta");

for (const marker of [
  "Fase 13/100",
  "24 cenários",
  "44 verificações",
  "user_metadata",
  "Data API",
  "não libera",
  "Fase 14/100",
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const promotedDraft = new URL("../supabase/migrations/20260719070511_reconcile_legacy_and_canonical_contracts.sql", import.meta.url);
expect(!existsSync(promotedDraft), "reconciliacao foi promovida sem staging");

const run = (script, args = []) => spawnSync(process.execPath, [script, ...args], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});

const semanticExecution = run(config.semanticRunner);
expect(semanticExecution.status === 0, `execucao RLS local falhou: ${semanticExecution.stderr || semanticExecution.stdout}`);
if (semanticExecution.status === 0) {
  const output = JSON.parse(semanticExecution.stdout);
  expect(output.passed && output.sanitized && !output.containsPersonalData, "resultado RLS local inseguro");
  expect(output.scenarioCount === 24 && output.assertionCount === 44, "resultado RLS local incompleto");
  expect(output.limitations.localPostgresClaimSemantics === true && output.limitations.realSignedJwt === false, "runner ocultou limites JWT");
}

const auditExecution = run(config.staticAudit);
expect(auditExecution.status === 0, `auditoria RLS falhou: ${auditExecution.stderr || auditExecution.stdout}`);
if (auditExecution.status === 0) {
  const output = JSON.parse(auditExecution.stdout);
  expect(output.localContractPassed === true && output.remoteHierarchyProven === false, "auditoria confundiu local com remoto");
  expect(output.deploymentReady === false, "auditoria liberou deploy");
}

const preflightExecution = run(config.stagingPreflight, ["--self-test"]);
expect(preflightExecution.status === 0, `self-test do gate falhou: ${preflightExecution.stderr || preflightExecution.stdout}`);
if (preflightExecution.status === 0) {
  const output = JSON.parse(preflightExecution.stdout);
  expect(output.passed === true && output.testCount >= 30, "matriz fail-closed incompleta");
}

const previousExecution = run("scripts/check-meta-intelligence-phase-012.mjs");
expect(previousExecution.status === 0, `regressao na Fase 12: ${previousExecution.stderr || previousExecution.stdout}`);

if (failures.length) {
  console.error("META INTELLIGENCE Fase 13: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 13: aprovada — RLS e hierarquia validados localmente; JWT assinado, Data API, staging, producao e build continuam bloqueados.");
