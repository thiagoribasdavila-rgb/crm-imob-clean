import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const boundaries = {
  dashboard: "overview",
  leads: "list",
  pipeline: "board",
  tasks: "list",
  calendar: "schedule",
  customers: "list",
  developments: "portfolio",
  "marketing/campaigns": "list",
};

test("rotas críticas possuem fallback local e contextual", () => {
  for (const [route, variant] of Object.entries(boundaries)) {
    const source = read(`app/(crm)/${route}/loading.tsx`);
    assert.match(source, /ProgressivePageLoading/);
    assert.match(source, new RegExp(`variant="${variant}"`));
    assert.match(source, /label="Carregando/);
  }
});

test("fallback compartilhado mantém semântica e geometria por tarefa", () => {
  const source = read("components/atlas/progressive-page-loading.tsx");
  assert.match(source, /data-loading-variant=\{variant\}/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /aria-busy="true"/);
  assert.match(source, /isBoard/);
  assert.match(source, /isList/);
  assert.match(source, /isSchedule/);
  assert.match(source, /isPortfolio/);
  assert.doesNotMatch(source, /aria-valuenow|role="progressbar"/);
});

test("shell continua persistente e animação respeita movimento reduzido", () => {
  const layout = read("app/(crm)/layout.tsx");
  const shell = read("components/atlas/app-shell.tsx");
  const styles = read("app/globals.css");
  assert.match(layout, /<AppShell>\{children\}<\/AppShell>/);
  assert.match(shell, /<NavigationPerformance/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.atlas-loading-stage,/);
});

test("contrato registra limites técnicos sem alegar prova de latência", () => {
  const config = JSON.parse(read("config/operational-ux-phase-057-local-instant-loading.json"));
  assert.equal(config.phase, 57);
  assert.equal(config.localBoundaries.length, 8);
  assert.equal(config.persistentShell, true);
  assert.equal(config.fakeProgressRendered, false);
  assert.equal(config.cacheComponentsEnabled, false);
  assert.equal(config.unstableInstantAdded, false);
  assert.equal(config.databaseChanged, false);
  assert.equal(config.permissionsChanged, false);
});
