import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/marketing/campaigns/page.tsx", "utf8");
const route = readFileSync("app/api/v1/marketing/campaigns/route.ts", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-030-campaign-decision-first.json",
    "utf8",
  ),
);

test("fase 30 prioriza resultado, investimento conhecido e decisão", () => {
  assert.match(page, /30-campaign-decision-first/);
  for (const label of [
    "Vendas observadas",
    "Receita observada",
    "Investimento conhecido",
    "Conversão observada",
    "Decisão recomendada",
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.equal(config.primaryDecision, true);
});

test("custo ausente não aparece como investimento zero", () => {
  assert.match(route, /campaignsWithKnownSpend\.length[\s\S]*?: null/);
  assert.match(page, /Custo não informado/);
  assert.match(page, /Verba planejada:/);
  assert.equal(config.truthRules.unknownSpendIsZero, false);
  assert.equal(config.truthRules.plannedBudgetIsActualSpend, false);
});

test("receita observada não é apresentada como impacto incremental", () => {
  assert.match(route, /revenue: rows\.reduce/);
  assert.match(page, /Sem alegar incrementalidade/);
  assert.match(page, /Receita e custo são observados/);
  assert.equal(config.truthRules.observedRevenueIsIncremental, false);
});

test("operações complementares preservam CRUD e upload sob demanda", () => {
  assert.match(page, /<details[\s\S]*Gerenciar briefings e criativos/);
  assert.match(page, /<details[\s\S]*Criar campanha interna/);
  assert.match(page, /uploadAsset/);
  assert.match(page, /void create\(\)/);
  assert.match(page, /void update\(c\.id/);
  assert.match(page, /void archive\(c\.id\)/);
  assert.match(page, /Incorporadora responsável pela campanha/);
  assert.match(page, /developerId: e\.target\.value/);
  assert.deepEqual(config.secondaryOperationsCollapsed, [
    "campaign_creation",
    "briefing_and_creative_upload",
  ]);
});

test("fase preserva banco, integrações e release", () => {
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});
