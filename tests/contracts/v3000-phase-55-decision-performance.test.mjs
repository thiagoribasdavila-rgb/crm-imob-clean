import assert from "node:assert/strict";
import test from "node:test";
import {
  ATLAS_DECISION_PERFORMANCE_CONTRACT,
  buildDecisionPerformanceEvent,
  decisionGroupingComplexity,
  groupRecordsByStage,
} from "../../lib/atlas/decision-performance.ts";
import {
  loadDecisionPerformanceRegistry,
  validateDecisionPerformance,
} from "../../scripts/check-v3000-phase-55-decision-performance.mjs";

const root = process.cwd();

test("Fase 55 preserva orçamento, privacidade e comparação controlada", () => {
  const registry = loadDecisionPerformanceRegistry(root);
  const result = validateDecisionPerformance({ root, registry });

  assert.equal(result.phase, 55);
  assert.equal(result.status, "decision-performance-adopted");
  assert.equal(result.previousComparisons, 3500);
  assert.equal(result.optimizedOperations, 507);
  assert.equal(result.reductionPercent, 85.51);
  assert.equal(result.decisionEvents, 4);
  assert.equal(result.telemetryPayloadBytes, 1024);
  assert.equal(result.databaseMigration, false);
});

test("agrupamento percorre os registros uma vez e preserva as etapas", () => {
  const records = [
    { id: "1", status: "novo" },
    { id: "2", status: "contato" },
    { id: "3", status: "novo" },
    { id: "4", status: null },
  ];
  const grouped = groupRecordsByStage(records);

  assert.deepEqual(
    grouped.get("novo")?.map((record) => record.id),
    ["1", "3", "4"],
  );
  assert.deepEqual(
    grouped.get("contato")?.map((record) => record.id),
    ["2"],
  );
});

test("complexidade comparável muda de multiplicativa para aditiva", () => {
  assert.deepEqual(decisionGroupingComplexity(500, 7), {
    previousComparisons: 3500,
    optimizedOperations: 507,
    reductionPercent: 85.51,
  });
});

test("quatro momentos decisórios usam nomes estáveis", () => {
  const contract = ATLAS_DECISION_PERFORMANCE_CONTRACT;

  assert.deepEqual(Object.values(contract.eventTypes), [
    "atlas.pipeline_priority_identified",
    "atlas.pipeline_opportunity_opened",
    "atlas.pipeline_action_started",
    "atlas.pipeline_result_registered",
  ]);
});

test("evento não inclui identificador nem conteúdo pessoal", () => {
  const event = buildDecisionPerformanceEvent("opportunityOpened", {
    durationMs: 182.4,
    method: "card",
    name: "Ana Costa",
    email: "ana@example.com",
    phone: "+5511999999999",
    message: "Conteúdo privado",
    leadId: "lead-123",
  });

  assert.deepEqual(event.payload, {
    performanceVersion: "v3000-phase-55",
    durationMs: 182,
    method: "card",
  });
  assert.equal("aggregateId" in event, false);
});

test("duração negativa é normalizada sem quebrar a coleta", () => {
  const event = buildDecisionPerformanceEvent("actionStarted", {
    durationMs: -10,
    fromStage: "novo",
    toStage: "contato",
  });

  assert.equal(event.payload.durationMs, 0);
});

test("payload rejeita objetos e chaves fora da lista permitida", () => {
  const event = buildDecisionPerformanceEvent("resultRegistered", {
    durationMs: 90,
    result: "success",
    metadata: { private: true },
    notes: "não enviar",
  });

  assert.deepEqual(event.payload, {
    performanceVersion: "v3000-phase-55",
    durationMs: 90,
    result: "success",
  });
});

test("contrato não cria migration, IA ou mutação paralela", () => {
  const registry = loadDecisionPerformanceRegistry(root);

  assert.equal(registry.constraints.databaseMigration, false);
  assert.equal(registry.constraints.businessMutation, false);
  assert.equal(registry.constraints.aiCall, false);
  assert.equal(registry.constraints.visibilityExpansion, false);
  assert.equal(registry.constraints.syntheticBusinessData, false);
});
