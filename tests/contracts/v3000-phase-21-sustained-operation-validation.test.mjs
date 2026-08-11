import assert from "node:assert/strict";
import test from "node:test";
import {
  argument,
  evaluateSustainedOperationValidation,
} from "../../scripts/check-v3000-phase-21-sustained-operation-validation.mjs";

const sha256 = "sha256-validacao-operacao-sustentada";
const sourceFingerprint = "sha256:fingerprint-validacao-operacao-sustentada";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = {
  phase: 21,
  origin: "https://atlasaios.com.br",
  requiredStatus: "approved",
  requiredChecks: [
    "humanReviewCompleted",
    "sameAuthorizedCohortConfirmed",
    "roleScopeConfirmed",
    "tenantIsolationConfirmed",
    "leadScopeConfirmed",
    "taskScopeConfirmed",
    "pipelineScopeConfirmed",
    "monitoringCoverageConfirmed",
    "supportCoverageConfirmed",
    "rollbackReadinessConfirmed",
    "dailyReviewsCompletedConfirmed",
    "aggregateOperationalOutcomeRecorded",
    "dataPrivacyReviewed",
    "noCriticalIncident",
    "noUnresolvedHighSeverityIncident",
    "noRequiredJourneyFailure",
  ],
  requiredStringFields: [
    "releaseIdentifier",
    "validationOwner",
    "rollbackOwner",
    "reviewedBy",
    "sanitizedEvidenceReference",
    "observedWindowStart",
    "observedWindowEnd",
    "reviewedAt",
  ],
  requiredRoles: ["DIRETOR", "GERENTE", "CORRETOR"],
  minimumAvailabilityPercent: 99,
  minimumMonitoringCoveragePercent: 100,
  minimumSuccessfulRequiredJourneys: 3,
  maximumRequiredJourneyFailures: 0,
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
  automaticContinuousOperationAllowed: false,
  automaticRollbackAllowed: false,
};

function authorization(overrides = {}) {
  return {
    phase: 20,
    ok: true,
    sustainedOperationStatus: "manual-sustained-operation-authorized",
    sustainedOperationAuthorized: true,
    manualSustainedOperationEligible: true,
    automaticProductionActionAllowed: false,
    authorizedUserCount: 8,
    rolesAuthorized: ["DIRETOR", "GERENTE", "CORRETOR"],
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    validationOwner: "responsavel-validacao",
    rollbackOwner: "responsavel-rollback",
    operationWindowStart: "2026-08-12T14:00:00-03:00",
    operationWindowEnd: "2026-08-15T14:00:00-03:00",
    authorizationWindowHours: 72,
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    phase: 21,
    status: "approved",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    humanReviewCompleted: true,
    sameAuthorizedCohortConfirmed: true,
    roleScopeConfirmed: true,
    tenantIsolationConfirmed: true,
    leadScopeConfirmed: true,
    taskScopeConfirmed: true,
    pipelineScopeConfirmed: true,
    monitoringCoverageConfirmed: true,
    supportCoverageConfirmed: true,
    rollbackReadinessConfirmed: true,
    dailyReviewsCompletedConfirmed: true,
    aggregateOperationalOutcomeRecorded: true,
    dataPrivacyReviewed: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    noRequiredJourneyFailure: true,
    observedUserCount: 8,
    rolesObserved: ["DIRETOR", "GERENTE", "CORRETOR"],
    userAccessValidatedCount: 8,
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    availabilityPercent: 99.9,
    monitoringCoveragePercent: 100,
    dailyReviewsCompleted: 3,
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
    sanitizedEvidenceReference: "evidencia-sanitizada-021",
    observedWindowStart: "2026-08-12T14:00:00-03:00",
    observedWindowEnd: "2026-08-15T14:00:00-03:00",
    reviewedAt: "2026-08-15T14:15:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  return evaluateSustainedOperationValidation({
    authorizationResult: authorization(),
    sustainedOperationValidationEvidence: evidence(),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 21 aguarda autorização da operação sustentada", () => {
  const result = evaluate({
    authorizationResult: authorization({ sustainedOperationAuthorized: false }),
    sustainedOperationValidationEvidence: null,
  });
  assert.equal(
    result.sustainedOperationValidationStatus,
    "awaiting-sustained-operation-authorization",
  );
  assert.equal(result.sustainedOperationValidated, false);
});

test("Fase 21 aguarda evidência após a autorização", () => {
  const result = evaluate({ sustainedOperationValidationEvidence: null });
  assert.equal(
    result.sustainedOperationValidationStatus,
    "awaiting-sustained-operation-validation",
  );
  assert.equal(result.continuousOperationReviewEligible, false);
});

