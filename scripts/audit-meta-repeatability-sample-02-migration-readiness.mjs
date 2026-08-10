import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-migration-readiness-gate.json"));
const template = JSON.parse(read("config/fixtures/meta-repeatability-sample-02-migration-readiness-template.json"));
const preflight = read("scripts/preflight-meta-repeatability-sample-02-migration-readiness.mjs");
const assessor = read("scripts/run-meta-repeatability-sample-02-migration-readiness.mjs");
const workflow = read(".github/workflows/atlas-meta-phase30-local-rehearsal.yml");
const failures = [];
let assertionCount = 0;
const expect = (condition, message) => {
  assertionCount += 1;
  if (!condition) failures.push(message);
};

expect(gate.phase === 34 && gate.sourcePhase === 33 && gate.environment === "local_readiness_assessment", "gate da Fase 34 invalido");
expect(gate.schemaVersion === "phase34.migration-readiness.v1", "schema da matriz de prontidao invalido");
expect(gate.maximumInputBytes === 1048576, "limite do recibo de origem invalido");
expect(gate.sourceReceipt.schemaVersion === "phase33.cross-major-reconciliation.v1", "schema de origem invalido");
expect(gate.sourceReceipt.status === "approved" && gate.sourceReceipt.crossMajorApproved === true, "origem nao exige conciliacao aprovada");
expect(gate.sourceReceipt.productionCompatibilityApproved === false, "origem alegou compatibilidade de producao");
expect(gate.runtimes.pg15.postgresMajor === 15 && gate.runtimes.pg17.postgresMajor === 17, "majors PostgreSQL invalidos");
expect(gate.runtimes.pg15.postgresImage === "supabase/postgres:15.14.1.149" && gate.runtimes.pg17.postgresImage === "supabase/postgres:17.6.1.149", "imagens PostgreSQL nao fixadas");

const inherited = gate.verifiedFromPhase33;
const pending = gate.requiredBeforeProduction;
const allControls = [...inherited, ...pending];
expect(inherited.length === 5, "controles herdados da Fase 33 invalidos");
expect(pending.length === 10, "controles pendentes de producao invalidos");
expect(allControls.length === 15 && new Set(allControls).size === 15, "matriz de controles duplicada ou incompleta");
expect(gate.evidenceCoverage.verifiedControls === 5 && gate.evidenceCoverage.requiredControls === 15 && gate.evidenceCoverage.percent === 33, "cobertura esperada invalida");
expect(Object.values(gate.requiredBlockedState).every((value) => value === false), "estado bloqueado abriu gate");
expect(Object.values(gate.prohibitedActions).every(Boolean), "acao proibida ausente");

expect(template.schemaVersion === gate.schemaVersion && template.status === "not_assessed", "template da Fase 34 invalido");
expect(Object.keys(template.controls).length === 15 && Object.values(template.controls).every((value) => value === false), "template alegou controle verificado");
expect(template.evidenceCoverage.verifiedControls === 0 && template.evidenceCoverage.requiredControls === 15 && template.evidenceCoverage.percent === 0, "template alegou cobertura");
expect(template.stagingMigrationAllowed === false && template.productionMigrationAllowed === false && template.productionCompatibilityApproved === false, "template liberou migracao");
expect(template.remoteDatabaseTouched === false && template.metaTouched === false && template.buildExecuted === false, "template alegou mutacao ou build");

for (const marker of [
  "validatePhase34SourceReceipt", "evaluatePhase34MigrationReadiness", "findSensitiveEvidence",
  "phase33_source_fingerprint_set_mismatch", "phase33_production_claim_invalid",
  "selfTestPhase34MigrationReadiness"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
for (const marker of [
  "phase34_source_reconciliation_path_required", "isSymbolicLink", "maximumInputBytes",
  "phase34_source_reconciliation_rejected", "sourceReceiptFingerprint", "assessment_complete_blocked",
  "phase34_output_parent_unsafe", "chmodSync", "stagingMigrationAllowed: false",
  "productionMigrationAllowed: false", "remoteDatabaseTouched: false", "metaTouched: false",
  "buildExecuted: false"
]) expect(assessor.includes(marker), `avaliador incompleto: ${marker}`);
expect(!assessor.includes("DATABASE_URL") && !assessor.includes("graph.facebook.com") && !assessor.includes("docker compose"), "avaliador tenta acessar banco, Docker ou Meta");
expect(!assessor.includes("supabase db push") && !assessor.includes("npm run build"), "avaliador tenta publicar banco ou executar build");
expect(workflow.includes("Assess migration readiness without production access"), "workflow nao executa a Fase 34");
expect(workflow.includes("ATLAS_PHASE33_RECONCILIATION_FILE") && workflow.includes("ATLAS_PHASE34_READINESS_FILE"), "workflow nao encadeia os recibos das Fases 33 e 34");
expect(workflow.includes("artifacts/meta-phase34-migration-readiness.json"), "workflow nao preserva a matriz da Fase 34");
expect(workflow.includes("workflow_dispatch") && workflow.includes("node-version: 24") && !workflow.includes("npm run build"), "workflow deixou de ser manual, Node 24 ou executa build");

const report = {
  passed: failures.length === 0,
  assertionCount,
  sourceEvidenceReceived: false,
  assessmentExecuted: false,
  currentEvidenceCoveragePercent: 0,
  databaseTouched: false,
  metaTouched: false,
  buildExecuted: false,
  failures
};
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exit(1);
