import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCommercialReleaseGate } from "../../lib/atlas/commercial-release-gate.ts";
import {
  loadCommercialHomologationRegistry,
  validateCommercialHomologation,
} from "../../scripts/check-v3000-phase-56-commercial-homologation.mjs";

const root = process.cwd();

const passedAutomatedGates = [
  "contracts",
  "typecheck",
  "lint",
  "build",
  "smoke",
  "rbac",
  "tenant-isolation",
  "desktop",
  "mobile",
  "package-verification",
].map((id) => ({ id, status: "passed" }));

const approvedHumans = [
  { role: "director", status: "approved" },
  { role: "manager", status: "approved" },
  { role: "broker", status: "approved" },
];

test("Fase 56 registra gates técnicos e preserva aprovação humana", () => {
  const registry = loadCommercialHomologationRegistry(root);
  const result = validateCommercialHomologation({ root, registry });

  assert.equal(result.phase, 56);
  assert.equal(result.status, "commercial-release-gate-enforced");
  assert.equal(result.automatedGates, 10);
  assert.equal(result.requiredHumanApprovals, 3);
  assert.equal(result.currentOutcome, "pending-human");
  assert.equal(result.releaseAllowed, false);
  assert.equal(result.databaseMigration, false);
});

test("release só é permitida com todos os gates e papéis aprovados", () => {
  const result = evaluateCommercialReleaseGate({
    automatedGates: passedAutomatedGates,
    humanApprovals: approvedHumans,
    openP0: 0,
    openP1: 0,
  });

  assert.equal(result.status, "passed");
  assert.equal(result.releaseAllowed, true);
});

test("gate automatizado pendente não é convertido em aprovação", () => {
  const result = evaluateCommercialReleaseGate({
    automatedGates: passedAutomatedGates.map((gate) =>
      gate.id === "mobile" ? { ...gate, status: "pending" } : gate,
    ),
    humanApprovals: approvedHumans,
    openP0: 0,
    openP1: 0,
  });

  assert.equal(result.status, "pending-human");
  assert.equal(result.releaseAllowed, false);
  assert.deepEqual(result.pendingGateIds, ["mobile"]);
});

test("aprovação humana ausente mantém a release pendente", () => {
  const result = evaluateCommercialReleaseGate({
    automatedGates: passedAutomatedGates,
    humanApprovals: approvedHumans.filter(({ role }) => role !== "broker"),
    openP0: 0,
    openP1: 0,
  });

  assert.equal(result.status, "pending-human");
  assert.equal(result.releaseAllowed, false);
  assert.deepEqual(result.pendingRoles, ["broker"]);
});

test("falha automatizada bloqueia a release", () => {
  const result = evaluateCommercialReleaseGate({
    automatedGates: passedAutomatedGates.map((gate) =>
      gate.id === "build" ? { ...gate, status: "failed" } : gate,
    ),
    humanApprovals: approvedHumans,
    openP0: 0,
    openP1: 0,
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.releaseAllowed, false);
  assert.deepEqual(result.failedGateIds, ["build"]);
});

test("rejeição humana bloqueia a release", () => {
  const result = evaluateCommercialReleaseGate({
    automatedGates: passedAutomatedGates,
    humanApprovals: approvedHumans.map((approval) =>
      approval.role === "manager"
        ? { ...approval, status: "rejected" }
        : approval,
    ),
    openP0: 0,
    openP1: 0,
  });

  assert.equal(result.status, "blocked");
  assert.deepEqual(result.rejectedRoles, ["manager"]);
});

test("qualquer P0 ou P1 impede a promoção", () => {
  const p0 = evaluateCommercialReleaseGate({
    automatedGates: passedAutomatedGates,
    humanApprovals: approvedHumans,
    openP0: 1,
    openP1: 0,
  });
  const p1 = evaluateCommercialReleaseGate({
    automatedGates: passedAutomatedGates,
    humanApprovals: approvedHumans,
    openP0: 0,
    openP1: 1,
  });

  assert.equal(p0.status, "blocked");
  assert.equal(p1.status, "blocked");
});

test("contrato da fase não cria migration ou promoção automática", () => {
  const registry = loadCommercialHomologationRegistry(root);

  assert.equal(registry.constraints.databaseMigration, false);
  assert.equal(registry.constraints.businessMutation, false);
  assert.equal(registry.constraints.aiCall, false);
  assert.equal(registry.constraints.visibilityExpansion, false);
  assert.equal(registry.constraints.syntheticBusinessData, false);
  assert.equal(registry.constraints.automaticProductionPromotion, false);
});
