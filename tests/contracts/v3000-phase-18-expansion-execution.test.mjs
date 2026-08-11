import assert from "node:assert/strict";
import test from "node:test";
import {
  argument,
  evaluateExpansionExecution,
} from "../../scripts/check-v3000-phase-18-expansion-execution.mjs";

const sha256 = "sha256-execucao-expansao";
const sourceFingerprint = "sha256:fingerprint-execucao-expansao";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = {
  phase: 18,
  requiredStatus: "completed",
  requiredChecks: [
    "manualExecutionConfirmed",
    "authorizedArtifactPreserved",
    "authorizedRolesPreserved",
    "authorizedUserLimitPreserved",
    "tenantIsolationVerified",
    "accessValidationCompleted",
    "monitoringActive",
    "supportAvailable",
    "rollbackStillReady",
    "noCriticalIncident",
    "noUnresolvedHighSeverityIncident",
  ],
  requiredStringFields: [
    "releaseIdentifier",
    "executionOwner",
    "rollbackOwner",
    "validatedBy",
    "sanitizedExecutionReference",
    "executionStartedAt",
    "executionEndedAt",
    "validatedAt",
  ],
  requiredRoles: ["DIRETOR", "GERENTE", "CORRETOR"],
  minimumExecutionDurationMinutes: 30,
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

function expansion(overrides = {}) {
  return {
    phase: 17,
    ok: true,
    controlledExpansionAuthorized: true,
    currentPilotUserCount: 3,
    authorizedTotalUsers: 8,
    rolesAuthorized: ["DIRETOR", "GERENTE", "CORRETOR"],
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    rolloutOwner: "responsavel-execucao",
    rollbackOwner: "responsavel-rollback",
    expansionWindowStart: "2026-08-12T10:00:00-03:00",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    phase: 18,
    status: "completed",
    candidateSha256: sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    manualExecutionConfirmed: true,
    authorizedArtifactPreserved: true,
    authorizedRolesPreserved: true,
    authorizedUserLimitPreserved: true,
    tenantIsolationVerified: true,
    accessValidationCompleted: true,
    monitoringActive: true,
    supportAvailable: true,
    rollbackStillReady: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    previousPilotUserCount: 3,
    expandedTotalUsers: 8,
    manuallyOnboardedUsers: 5,
    successfulAccessValidations: 8,
    rolesExecuted: ["DIRETOR", "GERENTE", "CORRETOR"],
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    executionOwner: "responsavel-execucao",
    rollbackOwner: "responsavel-rollback",
    sanitizedExecutionReference: "execucao-sanitizada-001",
    executionStartedAt: "2026-08-12T10:00:00-03:00",
    executionEndedAt: "2026-08-12T10:45:00-03:00",
    validatedBy: "homologador",
    validatedAt: "2026-08-12T10:50:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  return evaluateExpansionExecution({
    expansionResult: expansion(),
    executionEvidence: evidence(),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 18 aguarda autorização válida da expansão", () => {
  const result = evaluate({
    expansionResult: expansion({ controlledExpansionAuthorized: false }),
    executionEvidence: null,
  });
  assert.equal(result.expansionExecutionStatus, "awaiting-controlled-expansion-authorization");
  assert.equal(result.manualExpansionVerified, false);
});

test("Fase 18 aguarda evidência da execução manual", () => {
  const result = evaluate({ executionEvidence: null });
  assert.equal(result.expansionExecutionStatus, "awaiting-manual-expansion-execution");
});

test("Fase 18 comprova a expansão sem executar ações automáticas", () => {
  const result = evaluate();
  assert.equal(result.expansionExecutionStatus, "controlled-expansion-executed");
  assert.equal(result.manualExpansionVerified, true);
  assert.equal(result.expandedTotalUsers, 8);
  assert.equal(result.manuallyOnboardedUsers, 5);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 18 exige total exatamente autorizado e onboarding coerente", () => {
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ expandedTotalUsers: 7 }) }),
    /Total expandido/,
  );
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ manuallyOnboardedUsers: 4 }) }),
    /incluídos manualmente/,
  );
});

test("Fase 18 exige acesso validado para todo o grupo", () => {
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ successfulAccessValidations: 7 }) }),
    /Validações de acesso/,
  );
});

test("Fase 18 preserva os três papéis autorizados", () => {
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ rolesExecuted: ["DIRETOR", "GERENTE"] }) }),
    /papéis autorizados/,
  );
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ rolesExecuted: ["DIRETOR", "GERENTE", "ADMIN"] }) }),
    /CORRETOR/,
  );
});

test("Fase 18 exige isolamento, monitoramento, suporte e rollback", () => {
  for (const field of ["tenantIsolationVerified", "monitoringActive", "supportAvailable", "rollbackStillReady"]) {
    assert.throws(
      () => evaluate({ executionEvidence: evidence({ [field]: false }) }),
      new RegExp(field),
    );
  }
});

test("Fase 18 rejeita incidentes críticos ou graves", () => {
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ criticalIncidents: 1 }) }),
    /Incidentes críticos/,
  );
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ unresolvedHighSeverityIncidents: 1 }) }),
    /Incidentes graves/,
  );
});

test("Fase 18 rejeita ações do gate e evidência sensível", () => {
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ usersProvisionedByGate: 1 }) }),
    /Usuários provisionados/,
  );
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ databaseMigrationsByGate: 1 }) }),
    /Migrations/,
  );
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ containsPersonalData: true }) }),
    /Dados pessoais/,
  );
});

test("Fase 18 preserva artefato, responsáveis e cronologia", () => {
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ candidateSha256: "outro" }) }),
    /SHA-256/,
  );
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ executionOwner: "outro" }) }),
    /Responsável pela execução/,
  );
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ executionStartedAt: "2026-08-12T09:59:00-03:00" }) }),
    /janela autorizada/,
  );
  assert.throws(
    () => evaluate({ executionEvidence: evidence({ executionEndedAt: "2026-08-12T10:20:00-03:00" }) }),
    /no mínimo 30 minutos/,
  );
});

test("Fase 18 aceita argumento separado ou inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
