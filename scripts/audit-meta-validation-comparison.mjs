import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-payload-quality-gate.json"));
const runner = read("scripts/run-meta-validation-comparison.mjs");
const preflight = read("scripts/preflight-meta-validation-comparison.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(gate.phase === 19 && gate.mode === "local_comparison_no_delivery", "gate da Fase 19 invalido");
expect(gate.decisionModel === "binary_evidence_gate", "decisao nao e baseada em evidencia binaria");
expect(gate.principles.neverEstimateMetaEventMatchQuality && gate.principles.neverClaimOptimizationImpactWithoutObservedOutcome, "alegacoes sem evidencia nao foram bloqueadas");
expect(gate.principles.neverPersistPayloadOrMatchValues && gate.principles.neverOpenNetworkGateFromLocalEvidence, "privacidade ou rede insegura");
expect(gate.releaseGate.officialMetaComparisonExecuted === false && gate.releaseGate.testEventDeliveryAllowed === false && gate.releaseGate.productionDeliveryAllowed === false, "entrega Meta liberada");

for (const forbidden of ["fetch(", "graph.facebook", "META_CONVERSIONS_ACCESS_TOKEN", "test_event_code", "--env-file", ".env.local"]) {
  expect(!runner.includes(forbidden), `runner contem transporte ou segredo: ${forbidden}`);
}
for (const marker of ["ATLAS_PHASE17_DATA_API_EVIDENCE_FILE", "ATLAS_PHASE19_EVENT_INPUT_FILE", "ATLAS_PHASE19_COMPARISON_EVIDENCE_FILE", "officialComparisonApproved: false", "networkCallExecuted: false"]) {
  expect(runner.includes(marker), `runner sem protecao: ${marker}`);
}
for (const marker of ["createValidationComparison", "validatePhase18Evidence", "presenceIsNotEventMatchQuality", "optimizationImpactClaimed: false", "financial_signal_not_allowed_for_event", "official_comparison_falsely_claimed"]) {
  expect(preflight.includes(marker) || JSON.stringify(gate).includes(marker), `comparador incompleto: ${marker}`);
}

if (failures.length) {
  console.error("META VALIDATION COMPARISON: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("META VALIDATION COMPARISON: aprovada — qualidade local e alegacoes controladas sem payload persistido ou rede.");
