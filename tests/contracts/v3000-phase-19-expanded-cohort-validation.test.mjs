import assert from "node:assert/strict";
import test from "node:test";
import {
  argument,
  evaluateExpandedCohortValidation,
} from "../../scripts/check-v3000-phase-19-expanded-cohort-validation.mjs";

const sha256 = "sha256-validacao-coorte";
const sourceFingerprint = "sha256:fingerprint-validacao-coorte";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = {
  phase: 19,
  requiredStatus: "approved",
  requiredChecks: [
    "humanValidationApproved",
    "requiredJourneysValidated",
    "roleVisibilityValidated",
    "tenantIsolationValidated",
    "leadScopeValidated",
    "taskScopeValidated",
    "pipelineScopeValidated",
    "monitoringCoverageConfirmed",
    "supportCoverageConfirmed",
    "rollbackStillReady",
    "noCriticalIncident",
    "noUnresolvedHighSeverityIncident",
    "dataPrivacyReviewed",
  ],
  requiredStringFields: [
    "releaseIdentifier",
    "validationOwner",
    "rollbackOwner",
    "reviewedBy",
    "sanitizedValidationReference",
    "observationStartedAt",
    "observationEndedAt",
    "reviewedAt",
  ],
  requiredRoles: ["DIRETOR", "GERENTE", "CORRETOR"],
  requiredJourneys: [
    "authenticatedSession",
    "roleScopedNavigation",
    "leadReadWithinScope",
    "taskReadWithinScope",
    "pipelineReadWithinScope",
    "logout",
  ],
  minimumObservationDurationMinutes: 120,
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

function execution(overrides = {}) {
  return {
    phase: 18,
    ok: true,
    manualExpansionVerified: true,
    expandedTotalUsers: 8,
    rolesExecuted: ["DIRETOR", "GERENTE", "CORRETOR"],
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    executionOwner: "responsavel-validacao",
    rollbackOwner: "responsavel-rollback",
    executionEndedAt: "2026-08-12T10:45:00-03:00",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    phase: 19,
    status: "approved",
    candidateSha256: sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    humanValidationApproved: true,
    requiredJourneysValidated: true,
    roleVisibilityValidated: true,
    tenantIsolationValidated: true,
    leadScopeValidated: true,
    taskScopeValidated: true,
    pipelineScopeValidated: true,
    monitoringCoverageConfirmed: true,
    supportCoverageConfirmed: true,
    rollbackStillReady: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    dataPrivacyReviewed: true,
    expandedTotalUsers: 8,
    validatedUserCount: 8,
    rolesValidated: ["DIRETOR", "GERENTE", "CORRETOR"],
    journeysValidated: [
      "authenticatedSession",
      "roleScopedNavigation",
      "leadReadWithinScope",
      "taskReadWithinScope",
      "pipelineReadWithinScope",
      "logout",
    ],
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    validationOwner: "responsavel-validacao",
    rollbackOwner: "responsavel-rollback",
    reviewedBy: "homologador",
    sanitizedValidationReference: "validacao-sanitizada-001",
    observationStartedAt: "2026-08-12T11:00:00-03:00",
    observationEndedAt: "2026-08-12T13:00:00-03:00",
    reviewedAt: "2026-08-12T13:05:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  return evaluateExpandedCohortValidation({
    executionResult: execution(),
    validationEvidence: evidence(),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 19 aguarda a execução comprovada da expansão", () => {
  const result = evaluate({
    executionResult: execution({ manualExpansionVerified: false }),
    validationEvidence: null,
  });
  assert.equal(result.expandedCohortValidationStatus, "awaiting-controlled-expansion-execution");
  assert.equal(result.expandedCohortValidated, false);
});

test("Fase 19 aguarda a evidência humana da coorte expandida", () => {
  const result = evaluate({ validationEvidence: null });
  assert.equal(result.expandedCohortValidationStatus, "awaiting-expanded-cohort-validation");
});

test("Fase 19 valida a coorte sem executar ações de produção", () => {
  const result = evaluate();
  assert.equal(result.expandedCohortValidationStatus, "expanded-cohort-validated");
  assert.equal(result.expandedCohortValidated, true);
  assert.equal(result.sustainedOperationEligible, true);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
  assert.equal(result.deploymentPerformedByGate, false);
});

test("Fase 19 exige validação de todos os usuários expandidos", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ expandedTotalUsers: 7 }) }),
    /Total expandido/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ validatedUserCount: 7 }) }),
    /Usuários validados/,
  );
});

test("Fase 19 exige exatamente os papéis autorizados", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ rolesValidated: ["DIRETOR", "GERENTE"] }) }),
    /papéis obrigatórios/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ rolesValidated: ["DIRETOR", "GERENTE", "ADMIN"] }) }),
    /CORRETOR/,
  );
});

test("Fase 19 exige exatamente as jornadas obrigatórias", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ journeysValidated: ["authenticatedSession"] }) }),
    /jornadas obrigatórias/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ journeysValidated: [
      "authenticatedSession",
      "roleScopedNavigation",
      "leadReadWithinScope",
      "taskReadWithinScope",
      "pipelineReadWithinScope",
      "outra",
    ] }) }),
    /logout/,
  );
});

test("Fase 19 exige isolamento e escopos de leitura comprovados", () => {
  for (const field of [
    "tenantIsolationValidated",
    "leadScopeValidated",
    "taskScopeValidated",
    "pipelineScopeValidated",
  ]) {
    assert.throws(
      () => evaluate({ validationEvidence: evidence({ [field]: false }) }),
      new RegExp(field),
    );
  }
});

test("Fase 19 rejeita incidentes críticos ou graves", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ criticalIncidents: 1 }) }),
    /Incidentes críticos/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ unresolvedHighSeverityIncidents: 1 }) }),
    /Incidentes graves/,
  );
});

test("Fase 19 rejeita ações do gate e evidência sensível", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ databaseMigrationsByGate: 1 }) }),
    /Migrations/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ usersProvisionedByGate: 1 }) }),
    /Usuários provisionados/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ containsPersonalData: true }) }),
    /Dados pessoais/,
  );
});

test("Fase 19 preserva artefato, responsáveis e cronologia", () => {
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ candidateSha256: "outro" }) }),
    /SHA-256/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ validationOwner: "outro" }) }),
    /Responsável pela validação/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ observationStartedAt: "2026-08-12T10:40:00-03:00" }) }),
    /antes do fim da expansão/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ observationEndedAt: "2026-08-12T12:00:00-03:00" }) }),
    /no mínimo 120 minutos/,
  );
  assert.throws(
    () => evaluate({ validationEvidence: evidence({ reviewedAt: "2026-08-12T12:59:00-03:00" }) }),
    /fim da observação/,
  );
});

test("Fase 19 aceita argumento separado ou inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
