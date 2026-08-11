import assert from "node:assert/strict";
import test from "node:test";
import {
  argument,
  evaluateControlledPilot,
} from "../../scripts/check-v3000-phase-15-controlled-pilot.mjs";

const sha256 = "sha256-controlado";
const sourceFingerprint = "sha256:fingerprint-controlado";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = {
  phase: 15,
  origin: "https://atlasaios.com.br",
  requiredStatus: "approved",
  requiredChecks: [
    "pilotScopeApproved",
    "accessProfilesValidated",
    "tenantIsolationPreserved",
    "operationalOwnerReady",
    "supportChannelReady",
    "monitoringContinues",
    "rollbackStillReady",
    "noCriticalIncident",
    "humanExpansionApproved",
  ],
  requiredStringFields: [
    "releaseIdentifier",
    "rolloutOwner",
    "rollbackOwner",
    "reviewedBy",
    "pilotStartedAt",
    "reviewedAt",
  ],
  requiredRoles: ["DIRETOR", "GERENTE", "CORRETOR"],
  minimumPilotUsers: 3,
  maximumPilotUsers: 5,
  maximumCriticalIncidents: 0,
  requiredBusinessDataMutations: 0,
  requiredDatabaseMigrations: 0,
  requiredBootstrapExecutions: 0,
  requiredSecretValuesRecorded: false,
  deploymentPerformedByGate: false,
  databaseMutationAllowedByGate: false,
  automaticUserProvisioningAllowed: false,
  automaticExpansionAllowed: false,
  automaticRollbackAllowed: false,
};

function observation(overrides = {}) {
  return {
    ok: true,
    observationClosed: true,
    rollbackReady: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    rollbackOwner: "responsavel-rollback",
    observationEndedAt: "2026-08-10T23:05:00-03:00",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    phase: 15,
    status: "approved",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    pilotScopeApproved: true,
    accessProfilesValidated: true,
    tenantIsolationPreserved: true,
    operationalOwnerReady: true,
    supportChannelReady: true,
    monitoringContinues: true,
    rollbackStillReady: true,
    noCriticalIncident: true,
    humanExpansionApproved: true,
    pilotUserCount: 3,
    rolesCovered: ["DIRETOR", "GERENTE", "CORRETOR"],
    criticalIncidents: 0,
    databaseMigrations: 0,
    bootstrapExecutions: 0,
    businessDataMutations: 0,
    secretValuesRecorded: false,
    rolloutOwner: "responsavel-piloto",
    rollbackOwner: "responsavel-rollback",
    pilotStartedAt: "2026-08-10T23:10:00-03:00",
    reviewedBy: "homologador",
    reviewedAt: "2026-08-10T23:15:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  return evaluateControlledPilot({
    observationResult: observation(),
    pilotEvidence: evidence(),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 15 permanece bloqueada até a observação operacional", () => {
  const result = evaluate({
    observationResult: observation({
      observationClosed: false,
      rollbackReady: false,
      releaseIdentifier: undefined,
      observationEndedAt: undefined,
    }),
    pilotEvidence: null,
  });
  assert.equal(result.pilotStatus, "awaiting-operational-observation");
  assert.equal(result.pilotAuthorized, false);
});

test("Fase 15 exige autorização explícita do piloto", () => {
  const result = evaluate({ pilotEvidence: null });
  assert.equal(result.pilotStatus, "awaiting-controlled-pilot-approval");
  assert.equal(result.productionExpansionAllowed, false);
});

test("Fase 15 autoriza somente o piloto restrito comprovado", () => {
  const result = evaluate();
  assert.equal(result.pilotStatus, "controlled-pilot-authorized");
  assert.equal(result.pilotAuthorized, true);
  assert.equal(result.productionExpansionAllowed, false);
  assert.equal(result.pilotUserCount, 3);
  assert.deepEqual(result.rolesCovered, ["DIRETOR", "GERENTE", "CORRETOR"]);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 15 limita o piloto entre três e cinco usuários", () => {
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ pilotUserCount: 2 }) }),
    /entre 3 e 5/,
  );
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ pilotUserCount: 6 }) }),
    /entre 3 e 5/,
  );
});

test("Fase 15 exige Diretor, Gerente e Corretor sem duplicidade", () => {
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ rolesCovered: ["DIRETOR", "GERENTE"] }) }),
    /CORRETOR/,
  );
  assert.throws(
    () =>
      evaluate({
        pilotEvidence: evidence({
          rolesCovered: ["DIRETOR", "GERENTE", "CORRETOR", "CORRETOR"],
        }),
      }),
    /duplicados/,
  );
});

test("Fase 15 rejeita quebra de isolamento ou incidente crítico", () => {
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ tenantIsolationPreserved: false }) }),
    /tenantIsolationPreserved/,
  );
  assert.throws(
    () =>
      evaluate({
        pilotEvidence: evidence({ criticalIncidents: 1, noCriticalIncident: false }),
      }),
    /noCriticalIncident|Incidentes críticos/,
  );
});

test("Fase 15 rejeita bootstrap, migration, mutação ou segredo", () => {
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ bootstrapExecutions: 1 }) }),
    /bootstrap/i,
  );
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ databaseMigrations: 1 }) }),
    /Migrations/,
  );
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ businessDataMutations: 1 }) }),
    /Mutações de dados comerciais/,
  );
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ secretValuesRecorded: true }) }),
    /Registro de segredos/,
  );
});

test("Fase 15 rejeita identidade divergente", () => {
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ candidateSha256: "outro-sha" }) }),
    /SHA-256 do piloto/,
  );
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ releaseIdentifier: "outra-release" }) }),
    /Identificador da release/,
  );
  assert.throws(
    () => evaluate({ pilotEvidence: evidence({ rollbackOwner: "outro-responsavel" }) }),
    /Responsável pelo rollback/,
  );
});

test("Fase 15 exige cronologia posterior à observação", () => {
  assert.throws(
    () =>
      evaluate({
        pilotEvidence: evidence({ pilotStartedAt: "2026-08-10T23:00:00-03:00" }),
      }),
    /não pode começar antes/,
  );
  assert.throws(
    () =>
      evaluate({
        pilotEvidence: evidence({ reviewedAt: "2026-08-10T23:09:00-03:00" }),
      }),
    /não pode ser anterior/,
  );
});

test("Fase 15 aceita os dois formatos seguros de argumento CLI", () => {
  assert.equal(argument(["--zip", "/tmp/a.zip"], "--zip"), "/tmp/a.zip");
  assert.equal(argument(["--zip=/tmp/a.zip"], "--zip"), "/tmp/a.zip");
});
