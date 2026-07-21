import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-008.json"));
const baseline = JSON.parse(read(config.baselineFixture));
const template = JSON.parse(read(config.evidenceTemplate));
const validator = read("scripts/validate-meta-rls-staging-evidence.mjs");
const audit = read("scripts/audit-meta-rls-staging-readiness.mjs");
const report = read("docs/META_RLS_STAGING_GATE_REPORT.md");
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 8 && config.mode === "remote_policy_static_audit", "configuracao da Fase 8 invalida");
expect(config.status === "verified_with_blockers" && config.safeToApply === false, "fase deve permanecer bloqueada");
expect(config.requiredScenarios.length === 11, "matriz RLS deve conter onze cenarios");
expect(config.observedBaseline.canonicalPolicyCount === 11, "quantidade de policies divergiu");
expect(config.observedBaseline.tenantHelperPolicyCount === 11, "cobertura organizacional divergiu");
expect(config.observedBaseline.reportsToPolicyCount === 0 && config.observedBaseline.assigneePolicyCount === 0, "hierarquia nao pode aparecer como comprovada");
expect(config.observedBaseline.separateStagingProjectDetected === false, "staging nao pode aparecer como disponivel");
expect(config.observedBaseline.advisorWarningCount === 3, "alertas do Security Advisor divergiram");
expect(config.releaseGate.runtimeEvidenceApproved === false && config.releaseGate.deploymentReady === false, "gate nao pode liberar producao");
expect(config.governance.databaseMutation === false && config.governance.migrationCreated === false, "fase nao pode alterar o banco");
expect(config.governance.businessRowsRead === false && config.governance.personalDataRead === false && config.governance.secretsRead === false, "coleta acessou dados proibidos");
expect(config.governance.buildExecuted === false, "build deve ficar reservado ao checkpoint");

expect(baseline.collection.catalogOnly === true && baseline.collection.databaseMutation === false, "baseline remoto nao esta sanitizado");
expect(baseline.projects.detected === 1 && baseline.projects.separateStagingDetected === false, "inventario de ambientes divergiu");
expect(baseline.canonicalPolicies.organizationHelperReferences === 11, "predicado de tenant nao preservado");
expect(baseline.canonicalPolicies.leadVisibilityHelperReferences === 0, "helper de visibilidade nao pode aparecer como existente");
expect(baseline.remoteColumns["public.profiles"].join(",") === "active,name,organization_id,role", "colunas remotas de perfil divergiram");
expect(baseline.securityAdvisor.warningCount === 3, "snapshot do Security Advisor divergiu");
const knowledgeFunction = baseline.privilegedFunctions.find((item) => item.name === "public.search_knowledge_chunks");
expect(knowledgeFunction?.securityDefiner === true && knowledgeFunction?.anonExecute === true, "risco da busca de conhecimento nao preservado");
expect(knowledgeFunction?.authUidGuardDetected === false && knowledgeFunction?.searchPath === "public, private", "metadados da funcao privilegiada divergiram");
expect(template.environment === "staging_clone_required" && template.run.status === "not_run", "template nao pode alegar execucao");
expect(template.scenarios.length === config.requiredScenarios.length, "template incompleto");

for (const marker of [
  "environment_not_staging_clone",
  "required_scenario_missing",
  "denied_read_returned_rows",
  "allowed_read_not_observed",
  "denied_write_mutated_rows",
  "--strict-ready",
  "--self-test",
]) {
  expect(validator.includes(marker), `validador incompleto: ${marker}`);
}
for (const marker of [
  "tenantPredicatePercent",
  "hierarchyPredicatePercent",
  "privilegedKnowledgeSearch",
  "tenantIsolationApproved: false",
  "deploymentReady: false",
]) {
  expect(audit.includes(marker), `auditoria incompleta: ${marker}`);
}
for (const marker of [
  "Fase 8/100",
  "11 de 11",
  "hierarquia",
  "search_knowledge_chunks",
  "senhas vazadas",
  "não comprova vazamento",
  "Fase 9/100",
]) {
  expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}
expect(packageJson.scripts["meta:phase-008:audit"]?.includes("audit-meta-rls-staging-readiness.mjs"), "comando de auditoria ausente");
expect(packageJson.scripts["meta:phase-008:preflight"]?.includes("--self-test"), "comando de preflight ausente");
expect(packageJson.scripts["meta:phase-008:check"]?.includes("check-meta-intelligence-phase-008.mjs"), "gate da Fase 8 ausente");

const auditExecution = spawnSync(process.execPath, ["scripts/audit-meta-rls-staging-readiness.mjs"], {
  cwd: root,
  encoding: "utf8",
});
expect(auditExecution.status === 0, `auditoria executavel falhou: ${auditExecution.stderr || auditExecution.stdout}`);
if (auditExecution.status === 0) {
  const output = JSON.parse(auditExecution.stdout);
  expect(output.policyCoverage.tenantPredicatePercent === 100, "cobertura estrutural de tenant incorreta");
  expect(output.policyCoverage.hierarchyPredicatePercent === 0, "hierarquia nao pode aparecer como aprovada");
  expect(output.staging.evidenceApproved === false, "template vazio nao pode aprovar staging");
  expect(output.securityAdvisor.warningCount === 3, "alertas de seguranca nao foram propagados");
  expect(output.readiness.deploymentReady === false, "auditoria nao pode liberar deploy");
}

const preflightExecution = spawnSync(process.execPath, ["scripts/validate-meta-rls-staging-evidence.mjs", "--self-test"], {
  cwd: root,
  encoding: "utf8",
});
expect(preflightExecution.status === 0, `self-test fail-closed falhou: ${preflightExecution.stderr || preflightExecution.stdout}`);
if (preflightExecution.status === 0) {
  const output = JSON.parse(preflightExecution.stdout);
  expect(output.passed === true && output.tests.length >= 8, "matriz negativa incompleta");
  expect(output.actualTemplateApproved === false, "evidencia nao executada foi aceita");
}

if (failures.length) {
  console.error("META INTELLIGENCE Fase 8: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 8: aprovada — matriz fail-closed pronta, isolamento runtime pendente e producao bloqueada.");
