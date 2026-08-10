import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("config/operational-ux-phase-015-compact-page-header.json", "utf8"));
const component = readFileSync("components/atlas/page-header.tsx", "utf8");
const tokens = readFileSync("styles/atlas-tokens.css", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("cabeçalho canônico limita a superfície a uma ação contextual", () => {
  assert.equal(config.contract.maximumVisibleActions, 1);
  assert.match(component, /data-header-density="compact"/);
  assert.match(component, /data-visible-action-count=\{action \? 1 : 0\}/);
  assert.match(component, /data-action-count="1"/);
});

test("descrição é curta e o cabeçalho V30 deixa de ser um hero concorrente", () => {
  assert.equal(config.contract.descriptionLines, 2);
  assert.match(css, /\.atlas-page-description \{[\s\S]*?-webkit-line-clamp: 2/);
  const compactHeader =
    css.match(
      /\.atlas-app-shell\[data-visual-generation="atlas-v30"\]\s+\.atlas-page-header\[data-v30-layout="decision-header"\]\s*\{([\s\S]*?)\n\}/,
    )?.[1] ?? "";
  assert.match(compactHeader, /border-radius: 0/);
  assert.match(compactHeader, /background: transparent/);
  assert.match(compactHeader, /box-shadow: none/);
  assert.doesNotMatch(compactHeader, /radial-gradient/);
});

test("tokens de densidade mantêm a abertura compacta em desktop e modo compacto", () => {
  assert.equal(config.contract.desktopMinimumHeightPx, 88);
  assert.equal(config.contract.compactMinimumHeightPx, 76);
  assert.match(tokens, /--atlas-density-page-header-min: 88px/);
  assert.match(tokens, /--atlas-density-page-header-min: 76px/);
});

test("fase preserva infraestrutura e release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
});
