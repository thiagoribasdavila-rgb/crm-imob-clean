import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-037-just-in-time-movement-rule.json",
    "utf8",
  ),
);

test("fase 37 exibe orientação apenas por foco ou arraste", () => {
  assert.equal(config.phase, 37);
  assert.deepEqual(config.visibleTriggers, ["card_focus", "drag_start"]);
  assert.match(pipeline, /movementIntentLead && !draggedLead/);
  assert.match(pipeline, /onFocus=\{\(\) => setMovementIntentLeadId\(lead\.id\)\}/);
  assert.match(pipeline, /setMovementIntentLeadId\(lead\.id\);\s*setDraggedId/);
});

test("a regra contextual explica limites, destinos e confirmação final", () => {
  assert.match(pipeline, /movementIntentPreviousStage/);
  assert.match(pipeline, /movementIntentNextStage/);
  assert.match(pipeline, /Esta é a primeira etapa/);
  assert.match(pipeline, /A etapa final exige confirmação/);
});

test("a instrução visual permanente foi removida sem perder acessibilidade", () => {
  assert.equal(config.permanentFooterRemoved, true);
  assert.equal(config.screenReaderInstructionsPreserved, true);
  assert.doesNotMatch(pipeline, /A movimentação continua registrada na timeline/);
  assert.match(pipeline, /id="atlas-kanban-v30-board-instructions"/);
  assert.match(pipeline, /aria-describedby="atlas-kanban-v30-board-instructions"/);
});

test("o aviso contextual é compacto, sticky e responsivo", () => {
  assert.match(pipeline, /data-ux-phase="37-just-in-time-movement-rule"/);
  assert.match(styles, /\.atlas-kanban-movement-intent/);
  assert.match(styles, /position: sticky/);
  assert.match(styles, /position: static/);
});

test("fase não altera persistência nem entrega externa", () => {
  assert.match(pipeline, /authenticatedFetch\("\/api\/v1\/pipeline"/);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
