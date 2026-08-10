import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-test-events-observation-gate.json"));
const runner = read("scripts/run-meta-test-events-observation-receipt.mjs");
const preflight = read("scripts/preflight-meta-test-events-observation.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 21 && gate.mode === "sanitized_manual_observation_receipt_no_delivery", "gate da Fase 21 invalido");
expect(gate.attestation.operatorRequired && gate.attestation.independentReviewerRequired && gate.attestation.distinctReferencesRequired, "atestacao humana incompleta");
expect(gate.testScope.syntheticRecordOnly && gate.testScope.officialTestSurfaceRequired && gate.testScope.maximumDeliveries === 1, "escopo de observacao inseguro");
expect(gate.testScope.automaticRetryAllowed === false && gate.testScope.realCustomerDataAllowed === false && gate.testScope.productionDatasetAllowed === false, "teste real ou repeticao indevidamente liberados");
expect(gate.persistedOutcome.rawResponseAllowed === false && gate.persistedOutcome.payloadAllowed === false && gate.persistedOutcome.temporaryCodeAllowed === false && gate.persistedOutcome.screenshotAllowed === false, "artefato sensivel pode ser persistido");
expect(gate.releaseGate.automaticDeliveryAllowed === false && gate.releaseGate.productionDeliveryAllowed === false, "transmissao indevidamente liberada");

for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local"]) {
  expect(!runner.includes(forbidden), `runner contem transporte ou segredo: ${forbidden}`);
}
for (const marker of [
  "ATLAS_PHASE20_REHEARSAL_EVIDENCE_FILE", "ATLAS_PHASE21_OBSERVATION_INPUT_FILE",
  "ATLAS_PHASE21_OBSERVATION_RECEIPT_FILE", "automaticDeliveryAllowed: false",
  "automaticRetryAllowed: false", "rawResponsePersisted: false",
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
for (const marker of [
  "validateObservationInput", "createObservationReceipt", "validatePhase21Receipt",
  "distinct_attestation_references_required", "single_delivery_required",
  "automatic_retry_stays_blocked",
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);

if (failures.length) {
  console.error("META TEST EVENTS OBSERVATION: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META TEST EVENTS OBSERVATION: aprovada — recibo sanitizado, sem rede, resposta bruta, repeticao ou producao.");
