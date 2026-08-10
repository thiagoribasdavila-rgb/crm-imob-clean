import assert from "node:assert/strict";
import test from "node:test";
import {
  mostSevereOperationalState,
  OPERATIONAL_STATE_DICTIONARY,
  resolveOperationalState,
} from "../../lib/ui/operational-state.ts";

test("mantém um único significado operacional para cada cor e severidade", () => {
  assert.equal(OPERATIONAL_STATE_DICTIONARY.healthy.tone, "success");
  assert.equal(OPERATIONAL_STATE_DICTIONARY.attention.tone, "warning");
  assert.equal(OPERATIONAL_STATE_DICTIONARY.critical.tone, "danger");
  assert.equal(OPERATIONAL_STATE_DICTIONARY.insufficient.tone, "violet");
  assert.equal(OPERATIONAL_STATE_DICTIONARY.action.tone, "info");
});

test("traduz estados legados sem promover ausência de evidência a saudável", () => {
  assert.equal(resolveOperationalState("operational").state, "healthy");
  assert.equal(resolveOperationalState("degraded").state, "attention");
  assert.equal(resolveOperationalState("unavailable").state, "blocked");
  assert.equal(resolveOperationalState("no_sample").state, "insufficient");
  assert.equal(resolveOperationalState("valor-desconhecido").state, "neutral");
});

test("prioriza bloqueio e risco comprovado na leitura consolidada", () => {
  assert.equal(mostSevereOperationalState(["healthy", "attention", "critical"]).state, "critical");
  assert.equal(mostSevereOperationalState(["critical", "unavailable"]).state, "blocked");
});
