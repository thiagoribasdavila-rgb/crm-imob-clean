import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-022.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.reconciliationGate));
const template = JSON.parse(read(config.evidenceTemplate));
const runner = read(config.reconciliationRunner);
const preflight = read(config.evidencePreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 22 && config.mode === "sanitized_test_events_evidence_reconciliation", "configuracao da Fase 22 invalida");
expect(config.status === "evidence_reconciliation_ready_external_evidence_gate_closed" && config.safeToApply === false, "Fase 22 abriu gate indevido");
expect(previous.phase === 21 && previous.status === "observation_receipt_ready_execution_gate_closed", "baseline da Fase 21 invalido");
expect(config.releaseGate.officialEvidenceChainReconciled === false && config.releaseGate.singleSampleSufficientForAutomation === false, "evidencia ou automacao alegada sem prova");
expect(config.releaseGate.nextControlledTestAllowed === false && config.releaseGate.automaticRetryAllowed === false && config.releaseGate.productionReady === false, "novo teste, repeticao ou producao liberados");
expect(config.governance.payloadPersisted === false && config.governance.rawResponsePersisted === false && config.governance.temporaryCodePersisted === false, "artefato sensivel persistido");
expect(config.governance.eventMatchQualityEstimated === false && config.governance.optimizationImpactClaimed === false, "performance alegada sem base");
expect(config.governance.buildExecuted === false && config.governance.databaseMutation === false, "build ou banco executado");
expect(gate.requiredPhases.join(",") === "19,20,21" && gate.scope.maximumObservedDeliveries === 1, "cadeia ou escopo invalido");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo da reconciliacao aberto");
expect(template.passed === false && template.releaseGates.evidenceChainReconciled === false, "template alegou reconciliacao");

for (const [script, marker] of [
  ["meta:phase-022:audit", "audit-meta-test-events-evidence-reconciliation.mjs"],
  ["meta:phase-022:preflight", "preflight-meta-test-events-evidence-reconciliation.mjs"],
  ["meta:phase-022:reconcile", "run-meta-test-events-evidence-reconciliation.mjs"],
  ["meta:phase-022:check", "check-meta-intelligence-phase-022.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "createEvidenceReconciliation", "validatePhase22Evidence", "phase19_to_phase20_link_mismatch",
  "phase20_to_phase21_link_mismatch", "single_sample_not_overclaimed",
  "next_test_requires_new_authorization"
]) expect(preflight.includes(marker), `preflight sem contrato: ${marker}`);
for (const marker of [
  "ATLAS_PHASE19_COMPARISON_EVIDENCE_FILE", "ATLAS_PHASE20_REHEARSAL_EVIDENCE_FILE",
  "ATLAS_PHASE21_OBSERVATION_RECEIPT_FILE", "ATLAS_PHASE22_RECONCILIATION_EVIDENCE_FILE"
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META TEST EVENTS EVIDENCE RECONCILIATION") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of [
  "Fase 22/100", "uma única entrega sintética observada", "não envia nem repete eventos",
  "reconciliação oficial: **não executada**", "produção: **bloqueada**", "build: **não executado**"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-test-events-evidence-reconciliation.mjs"], "auditoria da reconciliacao");
run(["scripts/preflight-meta-test-events-evidence-reconciliation.mjs", "--self-test"], "autoteste da reconciliacao");

const blocked = spawnSync(process.execPath, ["scripts/run-meta-test-events-evidence-reconciliation.mjs"], {
  cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 22: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 22: aprovada — reconciliacao 19-21 preparada; nova execucao, repeticao, automacao, producao e build continuam bloqueados.");
