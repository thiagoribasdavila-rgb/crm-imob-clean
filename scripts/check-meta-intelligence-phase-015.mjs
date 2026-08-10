import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-015.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const evidence = JSON.parse(read(config.evidenceTemplate));
const packageJson = JSON.parse(read("package.json"));
const runner = read(config.rehearsalRunner);
const preflight = read(config.evidencePreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 15 && config.mode === "ephemeral_empty_clone_auth_jwt_rls_rehearsal", "configuracao da Fase 15 invalida");
expect(config.status === "isolated_rehearsal_automation_ready" && config.safeToApply === false, "Fase 15 liberou aplicacao indevida");
expect(previous.phase === 14 && previous.status === "isolated_auth_harness_ready", "baseline da Fase 14 invalido");
expect(config.environmentAudit.remoteCallsExecuted === false && config.environmentAudit.isolatedCredentialsDetected === false, "auditoria de ambiente divergente");
expect(config.safetyGates.stagingCloneOnly && config.safetyGates.productionUrlDenied && config.safetyGates.emptyCloneRequired, "gates do clone incompletos");
expect(config.safetyGates.emptyAuthRequired && config.safetyGates.secretKeyServerOnly, "Auth vazio ou segredo server-only nao protegido");
expect(config.ephemeralFixtures.organizations === 2 && config.ephemeralFixtures.authUsers === 9 && config.ephemeralFixtures.profiles === 9 && config.ephemeralFixtures.leads === 4, "fixtures efemeras divergentes");
expect(config.ephemeralFixtures.credentialsPersisted === false && config.ephemeralFixtures.personalDataUsed === false, "fixtures persistem material sensivel");
expect(config.ephemeralFixtures.cleanupAlwaysAttempted && config.ephemeralFixtures.zeroResidualRequired, "limpeza total nao obrigatoria");
expect(config.runtimeCoverage.realPasswordSignIn && config.runtimeCoverage.signedJwtVerification && config.runtimeCoverage.crossTenantReadWriteDenied, "cobertura Auth/RLS incompleta");
expect(config.runtimeCoverage.editableUserMetadataEscalationDenied && config.runtimeCoverage.reversibleMutationProbe, "escalacao ou restauracao nao coberta");
expect(config.releaseGate.phase14HarnessReady && config.releaseGate.phase15StaticAuditPassed, "gates locais incompletos");
expect(config.releaseGate.isolatedCloneExecuted === false && config.releaseGate.zeroResidualVerifiedRemotely === false, "ensaio remoto foi alegado sem execucao");
expect(config.releaseGate.productionReady === false && config.releaseGate.deploymentReady === false, "producao liberada indevidamente");
expect(config.governance.databaseMutation === false && config.governance.productionAccess === false && config.governance.migrationApplication === false, "banco publicado nao pode ser alterado");
expect(config.governance.realMetaEventDelivery === false && config.governance.campaignMutation === false, "Meta nao pode ser alterada");
expect(config.governance.buildExecuted === false, "build nao deve rodar nesta fase");

for (const [script, marker] of [
  ["meta:phase-015:audit", "audit-meta-auth-isolated-rehearsal.mjs"],
  ["meta:phase-015:rehearsal", "run-meta-auth-isolated-rehearsal.mjs"],
  ["meta:phase-015:preflight", "preflight-meta-auth-isolated-rehearsal.mjs"],
  ["meta:phase-015:check", "check-meta-intelligence-phase-015.mjs"],
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);

for (const marker of [
  "ATLAS_AUTH_TEST_REQUIRE_EMPTY_CLONE",
  "isolated_clone_not_empty",
  "auth.admin.createUser",
  "auth.admin.deleteUser",
  "run-meta-auth-jwt-data-api-staging.mjs",
  "example.invalid",
  "credentialsPersisted: false",
  "cleanup_residual_detected",
  "production_target_forbidden",
]) expect(runner.includes(marker), `executor sem contrato: ${marker}`);

expect(preflight.includes("validateIsolatedRehearsalEvidence") && preflight.includes("productionAllowed: false"), "preflight nao fecha producao");
expect(preflight.includes("clone_not_empty_before_rehearsal") && preflight.includes("fixture_residual_detected"), "preflight omite vazio ou residuos");
expect(audit.includes("clone vazio") && audit.includes("limpeza total"), "auditoria estatica incompleta");
expect(evidence.phase === 15 && evidence.passed === false && evidence.fixtureLifecycle.provisioned === false, "template remoto foi marcado como executado");
expect(evidence.containsSecrets === false && evidence.containsPersonalData === false, "template de evidencia inseguro");

for (const marker of [
  "Fase 15/100",
  "clone Supabase isolado",
  "ATLAS_AUTH_TEST_REQUIRE_EMPTY_CLONE=true",
  "nove usuários Auth",
  "remove leads, perfis, usuários Auth e organizações",
  "contagem residual volta a zero",
  "produção: bloqueada",
  "build: não executado",
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 500)}`);
};

run(["scripts/audit-meta-auth-isolated-rehearsal.mjs"], "auditoria do ensaio");
run(["scripts/preflight-meta-auth-isolated-rehearsal.mjs", "--self-test"], "autoteste do preflight");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 15: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 15: aprovada — ciclo efemero e limpeza total prontos; execucao em clone, producao, Meta e build continuam bloqueados.");
