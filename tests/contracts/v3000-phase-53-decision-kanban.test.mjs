import assert from "node:assert/strict";
import test from "node:test";
import {
  KANBAN_DECISION_BOARD_CONTRACT,
  buildKanbanStageDecisionHeader,
  validLeadValue,
} from "../../lib/atlas/kanban-decision-board.ts";
import {
  loadDecisionKanbanRegistry,
  validateDecisionKanban,
} from "../../scripts/check-v3000-phase-53-decision-kanban.mjs";

const root = process.cwd();

function stage(overrides = {}) {
  return buildKanbanStageDecisionHeader({
    stageLabel: "Contato",
    volume: 10,
    validValue: 800000,
    urgent: 0,
    noAction: 0,
    stalled: 0,
    hot: 0,
    ...overrides,
  });
}

test("Fase 53 preserva o contrato de Kanban decisivo", () => {
  const registry = loadDecisionKanbanRegistry(root);
  const result = validateDecisionKanban({ root, registry });

  assert.equal(result.phase, 53);
  assert.equal(result.status, "decision-kanban-adopted");
  assert.equal(result.visibleHeaderMetrics, 3);
  assert.equal(result.preservedCardContext, 4);
  assert.equal(result.mobileColumns, 1);
  assert.equal(result.governedMovement, 3);
});

test("valor válido rejeita ausente, inválido e negativo", () => {
  assert.equal(validLeadValue(undefined), 0);
  assert.equal(validLeadValue("valor"), 0);
  assert.equal(validLeadValue(-10), 0);
  assert.equal(validLeadValue("450000"), 450000);
});

test("SLA vencido tem precedência sobre todos os demais sinais", () => {
  const result = stage({ urgent: 2, noAction: 4, stalled: 6, hot: 8 });

  assert.equal(result.bottleneck.label, "2 SLAs vencidos");
  assert.equal(result.bottleneck.tone, "danger");
});

test("ausência de próxima ação precede estagnação e calor", () => {
  const result = stage({ noAction: 3, stalled: 6, hot: 8 });

  assert.equal(result.bottleneck.label, "3 sem próxima ação");
  assert.equal(result.bottleneck.tone, "warning");
});

test("estagnação precede oportunidade quente", () => {
  const result = stage({ stalled: 2, hot: 8 });

  assert.equal(result.bottleneck.label, "2 leads parados");
  assert.equal(result.bottleneck.detail, "Mais de 72h na etapa");
});

test("oportunidade quente orienta avanço quando não há gargalo", () => {
  const result = stage({ hot: 4 });

  assert.equal(result.bottleneck.label, "4 leads quentes");
  assert.equal(result.bottleneck.tone, "opportunity");
});

test("etapa com volume e sem alerta é saudável", () => {
  const result = stage();

  assert.equal(result.bottleneck.label, "Fluxo saudável");
  assert.equal(result.bottleneck.tone, "healthy");
});

test("etapa vazia informa prontidão sem inventar gargalo", () => {
  const result = stage({ volume: 0, hot: 9 });

  assert.equal(result.volume, 0);
  assert.equal(result.bottleneck.label, "Etapa pronta");
  assert.equal(result.bottleneck.tone, "neutral");
});

test("contrato proíbe IA, mutação e migration", () => {
  assert.equal(KANBAN_DECISION_BOARD_CONTRACT.visibleHeaderMetrics, 3);
  assert.equal(KANBAN_DECISION_BOARD_CONTRACT.compactMobileColumns, 1);
  assert.equal(KANBAN_DECISION_BOARD_CONTRACT.aiCalls, 0);
  assert.equal(KANBAN_DECISION_BOARD_CONTRACT.businessMutation, false);
  assert.equal(KANBAN_DECISION_BOARD_CONTRACT.databaseMigration, false);
});

test("Fase 53 rejeita quarto indicador no cabeçalho", () => {
  const registry = structuredClone(loadDecisionKanbanRegistry(root));
  registry.board.visibleHeaderMetrics.push("probability");

  assert.throws(
    () => validateDecisionKanban({ root, registry }),
    /somente volume, valor válido e gargalo principal/,
  );
});
