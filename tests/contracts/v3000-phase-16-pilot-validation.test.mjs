import assert from "node:assert/strict";
import test from "node:test";
import {
  argument,
  evaluatePilotValidation,
} from "../../scripts/check-v3000-phase-16-pilot-validation.mjs";

const sha256 = "sha256-piloto-validado";
const sourceFingerprint = "sha256:fingerprint-piloto-validado";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = {
  phase: 16,
  origin: "https://atlasaios.com.br",
  requiredStatus: "approved",
  requiredChecks: [
    "loginAndSessionValidated",
    "directorDecisionJourneyValidated",
    "managerTeamJourneyValidated",
    "brokerCommercialJourneyValidated",
    "crmReadWriteJourneyValidated",
    "tenantIsolationPreserved",
    "monitoringContinues",
    "supportChannelOperational",
    "rollbackStillReady",
    "noCriticalIncident",
    "humanPilotReviewApproved",
  ],
  requiredStringFields: [
    "releaseIdentifier",
    "rolloutOwner",
    "rollbackOwner",
    "reviewedBy",
    "sanitizedFeedbackReference",
    "pilotStartedAt",
    "pilotEndedAt",
    "reviewedAt",
  ],
  requiredRoles: ["DIRETOR", "GERENTE", "CORRETOR"],
  minimumPilotDurationMinutes: 1440,
  maximumCriticalIncidents: 0,
  maximumUnresolvedHighSeverityIncidents: 0,
  maximumFailedRequiredJourneys: 0,
  requiredDatabaseMigrationsByGate: 0,
  requiredBootstrapExecutionsByGate: 0,
  requiredBusinessDataMutationsByGate: 0,
  requiredUsersProvisionedByGate: 0,
  requiredSecretValuesRecorded: false,
  requiredPersonalDataInEvidence: false,
  deploymentPerformedByGate: false,
  databaseMutationAllowedByGate: false,
  automaticUserProvisioningAllowed: false,
  automaticExpansionAllowed: false,
  automaticRollbackAllowed: false,
};

function pilot(overrides = {}) {
  return {
    ok: true,
    pilotAuthorized: true,
    pilotUserCount: 3,
    rolesCovered: ["DIRETOR", "GERENTE", "CORRETOR"],
    rollbackReady: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    rolloutOwner: "responsavel-piloto",
    rollbackOwner: "responsavel-rollback",
    pilotStartedAt: "2026-08-10T23:10:00-03:00",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    phase: 16,
    status: "approved",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    loginAndSessionValidated: true,
    directorDecisionJourneyValidated: true,
    managerTeamJourneyValidated: true,
    brokerCommercialJourneyValidated: true,
    crmReadWriteJourneyValidated: true,
    tenantIsolationPreserved: true,
    monitoringContinues: true,
    supportChannelOperational: true,
    rollbackStillReady: true,
    noCriticalIncident: true,
    humanPilotReviewApproved: true,
    pilotUserCount: 3,
    rolesValidated: ["DIRETOR", "GERENTE", "CORRETOR"],
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    failedRequiredJourneys: 0,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    rolloutOwner: "responsavel-piloto",
    rollbackOwner: "responsavel-rollback",
    sanitizedFeedbackReference: "registro-interno-sanitizado-001",
    pilotStartedAt: "2026-08-10T23:10:00-03:00",
    pilotEndedAt: "2026-08-11T23:10:00-03:00",
    reviewedBy: "homologador",
    reviewedAt: "2026-08-11T23:20:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  return evaluatePilotValidation({
    pilotResult: pilot(),
    validationEvidence: evidence(),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 16 permanece bloqueada até a autorização do piloto", () => {
  const result = evaluate({
    pilotResult: pilot({ pilotAuthorized: false, rollbackReady: false }),
    validationEvidence: null,
  });
  assert.equal(
    result.pilotValidationStatus,
    "awaiting-controlled-pilot-authorization",
  );
  assert.equal(result.pilotValidated, false);
});

test("Fase 16 exige evidência operacional após a autorização", () => {
  const result = evaluate({ validationEvidence: null });
  assert.equal(result.pilotValidationStatus, "awaiting-pilot-validation-evidence");
  assert.equal(result.productionExpansionAllowed, false);
});

