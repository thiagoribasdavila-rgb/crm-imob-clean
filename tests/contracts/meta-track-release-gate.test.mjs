import assert from "node:assert/strict";
import test from "node:test";
import {
  META_TRACK_RELEASE_GATE_SCHEMA,
  evaluateMetaTrackReleaseGate,
} from "../../lib/release/meta-track-release-gate.ts";

const phaseChecks = [166, 167, 168, 169].map((phase) => ({
  id: `phase-${phase}`,
  passed: true,
  reference: `scripts/check-evolution-phase-${phase}.mjs`,
}));
const coreChecks = ["contracts", "typecheck", "lint", "secret-scan"].map((id) => ({
  id,
  passed: true,
  reference: `local://${id}`,
}));
const base = {
  approval: null,
  coreChecks,
  externalDeliveryOccurred: false,
  phaseChecks,
  productionMutationOccurred: false,
};

test("evidência completa sem decisão humana continua bloqueando build e ZIP", () => {
  const decision = evaluateMetaTrackReleaseGate(base);
  assert.equal(decision.status, "pending_director_approval");
  assert.equal(decision.buildAllowed, false);
  assert.equal(decision.zipAllowed, false);
  assert.equal(decision.productionAllowed, false);
});

test("evidência ausente bloqueia a solicitação de release", () => {
  const decision = evaluateMetaTrackReleaseGate({
    ...base,
    phaseChecks: phaseChecks.filter((item) => item.id !== "phase-168"),
  });
  assert.equal(decision.status, "blocked");
  assert.deepEqual(decision.missingEvidence, ["phase-168"]);
});

test("evidência reprovada nunca conta como concluída", () => {
  const decision = evaluateMetaTrackReleaseGate({
    ...base,
    coreChecks: coreChecks.map((item) => item.id === "typecheck" ? { ...item, passed: false } : item),
  });
  assert.equal(decision.status, "blocked");
  assert.ok(decision.missingEvidence.includes("typecheck"));
});

test("mutação produtiva ou entrega externa inesperada bloqueia o gate", () => {
  const decision = evaluateMetaTrackReleaseGate({
    ...base,
    externalDeliveryOccurred: true,
    productionMutationOccurred: true,
  });
  assert.equal(decision.status, "blocked");
  assert.ok(decision.missingEvidence.includes("no-external-delivery"));
  assert.ok(decision.missingEvidence.includes("no-production-mutation"));
});

test("somente diretor com escopo explícito autoriza um único build", () => {
  const decision = evaluateMetaTrackReleaseGate({
    ...base,
    approval: {
      approved: true,
      approvedAt: "2026-08-08T20:00:00.000Z",
      approverRole: "director",
      scope: "single_release_build",
    },
  });
  assert.equal(decision.status, "approved_for_single_build");
  assert.equal(decision.buildAllowed, true);
  assert.equal(decision.zipAllowed, false);
  assert.equal(decision.productionAllowed, false);
});

test("aprovação inválida ou ampla demais não libera o build", () => {
  const decision = evaluateMetaTrackReleaseGate({
    ...base,
    approval: {
      approved: true,
      approvedAt: "invalid-date",
      approverRole: "admin",
      scope: "build-and-deploy",
    },
  });
  assert.equal(decision.status, "pending_director_approval");
  assert.equal(decision.schemaVersion, META_TRACK_RELEASE_GATE_SCHEMA);
});

test("decisão serializada não contém payload, PII ou segredo", () => {
  const serialized = JSON.stringify(evaluateMetaTrackReleaseGate(base));
  for (const forbidden of ["phone", "email", "cpf", "access_token", "payload", "secret"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden), false);
  }
});
