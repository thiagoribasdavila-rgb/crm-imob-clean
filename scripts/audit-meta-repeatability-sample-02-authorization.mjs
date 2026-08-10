import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-authorization-gate.json"));
const runner = read("scripts/run-meta-repeatability-sample-02-authorization.mjs");
const preflight = read("scripts/preflight-meta-repeatability-sample-02-authorization.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 24 && gate.mode === "disposable_authorization_draft_no_delivery", "gate da Fase 24 invalido");
expect(gate.sourceSignalContract === "config/meta-validation-only-signal-contract.json", "contrato canonico de eventos ausente");
expect(gate.requiredSourcePhase === 23 && gate.targetSlot.slotId === "repeatability_02" && gate.targetSlot.sampleOrdinal === 2, "slot alvo invalido");
expect(gate.validity.maximumMinutes === 30 && gate.validity.singleUse === true, "validade descartavel invalida");
expect(gate.eventScope.syntheticRecordOnly === true && gate.eventScope.maximumDeliveries === 1 && gate.eventScope.baselineEventIdReuseAllowed === false, "escopo sintetico invalido");
expect(gate.humanGovernance.minimumIndependentRoles === 4 && gate.humanGovernance.justInTimeReconfirmationRequired === true && gate.humanGovernance.draftMayActivateAuthorization === false, "governanca humana invalida");
expect(gate.persistedEvidence.rawRoleReferencesAllowed === false && gate.persistedEvidence.temporaryCodeAllowed === false, "material sensivel liberado");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");

for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local"]) expect(!runner.includes(forbidden), `runner contem transporte ou segredo: ${forbidden}`);
for (const marker of [
  "ATLAS_PHASE23_REPEATABILITY_PLAN_FILE", "ATLAS_PHASE24_AUTHORIZATION_REQUEST_FILE",
  "ATLAS_PHASE24_AUTHORIZATION_DRAFT_FILE", "authorizationActivationAllowed: false",
  "manualObservationAllowed: false", "automaticDeliveryAllowed: false"
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
for (const marker of [
  "validatePhase23Plan", "createAuthorizationDraft", "validatePhase24Draft",
  "awaiting_just_in_time_confirmation", "four_distinct_role_hashes",
  "draft_activation_blocked", "raw_references_not_persisted",
  "baseline_event_reuse_blocked", "draft_event_name_must_be_canonical"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);

if (failures.length) {
  console.error("META REPEATABILITY SAMPLE 02 AUTHORIZATION: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META REPEATABILITY SAMPLE 02 AUTHORIZATION: aprovada — rascunho descartavel preparado, quatro papeis independentes e nenhuma permissao de execucao ou entrega.");
