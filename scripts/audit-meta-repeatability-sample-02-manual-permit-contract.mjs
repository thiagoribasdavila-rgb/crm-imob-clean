import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-manual-permit-contract-gate.json"));
const runner = read("scripts/run-meta-repeatability-sample-02-manual-permit-contract.mjs");
const preflight = read("scripts/preflight-meta-repeatability-sample-02-manual-permit-contract.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 26 && gate.mode === "ephemeral_consumable_manual_permit_contract_no_issue_no_delivery", "gate da Fase 26 invalido");
expect(gate.requiredSourcePhase === 25 && gate.sourceSignalContract === "config/meta-validation-only-signal-contract.json", "fonte da Fase 26 invalida");
expect(gate.targetSlot.slotId === "repeatability_02" && gate.targetSlot.sampleOrdinal === 2, "slot alvo invalido");
expect(gate.permitPolicy.maximumValiditySeconds === 120 && gate.permitPolicy.atomicConsumptionRequired === true && gate.permitPolicy.contractMayIssuePermit === false, "politica efemera invalida");
expect(gate.operatorBinding.requiredRole === "operator" && gate.operatorBinding.mustMatchPhase25Reconfirmation === true, "vinculo do operador invalido");
expect(gate.antiReplay.durableAtomicLedgerRequiredBeforeIssuance === true && gate.persistedEvidence.rawReferencesAllowed === false, "anti-replay ou persistencia invalida");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");
for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local"]) expect(!runner.includes(forbidden), `runner contem transporte ou segredo: ${forbidden}`);
for (const marker of [
  "ATLAS_PHASE25_JIT_CONFIRMATION_RECEIPT_FILE", "ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_REQUEST_FILE",
  "ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_FILE", "permitIssuanceAllowed: false",
  "manualObservationAllowed: false", "automaticDeliveryAllowed: false"
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
for (const marker of [
  "validatePhase25Receipt", "createManualPermitContract", "validatePhase26Contract",
  "contract_prepared_not_issued", "nonce_source_collision_blocked",
  "permit_issuance_blocked", "raw_operator_reference_not_persisted"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
if (failures.length) {
  console.error("META REPEATABILITY SAMPLE 02 MANUAL PERMIT CONTRACT: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META REPEATABILITY SAMPLE 02 MANUAL PERMIT CONTRACT: aprovada — contrato efemero e consumivel preparado; permissao nao emitida e nenhuma entrega autorizada.");
