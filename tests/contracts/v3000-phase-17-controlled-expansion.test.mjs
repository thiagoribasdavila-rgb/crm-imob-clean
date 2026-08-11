import assert from "node:assert/strict";
import test from "node:test";
import {
  argument,
  evaluateControlledExpansion,
} from "../../scripts/check-v3000-phase-17-controlled-expansion.mjs";

const sha256 = "sha256-expansao-controlada";
const sourceFingerprint = "sha256:fingerprint-expansao-controlada";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = {
  phase: 17,
  origin: "https://atlasaios.com.br",
  requiredStatus: "approved",
  requiredChecks: [
    "humanExpansionDecisionApproved",
    "capacityPlanReviewed",
    "roleAccessPlanReviewed",
    "tenantIsolationPlanReviewed",
    "monitoringCoverageConfirmed",
    "supportCoverageConfirmed",
    "rollbackStillReady",
    "noCriticalIncident",
    "noUnresolvedHighSeverityIncident",
    "privacyAndDataGovernanceReviewed",
    "expansionWindowApproved",
  ],
  requiredStringFields: [
    "releaseIdentifier",
    "decisionOwner",
    "rolloutOwner",
    "rollbackOwner",
    "reviewedBy",
    "sanitizedDecisionReference",
    "expansionWindowStart",
    "reviewedAt",
  ],
  requiredRoles: ["DIRETOR", "GERENTE", "CORRETOR"],
  minimumAuthorizedTotalUsers: 6,
  maximumAuthorizedTotalUsers: 10,
  maximumCriticalIncidents: 0,
  maximumUnresolvedHighSeverityIncidents: 0,
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

function validation(overrides = {}) {
  return {
    phase: 16,
    ok: true,
    pilotValidationStatus: "controlled-pilot-validated",
    pilotValidated: true,
    pilotUserCount: 3,
    rolesValidated: ["DIRETOR", "GERENTE", "CORRETOR"],
    rollbackReady: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    rolloutOwner: "responsavel-piloto",
    rollbackOwner: "responsavel-rollback",
    pilotEndedAt: "2026-08-11T23:10:00-03:00",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    phase: 17,
    status: "approved",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    humanExpansionDecisionApproved: true,
    capacityPlanReviewed: true,
    roleAccessPlanReviewed: true,
    tenantIsolationPlanReviewed: true,
    monitoringCoverageConfirmed: true,
    supportCoverageConfirmed: true,
    rollbackStillReady: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    privacyAndDataGovernanceReviewed: true,
    expansionWindowApproved: true,
    currentPilotUserCount: 3,
    authorizedTotalUsers: 8,
    rolesAuthorized: ["DIRETOR", "GERENTE", "CORRETOR"],
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    decisionOwner: "responsavel-decisao",
    rolloutOwner: "responsavel-piloto",
    rollbackOwner: "responsavel-rollback",
    sanitizedDecisionReference: "decisao-sanitizada-001",
    expansionWindowStart: "2026-08-12T10:00:00-03:00",
    reviewedBy: "homologador",
    reviewedAt: "2026-08-12T09:00:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  return evaluateControlledExpansion({
    validationResult: validation(),
    expansionEvidence: evidence(),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 17 permanece bloqueada até a validação do piloto", () => {
  const result = evaluate({
    validationResult: validation({ pilotValidated: false, rollbackReady: false }),
    expansionEvidence: null,
  });
  assert.equal(result.controlledExpansionStatus, "awaiting-pilot-validation");
  assert.equal(result.controlledExpansionAuthorized, false);
  assert.equal(result.automaticExpansionAllowed, false);
});

test("Fase 17 exige decisão humana após o piloto validado", () => {
  const result = evaluate({ expansionEvidence: null });
  assert.equal(
    result.controlledExpansionStatus,
    "awaiting-human-expansion-decision",
  );
  assert.equal(result.productionExpansionPerformedByGate, false);
});

test("Fase 17 autoriza somente execução manual e não provisiona usuários", () => {
  const result = evaluate();
  assert.equal(result.controlledExpansionStatus, "authorized-for-manual-execution");
  assert.equal(result.controlledExpansionAuthorized, true);
  assert.equal(result.authorizedTotalUsers, 8);
  assert.deepEqual(result.rolesAuthorized, ["DIRETOR", "GERENTE", "CORRETOR"]);
  assert.equal(result.automaticExpansionAllowed, false);
  assert.equal(result.productionExpansionPerformedByGate, false);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 17 limita a expansão a 6–10 usuários e exige crescimento real", () => {
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ authorizedTotalUsers: 5 }) }),
    /entre 6 e 10 usuários/,
  );
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ authorizedTotalUsers: 11 }) }),
    /entre 6 e 10 usuários/,
  );
  assert.throws(
    () =>
      evaluate({
        validationResult: validation({ pilotUserCount: 6 }),
        expansionEvidence: evidence({ currentPilotUserCount: 6, authorizedTotalUsers: 6 }),
      }),
    /deve aumentar/,
  );
});

