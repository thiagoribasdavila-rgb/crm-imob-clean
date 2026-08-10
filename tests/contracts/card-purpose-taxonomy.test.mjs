import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("config/operational-ux-phase-014-card-purpose-taxonomy.json", "utf8"));
const card = readFileSync("components/ui/AtlasCard.tsx", "utf8");
const ui = readFileSync("components/ui/AtlasUI.tsx", "utf8");
const pipeline = readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("taxonomia cobre todas as funções visuais sem criar componentes paralelos", () => {
  assert.deepEqual(Object.keys(config.purposes), ["metric", "decision", "work", "queue", "analysis", "empty"]);
  assert.match(card, /purpose\?: "work" \| "decision" \| "queue" \| "analysis"/);
  assert.match(card, /data-card-purpose=\{purpose\}/);
  assert.match(card, /data-card-purpose="metric"/);
  assert.match(ui, /data-card-purpose="empty"/);
});

test("hierarquia visual distingue decisão, fila e análise", () => {
  for (const purpose of ["decision", "queue", "analysis"]) {
    assert.match(css, new RegExp(`data-card-purpose="${purpose}"`));
  }
  assert.match(css, /data-card-purpose="decision"[\s\S]*?var\(--atlas-accent\)/);
  assert.match(css, /data-card-purpose="analysis"[\s\S]*?box-shadow: none/);
});

test("kanban classifica trabalho e análise sem alterar o fluxo", () => {
  assert.match(pipeline, /<AtlasCard purpose="work">/);
  assert.match(pipeline, /<AtlasCard purpose="analysis" emphasis="quiet">/);
});

test("fase preserva infraestrutura e release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
});
