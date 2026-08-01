import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-006.json"));
const snapshot = JSON.parse(read("config/fixtures/meta-bridge-isolated-snapshot.json"));
const preflight = read("scripts/preflight-meta-bridge-isolated.mjs");
const report = read("docs/META_BRIDGE_ISOLATED_PREFLIGHT.md");
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 6 && config.mode === "isolated_snapshot_preflight", "configuracao da Fase 6 invalida");
expect(config.status === "verified" && config.safeToApply === false, "preflight deve estar verificado sem liberar aplicacao");
expect(config.inputContract.unknownStateBehavior === "fail_closed", "estado desconhecido deve reprovar");
expect(config.inputContract.acceptsRemoteConnection === false && config.inputContract.acceptsServiceRoleKey === false, "preflight isolado nao pode aceitar conexao remota ou service role");
expect(config.checks.length >= 12, "cobertura do preflight insuficiente");
expect(config.requiredIsolationScenarios.length === 6, "cenarios de isolamento incompletos");
expect(config.negativeSelfTests.length === 7, "autotestes negativos incompletos");
expect(config.releaseGate.realSnapshotRequiredBeforeMigration && config.releaseGate.stagingCloneRequiredBeforeMigration, "gates de staging ausentes");
expect(config.governance.databaseMutation === false && config.governance.remoteDatabaseConnection === false, "fase nao pode conectar ou alterar banco remoto");
expect(config.governance.migrationCreated === false && config.governance.migrationApplication === false, "fase nao pode criar ou aplicar migration");
expect(config.governance.buildExecuted === false, "build deve ficar reservado aos checkpoints");
expect(snapshot.format === config.inputContract.format && snapshot.environment === "isolated_fixture", "fixture isolada invalida");
expect(snapshot.objects.length >= 14 && snapshot.functions.length === 2, "snapshot incompleto");
for (const marker of [
  "validateMetaBridgeSnapshot",
  "environment_not_isolated",
  "required_object_missing",
  "rls_required",
  "security_invoker_required",
  "anon_grants_mismatch",
  "authenticated_grants_mismatch",
  "security_definer_search_path_not_empty",
  "cross_tenant_rows_visible",
  "deploymentReady: false",
  "databaseMutation: false",
]) {
  expect(preflight.includes(marker), `controle do preflight ausente: ${marker}`);
}
for (const marker of [
  "Fase 6/100",
  "fail-closed",
  "snapshot",
  "RLS",
  "grants",
  "security_invoker",
  "sete falhas",
  "Fase 7/100",
]) {
  expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}
expect(packageJson.scripts["meta:phase-006:preflight"]?.includes("--self-test"), "comando de preflight com autoteste ausente");
expect(packageJson.scripts["meta:phase-006:check"]?.includes("check-meta-intelligence-phase-006.mjs"), "gate da Fase 6 ausente");

const execution = spawnSync(process.execPath, ["scripts/preflight-meta-bridge-isolated.mjs", "--self-test"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
});
expect(execution.status === 0, `preflight executavel falhou: ${execution.stderr || execution.stdout}`);
if (execution.status === 0) {
  const output = JSON.parse(execution.stdout);
  expect(output.result.ok === true && output.result.issueCount === 0, "fixture ideal deve passar sem inconsistencias");
  expect(output.negativeSelfTests.executed === 7 && output.negativeSelfTests.rejectedAsExpected === 7, "sete falhas precisam ser rejeitadas");
  expect(output.readiness.deploymentReady === false, "preflight isolado nao pode liberar deploy");
}

if (failures.length) {
  console.error("META INTELLIGENCE Fase 6: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 6: aprovada — preflight fail-closed validado com sete cenarios negativos e zero conexao remota.");
