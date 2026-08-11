import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAdaptiveDensityRegistry,
  validateAdaptiveDensity,
} from "../../scripts/check-v3000-phase-40-adaptive-density.mjs";

const root = process.cwd();

test("Fase 40 valida três modos, três perfis e três superfícies", () => {
  const registry = loadAdaptiveDensityRegistry(root);
  const result = validateAdaptiveDensity({ root, registry });

  assert.equal(result.ok, true);
  assert.equal(result.phase, 40);
  assert.equal(result.modes, 3);
  assert.equal(result.profiles, 3);
  assert.equal(result.surfaces, 3);
  assert.equal(result.sharedDom, true);
  assert.equal(result.cssOnlyReordering, true);
  assert.equal(result.primaryActionAlwaysVisible, true);
});

test("Fase 40 rejeita duplicação de API", () => {
  const registry = structuredClone(loadAdaptiveDensityRegistry(root));
  registry.apiDuplicationAllowed = true;

  assert.throws(
    () => validateAdaptiveDensity({ root, registry }),
    /não autoriza duplicação de API/,
  );
});

test("Fase 40 rejeita ocultação da ação primária", () => {
  const registry = structuredClone(loadAdaptiveDensityRegistry(root));
  registry.primaryActionMayBeHidden = true;

  assert.throws(
    () => validateAdaptiveDensity({ root, registry }),
    /não autoriza ocultar a ação primária/,
  );
});

test("Fase 40 protege o mapa de papéis", () => {
  const registry = structuredClone(loadAdaptiveDensityRegistry(root));
  registry.roleProfiles[0].roles = ["director"];

  assert.throws(
    () => validateAdaptiveDensity({ root, registry }),
    /mapa de densidade por papel/,
  );
});

test("Fase 40 detecta adoção ausente em superfície prioritária", () => {
  const registry = structuredClone(loadAdaptiveDensityRegistry(root));
  registry.adoptionSurfaces[0].source = "package.json";

  assert.throws(
    () => validateAdaptiveDensity({ root, registry }),
    /Adoção adaptativa ausente/,
  );
});
