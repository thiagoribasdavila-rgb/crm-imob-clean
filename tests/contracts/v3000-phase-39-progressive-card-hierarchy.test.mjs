import assert from "node:assert/strict";
import test from "node:test";
import {
  loadProgressiveCardRegistry,
  validateProgressiveCardHierarchy,
} from "../../scripts/check-v3000-phase-39-progressive-card-hierarchy.mjs";

const root = process.cwd();

test("Fase 39 valida três camadas, três sinais e três superfícies", () => {
  const registry = loadProgressiveCardRegistry(root);
  const result = validateProgressiveCardHierarchy({ root, registry });

  assert.equal(result.ok, true);
  assert.equal(result.phase, 39);
  assert.equal(result.layers, 3);
  assert.equal(result.surfaces, 3);
  assert.equal(result.maximumSignals, 3);
  assert.equal(result.nativeDisclosure, true);
  assert.equal(result.serverSafe, true);
});

test("Fase 39 rejeita mais de três sinais imediatos", () => {
  const registry = structuredClone(loadProgressiveCardRegistry(root));
  registry.quickDecision.maximumSignals = 4;

  assert.throws(
    () => validateProgressiveCardHierarchy({ root, registry }),
    /no máximo três sinais/,
  );
});

test("Fase 39 rejeita camada de leitura ausente", () => {
  const registry = structuredClone(loadProgressiveCardRegistry(root));
  registry.readingLayers.pop();

  assert.throws(
    () => validateProgressiveCardHierarchy({ root, registry }),
    /três camadas de leitura progressiva/,
  );
});

test("Fase 39 detecta adoção ausente em superfície prioritária", () => {
  const registry = structuredClone(loadProgressiveCardRegistry(root));
  registry.adoptionSurfaces[0].requiredMarkers.push("MARCADOR_INEXISTENTE");

  assert.throws(
    () => validateProgressiveCardHierarchy({ root, registry }),
    /Adoção progressiva ausente/,
  );
});

test("Fase 39 protege regra operacional, banco e fronteira server-safe", () => {
  const operationalRegistry = structuredClone(
    loadProgressiveCardRegistry(root),
  );
  operationalRegistry.businessRuntimeMutationAllowed = true;
  assert.throws(
    () =>
      validateProgressiveCardHierarchy({ root, registry: operationalRegistry }),
    /não autoriza mudança de regra operacional/,
  );

  const serverRegistry = structuredClone(loadProgressiveCardRegistry(root));
  serverRegistry.canonicalPrimitive.forbiddenTokens.push(
    "export function AtlasDecisionCard",
  );
  assert.throws(
    () => validateProgressiveCardHierarchy({ root, registry: serverRegistry }),
    /deixou de ser server-safe/,
  );
});
