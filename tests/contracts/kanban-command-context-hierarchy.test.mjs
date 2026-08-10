import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-043-command-context-hierarchy.json",
    "utf8",
  ),
);

test("fase 43 declara uma superfície primária e uma secundária", () => {
  assert.equal(config.phase, 43);
  assert.equal(config.primarySurface, "stage_command");
  assert.equal(config.secondarySurface, "progressive_context");
  assert.match(pipeline, /data-visual-priority="primary-command"/);
  assert.match(pipeline, /data-visual-priority="secondary-context"/);
});

test("comando mantém contraste e identidade de ação", () => {
  assert.equal(config.stageCommandPreserved, true);
  assert.match(
    styles,
    /\.atlas-kanban-v30-stage-command\[data-visual-priority="primary-command"\][\s\S]*box-shadow:/,
  );
  assert.match(pipeline, /\{stage\.v30Command\.label\}/);
  assert.match(pipeline, /\{stage\.v30Command\.actionLabel\}/);
});

test("contexto fechado deixa de competir como card", () => {
  assert.equal(config.closedContextCardRemoved, true);
  assert.match(
    styles,
    /\.atlas-kanban-stage-context\[data-visual-priority="secondary-context"\][\s\S]*border-color: transparent;[\s\S]*background: transparent;/,
  );
  assert.match(
    styles,
    /data-visual-priority="secondary-context"\][\s\S]*> summary[\s\S]*min-height: 30px/,
  );
});

test("contexto aberto e acesso por teclado continuam legíveis", () => {
  assert.equal(config.openContextReadabilityPreserved, true);
  assert.equal(config.keyboardDisclosurePreserved, true);
  assert.match(pipeline, /<details[\s\S]*data-visual-priority="secondary-context"/);
  assert.match(pipeline, /<summary>/);
  assert.match(
    styles,
    /data-visual-priority="secondary-context"\]\[open\][\s\S]*border-color:/,
  );
  assert.match(styles, /summary:focus-visible/);
});

test("fase preserva cards, movimento e infraestrutura", () => {
  assert.match(pipeline, /onDrop=\{\(event\) => onDrop\(event, stage\.key\)\}/);
  assert.match(pipeline, /moveByKeyboard\(lead, 1\)/);
  assert.equal(config.cardMovementPreserved, true);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
