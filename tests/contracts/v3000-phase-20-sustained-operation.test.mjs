import assert from "node:assert/strict";
import test from "node:test";
import {
  argument,
  evaluateSustainedOperationAuthorization,
} from "../../scripts/check-v3000-phase-20-sustained-operation.mjs";

const sha256 = "sha256-operacao-sustentada";
const sourceFingerprint = "sha256:fingerprint-operacao-sustentada";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = {
  phase: 20,
  origin: "https://atlasaios.com.br",
  requiredStatus: "approved",
  requiredDecision: "APPROVE_SUSTAINED_OPERATION",
  requiredDecisionRole: "DIRETOR",
  requiredChecks: [
    "humanDecisionApproved",
    "sameValidatedCohortConfirmed",
    "roleScopeConfirmed",
    "tenantIsolationConfirmed",
    "leadScopeConfirmed",
    "taskScopeConfirmed",
    "pipelineScopeConfirmed",
    "monitoringCoverageConfirmed",
    "supportCoverageConfirmed",
    "rollbackReadinessConfirmed",
    "dailyReviewCadenceConfirmed",
    "incidentEscalationConfirmed",
    "dataPrivacyReviewed",
    "noCriticalIncident",
    "noUnresolvedHighSeverityIncident",
  ],
  requiredStringFields: [
    "releaseIdentifier",
    "decisionOwner",
    "decisionRole",
    "validationOwner",
    "rollbackOwner",
    "reviewedBy",
    "sanitizedDecisionReference",
    "authorizedAt",
    "operationWindowStart",
    "operationWindowEnd",
  ],
  requiredRoles: ["DIRETOR", "GERENTE", "CORRETOR"],
  minimumAuthorizationWindowHours: 24,
  maximumAuthorizationWindowHours: 168,
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
  automaticSustainedOperationExecutionAllowed: false,
  automaticRollbackAllowed: false,
};

function validation(overrides = {}) {
  return {
    phase: 19,
    ok: true,
    expandedCohortValidationStatus: "expanded-cohort-validated",
    expandedCohortValidated: true,
    sustainedOperationEligible: true,
    expandedTotalUsers: 8,
    validatedUserCount: 8,
    rolesValidated: ["DIRETOR", "GERENTE", "CORRETOR"],
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    validationOwner: "responsavel-validacao",
    rollbackOwner: "responsavel-rollback",
    reviewedAt: "2026-08-12T13:05:00-03:00",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    phase: 20,
    status: "approved",
    decision: "APPROVE_SUSTAINED_OPERATION",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    humanDecisionApproved: true,
    sameValidatedCohortConfirmed: true,
    roleScopeConfirmed: true,
    tenantIsolationConfirmed: true,
    leadScopeConfirmed: true,
    taskScopeConfirmed: true,
    pipelineScopeConfirmed: true,
    monitoringCoverageConfirmed: true,
    supportCoverageConfirmed: true,
    rollbackReadinessConfirmed: true,
    dailyReviewCadenceConfirmed: true,
    incidentEscalationConfirmed: true,
    dataPrivacyReviewed: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    authorizedUserCount: 8,
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
    decisionRole: "DIRETOR",
    validationOwner: "responsavel-validacao",
    rollbackOwner: "responsavel-rollback",
    reviewedBy: "homologador",
    sanitizedDecisionReference: "decisao-sanitizada-020",
    authorizedAt: "2026-08-12T13:15:00-03:00",
    operationWindowStart: "2026-08-12T14:00:00-03:00",
    operationWindowEnd: "2026-08-15T14:00:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  return evaluateSustainedOperationAuthorization({
    validationResult: validation(),
    sustainedOperationEvidence: evidence(),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 20 aguarda a validação da coorte expandida", () => {
  const result = evaluate({
    validationResult: validation({
      expandedCohortValidated: false,
      sustainedOperationEligible: false,
    }),
    sustainedOperationEvidence: null,
  });
  assert.equal(result.sustainedOperationStatus, "awaiting-expanded-cohort-validation");
  assert.equal(result.sustainedOperationAuthorized, false);
});

