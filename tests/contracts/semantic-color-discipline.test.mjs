import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const config = JSON.parse(fs.readFileSync("config/operational-ux-phase-013-semantic-color-discipline.json", "utf8"));
const tokens = fs.readFileSync("styles/atlas-tokens.css", "utf8");
const globals = fs.readFileSync("app/globals.css", "utf8");
const operationalStates = fs.readFileSync("lib/ui/operational-state.ts", "utf8");

test("paleta declara um papel comercial inequívoco por cor", () => {
  assert.deepEqual(config.colorRoles, {
    action: "blue",
    success: "green",
    attention: "yellow",
    blocking: "red",
    structure: "neutral",
  });
  for (const token of ["--atlas-accent", "--atlas-success", "--atlas-warning", "--atlas-danger"]) {
    assert.ok(tokens.includes(token));
  }
});

test("superfícies estruturais canônicas deixam de usar gradiente multicolorido", () => {
  assert.match(globals, /\.atlas-button-primary[\s\S]*?background: var\(--atlas-accent-strong\)/);
  assert.match(
    globals,
    /\.atlas-progress-value\s*\{\s*background:\s*var\(--atlas-accent\)/,
  );
  assert.match(globals, /\.atlas-page-header::after[\s\S]*?var\(--atlas-border-strong\)/);
  assert.doesNotMatch(globals, /\.atlas-empty-orb[^\n]*linear-gradient/);
});

test("cores de estado continuam vinculadas ao dicionário operacional", () => {
  assert.match(operationalStates, /success/);
  assert.match(operationalStates, /warning/);
  assert.match(operationalStates, /danger/);
  assert.equal(config.requirements.semanticStatusColorsPreserved, true);
});

test("fase não altera infraestrutura nem release", () => {
  assert.ok(Object.values(config.infrastructureMutation).every((value) => value === false));
});
