import assert from "node:assert/strict";
import test from "node:test";

import { evaluateOperationalDelivery } from "../../lib/release/operational-delivery-program.ts";

const completeInput = {
  moduleId: "conversion-core",
  capabilities: [
    { id: "lead-intake", canonicalOwner: "app/api/leads", complete: true },
    { id: "pipeline", canonicalOwner: "app/(crm)/pipeline", complete: true },
  ],
  evidence: [
    { id: "contracts", verified: true, reference: "npm test" },
    { id: "typecheck", verified: true, reference: "npm run typecheck" },
    { id: "runtime", verified: true, reference: "evidence/runtime.json" },
  ],
  requiredEvidenceIds: ["contracts", "typecheck", "runtime"],
  rollbackReady: true,
};

test("evidência técnica completa aguarda homologação humana", () => {
  const result = evaluateOperationalDelivery(completeInput);
  assert.equal(result.status, "ready_for_homologation");
  assert.equal(result.buildAllowed, false);
  assert.equal(result.zipAllowed, false);
});

test("ZIP só é liberado para módulo grande homologado pela diretoria", () => {
  const result = evaluateOperationalDelivery({
    ...completeInput,
    approval: {
      approved: true,
      approverRole: "director",
      scope: "large_module_package",
    },
  });
  assert.equal(result.status, "homologated");
  assert.equal(result.buildAllowed, true);
  assert.equal(result.zipAllowed, true);
  assert.equal(result.deployAllowed, false);
});

test("evidência não verificada não alimenta a memória de entrega", () => {
  const result = evaluateOperationalDelivery({
    ...completeInput,
    evidence: completeInput.evidence.map((item) =>
      item.id === "runtime" ? { ...item, verified: false } : item,
    ),
  });
  assert.equal(result.status, "in_progress");
  assert.ok(result.blockers.includes("missing-verified-evidence:runtime"));
  assert.ok(!result.verifiedEvidenceIds.includes("runtime"));
});

test("proprietários concorrentes para a mesma capacidade bloqueiam duplicidade", () => {
  const result = evaluateOperationalDelivery({
    ...completeInput,
    capabilities: [
      ...completeInput.capabilities,
      { id: "pipeline", canonicalOwner: "app/kanban-v2", complete: true },
    ],
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("duplicate-capability-owner:pipeline"));
});

test("escopo incompleto ou sem rollback não pode virar pacote", () => {
  const result = evaluateOperationalDelivery({
    ...completeInput,
    capabilities: completeInput.capabilities.map((item) => ({
      ...item,
      complete: item.id !== "pipeline",
    })),
    rollbackReady: false,
  });
  assert.equal(result.status, "in_progress");
  assert.ok(result.blockers.includes("incomplete-module-scope"));
  assert.ok(result.blockers.includes("rollback-not-ready"));
});

