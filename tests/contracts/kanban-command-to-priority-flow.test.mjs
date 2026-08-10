import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-040-command-to-priority-flow.json",
    "utf8",
  ),
);

test("fase 40 une comando da etapa e prioridade em uma única ponte", () => {
  assert.equal(config.phase, 40);
  assert.equal(config.commandAndPriorityUnified, true);
  assert.match(
    pipeline,
    /atlas-kanban-v30-stage-command atlas-kanban-v30-stage-decision-bridge/,
  );
  assert.match(pipeline, /<span>Prioridade agora<\/span>/);
  assert.match(pipeline, /stage\.stageActionLead\.actionLabel/);
});

test("bloco intermediário duplicado não permanece entre cabeçalho e cards", () => {
  assert.equal(config.duplicateStageActionBlockRemoved, true);
  const contextEnd = pipeline.indexOf("</details>", pipeline.indexOf("40-command-to-priority-flow"));
  const loadingStart = pipeline.indexOf("{loading ? (", contextEnd);
  const betweenHeaderAndCards = pipeline.slice(contextEnd, loadingStart);
  assert.doesNotMatch(
    betweenHeaderAndCards,
    /className="atlas-kanban-v30-stage-action-lead"/,
  );
});

test("primeiro card é identificado como continuidade da prioridade", () => {
  assert.equal(config.primaryLeadMarkedInBoard, true);
  assert.match(pipeline, /visibleStageItems\.map\(\(lead, leadIndex\) =>/);
  assert.match(
    pipeline,
    /data-stage-priority=\{[\s\S]*leadIndex === 0 \? "primary" : "standard"/,
  );
  assert.match(
    styles,
    /\.atlas-pipeline-lead\[data-stage-priority="primary"\]/,
  );
});

test("foco da etapa e ação principal do lead continuam disponíveis", () => {
  assert.equal(config.stageFocusPreserved, true);
  assert.equal(config.leadPrimaryActionPreserved, true);
  assert.match(pipeline, /className="atlas-kanban-v30-stage-focus-action"/);
  assert.match(pipeline, /setFocus\(stage\.v30Command\.focus\)/);
  assert.match(pipeline, /href=\{stage\.stageActionLead\.actionHref\}/);
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
