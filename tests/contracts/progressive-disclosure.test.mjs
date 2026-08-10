import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("config/operational-ux-phase-016-progressive-disclosure.json", "utf8"));
const header = readFileSync("components/atlas/page-header.tsx", "utf8");
const ui = readFileSync("components/ui/AtlasUI.tsx", "utf8");
const primitives = readFileSync("components/atlas/information-primitives.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("decisão fica visível e contexto complementar abre sob demanda", () => {
  assert.match(header, /decision \? <p className="atlas-page-decision">/);
  assert.match(header, /description && decision \? \(/);
  assert.match(header, /className="atlas-page-context-disclosure"/);
  assert.match(header, /<summary>Entender esta visão<\/summary>/);
});

test("erro recuperável preserva segurança e ação enquanto recolhe diagnóstico", () => {
  assert.match(ui, /Seus dados permanecem protegidos/);
  assert.match(ui, /className="atlas-recovery-disclosure"/);
  assert.match(ui, /<summary>Detalhes para recuperação<\/summary>/);
  assert.match(ui, /onClick=\{onRetry\}/);
});

test("divulgação usa semântica nativa e foco visível", () => {
  assert.match(primitives, /data-disclosure="progressive"/);
  assert.match(primitives, /data-information-depth="analysis"/);
  assert.match(css, /atlas-page-context-disclosure summary:focus-visible/);
  assert.match(css, /atlas-recovery-disclosure summary:focus-visible/);
});

test("decisões e ações permanecem protegidas da compactação", () => {
  assert.deepEqual(config.protectedVisibleContent, [
    "decision",
    "operational-state",
    "primary-action",
    "recovery-action"
  ]);
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
});
