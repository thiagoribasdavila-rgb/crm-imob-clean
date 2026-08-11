import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const template = readFileSync(
  "components/atlas/v3000-page-template.tsx",
  "utf8",
);
const globalStyles = readFileSync("app/globals.css", "utf8");

test("Fase 6 conecta o atalho de teclado a um alvo operacional focável", () => {
  assert.match(template, /workspaceId = "atlas-v3000-workspace"/);
  assert.match(template, /href=\{`#\$\{workspaceId\}`\}/);
  assert.match(template, /id=\{workspaceId\}/);
  assert.match(template, /tabIndex=\{-1\}/);
  assert.match(template, /data-workspace-focus-target="true"/);
  assert.match(template, /aria-label=\{workspace\.title\}/);
});

test("template declara os contratos responsivo e de foco sem duplicar o shell", () => {
  assert.match(template, /data-responsive-contract="mobile-first"/);
  assert.match(
    template,
    /data-focus-contract="skip-link-and-visible-ring"/,
  );
  assert.match(template, /className="atlas-v3000-page min-w-0 space-y-6"/);
  assert.doesNotMatch(template, /<main\b/);
  assert.doesNotMatch(template, /^['"]use client['"];?/m);
});

test("feedback recuperável é anunciado sem transformar a página em alerta", () => {
  assert.match(template, /aria-live="polite"/);
  assert.match(template, /aria-atomic="true"/);
  assert.doesNotMatch(template, /role="alert"/);
});

test("CSS canônico cobre toque, foco, movimento reduzido e alto contraste", () => {
  assert.match(globalStyles, /\.atlas-v3000-skip-link\s*\{/);
  assert.match(globalStyles, /min-height:\s*44px/);
  assert.match(globalStyles, /\.atlas-v3000-focus-target:focus-visible\s*\{/);
  assert.match(globalStyles, /@media \(max-width: 639px\)/);
  assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globalStyles, /@media \(forced-colors: active\)/);
});

test("layout com contexto mantém colunas fluidas e não bloqueia conteúdo estreito", () => {
  assert.match(template, /grid min-w-0 items-start gap-6/);
  assert.match(template, /minmax\(0,1fr\)/);
  assert.match(template, /className="min-w-0 self-start"/);
  assert.match(globalStyles, /\.atlas-v3000-page > \*,/);
  assert.match(globalStyles, /overflow-wrap:\s*anywhere/);
});
