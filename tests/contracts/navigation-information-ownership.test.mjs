import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const config = JSON.parse(fs.readFileSync("config/operational-ux-phase-008-information-ownership.json", "utf8"));

test("topo é o proprietário visual do contexto e do resultado comercial", () => {
  assert.match(topbar, /atlas-topbar-section/);
  assert.match(topbar, /atlas-topbar-outcome/);
  assert.match(topbar, /decisionOutcome/);
  assert.deepEqual(config.informationOwnership.topbar, ["organization", "group", "currentSection", "businessOutcome", "primaryAction"]);
});

test("barra lateral mantém resultado pesquisável e acessível sem repeti-lo visualmente", () => {
  assert.match(sidebar, /item\.businessOutcome/);
  assert.match(sidebar, /atlas-nav-copy sr-only/);
  assert.match(sidebar, /aria-current=\{active \? "page" : undefined\}/);
  assert.doesNotMatch(sidebar, /atlas-nav-current atlas-sidebar-label/);
});

test("estado de segurança permanece acessível com uma única mensagem visual", () => {
  assert.match(sidebar, /<strong>Protegido<\/strong>/);
  assert.match(sidebar, /Ambiente protegido\. Contexto multi-tenant ativo\./);
  assert.match(sidebar, /atlas-sidebar-decision sr-only/);
});
