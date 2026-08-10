import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-pg17-compatibility-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-pg17-compatibility-template.json"));
const compose = read(gate.runtime.composeFile);
const pg17Verify = read(gate.requiredArtifacts.pg17Verification);
const baseline = read(gate.requiredArtifacts.baseline);
const migration = read(gate.requiredArtifacts.migration);
const runner = read("scripts/run-meta-repeatability-sample-02-pg17-compatibility.mjs");
const preflight = read("scripts/preflight-meta-repeatability-sample-02-pg17-compatibility.mjs");
const workflow = read(".github/workflows/atlas-meta-phase30-local-rehearsal.yml");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 32 && gate.sourcePhase === 31 && gate.environment === "local_ephemeral_pg17", "gate da Fase 32 invalido");
expect(gate.approval.exactValue === "EXECUTE_PHASE32_PG17_LOCAL_EPHEMERAL_ONLY", "aprovacao humana exata ausente");
expect(gate.sourceEvidence.phase30RuntimeEvidenceRequired === true && gate.sourceEvidence.phase31ReconciliationRequired === true, "cadeia Fase 30/31 ausente");
expect(gate.sourceEvidence.sharedArtifactFingerprintsMustMatch === true, "hashes compartilhados nao obrigatorios");
expect(gate.runtime.postgresImage === "supabase/postgres:17.6.1.149" && !gate.runtime.postgresImage.endsWith(":latest"), "imagem PG17 nao fixada");
expect(gate.runtime.postgresMajor === 17 && gate.runtime.user === "postgres", "major PG17 ou owner invalido");
expect(gate.runtime.host === "127.0.0.1" && gate.runtime.port === 55433 && gate.runtime.database === "atlas_phase32", "alvo PG17 local invalido");
expect(gate.runtime.volume === "phase32-pg17-postgres-data" && gate.runtime.reusesPg15Volume === false, "volume PG17 nao esta isolado");
expect(gate.runtime.remoteTarget === false && gate.runtime.productionTarget === false && gate.runtime.linkedProject === false, "alvo remoto liberado");
expect(gate.runtime.destroyVolumesAfterRun === true, "destruicao do volume nao obrigatoria");
expect(compose.includes("supabase/postgres:17.6.1.149") && compose.includes('"127.0.0.1:55433:5432"'), "compose PG17 divergente");
expect(compose.includes("phase32-pg17-postgres-data") && !compose.includes("phase30-postgres-data"), "compose reutiliza volume PG15");
expect(!compose.includes("latest") && !compose.includes("55432") && !compose.includes("atlas_phase30"), "compose mistura referencia da Fase 30");
expect(JSON.stringify(gate.requiredEventSequence) === JSON.stringify([
  "source_evidence_verified", "runtime_started", "baseline_applied", "migration_applied",
  "pg17_compatibility_verified", "security_verified", "rollback_started", "rollback_verified", "runtime_destroyed"
]), "sequencia PG17 incompleta");
expect(Object.keys(gate.requiredArtifacts).length === 7, "conjunto de artefatos PG17 incompleto");
expect(JSON.stringify(gate.extensionCompatibility.blockedOnPg17) === JSON.stringify(["timescaledb", "plv8", "plcoffee", "plls"]), "extensoes PG17 bloqueadas incompletas");
expect(baseline.includes("create extension if not exists pgcrypto") && !/create\s+extension(?:\s+if\s+not\s+exists)?\s+(timescaledb|plv8|plcoffee|plls)/i.test(`${baseline}\n${migration}`), "SQL exige extensao incompatível");
expect(pg17Verify.includes("server_version_num") && pg17Verify.includes("local_ephemeral_pg17") && pg17Verify.includes("current_user is distinct from 'postgres'"), "verificacao de runtime PG17 incompleta");
for (const extension of gate.extensionCompatibility.blockedOnPg17) expect(pg17Verify.includes(extension), `bloqueio de extensao ausente: ${extension}`);
expect(template.status === "not_run" && template.compatibility.pg17Verified === false, "template alegou compatibilidade executada");
expect(template.rehearsal.permitReservationExecuted === false && Object.values(template.releaseGates).every((value) => value === false), "template abriu gate indevido");
for (const marker of [
  "validatePhase31RuntimeEvidence", "phase32_source_evidence_required", "receipt_evidence_fingerprint_mismatch",
  "shared_artifact_mismatch", "isolated_pg17_runtime_unavailable", '"down", "--volumes", "--remove-orphans"',
  'recordEvent("pg17_compatibility_verified")', "permitReservationExecuted: false", "remoteDatabaseTouched: false",
  "metaTouched: false", "buildExecuted: false"
]) expect(runner.includes(marker), `runner PG17 sem marcador: ${marker}`);
expect(!runner.includes("ATLAS_PHASE32_DB_URL") && !runner.includes("graph.facebook.com") && !runner.includes('"db", "push"') && !runner.includes('"link"'), "runner permite alvo remoto ou Meta");
for (const marker of ["blocked_pg17_extension", "unreviewed_extension", "selfTestPhase32Pg17Compatibility", "pinned_pg17_image_required"]) {
  expect(preflight.includes(marker), `preflight PG17 incompleto: ${marker}`);
}
expect(workflow.includes("ATLAS_PHASE32_HUMAN_APPROVAL") && workflow.includes("run-meta-repeatability-sample-02-pg17-compatibility.mjs"), "workflow nao executa ensaio PG17 governado");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow nao e manual, Node 24 ou executa build");
expect(Object.values(gate.prohibitedActions).every(Boolean), "acao proibida nao declarada");

const report = {
  passed: failures.length === 0,
  assertionCount: 29 + gate.extensionCompatibility.blockedOnPg17.length,
  sourceEvidenceReceived: false,
  runtimeExecuted: false,
  databaseTouched: false,
  metaTouched: false,
  buildExecuted: false,
  failures
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
