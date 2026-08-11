import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRegistry,
  validateCardInventory,
} from "../../scripts/check-v3000-phase-37-card-inventory.mjs";

const root = process.cwd();

test("Fase 37 valida primitivas, superfícies operacionais e resíduos legados", () => {
  const registry = loadRegistry(root);
  const result = validateCardInventory({ root, registry });

  assert.equal(result.ok, true);
  assert.equal(result.phase, 37);
  assert.equal(result.operationalSurfaces, 4);
  assert.equal(result.runtimeMutationAllowed, false);
  assert.equal(result.databaseMutationAllowed, false);
});

test("Fase 37 rejeita autorização de mudança de runtime", () => {
  const registry = structuredClone(loadRegistry(root));
  registry.runtimeMutationAllowed = true;

  assert.throws(
    () => validateCardInventory({ root, registry }),
    /não autoriza mutação de runtime/,
  );
});

test("Fase 37 rejeita superfície sem evidência operacional", () => {
  const registry = structuredClone(loadRegistry(root));
  registry.criticalSurfaces[2].requiredMarkers.push("MARCADOR_INEXISTENTE");

  assert.throws(
    () => validateCardInventory({ root, registry }),
    /Marcador operacional ausente/,
  );
});

test("Fase 37 impede promover o dashboard fixo à base canônica", () => {
  const registry = structuredClone(loadRegistry(root));
  registry.criticalSurfaces[0].source = "app/(atlas)/dashboard/page.tsx";

  assert.throws(
    () => validateCardInventory({ root, registry }),
    /dashboard fixo não pode ser superfície canônica/,
  );
});

test("Fase 37 detecta mudança no alcance de um componente legado", () => {
  const registry = structuredClone(loadRegistry(root));
  registry.legacyCandidates[1].expectedExternalReferences = 1;

  assert.throws(
    () => validateCardInventory({ root, registry }),
    /Referências externas inesperadas/,
  );
});
