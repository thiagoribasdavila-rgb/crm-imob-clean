import assert from "node:assert/strict";
import test from "node:test";
import {
  loadReliableStatesRegistry,
  validateReliableStates,
} from "../../scripts/check-v3000-phase-41-reliable-states.mjs";

const root = process.cwd();

test("Fase 41 valida sete estados, sete invariantes e três superfícies", () => {
  const registry = loadReliableStatesRegistry(root);
  const result = validateReliableStates({ root, registry });

  assert.equal(result.ok, true);
  assert.equal(result.phase, 41);
  assert.equal(result.states, 7);
  assert.equal(result.invariants, 7);
  assert.equal(result.surfaces, 3);
  assert.equal(result.technicalErrorsHidden, true);
  assert.equal(result.zeroSemanticsProtected, true);
  assert.equal(result.recoverableErrorRequiresAction, true);
});

test("Fase 41 rejeita zero ambíguo", () => {
  const registry = structuredClone(loadReliableStatesRegistry(root));
  registry.ambiguousZeroAllowed = true;

  assert.throws(
    () => validateReliableStates({ root, registry }),
    /não autoriza zero ambíguo/,
  );
});

test("Fase 41 exige ação em erro recuperável", () => {
  const registry = structuredClone(loadReliableStatesRegistry(root));
  registry.invariants.recoverableErrorRequiresAction = false;

  assert.throws(
    () => validateReliableStates({ root, registry }),
    /recoverableErrorRequiresAction/,
  );
});

test("Fase 41 impede erro técnico na interface", () => {
  const registry = structuredClone(loadReliableStatesRegistry(root));
  registry.technicalErrorsMayReachUser = true;

  assert.throws(
    () => validateReliableStates({ root, registry }),
    /não autoriza erro técnico na interface/,
  );
});

test("Fase 41 detecta adoção ausente em superfície prioritária", () => {
  const registry = structuredClone(loadReliableStatesRegistry(root));
  registry.adoptionSurfaces[2].source = "package.json";

  assert.throws(
    () => validateReliableStates({ root, registry }),
    /Adoção confiável ausente/,
  );
});
