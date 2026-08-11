import assert from "node:assert/strict";
import test from "node:test";
import {
  loadDecisionCardRegistry,
  validateDecisionCardContract,
} from "../../scripts/check-v3000-phase-38-decision-card-contract.mjs";

const root = process.cwd();

test("Fase 38 valida contrato, sete camadas e três superfícies", () => {
  const registry = loadDecisionCardRegistry(root);
  const result = validateDecisionCardContract({ root, registry });

  assert.equal(result.ok, true);
  assert.equal(result.phase, 38);
  assert.equal(result.layers, 7);
  assert.equal(result.surfaces, 3);
  assert.equal(result.serverSafe, true);
});

test("Fase 38 rejeita contrato com camada ausente", () => {
  const registry = structuredClone(loadDecisionCardRegistry(root));
  registry.layers.pop();

  assert.throws(
    () => validateDecisionCardContract({ root, registry }),
    /sete camadas do card de decisão/,
  );
});

test("Fase 38 rejeita autorização de mudança operacional", () => {
  const registry = structuredClone(loadDecisionCardRegistry(root));
  registry.businessRuntimeMutationAllowed = true;

  assert.throws(
    () => validateDecisionCardContract({ root, registry }),
    /não autoriza mudança de regra operacional/,
  );
});

test("Fase 38 detecta adoção ausente em superfície prioritária", () => {
  const registry = structuredClone(loadDecisionCardRegistry(root));
  registry.adoptionSurfaces[0].requiredMarkers.push("MARCADOR_INEXISTENTE");

  assert.throws(
    () => validateDecisionCardContract({ root, registry }),
    /Adoção ausente/,
  );
});

test("Fase 38 protege a fronteira server-safe da primitiva", () => {
  const registry = structuredClone(loadDecisionCardRegistry(root));
  registry.canonicalPrimitive.forbiddenTokens.push(
    "export function AtlasDecisionCard",
  );

  assert.throws(
    () => validateDecisionCardContract({ root, registry }),
    /deixou de ser server-safe/,
  );
});
