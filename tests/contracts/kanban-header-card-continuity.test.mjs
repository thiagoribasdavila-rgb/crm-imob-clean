import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-044-header-card-continuity.json",
    "utf8",
  ),
);

test("fase 44 declara continuidade entre decisão e carteira", () => {
  assert.equal(config.phase, 44);
  assert.equal(config.headerLeadContinuity, true);
  assert.match(pipeline, /data-priority-continuation=/);
  assert.match(pipeline, /data-priority-transition="connected"/);
});

test("primeiro lead recebe transição própria sem perder prioridade", () => {
  assert.equal(config.priorityMarkerPreserved, true);
  assert.match(
    pipeline,
    /data-stage-priority=\{[\s\S]*leadIndex === 0 \? "primary" : "standard"/,
  );
  assert.match(
    pipeline,
    /data-stage-entry=\{[\s\S]*leadIndex === 0 \? "continuation" : "portfolio"/,
  );
  assert.match(styles, /data-stage-entry="continuation"/);
});

test("passagem reduz superfície encaixada e preserva marcador lateral", () => {
  assert.equal(config.nestedSurfaceReduced, true);
  assert.match(
    styles,
    /data-priority-continuation="lead"\][\s\S]*margin-bottom: 3px/,
  );
  assert.match(
    styles,
    /data-stage-entry="continuation"\][\s\S]*border-top-color: transparent;[\s\S]*inset 3px 0 0/,
  );
});

test("continuidade atende modos compacto e móvel", () => {
  assert.equal(config.compactModePreserved, true);
  assert.equal(config.mobileModePreserved, true);
  assert.match(
    styles,
    /\.atlas-kanban-board\.is-compact[\s\S]*data-priority-transition="connected"/,
  );
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*data-stage-entry="continuation"/);
});

test("fase preserva movimentação e infraestrutura", () => {
  assert.match(pipeline, /onDrop=\{\(event\) => onDrop\(event, stage\.key\)\}/);
  assert.match(pipeline, /moveByKeyboard\(lead, 1\)/);
  assert.equal(config.cardMovementPreserved, true);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
