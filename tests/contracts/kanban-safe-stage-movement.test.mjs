import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-035-safe-stage-movement.json",
    "utf8",
  ),
);

test("fase 35 define um feedback único com três estados claros", () => {
  assert.equal(config.phase, 35);
  assert.deepEqual(config.visibleStates, ["saving", "success", "error"]);
  assert.match(pipeline, /data-ux-phase="35-safe-stage-movement"/);
  assert.match(pipeline, /Movendo oportunidade/);
  assert.match(pipeline, /Etapa atualizada/);
  assert.match(pipeline, /Movimento não confirmado/);
});

test("origem e destino permanecem visíveis durante todo o movimento", () => {
  assert.match(pipeline, /movementFeedback\.from/);
  assert.match(pipeline, /movementFeedback\.to/);
  assert.match(pipeline, /salvando histórico/);
  assert.match(pipeline, /histórico preservado/);
});

test("falha restaura a etapa anterior e comunica o rollback", () => {
  assert.match(pipeline, /setLeads\(previous\)/);
  assert.match(pipeline, /state: "error"/);
  assert.match(pipeline, /etapa anterior restaurada/);
  assert.match(styles, /data-state="error"/);
});

test("proteções do funil e desfazer continuam ativos", () => {
  for (const marker of [
    "if (savingId)",
    "previousStage === stage",
    "requiresDecision",
    "expectedFromStage: previousStage",
    "undoLastMove",
    "reversalOf",
  ]) {
    assert.ok(pipeline.includes(marker), marker);
  }
});

test("fase não altera banco nem executa entrega externa", () => {
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
