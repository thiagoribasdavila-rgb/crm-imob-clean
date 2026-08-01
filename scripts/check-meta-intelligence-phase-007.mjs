import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-007.json"));
const snapshot = JSON.parse(read("config/fixtures/meta-bridge-remote-snapshot-sanitized.json"));
const sql = read("scripts/sql/meta-bridge-readonly-snapshot.sql");
const report = read("docs/META_REMOTE_SCHEMA_SNAPSHOT_REPORT.md");
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 7 && config.mode === "remote_catalog_read_only", "configuracao da Fase 7 invalida");
expect(config.status === "verified_with_blockers" && config.safeToApply === false, "snapshot real deve permanecer bloqueado");
expect(config.observedBaseline.canonicalSourcesDetected === 4, "fontes canonicas reais nao confirmadas");
expect(config.observedBaseline.targetObjectsDetected === 0, "baseline de objetos do bridge divergiu");
expect(config.blockingFindings.length >= 5, "bloqueios reais insuficientemente documentados");
expect(config.releaseGate.catalogSnapshotCollected && config.releaseGate.catalogSnapshotSanitized, "evidencia do catalogo ausente");
expect(config.releaseGate.migrationReady === false && config.releaseGate.deploymentReady === false, "snapshot nao pode liberar migration ou deploy");
expect(config.governance.remoteDatabaseRead === true && config.governance.databaseMutation === false, "governanca read-only invalida");
expect(config.governance.businessRowsRead === false && config.governance.personalDataRead === false && config.governance.secretsRead === false, "coleta acessou dados proibidos");
expect(config.governance.buildExecuted === false, "build deve ficar reservado ao checkpoint");
expect(snapshot.environment === "remote_read_only_snapshot", "snapshot remoto nao identificado");
expect(snapshot.collection?.catalogOnly === true, "snapshot deve conter somente catalogo");
expect(snapshot.collection?.businessRowsRead === false && snapshot.collection?.personalDataRead === false, "snapshot contem dados de negocio ou pessoais");
expect(snapshot.objects.length === 4 && snapshot.functions.length === 1, "snapshot sanitizado divergiu da coleta real");
expect(snapshot.objects.every((object) => object.rlsEnabled === true), "RLS das fontes canonicas nao confirmado");
expect(snapshot.objects.every((object) => object.grants.anon.length === 4), "grants legados de anon nao foram preservados no diagnostico");
expect(snapshot.functions[0].searchPath === "public, auth", "risco de search_path nao foi preservado");

for (const marker of [
  "pg_class",
  "pg_namespace",
  "pg_policies",
  "pg_proc",
  "pg_index",
  "businessRowsRead",
  "personalDataRead",
  "secretsRead",
]) {
  expect(sql.includes(marker), `coletor SQL incompleto: ${marker}`);
}
for (const pattern of [
  /\bcreate\s+(table|view|function|schema|index)\b/i,
  /\balter\s+(table|function|role|default)\b/i,
  /\bdrop\s+(table|view|function|schema|index)\b/i,
  /\btruncate\s+/i,
  /\binsert\s+into\b/i,
  /\bupdate\s+[a-z_]/i,
  /\bdelete\s+from\b/i,
]) {
  expect(!pattern.test(sql), `coletor contem comando mutavel: ${pattern}`);
}
expect(!/\b(from|join)\s+public\./i.test(sql), "coletor nao pode consultar linhas de tabelas publicas");
for (const marker of [
  "Fase 7/100",
  "somente leitura",
  "quatro fontes canônicas",
  "dez objetos",
  "search_path",
  "Fase 8/100",
]) {
  expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}
expect(packageJson.scripts["meta:phase-007:compare"]?.includes("compare-meta-bridge-remote-snapshot.mjs"), "comando de comparacao ausente");
expect(packageJson.scripts["meta:phase-007:check"]?.includes("check-meta-intelligence-phase-007.mjs"), "gate da Fase 7 ausente");

const execution = spawnSync(process.execPath, ["scripts/compare-meta-bridge-remote-snapshot.mjs"], {
  cwd: root,
  encoding: "utf8",
});
expect(execution.status === 0, `comparacao executavel falhou: ${execution.stderr || execution.stdout}`);
if (execution.status === 0) {
  const output = JSON.parse(execution.stdout);
  expect(output.collection.valid === true, "snapshot real nao esta sanitizado");
  expect(output.baseline.canonicalSources.detected === 4, "fontes canonicas nao detectadas");
  expect(output.baseline.targetObjects.detected === 0, "bridge nao pode aparecer como implementado");
  expect(output.baseline.requiredHelpers.detected === 1, "diagnostico de helpers divergiu");
  expect(output.baseline.unsafeSecurityDefiners === 1, "search_path inseguro nao detectado");
  expect(output.compatibility.approved === false, "snapshot remoto nao pode passar no preflight");
  for (const code of [
    "environment_not_isolated",
    "data_api_exposure_unverified",
    "required_helper_missing",
    "required_object_missing",
    "security_definer_search_path_not_empty",
    "isolation_scenario_missing",
  ]) {
    expect(output.compatibility.issueCodes.includes(code), `bloqueio nao detectado: ${code}`);
  }
  expect(output.readiness.deploymentReady === false && output.readiness.migrationReady === false, "comparacao nao pode liberar producao");
}

if (failures.length) {
  console.error("META INTELLIGENCE Fase 7: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 7: aprovada — catalogo real sanitizado, bridge ausente confirmado e producao mantida bloqueada.");
