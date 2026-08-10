import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-jit-confirmation-gate.json"));
const runner = read("scripts/run-meta-repeatability-sample-02-jit-confirmation.mjs");
const preflight = read("scripts/preflight-meta-repeatability-sample-02-jit-confirmation.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 25 && gate.mode === "just_in_time_reconfirmation_receipt_no_delivery", "gate da Fase 25 invalido");
expect(gate.requiredSourcePhase === 24 && gate.sourceSignalContract === "config/meta-validation-only-signal-contract.json", "fonte da Fase 25 invalida");
expect(gate.targetSlot.slotId === "repeatability_02" && gate.targetSlot.sampleOrdinal === 2, "slot alvo invalido");
expect(gate.validity.maximumMinutes === 5 && gate.validity.singleUse === true && gate.validity.mustExpireBeforeSourceDraft === true, "janela just-in-time invalida");
expect(gate.humanGovernance.minimumIndependentRoles === 4 && gate.humanGovernance.referencesFromDraftMayBeReused === false && gate.humanGovernance.receiptMayActivateAuthorization === false, "governanca humana invalida");
expect(gate.persistedEvidence.rawRoleReferencesAllowed === false && gate.persistedEvidence.temporaryCodeAllowed === false, "material sensivel liberado");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");

for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local"]) expect(!runner.includes(forbidden), `runner contem transporte ou segredo: ${forbidden}`);
for (const marker of [
  "ATLAS_PHASE24_AUTHORIZATION_DRAFT_FILE", "ATLAS_PHASE25_JIT_CONFIRMATION_REQUEST_FILE",
  "ATLAS_PHASE25_JIT_CONFIRMATION_RECEIPT_FILE", "authorizationActivationAllowed: false",
  "manualObservationAllowed: false", "automaticDeliveryAllowed: false"
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
for (const marker of [
  "validatePhase24Draft", "createJitConfirmationReceipt", "validatePhase25Receipt",
  "just_in_time_confirmed_activation_gate_closed", "draft_reference_reuse_blocked",
  "receipt_activation_blocked", "raw_reconfirmations_not_persisted"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);

if (failures.length) {
  console.error("META REPEATABILITY SAMPLE 02 JIT CONFIRMATION: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META REPEATABILITY SAMPLE 02 JIT CONFIRMATION: aprovada — quatro reconfirmacoes novas em janela de cinco minutos; ativacao e entrega permanecem bloqueadas.");
