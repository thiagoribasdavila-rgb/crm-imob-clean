import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-021-leads-lead360-density.json",
    "utf8",
  ),
);
const leads = readFileSync("app/(crm)/leads/page.tsx", "utf8");
const lead360 = readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");

test("contrato cobre Leads e Lead 360", () => {
  assert.equal(config.phase, 21);
  assert.deepEqual(config.canonicalSurfaces, ["leads", "lead-360"]);
  assert.ok(config.alwaysVisible.length >= 9);
  assert.ok(config.progressive.length >= 6);
});

test("ações essenciais permanecem na primeira leitura", () => {
  for (const marker of [
    "atlas-leads-action-queue",
    "atlas-leads-filter-panel",
    "atlas-leads-table-panel",
    "applyAttention",
    "transferSelected",
  ]) {
    assert.match(leads, new RegExp(marker));
  }
  for (const marker of [
    "LeadOperationalBar",
    "Rotina e histórico",
    "title: intelligence.nextAction",
    "addActivity",
    "saveLead",
  ]) {
    assert.match(lead360, new RegExp(marker));
  }
});

test("análises complementares continuam acessíveis sob demanda", () => {
  assert.match(leads, /Ver diagnóstico da carteira/);
  for (const label of [
    "Ver contexto completo do relacionamento",
    "Ver qualidade e memória unificada",
    "Ver evidências do score",
    "Evidências da qualificação",
    "Ver histórico completo do relacionamento",
    "Ver imóveis recomendados",
  ]) {
    assert.match(lead360, new RegExp(label));
  }
});

test("fase preserva infraestrutura, dados e release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
  assert.match(leads, /\/api\/v1\/crm\/leads/);
  assert.match(lead360, /\/api\/v1\/leads\/\$\{leadId\}/);
});
