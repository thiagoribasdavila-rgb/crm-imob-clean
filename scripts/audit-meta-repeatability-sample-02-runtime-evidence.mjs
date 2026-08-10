import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-runtime-evidence-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-runtime-evidence-reconciliation-template.json"));
const sourceGate = JSON.parse(read("config/meta-repeatability-sample-02-local-runtime-gate.json"));
const runner = read("scripts/run-meta-repeatability-sample-02-local-runtime.mjs");
const preflight = read("scripts/preflight-meta-repeatability-sample-02-runtime-evidence.mjs");
const reconciler = read("scripts/run-meta-repeatability-sample-02-runtime-evidence-reconciliation.mjs");
const workflow = read(".github/workflows/atlas-meta-phase30-local-rehearsal.yml");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 31 && gate.sourcePhase === 30 && gate.schemaVersion === "phase31.runtime-evidence.v1", "gate de evidencia invalido");
expect(gate.environment === "local_ephemeral" && gate.runtime.targetIdentity === "127.0.0.1:55432/atlas_phase30", "destino da evidencia nao e local");
expect(gate.runtime.postgresImage === sourceGate.runtime.postgresImage && gate.runtime.postgresMajor === 15, "imagem ou major Postgres divergente");
expect(gate.runtime.remoteTarget === false && gate.runtime.productionTarget === false, "destino remoto liberado");
expect(gate.maximumRuntimeMinutes === 20, "janela maxima de runtime invalida");
expect(JSON.stringify(gate.requiredEventSequence) === JSON.stringify([
  "runtime_started", "baseline_applied", "migration_applied", "security_verified",
  "rollback_started", "rollback_verified", "runtime_destroyed"
]), "ordem obrigatoria incompleta");
expect(Object.keys(gate.requiredArtifacts).length === 6, "conjunto de artefatos incompleto");
expect(gate.requiredRehearsalState.permitReservationExecuted === false && Object.values(gate.requiredReleaseGates).every(Boolean), "estado obrigatorio inseguro");
expect(template.status === "not_received" && template.runtimeApproved === false && template.evidenceFingerprint === null, "template alegou evidencia");
for (const marker of [
  'schemaVersion: "phase31.runtime-evidence.v1"', "randomUUID()", "artifactFingerprints", "eventSequence",
  "postgresVersion", 'recordEvent("runtime_destroyed")', "remoteDatabaseTouched: false", "metaTouched: false", "buildExecuted: false"
]) expect(runner.includes(marker), `runner sem marcador: ${marker}`);
for (const marker of [
  "validatePhase31RuntimeEvidence", "artifact_set_mismatch", "event_sequence_mismatch", "sensitive_key",
  "postgres_major_mismatch", "selfTestPhase31RuntimeEvidence"
]) expect(preflight.includes(marker), `preflight sem marcador: ${marker}`);
for (const marker of [
  "missing_runtime_evidence_path", "isSymbolicLink", "runtime_evidence_rejected", "evidenceFingerprint",
  "eventSequenceFingerprint", "ATLAS_PHASE31_RECONCILIATION_FILE"
]) expect(reconciler.includes(marker), `reconciliador sem marcador: ${marker}`);
expect(!runner.includes("ATLAS_PHASE30_DB_URL") && !runner.includes("graph.facebook.com") && !runner.includes('"db", "push"'), "runner admite alvo remoto ou Meta");
expect(workflow.includes("node-version: 24") && workflow.includes("run-meta-repeatability-sample-02-runtime-evidence-reconciliation.mjs"), "workflow nao reconcilia evidencia");
expect(workflow.includes("workflow_dispatch") && !workflow.includes("npm run build"), "workflow deixou de ser manual ou executa build");

const report = {
  passed: failures.length === 0,
  assertionCount: 17,
  runtimeExecuted: false,
  databaseTouched: false,
  metaTouched: false,
  buildExecuted: false,
  failures
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
