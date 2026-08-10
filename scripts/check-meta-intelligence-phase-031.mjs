import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-031.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.evidenceGate));
const template = JSON.parse(read(config.reconciliationTemplate));
const runner = read(config.sourceRunner);
const workflow = read(config.manualWorkflow);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 31 && config.mode === "sample_02_runtime_evidence_contract_and_reconciliation", "configuracao da Fase 31 invalida");
expect(config.status === "runtime_evidence_contract_prepared_execution_evidence_missing" && config.safeToApply === false, "Fase 31 abriu gate indevido");
expect(previous.phase === 30 && previous.status === "local_ephemeral_runtime_prepared_execution_blocked", "baseline da Fase 30 invalido");
expect(config.environmentAudit.runtimeEvidenceReceived === false && config.environmentAudit.localRehearsalExecuted === false, "execucao inexistente foi alegada");
expect(config.environmentAudit.databaseMutationExecuted === false && config.environmentAudit.metaMutationExecuted === false && config.environmentAudit.buildExecuted === false, "mutacao ou build indevido");
expect(config.releaseGate.evidenceSchemaApproved === true && config.releaseGate.failClosedReconciliationApproved === true, "contrato de evidencia incompleto");
expect(config.releaseGate.runtimeEvidenceApproved === false && config.releaseGate.postgres17CompatibilityApproved === false && config.releaseGate.nextPhaseAllowed === false, "gate futuro liberado");
expect(config.governance.remoteDatabaseAccess === false && config.governance.productionAccess === false && config.governance.realMetaEventDelivery === false, "acesso remoto ou Meta liberado");
expect(gate.schemaVersion === "phase31.runtime-evidence.v1" && gate.requiredEventSequence.length === 7, "gate ou sequencia invalida");
expect(Object.keys(gate.requiredArtifacts).length === 6 && gate.maximumRuntimeMinutes === 20, "integridade de artefatos incompleta");
expect(template.status === "not_received" && template.runtimeApproved === false, "template alegou reconciliacao");
for (const marker of ["artifactFingerprints", "eventSequence", "postgresVersion", 'recordEvent("runtime_destroyed")']) expect(runner.includes(marker), `runner incompleto: ${marker}`);
expect(workflow.includes("node-version: 24") && workflow.includes("ATLAS_PHASE31_RUNTIME_EVIDENCE_FILE") && !workflow.includes("npm run build"), "workflow invalido");
for (const [script, marker] of [
  ["meta:phase-031:audit", "audit-meta-repeatability-sample-02-runtime-evidence.mjs"],
  ["meta:phase-031:preflight", "preflight-meta-repeatability-sample-02-runtime-evidence.mjs"],
  ["meta:phase-031:reconcile", "run-meta-repeatability-sample-02-runtime-evidence-reconciliation.mjs"],
  ["meta:phase-031:check", "check-meta-intelligence-phase-031.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of ["Fase 31/100", "prova técnica verificável", "não foi executado", "não recebida", "não tocados", "não executado"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1600)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-runtime-evidence.mjs"], "auditoria do contrato de evidencia");
run(["scripts/preflight-meta-repeatability-sample-02-runtime-evidence.mjs", "--self-test"], "autoteste da evidencia");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-runtime-evidence-reconciliation.mjs"], {
  cwd: root,
  env: { PATH: process.env.PATH ?? "" },
  encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_runtime_evidence_path"), "reconciliador nao falhou fechado sem evidencia");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 31: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 31: aprovada — contrato de evidencia ordenada, versionada, sem segredos e vinculada por hashes preparado; ensaio, banco remoto, Meta, permissao, producao e build continuam bloqueados.");
