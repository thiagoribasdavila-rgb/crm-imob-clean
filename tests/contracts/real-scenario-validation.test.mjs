import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareScenarioObservation } from "../../lib/decision/scenario-validation.ts";

const api = readFileSync("app/api/v1/decisions/ledger/route.ts", "utf8");
const panel = readFileSync("components/decision-center/DecisionLearningLedger.tsx", "utf8");
const config = JSON.parse(readFileSync("config/operational-ux-phase-058-real-scenario-validation.json", "utf8"));

test("fase 58 reutiliza o livro canônico e exige fonte real no tenant", () => {
  assert.equal(config.phase, 58);
  assert.equal(config.canonicalLedger, "atlas_decisions");
  assert.equal(config.realSourceRequired, true);
  assert.equal(config.organizationIsolationPreserved, true);
  assert.match(api, /from\("leads"\)/);
  assert.match(api, /eq\("organization_id", organizationId\)/);
  assert.match(api, /realDataConfirmed: true/);
});

test("premissa, resultado esperado, métrica e base ficam explícitos", () => {
  assert.equal(config.explicitAssumptionRequired, true);
  assert.equal(config.expectedOutcomeRequired, true);
  assert.equal(config.baselineFrozenAtDecision, true);
  assert.match(api, /assumption\.length < 8/);
  assert.match(api, /expectedOutcome\.length < 8/);
  assert.match(api, /baselineCapturedAt/);
  assert.match(panel, /Premissa explícita/);
  assert.match(panel, /Resultado esperado/);
});

test("comparação posterior respeita direção sem chamar ausência de dado de acerto", () => {
  assert.deepEqual(compareScenarioObservation({ metric: "lead_score", expectedDirection: "increase", baseline: 60, observed: 75 }), { comparable: true, matched: true, delta: 15, reason: "expectation_observed" });
  assert.deepEqual(compareScenarioObservation({ metric: "lead_stage", expectedDirection: "increase", baseline: "contato", observed: "proposta" }), { comparable: true, matched: true, delta: 3, reason: "expectation_observed" });
  assert.equal(compareScenarioObservation({ metric: "lead_score", expectedDirection: "increase", baseline: null, observed: 75 }).matched, null);
});

test("janela futura, supervisão humana e ausência de ação autônoma permanecem", () => {
  assert.equal(config.posteriorObservationRequired, true);
  assert.equal(config.evaluationWindowEnforced, true);
  assert.equal(config.automaticCommercialAction, false);
  assert.match(api, /SCENARIO_WINDOW_OPEN/);
  assert.match(api, /observedByHuman: true/);
  assert.match(api, /externalActionExecuted: false/);
  assert.match(panel, /Não altera etapa, score ou contato/);
});

test("fase não cria migration, não altera base remota e não entrega release", () => {
  assert.equal(config.migrationCreated, false);
  assert.equal(config.remoteDataChangedDuringPhase, false);
  assert.equal(config.externalDeliveryDuringPhase, false);
  assert.equal(config.buildExecuted, false);
});
