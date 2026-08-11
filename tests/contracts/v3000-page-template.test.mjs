import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const template = readFileSync(
  "components/atlas/v3000-page-template.tsx",
  "utf8",
);

test("template V3000 preserva a ordem canônica de decisão", () => {
  assert.match(
    template,
    /data-information-order="decision-metrics-priority-workspace-analysis"/,
  );

  const primitives = [
    "PageHeader",
    "AtlasMetricDeck",
    "AtlasPriorityQueue",
    "AtlasSection",
    "AtlasDetailDisclosure",
  ];
  let previous = -1;

  for (const primitive of primitives) {
    const current = template.indexOf(`<${primitive}`);
    assert.ok(current > previous, `${primitive} deve respeitar a ordem canônica`);
    previous = current;
  }
});

test("template é compatível com Server Components e não duplica o shell", () => {
  assert.doesNotMatch(template, /^["']use client["'];/m);
  assert.doesNotMatch(template, /<main\b/);
  assert.doesNotMatch(template, /use(State|Effect|Memo|Callback)\s*\(/);
  assert.doesNotMatch(template, /fetch\s*\(/);
});

test("estados e conteúdo operacional entram por slots tipados", () => {
  assert.match(template, /feedback\?: ReactNode/);
  assert.match(template, /workspace: V3000Workspace/);
  assert.match(template, /content: ReactNode/);
  assert.match(template, /data-page-feedback="recoverable-state"/);
  assert.match(template, /data-workspace-layout=/);
});

test("template reutiliza os primitivos canônicos sem criar linguagem paralela", () => {
  assert.match(template, /from "\.\/information-primitives"/);
  assert.match(template, /from "\.\/page-header"/);
  assert.doesNotMatch(template, /#[0-9a-fA-F]{3,8}/);
  assert.doesNotMatch(template, /style=\{/);
});