test("Fase 20 aguarda decisão humana após a Fase 19", () => {
  const result = evaluate({ sustainedOperationEvidence: null });
  assert.equal(result.sustainedOperationStatus, "awaiting-sustained-operation-decision");
  assert.equal(result.manualSustainedOperationEligible, false);
});

test("Fase 20 autoriza somente operação sustentada manual", () => {
  const result = evaluate();
  assert.equal(result.sustainedOperationStatus, "manual-sustained-operation-authorized");
  assert.equal(result.sustainedOperationAuthorized, true);
  assert.equal(result.manualSustainedOperationEligible, true);
  assert.equal(result.authorizationWindowHours, 72);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 20 preserva exatamente a coorte validada", () => {
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ authorizedUserCount: 7 }) }),
    /Coorte autorizada/,
  );
});

test("Fase 20 preserva exatamente os papéis validados", () => {
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ rolesAuthorized: ["DIRETOR", "GERENTE"] }) }),
    /somente os papéis validados/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ rolesAuthorized: ["DIRETOR", "GERENTE", "ADMIN"] }) }),
    /CORRETOR/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ rolesAuthorized: ["DIRETOR", "GERENTE", "GERENTE"] }) }),
    /duplicados/,
  );
});

test("Fase 20 exige isolamento e todos os escopos operacionais", () => {
  for (const field of [
    "tenantIsolationConfirmed",
    "leadScopeConfirmed",
    "taskScopeConfirmed",
    "pipelineScopeConfirmed",
  ]) {
    assert.throws(
      () => evaluate({ sustainedOperationEvidence: evidence({ [field]: false }) }),
      new RegExp(field),
    );
  }
});

test("Fase 20 exige monitoramento, suporte, rollback e revisão diária", () => {
  for (const field of [
    "monitoringCoverageConfirmed",
    "supportCoverageConfirmed",
    "rollbackReadinessConfirmed",
    "dailyReviewCadenceConfirmed",
    "incidentEscalationConfirmed",
  ]) {
    assert.throws(
      () => evaluate({ sustainedOperationEvidence: evidence({ [field]: false }) }),
      new RegExp(field),
    );
  }
});

test("Fase 20 exige decisão explícita de Diretor", () => {
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ decision: "REVIEW" }) }),
    /Decisão operacional/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ decisionRole: "GERENTE" }) }),
    /Papel responsável pela decisão/,
  );
});

test("Fase 20 rejeita incidentes críticos ou graves", () => {
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ criticalIncidents: 1 }) }),
    /Incidentes críticos/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ unresolvedHighSeverityIncidents: 1 }) }),
    /Incidentes graves/,
  );
});

test("Fase 20 rejeita ações do gate e evidência sensível", () => {
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ databaseMigrationsByGate: 1 }) }),
    /Migrations/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ bootstrapExecutionsByGate: 1 }) }),
    /bootstrap/i,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ businessDataMutationsByGate: 1 }) }),
    /Mutações comerciais/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ usersProvisionedByGate: 1 }) }),
    /Usuários provisionados/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ secretValuesRecorded: true }) }),
    /Registro de segredos/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ containsPersonalData: true }) }),
    /Dados pessoais/,
  );
});

test("Fase 20 preserva identidade, responsáveis e cronologia", () => {
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ candidateSha256: "outro" }) }),
    /SHA-256/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ validationOwner: "outro" }) }),
    /Responsável pela validação/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ rollbackOwner: "outro" }) }),
    /Responsável pelo rollback/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ authorizedAt: "2026-08-12T13:04:00-03:00" }) }),
    /anterior à validação/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ operationWindowStart: "2026-08-12T13:14:00-03:00" }) }),
    /antes da autorização/,
  );
});

test("Fase 20 limita a janela entre 24 e 168 horas", () => {
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ operationWindowEnd: "2026-08-13T13:59:00-03:00" }) }),
    /no mínimo 24 horas/,
  );
  assert.throws(
    () => evaluate({ sustainedOperationEvidence: evidence({ operationWindowEnd: "2026-08-19T14:01:00-03:00" }) }),
    /no máximo 168 horas/,
  );
});

test("Fase 20 aceita argumento separado ou inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
