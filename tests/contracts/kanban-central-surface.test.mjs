import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-031-kanban-central-surface.json",
    "utf8",
  ),
);

test("fase 31 define o Kanban como superfície canônica", () => {
  assert.equal(config.phase, 31);
  assert.equal(config.canonicalSurface, "pipeline-kanban");
  assert.match(pipeline, /atlas-kanban-central-surface/);
  assert.match(pipeline, /atlas-kanban-scroll/);
});

test("somente uma fila curta permanece exposta antes do quadro", () => {
  const disclosure = pipeline.indexOf(
    'label="Ver briefing ampliado do Kanban"',
  );
  const decisionLayer = pipeline.indexOf("atlas-pipeline-v30-decision-layer");
  const nextMove = pipeline.indexOf("atlas-kanban-v30-next-move-strip");
  const disclosureEnd = pipeline.indexOf("</AtlasDetailDisclosure>", nextMove);
  const visibleQueue = pipeline.indexOf("atlas-pipeline-priority-queue");
  const board = pipeline.indexOf("atlas-kanban-central-surface");

  assert.ok(disclosure >= 0);
  assert.ok(disclosure < decisionLayer);
  assert.ok(decisionLayer < nextMove);
  assert.ok(nextMove < disclosureEnd);
  assert.ok(disclosureEnd < visibleQueue);
  assert.ok(visibleQueue < board);
  assert.equal(config.visiblePriorityQueue, "atlas-pipeline-priority-queue");
});

test("movimentação e ações do corretor continuam preservadas", () => {
  for (const marker of [
    "moveLead",
    "pendingMove",
    "undoLastMove",
    "onDragStart",
    "onDrop",
    "Lead 360",
    "Mensagem IA",
    "Tarefa",
    "Ligar",
  ]) {
    assert.match(pipeline, new RegExp(marker));
  }
});

test("análises continuam acessíveis sem competir com o quadro", () => {
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

test("fase não altera banco, integrações ou release", () => {
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
  assert.match(pipeline, /authenticatedFetch\("\/api\/v1\/pipeline"/);
  assert.match(pipeline, /method: "PATCH"/);
});
