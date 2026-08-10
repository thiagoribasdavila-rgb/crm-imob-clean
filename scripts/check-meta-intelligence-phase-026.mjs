import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-026.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const gate = JSON.parse(read(config.permitContractGate));
const requestTemplate = JSON.parse(read(config.requestTemplate));
const contractTemplate = JSON.parse(read(config.contractTemplate));
const runner = read(config.contractRunner);
const preflight = read(config.contractPreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 26 && config.mode === "sample_02_ephemeral_consumable_manual_permit_contract", "configuracao da Fase 26 invalida");
expect(config.status === "manual_permit_contract_ready_issuance_gate_closed" && config.safeToApply === false, "Fase 26 abriu gate indevido");
expect(previous.phase === 25 && previous.status === "jit_confirmation_ready_activation_gate_closed", "baseline da Fase 25 invalido");
expect(config.releaseGate.permitIssuanceAllowed === false && config.releaseGate.manualObservationAllowed === false && config.releaseGate.productionReady === false, "emissao, observacao ou producao liberadas");
expect(config.governance.maximumValiditySeconds === 120 && config.governance.atomicConsumptionRequired === true && config.governance.singleUse === true, "contrato nao efemero ou consumivel");
expect(config.governance.operatorBoundToPhase25 === true && config.governance.rawReferencesPersisted === false, "operador sem vinculo ou referencia bruta liberada");
expect(config.governance.buildExecuted === false && config.governance.databaseMutation === false, "build ou banco executado");
expect(gate.targetSlot.slotId === "repeatability_02" && gate.antiReplay.durableAtomicLedgerRequiredBeforeIssuance === true, "slot ou anti-replay invalido");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");
expect(requestTemplate.issuance.issued === false && contractTemplate.releaseGates.manualPermitContractPrepared === false, "template alegou permissao");
for (const [script, marker] of [
  ["meta:phase-026:audit", "audit-meta-repeatability-sample-02-manual-permit-contract.mjs"],
  ["meta:phase-026:preflight", "preflight-meta-repeatability-sample-02-manual-permit-contract.mjs"],
  ["meta:phase-026:contract", "run-meta-repeatability-sample-02-manual-permit-contract.mjs"],
  ["meta:phase-026:check", "check-meta-intelligence-phase-026.mjs"]
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);
for (const marker of [
  "validateManualPermitContractRequest", "createManualPermitContract", "validatePhase26Contract",
  "contract_not_issued", "nonce_source_collision_blocked", "permit_issuance_blocked",
  "raw_operator_reference_not_persisted"
]) expect(preflight.includes(marker), `preflight sem contrato: ${marker}`);
for (const marker of ["ATLAS_PHASE25_JIT_CONFIRMATION_RECEIPT_FILE", "ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_REQUEST_FILE", "ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_FILE"]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
expect(audit.includes("META REPEATABILITY SAMPLE 02 MANUAL PERMIT CONTRACT") && audit.includes("fetch("), "auditoria estatica incompleta");
for (const marker of [
  "Fase 26/100", "não emite", "entre 15 e 120 segundos",
  "contrato oficial: **não gerado**", "build: **não executado**", "produção: **bloqueada**"
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);
const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 900)}`);
};
run(["scripts/audit-meta-repeatability-sample-02-manual-permit-contract.mjs"], "auditoria do contrato");
run(["scripts/preflight-meta-repeatability-sample-02-manual-permit-contract.mjs", "--self-test"], "autoteste do contrato");
const blocked = spawnSync(process.execPath, ["scripts/run-meta-repeatability-sample-02-manual-permit-contract.mjs"], {
  cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH ?? "" }, encoding: "utf8"
});
expect(blocked.status !== 0 && blocked.stderr.includes("missing_required_environment"), "runner nao falhou fechado sem evidencias");
if (failures.length) {
  console.error("META INTELLIGENCE Fase 26: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 26: aprovada — contrato efemero pronto; emissao, observacao, entrega, producao e build continuam bloqueados.");
