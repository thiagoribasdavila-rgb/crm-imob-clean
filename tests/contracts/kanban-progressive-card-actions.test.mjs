import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-045-progressive-card-actions.json",
    "utf8",
  ),
);

test("fase 45 declara três níveis de prioridade de ação", () => {
  assert.equal(config.phase, 45);
  assert.match(pipeline, /data-action-priority="primary"/);
  assert.match(pipeline, /data-action-priority="secondary"/);
  assert.match(pipeline, /data-action-priority="tertiary"/);
});

test("ação comercial principal continua visível antes dos detalhes", () => {
  assert.equal(config.primaryActionVisible, true);
  const primary = pipeline.indexOf('data-action-priority="primary"');
  const context = pipeline.indexOf("atlas-kanban-v30-card-context", primary);
  assert.ok(primary >= 0);
  assert.ok(context > primary);
  assert.match(pipeline, /v30Card\.primaryAction\.label/);
  assert.match(styles, /data-action-priority="primary"/);
});

test("utilidades repetidas ficam reunidas sob divulgação nativa", () => {
  assert.equal(config.tertiaryUtilitiesConsolidated, true);
  assert.match(
    pipeline,
    /<details[\s\S]*className="atlas-kanban-v30-card-utilities"[\s\S]*<summary>Mais utilidades<\/summary>/,
  );
  assert.equal(
    (pipeline.match(/className="atlas-kanban-v30-card-utilities"/g) || [])
      .length,
    1,
  );
  assert.match(styles, /atlas-kanban-v30-card-utilities/);
});

test("execução, Copilot e contato permanecem disponíveis", () => {
  assert.equal(config.executionShortcutsPreserved, true);
  assert.equal(config.copilotShortcutsPreserved, true);
  assert.equal(config.contactShortcutsPreserved, true);
  for (const marker of [
    "atlas-kanban-execution-rail",
    "atlas-kanban-copilot-bridge",
    "atlas-card-shortcuts",
    "Mensagem IA",
    "Objeções",
    "WhatsApp",
    "Ligar",
  ]) {
    assert.match(pipeline, new RegExp(marker));
  }
});

test("divulgação acessível e movimentação continuam preservadas", () => {
  assert.equal(config.keyboardDisclosurePreserved, true);
  assert.match(styles, /atlas-kanban-v30-card-utilities[\s\S]*summary:focus-visible/);
  assert.match(pipeline, /moveByKeyboard\(lead, -1\)/);
  assert.match(pipeline, /moveByKeyboard\(lead, 1\)/);
  assert.equal(config.cardMovementPreserved, true);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
