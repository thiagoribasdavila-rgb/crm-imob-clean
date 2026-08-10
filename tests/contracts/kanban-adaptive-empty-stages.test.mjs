import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-038-adaptive-empty-stages.json",
    "utf8",
  ),
);

test("fase 38 compacta apenas colunas realmente vazias", () => {
  assert.equal(config.phase, 38);
  assert.equal(config.compactWidth, 148);
  assert.equal(config.expandedWidth, 270);
  assert.match(pipeline, /stage\.items\.length === 0/);
  assert.match(pipeline, /minmax\(148px, 0\.46fr\)/);
  assert.match(pipeline, /minmax\(270px, 1fr\)/);
});

test("etapas vazias continuam visíveis e acessíveis", () => {
  assert.equal(config.stagesRemainVisible, true);
  assert.match(pipeline, /data-empty-column-state=/);
  assert.match(pipeline, /tabIndex=\{isEmptyStage \? 0 : undefined\}/);
  assert.match(pipeline, /atlas-kanban-v30-empty-stage/);
});

test("foco e intenção de movimento expandem o destino necessário", () => {
  assert.deepEqual(config.expansionTriggers, [
    "stage_focus",
    "stage_action",
    "movement_neighbor",
    "drag_start",
    "drag_target",
  ]);
  assert.match(pipeline, /setEmptyStageIntentKey\(stage\.key\)/);
  assert.match(pipeline, /movementIntentPreviousStage/);
  assert.match(pipeline, /movementIntentNextStage/);
  assert.match(pipeline, /if \(draggedId\)/);
});

test("destinos de drop e navegação móvel foram preservados", () => {
  assert.equal(config.dropTargetsPreserved, true);
  assert.equal(config.mobileNavigationPreserved, true);
  assert.match(pipeline, /onDrop=\{\(event\) => onDrop\(event, stage\.key\)\}/);
  assert.match(pipeline, /className="atlas-kanban-mobile-nav"/);
  assert.match(styles, /\.is-empty-stage\.is-drop-target/);
});

test("layout adaptativo reduz ruído sem alterar persistência", () => {
  assert.match(styles, /--kanban-track-template/);
  assert.match(styles, /\.is-empty-collapsed/);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
