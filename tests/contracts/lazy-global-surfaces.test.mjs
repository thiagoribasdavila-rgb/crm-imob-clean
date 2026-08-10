import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const config = JSON.parse(fs.readFileSync("config/operational-ux-phase-011-lazy-global-surfaces.json", "utf8"));
const loader = fs.readFileSync("components/atlas/lazy-global-surfaces.tsx", "utf8");
const shell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const layout = fs.readFileSync("app/(crm)/layout.tsx", "utf8");

test("superfícies globais pesadas usam importação dinâmica cliente", () => {
  for (const component of ["CommandPalette", "AtlasNotificationCenter", "AtlasQuickCreate", "AtlasFeedbackCenter", "AtlasCopilotDock"]) {
    assert.match(loader, new RegExp(`const ${component} = dynamic`));
  }
  assert.equal((loader.match(/ssr: false/g) ?? []).length, 5);
  assert.equal(config.requirements.clientSideDynamicImports, true);
});

test("primeiro acionamento é preservado por replay identificado", () => {
  assert.match(loader, /__atlasLazyReplay/);
  assert.match(loader, /pendingDetail/);
  assert.match(loader, /window\.dispatchEvent\(new CustomEvent/);
  assert.equal(config.requirements.firstInteractionReplayed, true);
});

test("atalhos e lançadores leves continuam disponíveis antes do carregamento", () => {
  assert.match(loader, /key === "k"/);
  assert.match(loader, /key === "j"/);
  assert.match(loader, /key === "a"/);
  assert.match(loader, /Carregar e abrir Atlas Copilot/);
  assert.match(loader, /Carregar criação rápida/);
});

test("shell usa o carregador e layout preserva serviços operacionais contínuos", () => {
  assert.match(shell, /<LazyGlobalSurfaces identity={identity}/);
  assert.doesNotMatch(shell, /import CommandPalette from/);
  assert.match(layout, /<AtlasSystemPulse \/>/);
  assert.match(layout, /<AtlasWorkspaceMemory \/>/);
  assert.match(layout, /<CommercialPresence \/>/);
  assert.doesNotMatch(layout, /<AtlasCopilotDock \/>/);
});

test("fase não altera infraestrutura ou dados", () => {
  assert.ok(Object.values(config.infrastructureMutation).every((value) => value === false));
});
