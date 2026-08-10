import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-034-essential-kanban-card.json",
    "utf8",
  ),
);

test("fase 34 define o card essencial com quatro informações visíveis", () => {
  assert.equal(config.phase, 34);
  assert.deepEqual(config.visibleInformation, [
    "lead_identity",
    "urgency",
    "next_action",
    "primary_command",
  ]);
  assert.match(pipeline, /data-ux-phase="34-essential-decision-card"/);
  assert.match(styles, /34-essential-decision-card/);
});

test("identidade, urgência, próxima ação e comando aparecem antes do contexto", () => {
  const card = pipeline.indexOf('data-ux-phase="34-essential-decision-card"');
  const identity = pipeline.indexOf("atlas-kanban-v30-card-person", card);
  const urgency = pipeline.indexOf("atlas-kanban-v30-card-priority-mark", card);
  const nextAction = pipeline.indexOf("<span>Próxima ação</span>", card);
  const command = pipeline.indexOf('data-primary-command="phase-34"', card);
  const context = pipeline.indexOf("atlas-kanban-v30-card-context", card);

  assert.ok(card >= 0);
  assert.ok(card < identity);
  assert.ok(identity < urgency);
  assert.ok(urgency < nextAction);
  assert.ok(nextAction < command);
  assert.ok(command < context);
});

test("score, sinais, fatos e comandos secundários ficam sob demanda", () => {
  const context = pipeline.indexOf("atlas-kanban-v30-card-context");
  for (const marker of [
    "atlas-kanban-v30-card-quickstrip",
    "atlas-kanban-v30-card-facts",
    "atlas-kanban-v30-card-score",
    "Preview",
    "IA resumir",
    "Abrir Lead 360",
    "Avançar:",
  ]) {
    assert.ok(pipeline.indexOf(marker, context) > context, marker);
  }
  assert.match(pipeline, /<summary>Ver dados e outras ações<\/summary>/);
});

test("o comando principal continua contextual e executável", () => {
  assert.match(pipeline, /v30Card\.primaryAction\.external/);
  assert.match(pipeline, /href=\{v30Card\.primaryAction\.href\}/);
  assert.match(pipeline, /v30Card\.primaryAction\.label/);
  assert.match(pipeline, /WhatsApp agora/);
  assert.match(pipeline, /Preparar proposta/);
  assert.match(pipeline, /Confirmar visita/);
  assert.match(pipeline, /IA preparar contato/);
});

test("movimentação, dados e segurança permanecem intactos", () => {
  for (const marker of [
    "moveLead",
    "moveByKeyboard",
    "undoLastMove",
    "onDragStart",
    "onDrop",
    'method: "PATCH"',
  ]) {
    assert.match(pipeline, new RegExp(marker));
  }
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
