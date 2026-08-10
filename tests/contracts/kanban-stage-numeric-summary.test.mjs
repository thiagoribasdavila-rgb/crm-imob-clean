import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-042-stage-numeric-summary.json",
    "utf8",
  ),
);

test("fase 42 reúne as três métricas existentes em uma leitura", () => {
  assert.equal(config.phase, 42);
  assert.deepEqual(config.metrics, [
    "lead_volume",
    "stage_value",
    "stage_probability",
  ]);
  assert.match(pipeline, /className="atlas-kanban-stage-numeric-summary"/);
  assert.match(pipeline, /className="atlas-kanban-stage-numeric-line"/);
  for (const metric of ["volume", "value", "probability"])
    assert.match(pipeline, new RegExp(`data-stage-metric="${metric}"`));
});

test("volume, VGV e chance recebem rótulos explícitos", () => {
  assert.match(pipeline, /<small>leads<\/small>/);
  assert.match(pipeline, /<small>VGV<\/small>/);
  assert.match(pipeline, /<small>chance da etapa<\/small>/);
  assert.equal(config.probabilityExplicitlyLabeled, true);
});

test("resumo é acessível e mantém a barra canônica", () => {
  assert.match(
    pipeline,
    /aria-label=\{`\$\{stage\.label\}: \$\{stage\.items\.length\} oportunidades,[\s\S]*chance configurada para a etapa`\}/,
  );
  assert.match(pipeline, /<AtlasProgress value=\{stage\.probability\} \/>/);
  assert.match(styles, /\.atlas-kanban-stage-numeric-summary \.atlas-progress-track/);
});

test("leitura compacta não cria um novo painel", () => {
  assert.equal(config.singleReadingLine, true);
  assert.equal(config.newIndicatorCreated, false);
  assert.match(
    styles,
    /\.atlas-kanban-stage-numeric-line[\s\S]*grid-template-columns: auto minmax\(0, 1fr\) auto/,
  );
  assert.match(
    styles,
    /\.atlas-kanban-board\.is-compact \.atlas-kanban-stage-numeric-summary/,
  );
});

test("cálculos, movimentação e infraestrutura permanecem intactos", () => {
  assert.equal(config.canonicalCalculationsPreserved, true);
  assert.match(pipeline, /\{stage\.items\.length\}/);
  assert.match(pipeline, /\{brl\.format\(stage\.value\)\}/);
  assert.match(pipeline, /\{stage\.probability\}%/);
  assert.match(pipeline, /onDrop=\{\(event\) => onDrop\(event, stage\.key\)\}/);
  assert.equal(config.cardMovementPreserved, true);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
