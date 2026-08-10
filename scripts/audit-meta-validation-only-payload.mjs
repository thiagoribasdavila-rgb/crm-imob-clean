import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-validation-only-signal-contract.json"));
const runner = read("scripts/run-meta-validation-only-payload.mjs");
const preflight = read("scripts/preflight-meta-validation-only-payload.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 18 && config.mode === "validation_only_no_delivery", "contrato da Fase 18 invalido");
expect(config.releaseGate.phase17ApprovedEvidenceRequired && config.releaseGate.validationPayloadAllowed === false, "gate da Fase 17 foi ignorado");
expect(config.releaseGate.testEventDeliveryAllowed === false && config.releaseGate.productionEventDeliveryAllowed === false, "entrega Meta foi liberada");
expect(config.canonicalEvents.BuyerProfile.metaEligible === false, "perfil comprador externo foi promovido a conversao");
for (const signal of ["score_change_only", "contact_attempt_without_response", "external_purchase_as_atlas_sale", "cold_base_without_consent"]) {
  expect(config.forbidden.positiveSignals.includes(signal), `sinal proibido ausente: ${signal}`);
}
for (const field of ["cpf", "street_address", "income", "protected_or_sensitive_attribute"]) {
  expect(config.forbidden.payloadData.includes(field), `dado sensivel nao bloqueado: ${field}`);
}
expect(config.matching.rawInputEphemeralOnly && config.matching.persistRawIdentifiers === false && config.matching.persistHashedIdentifiersInEvidence === false, "governanca de identificadores incompleta");
expect(config.deduplication.eventIdMustBeStable && config.deduplication.eventIdMayContainPersonalData === false, "deduplicacao insegura");

for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local"]) {
  expect(!runner.includes(forbidden), `runner contem transporte ou segredo: ${forbidden}`);
}
for (const marker of ["ATLAS_PHASE17_DATA_API_EVIDENCE_FILE", "ATLAS_PHASE18_EVENT_INPUT_FILE", "ATLAS_PHASE18_VALIDATION_EVIDENCE_FILE", "validatePhase18Evidence", "networkCallExecuted: false", "metaRequestDelivered: false"]) {
  expect(runner.includes(marker), `runner sem protecao: ${marker}`);
}
for (const marker of ["validatePhase17Gate", "requiredEvidence", "serverSideSha256", "phase17_gate_closed", "internal_learning_event_not_meta_eligible", "confirmedCommercialOutcome"]) {
  expect(preflight.includes(marker), `preflight incompleto: ${marker}`);
}

if (failures.length) {
  console.error("META VALIDATION-ONLY: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META VALIDATION-ONLY: aprovada — contrato, privacidade, deduplicacao e gate fail-closed verificados sem rede.");
