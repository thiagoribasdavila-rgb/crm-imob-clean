import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const config = JSON.parse(fs.readFileSync("config/operational-ux-phase-012-decisive-design-tokens.json", "utf8"));
const tokens = fs.readFileSync("styles/atlas-tokens.css", "utf8");
const globals = fs.readFileSync("app/globals.css", "utf8");
const shell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");

test("tokens cobrem as escalas decisivas do produto", () => {
  for (const group of ["space", "font-size", "line-height", "radius", "shadow", "density", "transition"]) {
    assert.match(tokens, new RegExp(`--atlas-${group}`));
  }
  assert.deepEqual(config.tokenGroups, ["color", "spacing", "typography", "radius", "shadow", "density", "motion"]);
});

test("variáveis legadas apontam para a fonte semântica Atlas", () => {
  for (const alias of [
    "--background: var(--atlas-canvas)",
    "--surface: var(--atlas-surface)",
    "--border: var(--atlas-border)",
    "--text: var(--atlas-text-primary)",
    "--primary: var(--atlas-accent)",
    "--radius: var(--atlas-radius-2xl)",
  ]) {
    assert.ok(globals.includes(alias), `alias ausente: ${alias}`);
  }
});

test("densidade compacta redefine a mesma escala sem duplicar componentes", () => {
  assert.match(tokens, /data-desktop-density="compact"/);
  assert.match(tokens, /--atlas-density-card-padding: 16px/);
  assert.match(globals, /padding: var\(--atlas-density-card-padding\)/);
  assert.match(globals, /min-height: var\(--atlas-density-metric-min\)/);
  assert.match(shell, /data-desktop-density={desktopDensity}/);
});

test("fase preserva infraestrutura e release", () => {
  assert.ok(Object.values(config.infrastructureMutation).every((value) => value === false));
});
