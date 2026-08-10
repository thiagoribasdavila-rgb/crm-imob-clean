import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const primitives = readFileSync(
  "components/atlas/information-primitives.tsx",
  "utf8",
);
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-033-secondary-analysis-panel.json",
    "utf8",
  ),
);

test("fase 33 coordena as análises secundárias em um único grupo", () => {
  assert.equal(config.phase, 33);
  assert.equal(config.analysisGroup, "pipeline-secondary-analysis");
  assert.equal(config.accordionBehavior, "single_open_panel");
  assert.match(primitives, /group\?: string/);
  assert.match(primitives, /data-analysis-group=\{group\}/);
  assert.match(primitives, /name=\{group\}/);
});

test("as sete superfícies secundárias pertencem ao mesmo painel", () => {
  assert.equal(config.secondarySurfaces.length, 7);
  assert.equal(
    pipeline.match(/group="pipeline-secondary-analysis"/g)?.length,
    7,
  );
  for (const label of [
    "Ver diagnóstico e clareza do pipeline",
    "Ver briefing ampliado do Kanban",
    "Ver atalhos de análise do Kanban",
    "Ver saúde e indicadores do pipeline",
    "Ver resumo visual das etapas",
    "Ver lentes, fila inteligente e gargalos",
    "Ver inteligência avançada e ações em lote",
  ]) {
    assert.match(pipeline, new RegExp(label));
  }
});

test("Kanban e fila curta continuam como superfícies principais", () => {
  assert.match(pipeline, /data-ux-phase="32-single-short-priority-queue"/);
  assert.match(pipeline, /atlas-kanban-central-surface/);
  assert.match(pipeline, /const KANBAN_VISIBLE_PRIORITY_LIMIT = 3/);
  assert.equal(config.canonicalWorkspace, "pipeline-kanban");
});

test("radares, mapas, briefings e ações em lote permanecem acessíveis", () => {
  for (const marker of [
    "atlas-pipeline-v30-decision-layer",
    "atlas-kanban-bottleneck-radar",
    "atlas-kanban-v30-heatline",
    "atlas-kanban-v30-batch-dock",
  ]) {
    assert.match(pipeline, new RegExp(marker));
  }
});

test("operações e infraestrutura permanecem intactas", () => {
  for (const marker of [
    "moveLead",
    "undoLastMove",
    "onDragStart",
    "onDrop",
    "/api/v1/pipeline",
    'method: "PATCH"',
  ]) {
    assert.match(pipeline, new RegExp(marker));
  }
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
