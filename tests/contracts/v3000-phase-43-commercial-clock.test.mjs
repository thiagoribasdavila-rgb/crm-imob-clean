import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCommercialClockRegistry,
  validateCommercialClock,
} from "../../scripts/check-v3000-phase-43-commercial-clock.mjs";

const root = process.cwd();

test("Fase 43 valida quatro dimensões, cinco estados e duas superfícies", () => {
  const registry = loadCommercialClockRegistry(root);
  const result = validateCommercialClock({ root, registry });

  assert.equal(result.ok, true);
  assert.equal(result.phase, 43);
  assert.equal(result.dimensions, 4);
  assert.equal(result.states, 5);
  assert.equal(result.surfaces, 2);
  assert.equal(result.preservesSlaCalculation, true);
  assert.equal(result.textSemantic, true);
});

test("Fase 43 rejeita relógio sem impacto explícito", () => {
  const registry = structuredClone(loadCommercialClockRegistry(root));
  registry.requiredDimensions = registry.requiredDimensions.filter(
    (dimension) => dimension !== "impact",
  );

  assert.throws(
    () => validateCommercialClock({ root, registry }),
    /Dimensão temporal ausente: impact/,
  );
});

test("Fase 43 rejeita contrato sem estado não planejado", () => {
  const registry = structuredClone(loadCommercialClockRegistry(root));
  registry.requiredStates = registry.requiredStates.filter(
    (state) => state !== "unplanned",
  );

  assert.throws(
    () => validateCommercialClock({ root, registry }),
    /Estado temporal ausente: unplanned/,
  );
});

test("Fase 43 rejeita alteração de regra comercial", () => {
  const registry = structuredClone(loadCommercialClockRegistry(root));
  registry.businessRuleMutationAllowed = true;

  assert.throws(
    () => validateCommercialClock({ root, registry }),
    /não autoriza alteração de regra comercial/,
  );
});

test("Fase 43 detecta adoção removida do Pipeline", () => {
  const registry = structuredClone(loadCommercialClockRegistry(root));
  registry.pipelineSurface.file = "package.json";

  assert.throws(
    () => validateCommercialClock({ root, registry }),
    /Marcador temporal ausente/,
  );
});
