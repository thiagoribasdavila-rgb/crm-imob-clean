import assert from "node:assert/strict";
import test from "node:test";
import { getScreenDecisionContract, normalizeDecisionRole } from "../../lib/ui/screen-decision-contract.ts";

test("cada papel recebe uma decisão própria na Sala de Comando", () => {
  const contracts = ["director", "superintendent", "manager", "broker"].map((role) => getScreenDecisionContract("/dashboard", role));
  assert.equal(new Set(contracts.map((item) => item.decision)).size, 4);
  for (const contract of contracts) {
    assert.ok(contract.owner);
    assert.ok(contract.deadline);
    assert.ok(contract.expectedResult);
    assert.ok(contract.evidence);
  }
});

test("rotas de detalhe herdam o contrato da área canônica", () => {
  assert.deepEqual(
    getScreenDecisionContract("/leads/lead-real?tab=history", "broker"),
    getScreenDecisionContract("/leads", "broker"),
  );
  assert.equal(getScreenDecisionContract("/developments/projeto-real/materials", "manager").route, "/developments");
});

test("papel desconhecido recebe escopo de menor privilégio", () => {
  assert.equal(normalizeDecisionRole("admin"), "director");
  assert.equal(getScreenDecisionContract("/dashboard", "unknown").role, "broker");
});
