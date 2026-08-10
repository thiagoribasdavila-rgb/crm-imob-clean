import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-atomic-ledger-gate.json"));
const runner = read("scripts/run-meta-repeatability-sample-02-atomic-ledger.mjs");
const preflight = read("scripts/preflight-meta-repeatability-sample-02-atomic-ledger.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 27 && gate.mode === "atomic_single_use_ledger_contract_no_persistence_no_issue_no_delivery", "gate da Fase 27 invalido");
expect(gate.requiredSourcePhase === 26 && gate.sourceSignalContract === "config/meta-validation-only-signal-contract.json", "fonte da Fase 27 invalida");
expect(gate.targetSlot.slotId === "repeatability_02" && gate.targetSlot.sampleOrdinal === 2, "slot alvo invalido");
expect(gate.ledgerPolicy.strategy === "compare_and_set" && gate.ledgerPolicy.singleWinnerRequired === true, "politica atomica invalida");
expect(gate.ledgerPolicy.ledgerMayPersistReservation === false && gate.ledgerPolicy.ledgerMayIssuePermit === false && gate.ledgerPolicy.ledgerMayConsumePermit === false, "ledger avancou estado indevido");
expect(gate.rehearsal.inMemoryOnly === true && gate.rehearsal.databaseConnectionAllowed === false && gate.rehearsal.filesystemLedgerAllowed === false && gate.rehearsal.networkAllowed === false, "ensaio saiu da memoria");
expect(gate.persistedEvidence.rawReferencesAllowed === false && Object.values(gate.releaseGate).every((value) => value === false), "persistencia sensivel ou gate externo aberto");
for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local", "createClient(", "supabase.from("]) expect(!runner.includes(forbidden), `runner contem transporte, banco ou segredo: ${forbidden}`);
for (const marker of [
  "ATLAS_PHASE26_MANUAL_PERMIT_CONTRACT_FILE", "ATLAS_PHASE27_ATOMIC_LEDGER_REQUEST_FILE",
  "ATLAS_PHASE27_ATOMIC_LEDGER_PREPARATION_FILE", "ledgerPersistenceAllowed: false",
  "permitIssuanceAllowed: false", "permitConsumptionAllowed: false", "automaticDeliveryAllowed: false"
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
for (const marker of [
  "validatePhase26Contract", "simulateAtomicReservation", "createAtomicLedgerPreparation",
  "validatePhase27Preparation", "single_winner_proven", "duplicate_rejected",
  "ledger_not_persisted", "raw_ledger_reference_not_persisted"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
if (failures.length) {
  console.error("META REPEATABILITY SAMPLE 02 ATOMIC LEDGER: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META REPEATABILITY SAMPLE 02 ATOMIC LEDGER: aprovada — concorrencia ensaiada em memoria; ledger nao persistido, permissao nao emitida e evento nao entregue.");