test("Fase 16 valida o piloto sem autorizar expansão automática", () => {
  const result = evaluate();
  assert.equal(result.pilotValidationStatus, "controlled-pilot-validated");
  assert.equal(result.pilotValidated, true);
  assert.equal(result.productionExpansionAllowed, false);
  assert.equal(result.durationMinutes, 1440);
  assert.equal(result.requiredJourneysValidated, true);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 16 exige uma janela operacional mínima de 24 horas", () => {
  assert.throws(
    () =>
      evaluate({
        validationEvidence: evidence({
          pilotEndedAt: "2026-08-11T23:09:00-03:00",
          reviewedAt: "2026-08-11T23:20:00-03:00",
        }),
      }),
    /no mínimo 1440 minutos/,
  );
});

test("Fase 16 rejeita mudança no número ou nos papéis do piloto", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ pilotUserCount: 4 }) }),
    /Quantidade de usuários/,
  );
  assert.throws(
    () =>
      evaluate({
        validationEvidence: evidence({ rolesValidated: ["DIRETOR", "GERENTE"] }),
      }),
    /CORRETOR/,
  );
  assert.throws(
    () =>
      evaluate({
        validationEvidence: evidence({
          rolesValidated: ["DIRETOR", "GERENTE", "CORRETOR", "ADMIN"],
        }),
      }),
    /não autorizado/,
  );
});

test("Fase 16 exige as jornadas reais e o isolamento entre organizações", () => {
  assert.throws(
    () =>
      evaluate({
        validationEvidence: evidence({ brokerCommercialJourneyValidated: false }),
      }),
    /brokerCommercialJourneyValidated/,
  );
  assert.throws(
    () =>
      evaluate({ validationEvidence: evidence({ tenantIsolationPreserved: false }) }),
    /tenantIsolationPreserved/,
  );
});

test("Fase 16 rejeita incidente crítico, grave ou jornada obrigatória falha", () => {
  assert.throws(
    () =>
      evaluate({
        validationEvidence: evidence({ criticalIncidents: 1, noCriticalIncident: false }),
      }),
    /noCriticalIncident|Incidentes críticos/,
  );
  assert.throws(
    () =>
      evaluate({
        validationEvidence: evidence({ unresolvedHighSeverityIncidents: 1 }),
      }),
    /Incidentes graves/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ failedRequiredJourneys: 1 }) }),
    /Jornadas obrigatórias/,
  );
});

test("Fase 16 não executa bootstrap, migration, mutação, usuário ou segredo", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ bootstrapExecutionsByGate: 1 }) }),
    /bootstrap/i,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ databaseMigrationsByGate: 1 }) }),
    /Migrations/,
  );
  assert.throws(
    () =>
      evaluate({ validationEvidence: evidence({ businessDataMutationsByGate: 1 }) }),
    /Mutações comerciais/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ usersProvisionedByGate: 1 }) }),
    /Usuários provisionados/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ secretValuesRecorded: true }) }),
    /Registro de segredos/,
  );
});

test("Fase 16 rejeita dados pessoais na evidência", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ containsPersonalData: true }) }),
    /Dados pessoais/,
  );
});

test("Fase 16 preserva identidade, responsáveis e cronologia", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ candidateSha256: "outro-sha" }) }),
    /SHA-256/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ rolloutOwner: "outro" }) }),
    /Responsável pelo piloto/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ rollbackOwner: "outro" }) }),
    /Responsável pelo rollback/,
  );
  assert.throws(
    () =>
      evaluate({
        validationEvidence: evidence({ pilotStartedAt: "2026-08-10T23:11:00-03:00" }),
      }),
    /preservar o início/,
  );
  assert.throws(
    () =>
      evaluate({
        validationEvidence: evidence({ reviewedAt: "2026-08-11T23:09:00-03:00" }),
      }),
    /não pode ser anterior/,
  );
});

test("Fase 16 aceita os dois formatos seguros de argumento CLI", () => {
  assert.equal(argument(["--zip", "/tmp/a.zip"], "--zip"), "/tmp/a.zip");
  assert.equal(argument(["--zip=/tmp/a.zip"], "--zip"), "/tmp/a.zip");
});
