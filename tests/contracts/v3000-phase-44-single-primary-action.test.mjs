import assert from "node:assert/strict";
import test from "node:test";
import {
  loadSinglePrimaryActionRegistry,
  validateSinglePrimaryAction,
} from "../../scripts/check-v3000-phase-44-single-primary-action.mjs";

const root = process.cwd();

test("Fase 44 valida cinco ações e três superfícies operacionais", () => {
  const registry = loadSinglePrimaryActionRegistry(root);
  const result = validateSinglePrimaryAction({ root, registry });

  assert.equal(result.ok, true);
  assert.equal(result.phase, 44);
  assert.equal(result.actions, 5);
  assert.equal(result.surfaces, 3);
  assert.equal(result.singlePrimaryAction, true);
  assert.equal(result.contextualSecondaryActions, true);
});

test("Fase 44 rejeita seletor sem ação de avanço", () => {
  const registry = structuredClone(loadSinglePrimaryActionRegistry(root));
  registry.requiredActionKinds = registry.requiredActionKinds.filter(
    (action) => action !== "advance",
  );

  assert.throws(
    () => validateSinglePrimaryAction({ root, registry }),
    /Ação primária ausente: advance/,
  );
});

test("Fase 44 rejeita alteração de regra comercial", () => {
  const registry = structuredClone(loadSinglePrimaryActionRegistry(root));
  registry.businessRuleMutationAllowed = true;

  assert.throws(
    () => validateSinglePrimaryAction({ root, registry }),
    /não autoriza alteração de regra comercial/,
  );
});

test("Fase 44 detecta adoção removida do Pipeline", () => {
  const registry = structuredClone(loadSinglePrimaryActionRegistry(root));
  registry.pipelineSurface.file = "package.json";

  assert.throws(
    () => validateSinglePrimaryAction({ root, registry }),
    /Marcador de ação única ausente/,
  );
});

test("Fase 44 mantém aceite amplo e sem mutação de banco", () => {
  const registry = loadSinglePrimaryActionRegistry(root);

  assert.ok(registry.acceptanceCriteria.length >= 10);
  assert.equal(registry.databaseMutationAllowed, false);
  assert.equal(registry.apiDuplicationAllowed, false);
});
