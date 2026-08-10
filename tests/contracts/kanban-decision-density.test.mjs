import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-020-kanban-decision-density.json",
    "utf8",
  ),
);
const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");

test("contrato cobre a densidade decisória do Kanban", () => {
  assert.equal(config.phase, 20);
  assert.equal(config.canonicalSurface, "pipeline-kanban");
  assert.ok(config.alwaysVisible.length >= 8);
  assert.ok(config.progressive.length >= 6);
});

test("ações essenciais e quadro permanecem na primeira leitura", () => {
  for (const marker of [
    "atlas-decision-command-action",
    "atlas-pipeline-v30-decision-layer",
    "atlas-kanban-v30-next-move-strip",
    "atlas-kanban-v30-command-bar",
    "atlas-kanban-scroll",
    "moveLead",
    "pendingMove",
  ]) {
    assert.match(pipeline, new RegExp(marker));
  }
});

test("diagnósticos complementares continuam acessíveis sob demanda", () => {
  assert.match(pipeline, /AtlasDetailDisclosure/);
  for (const label of [
    "Ver diagnóstico e clareza do pipeline",
    "Ver atalhos de análise do Kanban",
    "Ver saúde e indicadores do pipeline",
    "Ver resumo visual das etapas",
    "Ver lentes, fila inteligente e gargalos",
    "Ver inteligência avançada e ações em lote",
  ]) {
    assert.match(pipeline, new RegExp(label));
  }
  assert.match(pipeline, /stageBottleneckRanking/);
  assert.match(pipeline, /atlas-kanban-v30-heatline/);
  assert.match(pipeline, /kanbanV30BatchSelection/);
});

test("fase preserva infraestrutura, dados e release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
  assert.match(pipeline, /authenticatedFetch\("\/api\/v1\/pipeline"/);
  assert.match(pipeline, /method: "PATCH"/);
});
