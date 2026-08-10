import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-014.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const evidence = JSON.parse(read(config.stagingEvidenceTemplate));
const packageJson = JSON.parse(read("package.json"));
const runner = read(config.stagingRunner);
const preflight = read(config.stagingPreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 14 && config.mode === "isolated_supabase_auth_signed_jwt_session_and_data_api_harness", "configuracao da Fase 14 invalida");
expect(config.status === "isolated_auth_harness_ready" && config.safeToApply === false, "Fase 14 liberou aplicacao indevida");
expect(previous.phase === 13 && previous.status === "local_rls_claim_semantics_verified", "baseline da Fase 13 invalido");
expect(previous.releaseGate.localPostgresRlsPassed === true && previous.releaseGate.realSignedJwtPassed === false, "estado herdado da Fase 13 divergente");
expect(config.localAudit.applicationMiddlewareUsesGetClaims && config.localAudit.sensitiveApiUsesGetUser, "validacao Auth da aplicacao incompleta");
expect(config.localAudit.sessionEndpointReturnsTokens === false && config.localAudit.rlsUsesEditableUserMetadata === false, "tokens ou metadados inseguros");
expect(config.harnessCoverage.verifiedClaims && config.harnessCoverage.refreshTokenRotation && config.harnessCoverage.refreshTokenRevocation, "ciclo JWT/sessao incompleto");
expect(config.harnessCoverage.anonymousDataApiBoundary && config.harnessCoverage.authenticatedHierarchy && config.harnessCoverage.crossTenantReadWrite, "cobertura Data API incompleta");
expect(config.harnessCoverage.serviceRoleServerBoundary && config.harnessCoverage.editableMetadataEscalation && config.harnessCoverage.mutationRestore, "limites privilegiados incompletos");
expect(config.unverifiedBoundaries.isolatedSupabaseProject && config.unverifiedBoundaries.realSignedJwtExecution, "limites remotos foram omitidos");
expect(config.releaseGate.phase13LocalRlsPassed === true && config.releaseGate.phase14StaticAuditPassed === true, "gates locais incompletos");
expect(config.releaseGate.isolatedStagingPassed === false && config.releaseGate.productionReady === false && config.releaseGate.deploymentReady === false, "homologacao ou producao liberada indevidamente");
expect(config.governance.productionAccess === false && config.governance.databaseMutation === false && config.governance.migrationApplication === false, "banco publicado nao pode ser acessado ou alterado");
expect(config.governance.tokenPersistence === false && config.governance.secretPersistence === false, "material secreto nao pode ser persistido");
expect(config.governance.realMetaEventDelivery === false && config.governance.campaignMutation === false, "Meta nao pode ser alterada");
expect(config.governance.buildExecuted === false, "build nao deve rodar nesta fase");

for (const [script, marker] of [
  ["meta:phase-014:audit", "audit-meta-auth-jwt-contract.mjs"],
  ["meta:phase-014:staging", "run-meta-auth-jwt-data-api-staging.mjs"],
  ["meta:phase-014:preflight", "--self-test"],
  ["meta:phase-014:check", "check-meta-intelligence-phase-014.mjs"],
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);

for (const marker of [
  "ATLAS_AUTH_TEST_ENVIRONMENT",
  "staging_clone_required",
  "production_target_forbidden",
  "https_staging_target_required",
  "auth.signInWithPassword",
  "auth.getClaims",
  "/.well-known/jwks.json",
  "refresh_token_rotation_verified",
  "revoked_refresh_token_rejected",
  "anonymous_data_api_denied",
  "service_role_server_boundary",
  "editable_metadata_escalation_denied",
  "cross_tenant_data_api_update_denied",
  "mutation_probe_restored",
  "tokenValuesPersisted: false",
  "accessTokenImmediateRevocationNotClaimed",
]) expect(runner.includes(marker), `executor sem contrato: ${marker}`);

expect(preflight.includes("validateAuthJwtDataApiEvidence") && preflight.includes("productionAllowed: false"), "preflight nao fecha producao");
expect(preflight.includes("refresh_revocation_not_verified") && preflight.includes("token_material_persisted"), "preflight omite sessao ou token");
expect(audit.includes("middleware_verifies_signed_claims") && audit.includes("rls_ignores_editable_metadata"), "auditoria local incompleta");
expect(evidence.phase === 14 && evidence.authStagingRun.status === "not_run", "template remoto foi marcado como executado");
expect(evidence.containsSecrets === false && evidence.containsPersonalData === false, "template de evidencia inseguro");
expect(evidence.authStagingRun.realSignedJwtSessions === false && evidence.authStagingRun.authenticatedDataApiPassed === false, "evidencia remota artificial");
expect(evidence.authStagingRun.productionMutation === false && evidence.authStagingRun.realMetaEventDelivery === false, "template permite mutacao proibida");

for (const marker of [
  "Fase 14/100",
  "JWT assinado",
  "getClaims()",
  "getUser(token)",
  "session_id",
  "access token já emitido pode continuar válido até sua expiração",
  "ATLAS_AUTH_TEST_SUPABASE_PUBLISHABLE_KEY",
  "ATLAS_AUTH_TEST_SUPABASE_SECRET_KEY",
  "Produção, envio de eventos Meta, campanhas, orçamento, público e build permanecem fora do escopo",
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 500)}`);
};

run(["scripts/check-meta-intelligence-phase-013.mjs"], "baseline da Fase 13");
run(["scripts/audit-meta-auth-jwt-contract.mjs"], "auditoria Auth/JWT");
run(["scripts/preflight-meta-auth-jwt-data-api-staging.mjs", "--self-test"], "autoteste do preflight");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 14: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 14: aprovada — executor isolado de Auth, JWT, sessao e Data API pronto; staging, producao, Meta e build continuam bloqueados.");
