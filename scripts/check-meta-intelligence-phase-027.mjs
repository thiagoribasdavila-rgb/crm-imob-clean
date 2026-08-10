import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-027.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.atomicLedgerGate));
const requestTemplate = JSON.parse(read(config.requestTemplate));
const preparationTemplate = JSON.parse(read(config.preparationTemplate));
const runner = read(config.ledgerRunner);
const preflight = read(config.ledgerPreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 27 && config.mode === "sample_02_atomic_single_use_ledger_contract", "configuracao da Fase 27 invalida");
expect(config.status === "atomic_ledger_contract_ready_persistence_gate_closed" && config.safeToApply === false, "Fase 27 abriu gate indevido");
expect(previous.phase === 26 && previous.status === "manual_permit_contract_ready_issuance_gate_closed", "baseline da Fase 26 invalido");
expect(config.releaseGate.ledgerPersistenceAllowed === false && config.releaseGate.permitIssuanceAllowed === false && config.releaseGate.permitConsumptionAllowed === false && config.releaseGate.productionReady === false, "persistencia, emissao, consumo ou producao liberados");
expect(config.governance.compareAndSetRequired === true && config.governance.singleWinnerRequired === true && config.governance.duplicateReservationRejected === true, "contrato atomico incompleto");
expect(config.governance.inMemoryRehearsalOnly === true && config.governance.databaseMutation === false && config.governance.buildExecuted === false, "ensaio saiu da memoria, banco ou build executado");
expect(gate.ledgerPolicy.atomicConsumptionRequired === true && gate.rehearsal.expectedWinnerCount === 1, "consumo ou concorrencia invalidos");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");
expect(requestTemplate.operation.persistReservation === false && requestTemplate.operation.issuePermit === false && preparationTemplate.releaseGates.atomicLedgerContractPrepared === false, "template alegou persistencia ou permissao");
for (const [script, marker] of [
  ["meta:phase-027:audit", "audit-meta-repeatability-sample-02-atomic-ledger.mjs"],
  ["meta:phase-027:preflight", "preflight-meta-repeatability-sample-02-atomic-ledger.mjs"],
  ["meta:phase-027:prepare", "run-meta-repeatability-sample-02-atomic-ledger.mjs"],
  ["meta:phase-027:check", "check-meta-intelligence-phase-027.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "simulateAtomicReservation", "validateAtomicLedgerRequest", "createAtomicLedgerPreparation",
  "validatePhase27Preparation", "single_winner_proven", "duplicate_rejected",
  "ledger_persistence_gate_closed", "revision_conflict_has_no_winner"
]) expect(preflight.includes(marker), `preflight sem ledger: ${marker}`);
for (const marker of ["ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_FILE", "ATLAS_PHASE27_ATOMIC_LEDGER_REQUEST_FILE", "ATLAS_PHASE27_ATOMIC_LEDGER_PREPARATION_FILE"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META REPEATABILITY SAMPLE 02 ATOMIC LEDGER") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of [
  "Fase 27/100", "compare-and-set", "somente em memória",
  "ledger oficial: **não persistido**", "build: **não executado**", "produção: **bloqueada**"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);
const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-atomic-ledger.mjs"], "auditoria do ledger");
run(["scripts/preflight-meta-repeatability-sample-02-atomic-ledger.mjs", "--self-test"], "autoteste do ledger");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-atomic-ledger.mjs"], {
  cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem evidencias");
if (failures.length) {
  console.error("META INTELLIGENCE Fase 27: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 27: aprovada — ledger atomico preparado em memoria; persistencia, emissao, consumo, entrega, producao e build continuam bloqueados.");
