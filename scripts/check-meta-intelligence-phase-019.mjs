import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-019.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.qualityGate));
const evidenceTemplate = JSON.parse(read(config.evidenceTemplate));
const runner = read(config.comparisonRunner);
const preflight = read(config.evidencePreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 19 && config.mode === "sanitized_payload_quality_comparison", "configuracao da Fase 19 invalida");
expect(config.status === "comparison_harness_ready_branch_gate_closed" && config.safeToApply === false, "Fase 19 abriu gate indevido");
expect(previous.phase === 18 && previous.status === "validation_contract_ready_branch_gate_closed", "baseline da Fase 18 invalido");
expect(config.releaseGate.phase17EvidenceApproved === false && config.releaseGate.officialMetaComparisonApproved === false, "comparacao oficial alegada sem prova");
expect(config.releaseGate.testEventDeliveryReady === false && config.releaseGate.productionReady === false, "entrega Meta liberada");
expect(config.governance.eventMatchQualityEstimated === false && config.governance.optimizationImpactClaimed === false, "alegacao de performance indevida");
expect(config.governance.payloadPersisted === false && config.governance.matchValuesPersisted === false, "payload ou valores foram persistidos");
expect(config.governance.buildExecuted === false && config.governance.databaseMutation === false, "build ou banco executado");
expect(gate.phase === 19 && gate.officialComparison.status === "pending", "gate de qualidade invalido");
expect(evidenceTemplate.passed === false && evidenceTemplate.officialMetaComparison.executed === false, "template alegou execucao oficial");

for (const [script, marker] of [
  ["meta:phase-019:audit", "audit-meta-validation-comparison.mjs"],
  ["meta:phase-019:preflight", "preflight-meta-validation-comparison.mjs"],
  ["meta:phase-019:compare", "run-meta-validation-comparison.mjs"],
  ["meta:phase-019:check", "check-meta-intelligence-phase-019.mjs"],
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);

for (const marker of ["createValidationComparison", "validatePhase18Evidence", "eventMatchQualityEstimated: false", "official_comparison_falsely_claimed", "payloadPersisted: false"]) expect(preflight.includes(marker), `preflight sem contrato: ${marker}`);
for (const marker of ["ATLAS_PHASE17_DATA_API_EVIDENCE_FILE", "ATLAS_PHASE19_COMPARISON_EVIDENCE_FILE", "officialComparisonApproved: false", "networkCallExecuted: false"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META VALIDATION COMPARISON") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of ["Fase 19/100", "Presença não é qualidade comprovada", "não estima `Event Match Quality`", "comparação oficial Meta: **pendente**", "produção: **bloqueada**", "build: **não executado**"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-validation-comparison.mjs"], "auditoria da comparacao");
run(["scripts/preflight-meta-validation-comparison.mjs", "--self-test"], "autoteste da comparacao");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 19: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 19: aprovada — comparacao local sanitizada pronta; branch, Meta oficial, producao e build continuam bloqueados.");
