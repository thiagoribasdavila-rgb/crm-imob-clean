import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const config = JSON.parse(fs.readFileSync("config/operational-ux-phase-009-page-header-hierarchy.json", "utf8"));
const component = fs.readFileSync("components/atlas/page-header.tsx", "utf8");
const canonicalFiles = [
  "app/(crm)/leads/page.tsx",
  "app/(crm)/pipeline/page.tsx",
  "app/(crm)/tasks/page.tsx",
  "app/(crm)/customers/page.tsx",
  "app/(crm)/developments/page.tsx",
];

test("cabeçalho compartilhado declara hierarquia e limite de ação", () => {
  assert.match(component, /data-page-header="decision"/);
  assert.match(component, /data-primary-action-count/);
  assert.match(component, /atlas-page-decision/);
  assert.deepEqual(config.hierarchy, ["context", "title", "decisionOrientation", "primaryAction"]);
});

test("áreas operacionais canônicas aderem ao mesmo contrato", () => {
  for (const file of canonicalFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /data-page-header="decision"/, file);
    assert.match(source, /data-primary-action-count="1"/, file);
  }
});

test("pipeline possui título principal semanticamente correto", () => {
  const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
  assert.match(pipeline, /<h1[^>]*>Pipeline inteligente<\/h1>/);
  assert.doesNotMatch(pipeline, /<h2[^>]*>Pipeline inteligente<\/h2>/);
});

test("fase não altera infraestrutura operacional", () => {
  assert.ok(Object.values(config.infrastructureMutation).every((value) => value === false));
});
