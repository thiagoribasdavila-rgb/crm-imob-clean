import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-test-events-repeatability-plan-gate.json"));
const runner = read("scripts/run-meta-test-events-repeatability-plan.mjs");
const preflight = read("scripts/preflight-meta-test-events-repeatability-plan.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 23 && gate.mode === "sanitized_repeatability_plan_no_delivery", "gate da Fase 23 invalido");
expect(gate.requiredSourcePhase === 22 && gate.sampling.baselineApprovedSamples === 1, "baseline da reconciliacao invalida");
expect(gate.sampling.targetApprovedSamples === 3 && gate.sampling.additionalObservationsPlanned === 2, "plano minimo de amostras invalido");
expect(gate.sampling.newAuthorizationPerObservation === true && gate.sampling.stopSequenceOnFirstFailure === true, "governanca de repeticao incompleta");
expect(gate.humanGovernance.minimumIndependentRolesPerObservation === 4 && gate.humanGovernance.preAuthorizationAllowed === false, "governanca humana invalida");
expect(gate.interpretation.targetSufficientForAutomaticDelivery === false && gate.interpretation.targetSufficientForOptimizationClaim === false, "amostra limitada superestimada");
expect(gate.persistedEvidence.futureEventFingerprintAllowed === false && gate.persistedEvidence.approvalFingerprintAllowedBeforeAuthorization === false, "identificador futuro persistido");
expect(Object.values(gate.releaseGate).every((value) => value === false), "gate externo aberto");

for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "--env-file", ".env.local"]) {
  expect(!runner.includes(forbidden), `runner contem transporte ou segredo: ${forbidden}`);
}
for (const marker of [
  "ATLAS_PHASE22_RECONCILIATION_EVIDENCE_FILE", "ATLAS_PHASE23_REPEATABILITY_PLAN_FILE",
  "nextControlledTestAllowed: false", "automaticDeliveryAllowed: false", "productionDeliveryAllowed: false"
]) expect(runner.includes(marker), `runner sem protecao: ${marker}`);
for (const marker of [
  "validatePhase22Evidence", "createRepeatabilityPlan", "validatePhase23Plan",
  "awaiting_new_authorization", "technical_repeatability_not_preclaimed",
  "future_fingerprint_not_persisted", "stopSequenceOnFirstFailure"
]) expect(preflight.includes(marker), `preflight incompleto: ${marker}`);

if (failures.length) {
  console.error("META TEST EVENTS REPEATABILITY PLAN: REPROVADO");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META TEST EVENTS REPEATABILITY PLAN: aprovado — 1 baseline + 2 observacoes planejadas; cada execucao exige nova autorizacao e todos os gates externos permanecem fechados.");
