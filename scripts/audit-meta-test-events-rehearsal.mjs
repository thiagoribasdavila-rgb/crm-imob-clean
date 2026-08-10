import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-test-events-rehearsal-gate.json"));
const runner = read("scripts/run-meta-test-events-rehearsal.mjs");
const preflight = read("scripts/preflight-meta-test-events-rehearsal.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 20 && gate.mode === "manual_packet_only_no_delivery", "gate da Fase 20 invalido");
expect(gate.authorization.directorApprovalRequired && gate.authorization.securityApprovalRequired, "aprovacao humana incompleta");
expect(gate.authorization.maximumValidityHours === 24 && gate.authorization.expiredApprovalFailsClosed, "janela de aprovacao insegura");
expect(gate.testScope.syntheticRecordOnly && gate.testScope.singleCanonicalEventOnly && gate.testScope.maximumDeliveries === 1, "escopo de teste inseguro");
expect(gate.testScope.testCodeMayBePersistedByAtlas === false && gate.testScope.payloadMayBePersistedByAtlas === false && gate.testScope.officialResponseMayBePersistedByAtlas === false, "material sensivel pode ser persistido");
expect(gate.releaseGate.automaticDeliveryAllowed === false && gate.releaseGate.productionDeliveryAllowed === false, "transmissao indevidamente liberada");

for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local"]) {
  expect(!runner.includes(forbidden), `runner contem transporte ou segredo: ${forbidden}`);
}
for (const marker of [
  "ATLAS_PHASE17_DATA_API_EVIDENCE_FILE", "ATLAS_PHASE19_COMPARISON_EVIDENCE_FILE",
  "ATLAS_PHASE20_REHEARSAL_REQUEST_FILE", "ATLAS_PHASE20_REHEARSAL_EVIDENCE_FILE",
  "automaticDeliveryAllowed: false", "containsTemporaryCode: false",
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
for (const marker of [
  "validateRehearsalRequest", "createTestEventsRehearsalPacket", "validatePhase20Evidence",
  "distinct_approval_references_required", "temporary_code_must_not_enter_atlas",
  "false_official_execution_blocked",
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);

if (failures.length) {
  console.error("META TEST EVENTS REHEARSAL: REPROVADO");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META TEST EVENTS REHEARSAL: aprovado — pacote manual governado, sem rede, segredo, payload ou producao.");
