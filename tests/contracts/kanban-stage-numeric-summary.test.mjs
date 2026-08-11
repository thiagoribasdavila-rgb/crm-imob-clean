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

test("fase 42 permanece registrada como base histórica da síntese", () => {
  assert.equal(config.phase, 42);
  assert.deepEqual(config.metrics, [
    "lead_volume",
    "stage_value",
    "stage_probability",
  ]);
  assert.equal(config.singleReadingLine, true);
  assert.equal(config.newIndicatorCreated, false);
});

test("fase 53 substitui a síntese histórica pelo cabeçalho decisório canônico", () => {
  assert.doesNotMatch(
    pipeline,
    /className="atlas-kanban-stage-numeric-summary"/,
  );
  assert.match(pipeline, /className="atlas-kanban-v3000-decision-header"/);
  assert.match(pipeline, /<small>leads<\/small>/);
  assert.match(pipeline, /<small>valor válido<\/small>/);
  assert.match(pipeline, /data-stage-metric="main-bottleneck"/);
  assert.equal(config.probabilityExplicitlyLabeled, true);
});

test("cabeçalho decisório mantém uma leitura acessível da etapa", () => {
  assert.match(
    pipeline,
    /aria-label=\{`\$\{stage\.label\}: \$\{stage\.decisionHeader\.volume\} oportunidades,[\s\S]*Gargalo principal: \$\{stage\.decisionHeader\.bottleneck\.label\}/,
  );
  assert.match(pipeline, /data-v3000-phase="53-decision-header"/);
});

test("leitura compacta não cria um novo painel", () => {
  assert.equal(config.singleReadingLine, true);
  assert.equal(config.newIndicatorCreated, false);
  assert.match(styles, /\.atlas-kanban-v3000-decision-header/);
  assert.match(styles, /\.atlas-kanban-v3000-decision-metrics/);
});

test("cálculos, movimentação e infraestrutura permanecem intactos", () => {
  assert.equal(config.canonicalCalculationsPreserved, true);
  assert.match(pipeline, /\{stage\.items\.length\}/);
  assert.match(
    pipeline,
    /\{brl\.format\(stage\.decisionHeader\.validValue\)\}/,
  );
  assert.match(pipeline, /\{stage\.decisionHeader\.bottleneck\.label\}/);
  assert.match(pipeline, /onDrop=\{\(event\) => onDrop\(event, stage\.key\)\}/);
  assert.equal(config.cardMovementPreserved, true);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
