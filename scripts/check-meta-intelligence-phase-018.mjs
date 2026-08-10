import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-018.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const signal = JSON.parse(read(config.signalContract));
const eventTemplate = JSON.parse(read(config.eventInputTemplate));
const evidenceTemplate = JSON.parse(read(config.evidenceTemplate));
const runner = read(config.payloadRunner);
const preflight = read(config.evidencePreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 18 && config.mode === "validation_only_payload_contract", "configuracao da Fase 18 invalida");
expect(config.status === "validation_contract_ready_branch_gate_closed" && config.safeToApply === false, "Fase 18 abriu gate indevido");
expect(previous.phase === 17 && previous.status === "local_contract_audited_branch_evidence_pending", "baseline da Fase 17 invalido");
expect(config.releaseGate.phase17EvidenceApproved === false && config.releaseGate.testEventDeliveryReady === false, "evento Meta liberado sem evidencia");
expect(config.releaseGate.productionReady === false && config.releaseGate.deploymentReady === false, "producao liberada indevidamente");
expect(config.governance.realMetaEventDelivery === false && config.governance.testMetaEventDelivery === false, "entrega Meta nao pode ocorrer");
expect(config.governance.databaseMutation === false && config.governance.buildExecuted === false, "banco ou build executado nesta fase");
expect(config.commercialSignalPolicy.activityIsNotConversion && config.commercialSignalPolicy.confirmedOutcomeRequiredForConvertedLead, "politica comercial incompleta");
expect(signal.phase === 18 && signal.payload.networkDelivery === false, "contrato de payload invalido");
expect(signal.canonicalEvents.BuyerProfile.metaEligible === false, "BuyerProfile nao pode ser entregue");
expect(eventTemplate.synthetic === true && eventTemplate.environment === "staging_clone", "fixture de evento nao e sintetica");
expect(evidenceTemplate.passed === false && evidenceTemplate.remoteExecutionPerformed === false, "template de evidencia alegou execucao");

for (const [script, marker] of [
  ["meta:phase-018:audit", "audit-meta-validation-only-payload.mjs"],
  ["meta:phase-018:preflight", "preflight-meta-validation-only-payload.mjs"],
  ["meta:phase-018:validate", "run-meta-validation-only-payload.mjs"],
  ["meta:phase-018:check", "check-meta-intelligence-phase-018.mjs"],
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);

for (const marker of ["buildValidationOnlyPayload", "validatePhase17Gate", "serverSideSha256", "phase17_gate_closed", "payloadPersisted: false"]) expect(preflight.includes(marker), `preflight sem contrato: ${marker}`);
for (const marker of ["ATLAS_PHASE17_DATA_API_EVIDENCE_FILE", "networkCallExecuted: false", "writeFileSync", "validatePhase18Evidence"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META VALIDATION-ONLY") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of ["Fase 18/100", "Atividade operacional não pode ser apresentada como conversão", "BuyerProfile", "Gate fail-closed", "produção: **bloqueada**", "build: **não executado**"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-validation-only-payload.mjs"], "auditoria validation-only");
run(["scripts/preflight-meta-validation-only-payload.mjs", "--self-test"], "autoteste validation-only");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 18: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 18: aprovada — payload sintetico validado em memoria; branch, rede Meta, producao e build continuam bloqueados.");
