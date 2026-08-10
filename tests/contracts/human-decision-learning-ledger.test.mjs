import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/decision-center/page.tsx", "utf8");
const panel = readFileSync("components/decision-center/DecisionLearningLedger.tsx", "utf8");
const api = readFileSync("app/api/v1/decisions/ledger/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260804173000_phase_55_human_decision_learning_ledger.sql", "utf8");
const config = JSON.parse(readFileSync("config/operational-ux-phase-055-human-decision-learning-ledger.json", "utf8"));

test("fase 55 fecha o ciclo no Centro de Decisão canônico", () => {
  assert.equal(config.phase, 55);
  assert.equal(config.canonicalRoute, "/decision-center");
  assert.match(page, /DecisionLearningLedger/);
  assert.match(panel, /data-ux-phase="55-human-decision-learning-ledger"/);
});

test("decisão humana exige justificativa, responsável e prazo", () => {
  assert.equal(config.humanDecisionRecorded, true);
  assert.equal(config.decisionReasonRecorded, true);
  assert.equal(config.responsibleRecorded, true);
  assert.equal(config.deadlineRecorded, true);
  assert.match(api, /humanDecision/);
  assert.match(api, /reason\.length < 8/);
  assert.match(api, /responsibleId/);
  assert.match(api, /dueAt\.getTime\(\) <= Date\.now\(\)/);
  assert.match(panel, /Aceitar/);
  assert.match(panel, /Adaptar/);
  assert.match(panel, /Rejeitar/);
});

test("resultado observado é obrigatório para fechar o aprendizado", () => {
  assert.equal(config.observedOutcomeRecorded, true);
  assert.match(api, /record_outcome/);
  assert.match(api, /observedByHuman: true/);
  assert.match(api, /learningClosed: true/);
  assert.match(panel, /Resultado observado/);
  assert.match(panel, /ciclo de aprendizado fechado/);
});

test("livro executivo reutiliza atlas_decisions sem sistema paralelo", () => {
  assert.match(migration, /alter table public\.atlas_decisions/);
  assert.match(migration, /human_decision/);
  assert.match(migration, /responsible_id/);
  assert.match(migration, /outcome_recorded_at/);
  assert.doesNotMatch(migration, /create table/);
});

test("isolamento e hierarquia comercial permanecem explícitos", () => {
  assert.equal(config.organizationIsolationPreserved, true);
  assert.equal(config.managerHierarchyPreserved, true);
  assert.match(api, /eq\("organization_id", organizationId\)/);
  assert.match(api, /profile\.reports_to === access\.access\.profile\.id/);
  assert.match(api, /Somente o responsável ou a liderança/);
});

test("registro não executa contato, campanha ou mudança comercial", () => {
  assert.equal(config.automaticCommercialAction, false);
  assert.equal(config.externalDeliveryDuringPhase, false);
  assert.match(api, /externalActionExecuted: false/);
  assert.match(panel, /Nenhuma ação externa é automática/);
});
