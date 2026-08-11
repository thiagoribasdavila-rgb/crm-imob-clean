import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-039-progressive-column-density.json",
    "utf8",
  ),
);

test("fase 39 mantém identidade e comando da etapa na leitura imediata", () => {
  assert.equal(config.phase, 39);
  assert.deepEqual(config.alwaysVisible, [
    "stage_identity",
    "lead_count",
    "stage_value",
    "probability",
    "primary_stage_command",
  ]);
  assert.match(
    pipeline,
    /className="atlas-kanban-v30-stage-command(?:\s+[^"]+)?"/,
  );
  assert.match(pipeline, /\{stage\.v30Command\.actionLabel\}/);
});

test("saúde, diagnóstico, lente e microcopy ficam no mesmo contexto progressivo", () => {
  assert.deepEqual(config.onDemand, [
    "stage_health",
    "stage_decision_diagnostic",
    "lens_priority",
    "stage_microcopy",
  ]);
  assert.match(pipeline, /className="atlas-kanban-stage-context"/);
  assert.match(pipeline, /className="atlas-stage-decision-row"/);
  assert.match(pipeline, /className="atlas-stage-pulse-row"/);
  assert.match(pipeline, /className="atlas-stage-lens-priority"/);
  assert.match(pipeline, /className="atlas-stage-action-microcopy"/);
});

test("divulgação nativa é compacta e acessível por teclado", () => {
  assert.equal(config.nativeDisclosure, true);
  assert.equal(config.keyboardAccessible, true);
  assert.match(
    pipeline,
    /<details\s+className="atlas-kanban-v3000-stage-support"/,
  );
  assert.match(pipeline, /<span>Comando e contexto<\/span>/);
  assert.match(
    styles,
    /\.atlas-kanban-v3000-stage-support > summary:focus-visible/,
  );
});

test("coluna vazia compacta não reintroduz análise secundária", () => {
  assert.match(
    styles,
    /\.atlas-pipeline-column\.is-empty-collapsed[\s\S]*\.atlas-kanban-stage-context[\s\S]*display: none/,
  );
});

test("fase preserva cards, movimentação e infraestrutura", () => {
  assert.equal(config.cardMovementPreserved, true);
  assert.match(pipeline, /onDrop=\{\(event\) => onDrop\(event, stage\.key\)\}/);
  assert.match(pipeline, /moveByKeyboard\(lead, 1\)/);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
