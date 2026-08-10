import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const config = JSON.parse(fs.readFileSync("config/operational-ux-phase-010-global-command-rail.json", "utf8"));
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");

test("faixa global declara coordenação e uma única ação primária", () => {
  assert.match(topbar, /data-global-command-rail="coordinated"/);
  assert.match(topbar, /data-primary-global-action="quick-create"/);
  assert.equal((topbar.match(/priority="primary"/g) ?? []).length, 1);
  assert.equal(config.requirements.onePrimaryGlobalAction, true);
});

test("busca, Copilot e notificações preservam seus eventos", () => {
  assert.match(topbar, /atlas:open-command-palette/);
  assert.match(topbar, /atlas:open-copilot/);
  assert.match(topbar, /atlas:open-notifications/);
  assert.match(topbar, /atlas-topbar-utilities/);
});

test("Copilot flutuante é suprimido apenas no desktop coordenado", () => {
  assert.match(
    styles,
    /@media \(min-width: 1180px\)[\s\S]*\.atlas-app-shell\[data-visual-generation="atlas-v30"\]\s*~\s*\.atlas-copilot-launcher[\s\S]*display:\s*none/,
  );
  assert.match(styles, /\.atlas-copilot-topbar-trigger/);
});

test("fase não altera infraestrutura operacional", () => {
  assert.ok(Object.values(config.infrastructureMutation).every((value) => value === false));
});