test("Fase 17 rejeita divergência na quantidade atual do piloto", () => {
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ currentPilotUserCount: 4 }) }),
    /Quantidade atual de usuários do piloto/,
  );
});

test("Fase 17 preserva exatamente os três papéis homologados", () => {
  assert.throws(
    () =>
      evaluate({
        expansionEvidence: evidence({ rolesAuthorized: ["DIRETOR", "GERENTE"] }),
      }),
    /somente os papéis homologados/,
  );
  assert.throws(
    () =>
      evaluate({
        expansionEvidence: evidence({
          rolesAuthorized: ["DIRETOR", "GERENTE", "ADMIN"],
        }),
      }),
    /CORRETOR/,
  );
  assert.throws(
    () =>
      evaluate({
        expansionEvidence: evidence({
          rolesAuthorized: ["DIRETOR", "GERENTE", "GERENTE"],
        }),
      }),
    /duplicados/,
  );
});

test("Fase 17 exige capacidade, acesso, isolamento, monitoramento e suporte", () => {
  for (const field of [
    "capacityPlanReviewed",
    "roleAccessPlanReviewed",
    "tenantIsolationPlanReviewed",
    "monitoringCoverageConfirmed",
    "supportCoverageConfirmed",
  ]) {
    assert.throws(
      () => evaluate({ expansionEvidence: evidence({ [field]: false }) }),
      new RegExp(field),
    );
  }
});

test("Fase 17 rejeita incidente crítico ou grave ainda aberto", () => {
  assert.throws(
    () =>
      evaluate({
        expansionEvidence: evidence({ criticalIncidents: 1, noCriticalIncident: false }),
      }),
    /noCriticalIncident|Incidentes críticos/,
  );
  assert.throws(
    () =>
      evaluate({
        expansionEvidence: evidence({
          unresolvedHighSeverityIncidents: 1,
          noUnresolvedHighSeverityIncident: false,
        }),
      }),
    /noUnresolvedHighSeverityIncident|Incidentes graves/,
  );
});

test("Fase 17 não executa bootstrap, migration, mutação, usuário ou segredo", () => {
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ bootstrapExecutionsByGate: 1 }) }),
    /bootstrap/i,
  );
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ databaseMigrationsByGate: 1 }) }),
    /Migrations/,
  );
  assert.throws(
    () =>
      evaluate({ expansionEvidence: evidence({ businessDataMutationsByGate: 1 }) }),
    /Mutações comerciais/,
  );
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ usersProvisionedByGate: 1 }) }),
    /Usuários provisionados/,
  );
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ secretValuesRecorded: true }) }),
    /Registro de segredos/,
  );
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ containsPersonalData: true }) }),
    /Dados pessoais/,
  );
});

test("Fase 17 preserva identidade, responsáveis e cronologia", () => {
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ candidateSha256: "outro-sha" }) }),
    /SHA-256/,
  );
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ rolloutOwner: "outro" }) }),
    /Responsável pela expansão/,
  );
  assert.throws(
    () => evaluate({ expansionEvidence: evidence({ rollbackOwner: "outro" }) }),
    /Responsável pelo rollback/,
  );
  assert.throws(
    () =>
      evaluate({ expansionEvidence: evidence({ reviewedAt: "2026-08-11T23:09:00-03:00" }) }),
    /não pode ser anterior/,
  );
  assert.throws(
    () =>
      evaluate({
        expansionEvidence: evidence({ expansionWindowStart: "2026-08-12T08:59:00-03:00" }),
      }),
    /não pode começar antes/,
  );
});

test("Fase 17 aceita os dois formatos seguros de argumento CLI", () => {
  assert.equal(argument(["--zip", "/tmp/a.zip"], "--zip"), "/tmp/a.zip");
  assert.equal(argument(["--zip=/tmp/a.zip"], "--zip"), "/tmp/a.zip");
});
