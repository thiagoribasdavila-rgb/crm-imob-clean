import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-036-unified-kanban-movement.json",
    "utf8",
  ),
);

test("fase 36 cobre todos os caminhos de movimentação", () => {
  assert.equal(config.phase, 36);
  assert.deepEqual(config.interactionMethods, [
    "drag",
    "keyboard",
    "selector",
    "quick_action",
    "undo",
    "decision",
  ]);
  assert.match(pipeline, /type PipelineMovementMethod/);
});

test("o recibo único informa o método de interação", () => {
  assert.match(pipeline, /method: PipelineMovementMethod/);
  assert.match(pipeline, /data-unified-movement="phase-36"/);
  assert.match(pipeline, /data-interaction-method=\{movementFeedback\.method\}/);
  assert.match(pipeline, /PIPELINE_MOVEMENT_METHOD_LABEL/);
});

test("arrastar, teclado, seletor, desfazer e decisão declaram sua origem", () => {
  for (const method of ["drag", "keyboard", "selector", "undo", "decision"]) {
    assert.ok(pipeline.includes(`"${method}"`), method);
  }
  assert.match(pipeline, /movementMethod: PipelineMovementMethod = "quick_action"/);
});

test("o feedback se reorganiza corretamente no celular", () => {
  assert.match(styles, /\.atlas-kanban-move-feedback-actions\s*\{/);
  assert.match(styles, /grid-column: 1;/);
  assert.match(styles, /flex-wrap: wrap;/);
});

test("fase preserva API e histórico sem alterar infraestrutura", () => {
  assert.match(pipeline, /authenticatedFetch\("\/api\/v1\/pipeline"/);
  assert.match(pipeline, /expectedFromStage: previousStage/);
  assert.match(pipeline, /reversalOf/);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