test("Fase 21 valida a janela sem executar ações de produção", () => {
  const result = evaluate();
  assert.equal(result.sustainedOperationValidationStatus, "sustained-operation-validated");
  assert.equal(result.sustainedOperationValidated, true);
  assert.equal(result.continuousOperationReviewEligible, true);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 21 exige identidade exata do artefato e da release", () => {
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ candidateSha256: "outro" }) }),
    /SHA-256 da validação/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ sourceFingerprint: "outro" }) }),
    /Fingerprint da validação/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ releaseIdentifier: "outra" }) }),
    /Identificador da release/,
  );
});

test("Fase 21 preserva exatamente a coorte e sua cobertura de acesso", () => {
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ observedUserCount: 7 }) }),
    /Coorte observada/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ userAccessValidatedCount: 7 }) }),
    /Cobertura de acessos/,
  );
});

test("Fase 21 preserva exatamente os papéis autorizados", () => {
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ rolesObserved: ["DIRETOR", "GERENTE"] }) }),
    /somente os papéis autorizados/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ rolesObserved: ["DIRETOR", "GERENTE", "ADMIN"] }) }),
    /CORRETOR/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ rolesObserved: ["DIRETOR", "GERENTE", "GERENTE"] }) }),
    /duplicados/,
  );
});

test("Fase 21 exige isolamento e escopos operacionais", () => {
  for (const field of [
    "tenantIsolationConfirmed",
    "leadScopeConfirmed",
    "taskScopeConfirmed",
    "pipelineScopeConfirmed",
  ]) {
    assert.throws(
      () => evaluate({ sustainedOperationValidationEvidence: evidence({ [field]: false }) }),
      new RegExp(field),
    );
  }
});

test("Fase 21 exige monitoramento, suporte, rollback e resultado registrado", () => {
  for (const field of [
    "monitoringCoverageConfirmed",
    "supportCoverageConfirmed",
    "rollbackReadinessConfirmed",
    "dailyReviewsCompletedConfirmed",
    "aggregateOperationalOutcomeRecorded",
    "dataPrivacyReviewed",
  ]) {
    assert.throws(
      () => evaluate({ sustainedOperationValidationEvidence: evidence({ [field]: false }) }),
      new RegExp(field),
    );
  }
});

test("Fase 21 exige jornadas suficientes e sem falhas", () => {
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ successfulRequiredJourneys: 2 }) }),
    /ao menos 3 jornadas/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ failedRequiredJourneys: 1 }) }),
    /Falhas em jornadas obrigatórias/,
  );
});

test("Fase 21 exige disponibilidade e cobertura de monitoramento", () => {
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ availabilityPercent: 98.9 }) }),
    /Disponibilidade/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ monitoringCoveragePercent: 99.9 }) }),
    /Cobertura de monitoramento/,
  );
});

test("Fase 21 exige uma revisão por dia autorizado", () => {
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ dailyReviewsCompleted: 2 }) }),
    /ao menos 3 revisões diárias/,
  );
});

test("Fase 21 rejeita incidentes críticos ou graves", () => {
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ criticalIncidents: 1 }) }),
    /Incidentes críticos/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ unresolvedHighSeverityIncidents: 1 }) }),
    /Incidentes graves/,
  );
});

test("Fase 21 rejeita ações do gate e evidência sensível", () => {
  for (const [field, pattern] of [
    ["databaseMigrationsByGate", /Migrations/],
    ["bootstrapExecutionsByGate", /bootstrap/i],
    ["businessDataMutationsByGate", /Mutações comerciais/],
    ["usersProvisionedByGate", /Usuários provisionados/],
    ["secretValuesRecorded", /Registro de segredos/],
    ["containsPersonalData", /Dados pessoais/],
  ]) {
    assert.throws(
      () => evaluate({ sustainedOperationValidationEvidence: evidence({ [field]: 1 }) }),
      pattern,
    );
  }
});

test("Fase 21 exige responsáveis, janela e revisão cronologicamente válidos", () => {
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ validationOwner: "outro" }) }),
    /Responsável pela validação/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ rollbackOwner: "outro" }) }),
    /Responsável pelo rollback/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ observedWindowStart: "2026-08-12T15:00:00-03:00" }) }),
    /Início da janela observada/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: evidence({ reviewedAt: "2026-08-15T13:59:00-03:00" }) }),
    /antes do fim da janela/,
  );
});

test("Fase 21 aceita argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
