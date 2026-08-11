import assert from "node:assert/strict";
import test from "node:test";
import {
  loadCommercialIdentityRegistry,
  validateCommercialIdentity,
} from "../../scripts/check-v3000-phase-42-commercial-identity.mjs";

const root = process.cwd();

test("Fase 42 valida seis sinais e três superfícies", () => {
  const registry = loadCommercialIdentityRegistry(root);
  const result = validateCommercialIdentity({ root, registry });

  assert.equal(result.ok, true);
  assert.equal(result.phase, 42);
  assert.equal(result.signals, 6);
  assert.equal(result.surfaces, 3);
  assert.equal(result.tenantScopedOwnerResolution, true);
  assert.equal(result.degradedOwnerFallback, true);
});

test("Fase 42 rejeita identidade sem projeto", () => {
  const registry = structuredClone(loadCommercialIdentityRegistry(root));
  registry.requiredSignals = registry.requiredSignals.filter(
    (signal) => signal !== "project",
  );

  assert.throws(
    () => validateCommercialIdentity({ root, registry }),
    /Sinal comercial ausente: project/,
  );
});

test("Fase 42 rejeita mutação de banco", () => {
  const registry = structuredClone(loadCommercialIdentityRegistry(root));
  registry.databaseMutationAllowed = true;

  assert.throws(
    () => validateCommercialIdentity({ root, registry }),
    /não autoriza alteração de banco/,
  );
});

test("Fase 42 detecta adoção removida do Pipeline", () => {
  const registry = structuredClone(loadCommercialIdentityRegistry(root));
  registry.pipelineSurface.file = "package.json";

  assert.throws(
    () => validateCommercialIdentity({ root, registry }),
    /Marcador comercial ausente/,
  );
});
