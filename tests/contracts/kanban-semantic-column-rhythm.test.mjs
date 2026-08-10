import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-041-semantic-column-rhythm.json",
    "utf8",
  ),
);

test("fase 41 organiza a coluna em decisão e oportunidades", () => {
  assert.equal(config.phase, 41);
  assert.deepEqual(config.rhythmZones, [
    "stage_decision",
    "stage_opportunities",
  ]);
  assert.match(pipeline, /data-rhythm-zone="stage-decision"/);
  assert.match(pipeline, /data-rhythm-zone="stage-opportunities"/);
});

test("linha decorativa do cabeçalho deixa de competir com o fluxo", () => {
  assert.equal(config.decorativeHeaderDividerRemoved, true);
  assert.doesNotMatch(
    pipeline,
    /atlas-pipeline-column-header[^"\n]*border-b/,
  );
  assert.match(
    styles,
    /\.atlas-kanban-board-v30 \.atlas-kanban-stage-decision-zone[\s\S]*border-bottom: 0/,
  );
});

test("stream usa densidade própria sem utilitário genérico repetido", () => {
  assert.match(pipeline, /className="atlas-kanban-stage-card-stream"/);
  assert.doesNotMatch(pipeline, /<div className="space-y-3">/);
  assert.match(styles, /\.atlas-kanban-stage-card-stream[\s\S]*gap: 8px/);
  assert.equal(config.compactDensitySupported, true);
  assert.match(
    styles,
    /\.atlas-kanban-board\.is-compact \.atlas-kanban-stage-card-stream/,
  );
});

test("transição entre prioridade e carteira permanece perceptível", () => {
  assert.equal(config.priorityTransitionPreserved, true);
  assert.match(
    styles,
    /data-stage-priority="primary"\][\s\S]*\+[\s\S]*data-stage-priority="standard"/,
  );
});

test("fase preserva movimentação e infraestrutura", () => {
  assert.equal(config.cardMovementPreserved, true);
  assert.match(pipeline, /onDrop=\{\(event\) => onDrop\(event, stage\.key\)\}/);
  assert.match(pipeline, /moveByKeyboard\(lead, 1\)/);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
