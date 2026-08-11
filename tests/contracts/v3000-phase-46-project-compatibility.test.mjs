import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectCompatibility } from "../../lib/atlas/project-compatibility.ts";
import {
  loadProjectCompatibilityRegistry,
  validateProjectCompatibility,
} from "../../scripts/check-v3000-phase-46-project-compatibility.mjs";

const root = process.cwd();

const completeLead = {
  id: "lead-1",
  development_id: "dev-1",
  budget_min: "R$ 500.000,00",
  budget_max: 700000,
  preferred_regions: ["Perdizes"],
  bedrooms: 2,
};

const development = {
  id: "dev-1",
  name: "Inside Perdizes",
  neighborhood: "Perdizes",
  city: "São Paulo",
  state: "SP",
  price_min: 540000,
  price_max: 850000,
  bedrooms_min: 1,
  bedrooms_max: 3,
};

test("Fase 46 adota compatibilidade factual e preserva a Fase 45", () => {
  const registry = loadProjectCompatibilityRegistry(root);
  const result = validateProjectCompatibility({ root, registry });

  assert.equal(result.phase, 46);
  assert.equal(result.status, "project-compatibility-adopted");
  assert.equal(result.evidenceOnly, true);
  assert.equal(result.missingDataBecomesQuestion, true);
  assert.equal(result.aiProbabilityDisplayed, false);
});

test("compatibilidade completa lista cinco evidências sem estimar chance", () => {
  const result = buildProjectCompatibility(completeLead, development, {
    timeline_key: "Até 3 meses",
    purpose_key: "Morar",
  });

  assert.equal(result.status, "evidence_available");
  assert.equal(result.evidence_count, 5);
  assert.equal(result.missing, null);
  assert.equal(result.evaluated_without_ai, true);
  assert.ok(result.signals.every((signal) => signal.evidence));
  assert.doesNotMatch(JSON.stringify(result), /probability|percent|chance/i);
});

test("dado ausente vira pergunta e não compatibilidade baixa", () => {
  const result = buildProjectCompatibility(
    { id: "lead-2", development_id: "dev-1" },
    development,
  );

  assert.equal(result.status, "needs_qualification");
  assert.equal(result.missing?.key, "budget");
  assert.match(result.missing?.question || "", /faixa de investimento/i);
  assert.ok(!result.signals.some((signal) => signal.key === "budget"));
});

test("divergência conhecida é atenção factual, sem score", () => {
  const result = buildProjectCompatibility(
    { ...completeLead, budget_min: 100000, budget_max: 200000 },
    development,
    { timeline_key: "Até 3 meses", purpose_key: "Investir" },
  );
  const budget = result.signals.find((signal) => signal.key === "budget");

  assert.equal(budget?.state, "attention");
  assert.match(budget?.evidence || "", /Cliente/);
  assert.equal("score" in result, false);
});

test("empreendimento não resolvido solicita qualificação do projeto", () => {
  const result = buildProjectCompatibility({ id: "lead-3" }, null);

  assert.equal(result.status, "project_unavailable");
  assert.equal(result.missing?.key, "project");
  assert.equal(result.evidence_count, 0);
});

test("Fase 46 rejeita porcentagem de compatibilidade declarada", () => {
  const registry = structuredClone(loadProjectCompatibilityRegistry(root));
  registry.scope.aiProbabilityDisplayed = true;

  assert.throws(
    () => validateProjectCompatibility({ root, registry }),
    /não pode inventar probabilidade/,
  );
});
