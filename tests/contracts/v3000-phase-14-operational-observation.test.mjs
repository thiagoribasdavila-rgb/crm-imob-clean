import assert from "node:assert/strict";
import test from "node:test";
import {
  argument,
  evaluateOperationalObservation,
} from "../../scripts/check-v3000-phase-14-operational-observation.mjs";

const sha256 = "sha256-controlado";
const sourceFingerprint = "sha256:fingerprint-controlado";
const phase11Contract = {
  candidate: { sha256, sourceFingerprint },
};
const contract = {
  phase: 14,
  origin: "https://atlasaios.com.br",
  route: "/notifications",
  requiredStatus: "approved",
  requiredChecks: [
    "releaseRemainedAvailable",
    "authenticationHealthy",
    "dashboardHealthy",
    "notificationsHealthy",
    "dataIntegrityConfirmed",
    "rollbackStillReady",
    "noCriticalIncident",
    "humanObservationApproved",
  ],
  requiredStringFields: [
    "releaseIdentifier",
    "rollbackOwner",
    "observedBy",
    "reviewedBy",
    "observationStartedAt",
    "observationEndedAt",
    "reviewedAt",
  ],
  minimumObservationMinutes: 30,
  minimumAuthenticatedChecks: 2,
  minimumDashboardChecks: 2,
  minimumNotificationChecks: 2,
  maximumCriticalIncidents: 0,
  requiredBusinessDataMutations: 0,
  requiredDatabaseMigrations: 0,
  requiredBootstrapExecutions: 0,
  requiredSecretValuesRecorded: false,
  deploymentPerformedByGate: false,
  databaseMutationAllowedByGate: false,
  automaticExpansionAllowed: false,
  automaticRollbackAllowed: false,
};

function release(overrides = {}) {
  return {
    ok: true,
    releaseClosed: true,
    rollbackReady: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    candidateReleaseIdentifier: "atlas-one-v3000-candidate",
    rollbackOwner: "operador-responsavel",
    reviewedAt: "2026-08-10T22:30:00-03:00",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    phase: 14,
    status: "approved",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    route: contract.route,
    releaseIdentifier: "atlas-one-v3000-candidate",
    releaseRemainedAvailable: true,
    authenticationHealthy: true,
    dashboardHealthy: true,
    notificationsHealthy: true,
    dataIntegrityConfirmed: true,
    rollbackStillReady: true,
    noCriticalIncident: true,
    humanObservationApproved: true,
    authenticatedChecks: 2,
    dashboardChecks: 2,
    notificationChecks: 2,
    criticalIncidents: 0,
    rollbackOwner: "operador-responsavel",
    databaseMigrations: 0,
    bootstrapExecutions: 0,
    businessDataMutations: 0,
    secretValuesRecorded: false,
    observationStartedAt: "2026-08-10T22:35:00-03:00",
    observationEndedAt: "2026-08-10T23:05:00-03:00",
    observedBy: "operador",
    reviewedBy: "homologador",
    reviewedAt: "2026-08-10T23:10:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  return evaluateOperationalObservation({
    releaseResult: release(),
    observationEvidence: evidence(),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 14 permanece bloqueada enquanto a release não foi fechada", () => {
  const result = evaluate({
    releaseResult: release({
      releaseClosed: false,
      rollbackReady: false,
      candidateReleaseIdentifier: undefined,
      rollbackOwner: undefined,
      reviewedAt: undefined,
    }),
    observationEvidence: null,
  });
  assert.equal(result.operationalStatus, "awaiting-release-closure");
  assert.equal(result.observationClosed, false);
  assert.equal(result.stableForControlledExpansion, false);
});

test("Fase 14 exige observação após o fechamento da release", () => {
  const result = evaluate({ observationEvidence: null });
  assert.equal(result.operationalStatus, "awaiting-operational-observation");
  assert.equal(result.observationClosed, false);
});

test("Fase 14 aprova uma janela operacional comprovada", () => {
  const result = evaluate();
  assert.equal(result.operationalStatus, "operational-observation-approved");
  assert.equal(result.observationClosed, true);
  assert.equal(result.stableForControlledExpansion, true);
  assert.equal(result.durationMinutes, 30);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 14 rejeita janela de observação curta", () => {
  assert.throws(
    () =>
      evaluate({
        observationEvidence: evidence({
          observationEndedAt: "2026-08-10T22:50:00-03:00",
          reviewedAt: "2026-08-10T22:55:00-03:00",
        }),
      }),
    /mínimo 30 minutos/,
  );
});

test("Fase 14 rejeita ausência de checagens ou incidente crítico", () => {
  assert.throws(
    () =>
      evaluate({
        observationEvidence: evidence({ authenticatedChecks: 1 }),
      }),
    /Checagens autenticadas/,
  );
  assert.throws(
    () =>
      evaluate({
        observationEvidence: evidence({
          criticalIncidents: 1,
          noCriticalIncident: false,
        }),
      }),
    /noCriticalIncident|Incidentes críticos/,
  );
});

test("Fase 14 rejeita identidade ou release divergente", () => {
  assert.throws(
    () =>
      evaluate({
        observationEvidence: evidence({ candidateSha256: "outro-sha" }),
      }),
    /SHA-256 observado/,
  );
  assert.throws(
    () =>
      evaluate({
        observationEvidence: evidence({ releaseIdentifier: "outra-release" }),
      }),
    /Identificador da release/,
  );
});

test("Fase 14 rejeita bootstrap, migration, mutação ou segredo", () => {
  assert.throws(
    () => evaluate({ observationEvidence: evidence({ bootstrapExecutions: 1 }) }),
    /bootstrap/i,
  );
  assert.throws(
    () => evaluate({ observationEvidence: evidence({ databaseMigrations: 1 }) }),
    /Migrations/,
  );
  assert.throws(
    () => evaluate({ observationEvidence: evidence({ businessDataMutations: 1 }) }),
    /Mutações de dados comerciais/,
  );
  assert.throws(
    () => evaluate({ observationEvidence: evidence({ secretValuesRecorded: true }) }),
    /Registro de segredos/,
  );
});

test("Fase 14 exige cronologia posterior ao aceite da release", () => {
  assert.throws(
    () =>
      evaluate({
        observationEvidence: evidence({
          observationStartedAt: "2026-08-10T22:00:00-03:00",
        }),
      }),
    /não pode começar antes/,
  );
  assert.throws(
    () =>
      evaluate({
        observationEvidence: evidence({
          reviewedAt: "2026-08-10T23:00:00-03:00",
        }),
      }),
    /não pode ser anterior ao fim/,
  );
});

test("Fase 14 aceita os dois formatos seguros de argumento CLI", () => {
  assert.equal(argument(["--zip", "/tmp/a.zip"], "--zip"), "/tmp/a.zip");
  assert.equal(argument(["--zip=/tmp/a.zip"], "--zip"), "/tmp/a.zip");
});
