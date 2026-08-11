import assert from "node:assert/strict";
import test from "node:test";
import {
  argument,
  evaluateReleaseClosure,
} from "../../scripts/check-v3000-phase-13-release-closure.mjs";

const sha256 = "sha256-controlado";
const sourceFingerprint = "sha256:fingerprint-controlado";
const phase11Contract = {
  candidate: { sha256, sourceFingerprint },
};
const contract = {
  phase: 13,
  origin: "https://atlasaios.com.br",
  route: "/notifications",
  requiredStatus: "approved",
  requiredChecks: [
    "currentReleaseRetained",
    "candidateInstalled",
    "applicationStarted",
    "loginApproved",
    "authenticatedRouteApproved",
    "notificationsApproved",
    "rollbackCommandDocumented",
    "rollbackTargetVerified",
  ],
  requiredStringFields: [
    "candidateReleaseIdentifier",
    "previousReleaseIdentifier",
    "rollbackOwner",
    "reviewedBy",
    "installedAt",
    "reviewedAt",
  ],
  requiredBusinessDataMutations: 0,
  requiredDatabaseMigrations: 0,
  requiredBootstrapExecutions: 0,
  requiredSecretValuesRecorded: false,
  deploymentPerformedByGate: false,
  databaseMutationAllowedByGate: false,
  automaticPromotionAllowed: false,
};

function handoff(productionStatus = "approved") {
  return {
    ok: true,
    installationReady: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    productionStatus,
  };
}

function evidence(overrides = {}) {
  return {
    phase: 13,
    status: "approved",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    route: contract.route,
    candidateReleaseIdentifier: "atlas-one-v3000-candidate",
    previousReleaseIdentifier: "atlas-one-current",
    currentReleaseRetained: true,
    candidateInstalled: true,
    applicationStarted: true,
    loginApproved: true,
    authenticatedRouteApproved: true,
    notificationsApproved: true,
    rollbackCommandDocumented: true,
    rollbackTargetVerified: true,
    rollbackOwner: "operador-responsavel",
    databaseMigrations: 0,
    bootstrapExecutions: 0,
    businessDataMutations: 0,
    secretValuesRecorded: false,
    installedAt: "2026-08-10T22:00:00-03:00",
    reviewedBy: "homologador",
    reviewedAt: "2026-08-10T22:30:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  return evaluateReleaseClosure({
    handoffResult: handoff(),
    releaseEvidence: evidence(),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 13 permanece bloqueada sem homologação pós-deploy", () => {
  const result = evaluate({
    handoffResult: handoff("pending-authorized-deployment"),
    releaseEvidence: null,
  });
  assert.equal(result.releaseStatus, "awaiting-post-deploy-evidence");
  assert.equal(result.releaseClosed, false);
  assert.equal(result.eligibleForControlledTemplatePromotion, false);
});

test("Fase 13 exige aceite operacional mesmo após a Fase 11", () => {
  const result = evaluate({ releaseEvidence: null });
  assert.equal(result.releaseStatus, "awaiting-release-acceptance");
  assert.equal(result.releaseClosed, false);
});

test("Fase 13 fecha a release com rollback e aceite comprovados", () => {
  const result = evaluate();
  assert.equal(result.releaseStatus, "operational-release-approved");
  assert.equal(result.releaseClosed, true);
  assert.equal(result.rollbackReady, true);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 13 rejeita aceite sem alvo de rollback comprovado", () => {
  assert.throws(
    () => evaluate({ releaseEvidence: evidence({ rollbackTargetVerified: false }) }),
    /rollbackTargetVerified/,
  );
});

test("Fase 13 rejeita bootstrap, migration ou mutação comercial", () => {
  assert.throws(
    () => evaluate({ releaseEvidence: evidence({ bootstrapExecutions: 1 }) }),
    /bootstrap/i,
  );
  assert.throws(
    () => evaluate({ releaseEvidence: evidence({ databaseMigrations: 1 }) }),
    /Migrations/,
  );
  assert.throws(
    () => evaluate({ releaseEvidence: evidence({ businessDataMutations: 1 }) }),
    /Mutações de dados comerciais/,
  );
});

test("Fase 13 exige releases distintas e cronologia válida", () => {
  assert.throws(
    () =>
      evaluate({
        releaseEvidence: evidence({
          previousReleaseIdentifier: "atlas-one-v3000-candidate",
        }),
      }),
    /devem ser distintas/,
  );
  assert.throws(
    () =>
      evaluate({
        releaseEvidence: evidence({
          reviewedAt: "2026-08-10T21:59:00-03:00",
        }),
      }),
    /não pode ser anterior/,
  );
});

test("Fase 13 aceita os dois formatos seguros de argumento CLI", () => {
  assert.equal(argument(["--zip", "/tmp/a.zip"], "--zip"), "/tmp/a.zip");
  assert.equal(argument(["--zip=/tmp/a.zip"], "--zip"), "/tmp/a.zip");
});
