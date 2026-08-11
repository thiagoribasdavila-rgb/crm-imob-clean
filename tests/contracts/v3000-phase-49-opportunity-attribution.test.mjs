import assert from "node:assert/strict";
import test from "node:test";
import {
  OPPORTUNITY_ATTRIBUTION_CONTRACT,
  buildOpportunityAttribution,
} from "../../lib/atlas/opportunity-attribution.ts";
import {
  loadOpportunityAttributionRegistry,
  validateOpportunityAttribution,
} from "../../scripts/check-v3000-phase-49-opportunity-attribution.mjs";

const root = process.cwd();

function completeInput(overrides = {}) {
  return {
    assignedName: "Diego",
    campaignId: "campaign-1",
    campaignName: "Inside Meta Julho",
    leadId: "lead-1",
    leadName: "Cliente Atlas",
    metadata: {
      developer_id: "developer-1",
      developer_name: "Incorporadora Atlas",
    },
    projectId: "project-1",
    projectName: "Inside Perdizes",
    source: "Meta Ads",
    stageKey: "qualified",
    stageLabel: "Qualificação",
    ...overrides,
  };
}

test("Fase 49 preserva o rastro factual por oportunidade", () => {
  const registry = loadOpportunityAttributionRegistry(root);
  const result = validateOpportunityAttribution({ root, registry });

  assert.equal(result.phase, 49);
  assert.equal(result.status, "opportunity-attribution-adopted");
  assert.deepEqual(result.path, ["campaign", "lead", "broker", "stage"]);
  assert.equal(result.registeredFactsOnly, true);
  assert.equal(result.perOpportunity, true);
});

test("rastro completo mantém a ordem campanha, lead, corretor e etapa", () => {
  const snapshot = buildOpportunityAttribution(completeInput());

  assert.equal(snapshot.status, "complete");
  assert.deepEqual(
    snapshot.steps.map((step) => step.key),
    OPPORTUNITY_ATTRIBUTION_CONTRACT.path,
  );
  assert.deepEqual(
    snapshot.contexts.map((context) => context.key),
    ["source", "project", "developer"],
  );
  assert.equal(snapshot.missing.length, 0);
  assert.equal(snapshot.financials, null);
});

test("campanha ausente permanece ausência e não é inferida", () => {
  const snapshot = buildOpportunityAttribution(
    completeInput({ campaignId: null, campaignName: null }),
  );

  assert.equal(snapshot.status, "partial");
  assert.equal(snapshot.steps[0]?.state, "missing");
  assert.equal(snapshot.steps[0]?.value, "Não vinculada");
  assert.ok(snapshot.missing.includes("Campanha"));
});

test("mesma incorporadora em projeto e campanha mantém o rastro válido", () => {
  const snapshot = buildOpportunityAttribution(
    completeInput({
      metadata: {
        campaign_developer_id: "developer-1",
        developer_name: "Incorporadora Atlas",
        project_developer_id: "developer-1",
      },
    }),
  );

  assert.equal(snapshot.status, "complete");
  assert.equal(snapshot.contexts[2]?.state, "linked");
});

test("incorporadoras divergentes bloqueiam a atribuição financeira", () => {
  const snapshot = buildOpportunityAttribution(
    completeInput({
      attributedCost: 1200,
      attributedRevenue: 800000,
      metadata: {
        campaign_developer_id: "developer-2",
        developer_name: "Vínculo ambíguo",
        project_developer_id: "developer-1",
      },
      periodEnd: "2026-08-31",
      periodStart: "2026-08-01",
    }),
  );

  assert.equal(snapshot.status, "conflict");
  assert.equal(snapshot.contexts[2]?.state, "conflict");
  assert.equal(snapshot.financials, null);
});

test("sem período válido o card não mostra valores financeiros", () => {
  const snapshot = buildOpportunityAttribution(
    completeInput({ attributedCost: 1200, attributedRevenue: 800000 }),
  );

  assert.equal(snapshot.status, "complete");
  assert.equal(snapshot.financials, null);
});

test("período e valores explícitos liberam a leitura financeira", () => {
  const snapshot = buildOpportunityAttribution(
    completeInput({
      attributedCost: 1200,
      attributedRevenue: 800000,
      periodEnd: "2026-08-31",
      periodStart: "2026-08-01",
    }),
  );

  assert.deepEqual(snapshot.financials, {
    attributedCost: 1200,
    attributedRevenue: 800000,
    periodEnd: "2026-08-31T00:00:00.000Z",
    periodStart: "2026-08-01T00:00:00.000Z",
  });
});

test("valores negativos ou inválidos nunca entram no rastro", () => {
  const negative = buildOpportunityAttribution(
    completeInput({
      attributedCost: -1,
      attributedRevenue: 800000,
      periodEnd: "2026-08-31",
      periodStart: "2026-08-01",
    }),
  );
  const invalid = buildOpportunityAttribution(
    completeInput({
      attributedCost: Number.NaN,
      attributedRevenue: 800000,
      periodEnd: "2026-08-31",
      periodStart: "2026-08-01",
    }),
  );

  assert.equal(negative.financials, null);
  assert.equal(invalid.financials, null);
});

test("Fase 49 rejeita converter o rastro em agregação", () => {
  const registry = structuredClone(loadOpportunityAttributionRegistry(root));
  registry.scope.perOpportunity = false;

  assert.throws(
    () => validateOpportunityAttribution({ root, registry }),
    /factual, individual e progressiva/,
  );
});
