import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/notifications/page.tsx", "utf8");
const surface = readFileSync(
  "components/atlas/notifications-v3000-surface.tsx",
  "utf8",
);
const template = readFileSync(
  "components/atlas/v3000-page-template.tsx",
  "utf8",
);
const globalStyles = readFileSync("app/globals.css", "utf8");

test("Fase 7 mantém a página como composição server-first e uma única ilha cliente", () => {
  assert.doesNotMatch(page, /^['"]use client['"];?/m);
  assert.match(page, /<NotificationsProvider>/);
  assert.match(page, /<V3000PageTemplate/);
  assert.match(surface, /^['"]use client['"];?/m);
  assert.equal((surface.match(/export function NotificationsProvider/g) ?? []).length, 1);
});

test("decisão, prioridade, trabalho e governança possuem rótulos explícitos", () => {
  for (const marker of [
    "Resolva primeiro os prazos vencidos",
    "Vencidas primeiro",
    "Lembretes que pedem decisão",
    "Estado da atualização da caixa",
    "Como esta caixa protege a operação",
  ]) {
    assert.ok(page.includes(marker), `rótulo operacional ausente: ${marker}`);
  }
});

test("prova responsiva usa o mesmo workspace em desktop e mobile", () => {
  assert.match(template, /data-responsive-contract="mobile-first"/);
  assert.match(template, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(18rem,0\.32fr\)\]/);
  assert.match(globalStyles, /@media \(max-width: 639px\)/);
  assert.match(globalStyles, /overflow-x:\s*clip/);
  assert.match(globalStyles, /min-width:\s*0/);
});

test("teclado e feedback recuperável permanecem conectados ao trabalho real", () => {
  assert.match(template, /Ir para a área de trabalho/);
  assert.match(template, /tabIndex=\{-1\}/);
  assert.match(template, /aria-live="polite"/);
  assert.match(surface, /AtlasRecoverableError/);
  assert.match(surface, /onRetry=\{\(\) => void refresh\(\)\}/);
  assert.match(surface, /disabled=\{loading\}/);
});

test("a tela não ganha automação comercial silenciosa durante a consolidação visual", () => {
  assert.doesNotMatch(surface, /sendMessage|sendTemplate|createLead|completeTask/);
  assert.match(surface, /action: "read" \| "dismiss"/);
  assert.match(surface, /Nenhum cliente é contatado/);
  assert.match(surface, /Nenhuma tarefa é concluída/);
});
