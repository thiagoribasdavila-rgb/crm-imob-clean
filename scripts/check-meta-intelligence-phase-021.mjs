import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-021.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.observationGate));
const inputTemplate = JSON.parse(read(config.observationInputTemplate));
const receiptTemplate = JSON.parse(read(config.receiptTemplate));
const runner = read(config.receiptRunner);
const preflight = read(config.receiptPreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 21 && config.mode === "sanitized_test_events_observation_receipt", "configuracao da Fase 21 invalida");
expect(config.status === "observation_receipt_ready_execution_gate_closed" && config.safeToApply === false, "Fase 21 abriu gate indevido");
expect(previous.phase === 20 && previous.status === "manual_rehearsal_packet_ready_evidence_gate_closed", "baseline da Fase 20 invalido");
expect(config.releaseGate.phase20EvidenceApproved === false && config.releaseGate.humanObservationApproved === false && config.releaseGate.officialTestObservationApproved === false, "evidencia ou observacao real alegada sem prova");
expect(config.releaseGate.automaticRetryAllowed === false && config.releaseGate.automaticDeliveryAllowed === false && config.releaseGate.productionReady === false, "repeticao ou producao indevidamente liberada");
expect(config.governance.temporaryCodePersisted === false && config.governance.payloadPersisted === false && config.governance.rawResponsePersisted === false && config.governance.screenshotPersisted === false, "artefato sensivel persistido");
expect(config.governance.eventMatchQualityEstimated === false && config.governance.optimizationImpactClaimed === false, "alegacao de performance indevida");
expect(config.governance.buildExecuted === false && config.governance.databaseMutation === false, "build ou banco executado");
expect(gate.phase === 21 && gate.observationWindow.maximumObservationDelayMinutes === 30 && gate.observationWindow.maximumReceiptAgeMinutes === 120, "janela de observacao invalida");
expect(gate.testScope.maximumDeliveries === 1 && gate.testScope.automaticRetryAllowed === false, "escopo de entrega invalido");
expect(inputTemplate.attestations.operatorConfirmed === false && inputTemplate.attestations.reviewerConfirmed === false, "template de entrada pre-atestado");
expect(receiptTemplate.passed === false && receiptTemplate.releaseGates.officialTestObservationApproved === false, "template alegou observacao oficial");

for (const [script, marker] of [
  ["meta:phase-021:audit", "audit-meta-test-events-observation.mjs"],
  ["meta:phase-021:preflight", "preflight-meta-test-events-observation.mjs"],
  ["meta:phase-021:receipt", "run-meta-test-events-observation-receipt.mjs"],
  ["meta:phase-021:check", "check-meta-intelligence-phase-021.mjs"],
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);

for (const marker of [
  "createObservationReceipt", "validatePhase21Receipt", "single_delivery_required",
  "automatic_retry_stays_blocked", "performance_claim_blocked",
]) expect(preflight.includes(marker), `preflight sem contrato: ${marker}`);
for (const marker of [
  "ATLAS_PHASE20_REHEARSAL_EVIDENCE_FILE", "ATLAS_PHASE21_OBSERVATION_INPUT_FILE",
  "ATLAS_PHASE21_OBSERVATION_RECEIPT_FILE", "automaticRetryAllowed: false",
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META TEST EVENTS OBSERVATION") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of [
  "Fase 21/100", "uma única entrega", "não executa o evento", "execução manual oficial: **não executada**",
  "produção: **bloqueada**", "build: **não executado**",
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label, env = process.env) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-test-events-observation.mjs"], "auditoria do recibo");
run(["scripts/preflight-meta-test-events-observation.mjs", "--self-test"], "autoteste do recibo");

const blocked = spawnSync(process.execPath, ["scripts/run-meta-test-events-observation-receipt.mjs"], {
  cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8",
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 21: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 21: aprovada — recibo sanitizado preparado; execucao oficial, repeticao, producao e build continuam bloqueados.");
