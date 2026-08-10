import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-032-single-priority-queue.json",
    "utf8",
  ),
);

test("fase 32 limita a fila visível a três decisões", () => {
  assert.equal(config.phase, 32);
  assert.equal(config.maxVisibleDecisions, 3);
  assert.match(pipeline, /const KANBAN_VISIBLE_PRIORITY_LIMIT = 3;/);
  assert.match(
    pipeline,
    /data-priority-limit=\{KANBAN_VISIBLE_PRIORITY_LIMIT\}/,
  );
  assert.match(pipeline, /\.slice\(0, KANBAN_VISIBLE_PRIORITY_LIMIT\)/);
});

test("existe uma única fila prioritária visível e canônica", () => {
  assert.equal(
    pipeline.match(/data-ux-phase="32-single-short-priority-queue"/g)?.length,
    1,
  );
  assert.equal(config.canonicalQueue, "atlas-pipeline-priority-queue");
  assert.equal(config.duplicateVisibleQueues, false);
});

test("a fila usa o ranking contextual já autorizado", () => {
  assert.equal(config.rankingSource, "kanbanLensQueue");
  assert.match(pipeline, /const kanbanLensQueue = useMemo/);
  assert.match(pipeline, /kanbanLensPriorityWeight/);
  assert.match(pipeline, /\.map\(\(item\) => item\.lead\)/);
  assert.match(pipeline, /data-priority-source="authorized-loaded-pipeline"/);
});

test("o restante das oportunidades continua no quadro e nas análises", () => {
  assert.match(pipeline, /priorityCandidateCount - dailyFocus\.length/);
  assert.match(pipeline, /atlas-kanban-central-surface/);
  assert.match(pipeline, /O restante permanece no quadro e nas análises/);
  assert.match(pipeline, /Ver briefing ampliado do Kanban/);
});

test("movimentação e segurança operacional permanecem intactas", () => {
  for (const marker of [
    "moveLead",
    "pendingMove",
    "undoLastMove",
    "onDragStart",
    "onDrop",
    "Lead 360",
    "Mensagem IA",
  ]) {
    assert.match(pipeline, new RegExp(marker));
  }
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
