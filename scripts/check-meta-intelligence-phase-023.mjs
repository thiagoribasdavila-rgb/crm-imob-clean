import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-023.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.repeatabilityGate));
const template = JSON.parse(read(config.planTemplate));
const runner = read(config.planRunner);
const preflight = read(config.planPreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 23 && config.mode === "sanitized_test_events_repeatability_plan", "configuracao da Fase 23 invalida");
expect(config.status === "repeatability_plan_ready_execution_gate_closed" && config.safeToApply === false, "Fase 23 abriu gate indevido");
expect(previous.phase === 22 && previous.status === "evidence_reconciliation_ready_external_evidence_gate_closed", "baseline da Fase 22 invalido");
expect(config.releaseGate.plannedAdditionalObservations === 2 && config.releaseGate.technicalRepeatabilityProven === false, "amostragem ou repetibilidade alegada sem prova");
expect(config.releaseGate.nextControlledTestAllowed === false && config.releaseGate.automaticDeliveryAllowed === false && config.releaseGate.productionReady === false, "execucao, automacao ou producao liberadas");
expect(config.governance.newAuthorizationPerObservation === true && config.governance.futureAuthorizationPersisted === false, "governanca de autorizacao invalida");
expect(config.governance.eventMatchQualityEstimated === false && config.governance.optimizationImpactClaimed === false, "performance alegada sem base");
expect(config.governance.buildExecuted === false && config.governance.databaseMutation === false, "build ou banco executado");
expect(gate.sampling.baselineApprovedSamples === 1 && gate.sampling.targetApprovedSamples === 3 && gate.sampling.additionalObservationsPlanned === 2, "plano de amostragem invalido");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo do plano aberto");
expect(template.passed === false && template.releaseGates.repeatabilityPlanPrepared === false, "template alegou plano aprovado");

for (const [script, marker] of [
  ["meta:phase-023:audit", "audit-meta-test-events-repeatability-plan.mjs"],
  ["meta:phase-023:preflight", "preflight-meta-test-events-repeatability-plan.mjs"],
  ["meta:phase-023:plan", "run-meta-test-events-repeatability-plan.mjs"],
  ["meta:phase-023:check", "check-meta-intelligence-phase-023.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "createRepeatabilityPlan", "validatePhase23Plan", "one_baseline_plus_two_planned",
  "all_future_slots_blocked", "technical_repeatability_not_preclaimed",
  "next_test_stays_blocked", "future_fingerprint_not_persisted"
]) expect(preflight.includes(marker), `preflight sem contrato: ${marker}`);
for (const marker of ["ATLAS_PHASE22_RECONCILIATION_EVIDENCE_FILE", "ATLAS_PHASE23_REPEATABILITY_PLAN_FILE"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META TEST EVENTS REPEATABILITY PLAN") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of [
  "Fase 23/100", "uma amostra sintética reconciliada como linha de base",
  "O ATLAS não envia, agenda nem repete eventos", "plano oficial: **não gerado**",
  "produção: **bloqueada**", "build: **não executado**"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-test-events-repeatability-plan.mjs"], "auditoria do plano");
run(["scripts/preflight-meta-test-events-repeatability-plan.mjs", "--self-test"], "autoteste do plano");

const blocked = spawnSync(process.execPath, ["scripts/run-meta-test-events-repeatability-plan.mjs"], {
  cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem evidencia");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 23: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 23: aprovada — plano 1+2 preparado; nenhuma repeticao foi autorizada e automacao, producao e build continuam bloqueados.");
