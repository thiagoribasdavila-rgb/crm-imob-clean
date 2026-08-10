import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-020.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.rehearsalGate));
const requestTemplate = JSON.parse(read(config.requestTemplate));
const evidenceTemplate = JSON.parse(read(config.evidenceTemplate));
const runner = read(config.packetRunner);
const preflight = read(config.evidencePreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 20 && config.mode === "governed_manual_test_events_rehearsal", "configuracao da Fase 20 invalida");
expect(config.status === "manual_rehearsal_packet_ready_evidence_gate_closed" && config.safeToApply === false, "Fase 20 abriu gate indevido");
expect(previous.phase === 19 && previous.status === "comparison_harness_ready_branch_gate_closed", "baseline da Fase 19 invalido");
expect(config.releaseGate.phase17EvidenceApproved === false && config.releaseGate.phase19EvidenceApproved === false && config.releaseGate.humanApprovalApproved === false, "evidencia ou aprovacao alegada sem prova");
expect(config.releaseGate.manualOperatorRehearsalAllowed === false && config.releaseGate.automaticDeliveryAllowed === false && config.releaseGate.productionReady === false, "execucao Meta indevidamente liberada");
expect(config.governance.temporaryCodePersisted === false && config.governance.payloadPersisted === false && config.governance.responsePersisted === false, "material sensivel persistido");
expect(config.governance.eventMatchQualityEstimated === false && config.governance.optimizationImpactClaimed === false, "alegacao de performance indevida");
expect(config.governance.buildExecuted === false && config.governance.databaseMutation === false, "build ou banco executado");
expect(gate.phase === 20 && gate.authorization.maximumValidityHours === 24 && gate.testScope.maximumDeliveries === 1, "gate do ensaio invalido");
expect(requestTemplate.approvals.directorApproved === false && requestTemplate.approvals.securityApproved === false, "template de solicitacao pre-aprovado");
expect(evidenceTemplate.passed === false && evidenceTemplate.officialExecution.executed === false, "template alegou execucao oficial");

for (const [script, marker] of [
  ["meta:phase-020:audit", "audit-meta-test-events-rehearsal.mjs"],
  ["meta:phase-020:preflight", "preflight-meta-test-events-rehearsal.mjs"],
  ["meta:phase-020:packet", "run-meta-test-events-rehearsal.mjs"],
  ["meta:phase-020:check", "check-meta-intelligence-phase-020.mjs"],
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);

for (const marker of ["createTestEventsRehearsalPacket", "validatePhase20Evidence", "maximumDeliveries: 1", "containsTemporaryCode: false", "false_official_execution_blocked"]) expect(preflight.includes(marker), `preflight sem contrato: ${marker}`);
for (const marker of ["ATLAS_PHASE17_DATA_API_EVIDENCE_FILE", "ATLAS_PHASE19_COMPARISON_EVIDENCE_FILE", "ATLAS_PHASE20_REHEARSAL_REQUEST_FILE", "automaticDeliveryAllowed: false"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META TEST EVENTS REHEARSAL") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of ["Fase 20/100", "um único evento sintético", "não guarda o código temporário", "aprovação da diretoria: **pendente**", "evento oficial de teste: **não executado**", "build: **não executado**"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label, env = process.env) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-test-events-rehearsal.mjs"], "auditoria do ensaio");
run(["scripts/preflight-meta-test-events-rehearsal.mjs", "--self-test"], "autoteste do ensaio");

const blocked = spawnSync(process.execPath, ["scripts/run-meta-test-events-rehearsal.mjs"], {
  cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8",
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem evidencias");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 20: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 20: aprovada — ensaio manual preparado; evidencias, aprovacoes, Meta oficial, producao e build continuam bloqueados.");
