import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-test-events-evidence-reconciliation-gate.json"));
const runner = read("scripts/run-meta-test-events-evidence-reconciliation.mjs");
const preflight = read("scripts/preflight-meta-test-events-evidence-reconciliation.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 22 && gate.mode === "sanitized_chain_reconciliation_no_delivery", "gate da Fase 22 invalido");
expect(gate.requiredPhases.join(",") === "19,20,21", "cadeia de fases incompleta");
expect(Object.values(gate.chain).every(Boolean), "vinculos obrigatorios incompletos");
expect(gate.scope.maximumObservedDeliveries === 1 && gate.scope.minimumIndependentHumanRoles === 4, "escopo humano ou de entrega invalido");
expect(gate.scope.singleObservationSufficientForAutomation === false && gate.scope.singleObservationSufficientForOptimizationClaim === false, "amostra unica superestimada");
expect(gate.persistedEvidence.rawPayloadAllowed === false && gate.persistedEvidence.rawResponseAllowed === false && gate.persistedEvidence.temporaryCodeAllowed === false, "artefato sensivel liberado");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");

for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local"]) {
  expect(!runner.includes(forbidden), `runner contem transporte ou segredo: ${forbidden}`);
}
for (const marker of [
  "ATLAS_PHASE19_COMPARISON_EVIDENCE_FILE", "ATLAS_PHASE20_REHEARSAL_EVIDENCE_FILE",
  "ATLAS_PHASE21_OBSERVATION_RECEIPT_FILE", "ATLAS_PHASE22_RECONCILIATION_EVIDENCE_FILE",
  "automaticDeliveryAllowed: false", "productionDeliveryAllowed: false"
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
for (const marker of [
  "validatePhase19Evidence", "validatePhase20Evidence", "validatePhase21Receipt",
  "phase19_to_phase20_link_mismatch", "phase20_to_phase21_link_mismatch",
  "event_classification_mismatch", "four_role_governance_incomplete",
  "single_sample_not_overclaimed", "next_test_requires_new_authorization"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);

if (failures.length) {
  console.error("META TEST EVENTS EVIDENCE RECONCILIATION: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META TEST EVENTS EVIDENCE RECONCILIATION: aprovada — cadeia 19-21 verificavel, amostra unica sem alegacao e todos os gates externos fechados.");
