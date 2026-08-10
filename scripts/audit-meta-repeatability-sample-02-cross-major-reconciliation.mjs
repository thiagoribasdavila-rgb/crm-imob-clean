import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-cross-major-reconciliation-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-cross-major-reconciliation-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-cross-major-reconciliation.mjs");
const reconciler = read("scripts/run-meta-repeatability-sample-02-cross-major-reconciliation.mjs");
const workflow = read(".github/workflows/atlas-meta-phase30-local-rehearsal.yml");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 33 && gate.sourcePhase === 32 && gate.environment === "local_evidence_reconciliation", "gate da Fase 33 invalido");
expect(gate.schemaVersion === "phase33.cross-major-reconciliation.v1", "schema do recibo final invalido");
expect(gate.maximumInputBytes === 1048576 && gate.maximumRuntimeMinutes === 20, "limites de evidencia invalidos");
expect(gate.sourceSchemas.phase30Evidence === "phase31.runtime-evidence.v1", "schema da evidencia PG15 invalido");
expect(gate.sourceSchemas.phase31Receipt === "phase31.runtime-reconciliation.v1", "schema do recibo PG15 invalido");
expect(gate.sourceSchemas.phase32Evidence === "phase32.pg17-compatibility-evidence.v1", "schema da evidencia PG17 invalido");
expect(gate.runtimes.pg15.postgresMajor === 15 && gate.runtimes.pg17.postgresMajor === 17, "majors PostgreSQL invalidos");
expect(gate.runtimes.pg15.postgresImage === "supabase/postgres:15.14.1.149" && gate.runtimes.pg17.postgresImage === "supabase/postgres:17.6.1.149", "imagens PostgreSQL nao fixadas");
expect(gate.runtimes.pg15.targetIdentity !== gate.runtimes.pg17.targetIdentity, "alvos PG15 e PG17 nao sao distintos");
expect(gate.runtimes.pg17.currentUser === "postgres", "owner PG17 invalido");
expect(gate.requiredPhase32EventSequence.length === 9, "sequencia PG17 incompleta");
expect(Object.keys(gate.requiredPhase32Artifacts).length === 7, "artefatos PG17 incompletos");
expect(Object.keys(gate.sharedArtifactMapping).length === 5, "mapeamento compartilhado incompleto");
expect(JSON.stringify(gate.blockedPg17Extensions) === JSON.stringify(["timescaledb", "plv8", "plcoffee", "plls"]), "extensoes bloqueadas divergentes");
expect(gate.requiredPhase32RehearsalState.permitReservationExecuted === false, "reserva de permissao liberada");
expect(Object.values(gate.requiredPhase32ReleaseGates).every(Boolean), "gates PG17 obrigatorios incompletos");
expect(Object.values(gate.prohibitedClaims).every(Boolean), "declaracao proibida ausente");
expect(template.status === "not_received" && template.crossMajorApproved === false, "template alegou conciliacao");
expect(template.productionCompatibilityApproved === false && template.remoteDatabaseTouched === false && template.metaTouched === false && template.buildExecuted === false, "template liberou producao ou mutacao");

for (const marker of [
  "validatePhase32RuntimeEvidence", "validatePhase33CrossMajorSources", "runtime_targets_not_distinct",
  "cross_major_shared_artifact_mismatch", "blockedExtensionsDetected", "findSensitiveEvidence",
  "selfTestPhase33CrossMajorReconciliation"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase33_source_evidence_paths_required", "isSymbolicLink", "maximumInputBytes",
  "phase33_cross_major_evidence_rejected", "sourceFingerprints", "crossMajorApproved: true",
  "productionCompatibilityApproved: false", "phase33_output_parent_unsafe", "chmodSync",
  "remoteDatabaseTouched: false", "metaTouched: false", "buildExecuted: false"
]) expect(reconciler.includes(marker), `reconciliador incompleto: ${marker}`);
expect(!reconciler.includes("DATABASE_URL") && !reconciler.includes("graph.facebook.com") && !reconciler.includes("docker compose") && !reconciler.includes("npm run build"), "reconciliador tenta acessar runtime, Meta ou build");
expect(workflow.includes("run-meta-repeatability-sample-02-cross-major-reconciliation.mjs"), "workflow nao reconcilia PG15 x PG17");
expect(workflow.includes("ATLAS_PHASE33_RECONCILIATION_FILE"), "workflow nao persiste recibo da Fase 33");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow deixou de ser manual, Node 24 ou executa build");

const report = {
  passed: failures.length === 0,
  assertionCount: 31,
  sourceEvidenceReceived: false,
  reconciliationExecuted: false,
  databaseTouched: false,
  metaTouched: false,
  buildExecuted: false,
  failures
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
