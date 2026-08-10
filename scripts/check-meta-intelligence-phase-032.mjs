import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-032.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.compatibilityGate));
const template = JSON.parse(read(config.evidenceTemplate));
const compose = read(config.composeFile);
const runner = read(config.runner);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 32 && config.mode === "sample_02_fresh_postgres17_compatibility_rehearsal", "configuracao da Fase 32 invalida");
expect(config.status === "pg17_compatibility_runtime_prepared_source_evidence_missing" && config.safeToApply === false, "Fase 32 abriu gate indevido");
expect(previous.phase === 31 && previous.status === "runtime_evidence_contract_prepared_execution_evidence_missing", "baseline da Fase 31 invalido");
expect(config.environmentAudit.freshPg17ComposePrepared === true && config.environmentAudit.sourceEvidenceChainRequired === true, "preparacao PG17 incompleta");
expect(config.environmentAudit.sourceRuntimeEvidenceReceived === false && config.environmentAudit.pg17CompatibilityExecuted === false, "execucao inexistente foi alegada");
expect(config.environmentAudit.databaseMutationExecuted === false && config.environmentAudit.metaMutationExecuted === false && config.environmentAudit.buildExecuted === false, "mutacao ou build indevido");
expect(config.releaseGate.staticCompatibilityContractApproved === true && config.releaseGate.extensionCompatibilityContractApproved === true, "contrato de compatibilidade incompleto");
expect(config.releaseGate.sourceEvidenceApproved === false && config.releaseGate.pg17CompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "gate futuro liberado");
expect(config.governance.pg15VolumeReuse === false && config.governance.freshPg17VolumeRequired === true, "isolamento de volume invalido");
expect(config.governance.remoteDatabaseAccess === false && config.governance.productionAccess === false && config.governance.realMetaEventDelivery === false, "acesso remoto ou Meta liberado");
expect(gate.phase === 32 && gate.runtime.postgresImage === "supabase/postgres:17.6.1.149" && gate.runtime.postgresMajor === 17, "gate PG17 invalido");
expect(gate.runtime.port === 55433 && gate.runtime.volume === "phase32-pg17-postgres-data" && gate.runtime.reusesPg15Volume === false, "runtime PG17 nao isolado");
expect(gate.requiredEventSequence.length === 9 && Object.keys(gate.requiredArtifacts).length === 7, "evidencia PG17 incompleta");
expect(template.status === "not_run" && template.releaseGates.pg17CompatibilityApproved === false, "template alegou execucao");
expect(compose.includes("supabase/postgres:17.6.1.149") && compose.includes('"127.0.0.1:55433:5432"') && !compose.includes("phase30-postgres-data"), "compose PG17 invalido");
for (const marker of [
  "validatePhase31RuntimeEvidence", "phase32_source_evidence_required", "isolated_pg17_runtime_unavailable",
  "sharedArtifactFingerprintsMatched: true", 'recordEvent("source_evidence_verified")',
  'recordEvent("runtime_destroyed")', "remoteDatabaseTouched: false", "metaTouched: false", "buildExecuted: false"
]) expect(runner.includes(marker), `runner incompleto: ${marker}`);
expect(workflow.includes("timeout-minutes: 40") && workflow.includes("ATLAS_PHASE32_HUMAN_APPROVAL") && workflow.includes("ATLAS_PHASE32_EVIDENCE_FILE"), "workflow PG17 incompleto");
expect(workflow.includes("node-version: 24") && workflow.includes("workflow_dispatch") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-032:audit", "audit-meta-repeatability-sample-02-pg17-compatibility.mjs"],
  ["meta:phase-032:preflight", "preflight-meta-repeatability-sample-02-pg17-compatibility.mjs"],
  ["meta:phase-032:compatibility", "run-meta-repeatability-sample-02-pg17-compatibility.mjs"],
  ["meta:phase-032:check", "check-meta-intelligence-phase-032.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "Fase 32/100", "PostgreSQL 17", "não foi executado", "não recebida", "não tocados",
  "não reservada", "não executado", "phase32-pg17-postgres-data"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-pg17-compatibility.mjs"], "auditoria PG17");
run(["scripts/preflight-meta-repeatability-sample-02-pg17-compatibility.mjs", "--self-test"], "autoteste PG17");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-pg17-compatibility.mjs"], {
  cwd: root,
  env: {
    PATH: process.env.PATH ?? "",
    ATLAS_PHASE32_HUMAN_APPROVAL: "EXECUTE_PHASE32_PG17_LOCAL_EPHEMERAL_ONLY"
  },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("phase32_source_evidence_required"), "executor PG17 nao falhou fechado sem evidencia fonte");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 32: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 32: aprovada — ensaio complementar PG17 isolado, encadeado por evidencias e hashes, com volume novo e extensoes incompatíveis bloqueadas; execucao, banco remoto, Meta, permissao, producao e build continuam bloqueados.");
