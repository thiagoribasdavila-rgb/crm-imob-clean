import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateNextCycleValidation,
} from "../../scripts/check-v3000-phase-26-next-cycle-validation.mjs";

const sha256 = "sha256-validacao-proximo-ciclo";
const sourceFingerprint = "sha256:fingerprint-validacao-proximo-ciclo";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-26-next-cycle-validation.json", import.meta.url),
    "utf8",
  ),
);

function executionResult(overrides = {}) {
  return {
    phase: 25,
    ok: true,
    nextCycleExecutionStatus: "next-cycle-executed",
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    executedUserCount: 5,
    rolesExecuted: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    requiredJourneyFailures: 0,
    observedAvailabilityPercent: 99.95,
    monitoringCoveragePercent: 100,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    observedCostCents: 8500,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    executionOwner: "responsavel-execucao-fase-25",
    witnessedBy: "testemunha-independente-fase-25",
    executionCompletedAt: "2026-08-09T11:00:00-03:00",
    ...overrides,
  };
}

function executionEvidence(overrides = {}) {
  return {
    phase: 25,
    status: "completed",
    decision: "confirm-next-cycle-execution",
    candidateSha256: sha256,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    sanitizedExecutionReference: "execucao-sanitizada-fase-25",
    executionCompletedAt: "2026-08-09T11:00:00-03:00",
    ...overrides,
  };
}

function validationEvidence(previousEvidence = executionEvidence(), overrides = {}) {
  return {
    phase: 26,
    status: "completed",
    decision: "validate-next-cycle-execution",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    nextCycleExecutionEvidenceSha256: canonicalEvidenceSha256(previousEvidence),
    manualValidationConfirmed: true,
    executionEvidenceReviewed: true,
    evidenceChainReviewed: true,
    sameReleaseReferenceConfirmed: true,
    sameCycleReferenceConfirmed: true,
    approvedPlanOutcomeReviewed: true,
    authorizedCohortOutcomeReviewed: true,
    authorizedRoleScopeOutcomeReviewed: true,
    requiredJourneysOutcomeReviewed: true,
    metricCollectionOutcomeReviewed: true,
    availabilityOutcomeAccepted: true,
    monitoringOutcomeAccepted: true,
    supportOutcomeAccepted: true,
    rollbackReadinessPreserved: true,
    privacyOutcomeAccepted: true,
    costOutcomeAccepted: true,
    changeFreezeOutcomeAccepted: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    noMaterialRegressionDetected: true,
    noAutomaticDeploymentPerformed: true,
    noAutomaticExpansionPerformed: true,
    noAutomaticRollbackPerformed: true,
    validatedUserCount: 5,
    rolesValidated: ["DIRETOR", "GERENTE", "CORRETOR"],
    validatedSuccessfulRequiredJourneys: 3,
    validatedFailedRequiredJourneys: 0,
    validatedAvailabilityPercent: 99.95,
    validatedMonitoringCoveragePercent: 100,
    validatedCriticalIncidents: 0,
    validatedUnresolvedHighSeverityIncidents: 0,
    materialRegressions: 0,
    validatedObservedCostCents: 8500,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    validatedBy: "responsavel-validacao-fase-26",
    reviewedBy: "revisor-independente-fase-26",
    sanitizedValidationReference: "validacao-sanitizada-fase-26",
    validationStartedAt: "2026-08-09T11:30:00-03:00",
    validationCompletedAt: "2026-08-09T12:15:00-03:00",
    recordedAt: "2026-08-09T12:20:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previousEvidence = Object.prototype.hasOwnProperty.call(
    input,
    "nextCycleExecutionEvidence",
  )
    ? input.nextCycleExecutionEvidence
    : executionEvidence();
  const defaultValidationEvidence = previousEvidence
    ? validationEvidence(previousEvidence)
    : validationEvidence(executionEvidence());
  return evaluateNextCycleValidation({
    executionResult: executionResult(),
    nextCycleExecutionEvidence: previousEvidence,
    nextCycleValidationEvidence: defaultValidationEvidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 26 preserva estados pendentes das fases anteriores", () => {
  for (const status of [
    "awaiting-next-cycle-plan",
    "awaiting-next-cycle-execution-review",
    "awaiting-next-cycle-execution-evidence",
  ]) {
    const result = evaluate({
      executionResult: executionResult({ nextCycleExecutionStatus: status }),
      nextCycleExecutionEvidence: null,
      nextCycleValidationEvidence: null,
    });
    assert.equal(result.nextCycleValidationStatus, status);
    assert.equal(result.nextCycleExecutionValidated, false);
  }
});

test("Fase 26 aguarda evidência factual da validação", () => {
  const result = evaluate({ nextCycleValidationEvidence: null });
  assert.equal(result.nextCycleValidationStatus, "awaiting-next-cycle-validation");
  assert.equal(result.nextCycleValidationEvidenceVerified, false);
  assert.equal(result.nextCycleClosureReviewRequired, false);
});

test("Fase 26 valida o ciclo sem executar ações externas", () => {
  const result = evaluate();
  assert.equal(result.nextCycleValidationStatus, "next-cycle-validated");
  assert.equal(result.nextCycleValidationEvidenceVerified, true);
  assert.equal(result.manualNextCycleValidationVerified, true);
  assert.equal(result.nextCycleExecutionValidated, true);
  assert.equal(result.nextCycleClosureReviewRequired, true);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticExpansionAllowed, false);
  assert.equal(result.automaticRollbackAllowed, false);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
  assert.equal(result.secretValuesRecordedByGate, false);
});

test("Fase 26 exige a evidência da Fase 25 quando há validação", () => {
  assert.throws(
    () => evaluate({ nextCycleExecutionEvidence: null }),
    /evidência da Fase 25 é obrigatória/,
  );
});

test("Fase 26 exige fase, status e decisão exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 25, /Fase da evidência/],
    ["status", "approved", /Status da validação/],
    ["decision", "validate", /Decisão da validação/],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleValidationEvidence: validationEvidence(executionEvidence(), {
          [field]: value,
        }),
      }),
      expected,
    );
  }
});

test("Fase 26 exige identidade exata de artefato, release, origem e ciclo", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da validação/],
    ["sourceFingerprint", "outro", /Fingerprint da validação/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da validação/],
    ["cycleIdentifier", "outro-ciclo", /Identificador do ciclo/],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleValidationEvidence: validationEvidence(executionEvidence(), {
          [field]: value,
        }),
      }),
      expected,
    );
  }
});

test("Fase 26 vincula a validação ao hash canônico da execução", () => {
  const original = executionEvidence();
  assert.throws(
    () => evaluate({
      nextCycleExecutionEvidence: executionEvidence({
        sanitizedExecutionReference: "execucao-alterada",
      }),
      nextCycleValidationEvidence: validationEvidence(original),
    }),
    /Hash canônico da evidência da Fase 25/,
  );
});

test("Fase 26 exige todas as confirmações factuais", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({
        nextCycleValidationEvidence: validationEvidence(executionEvidence(), {
          [field]: false,
        }),
      }),
      new RegExp(field),
    );
  }
});

test("Fase 26 exige todos os identificadores de auditoria", () => {
  for (const field of contract.requiredStringFields) {
    assert.throws(() => evaluate({
      nextCycleValidationEvidence: validationEvidence(executionEvidence(), { [field]: "" }),
    }));
  }
});

test("Fase 26 valida exatamente a mesma coorte executada", () => {
  for (const value of [0, 6, 2.5]) {
    assert.throws(() => evaluate({
      nextCycleValidationEvidence: validationEvidence(executionEvidence(), {
        validatedUserCount: value,
      }),
    }), /usuários|inteiro/i);
  }
});

test("Fase 26 valida exatamente os mesmos papéis executados", () => {
  for (const rolesValidated of [
    ["DIRETOR", "GERENTE"],
    ["DIRETOR", "GERENTE", "ADMIN"],
    ["DIRETOR", "GERENTE", "GERENTE"],
  ]) {
    assert.throws(() => evaluate({
      nextCycleValidationEvidence: validationEvidence(executionEvidence(), { rolesValidated }),
    }), /papéis|duplicados/i);
  }
});

test("Fase 26 exige os mesmos resultados das jornadas", () => {
  for (const [field, values] of [
    ["validatedSuccessfulRequiredJourneys", [2, 4, -1, 2.5]],
    ["validatedFailedRequiredJourneys", [1, -1, 0.5]],
  ]) {
    for (const value of values) {
      assert.throws(() => evaluate({
        nextCycleValidationEvidence: validationEvidence(executionEvidence(), {
          [field]: value,
        }),
      }));
    }
  }
});

test("Fase 26 exige métricas idênticas às observadas na execução", () => {
  for (const [field, values] of [
    ["validatedAvailabilityPercent", [99.9, 100, Number.NaN]],
    ["validatedMonitoringCoveragePercent", [99, 101, Number.NaN]],
    ["validatedObservedCostCents", [8499, 8501, -1, 0.5]],
  ]) {
    for (const value of values) {
      assert.throws(() => evaluate({
        nextCycleValidationEvidence: validationEvidence(executionEvidence(), {
          [field]: value,
        }),
      }));
    }
  }
});

test("Fase 26 mantém tolerância zero para incidentes e regressões", () => {
  for (const field of [
    "validatedCriticalIncidents",
    "validatedUnresolvedHighSeverityIncidents",
    "materialRegressions",
  ]) {
    for (const value of [1, -1, 0.5]) {
      assert.throws(() => evaluate({
        nextCycleValidationEvidence: validationEvidence(executionEvidence(), {
          [field]: value,
        }),
      }));
    }
  }
});

test("Fase 26 não admite efeitos colaterais nem dados sensíveis", () => {
  for (const [field, value] of [
    ["databaseMigrationsByGate", 1],
    ["bootstrapExecutionsByGate", 1],
    ["businessDataMutationsByGate", 1],
    ["usersProvisionedByGate", 1],
    ["secretValuesRecorded", true],
    ["containsPersonalData", true],
  ]) {
    assert.throws(() => evaluate({
      nextCycleValidationEvidence: validationEvidence(executionEvidence(), { [field]: value }),
    }));
  }
});

test("Fase 26 exige validação e revisão independentes da execução", () => {
  for (const [field, value] of [
    ["validatedBy", "responsavel-execucao-fase-25"],
    ["validatedBy", "testemunha-independente-fase-25"],
    ["reviewedBy", "responsavel-validacao-fase-26"],
    ["reviewedBy", "responsavel-execucao-fase-25"],
  ]) {
    assert.throws(() => evaluate({
      nextCycleValidationEvidence: validationEvidence(executionEvidence(), { [field]: value }),
    }), /independente/);
  }
});

test("Fase 26 exige cronologia válida após a execução", () => {
  for (const [field, value, expected] of [
    ["validationStartedAt", "2026-08-09T10:59:00-03:00", /não pode começar/],
    ["validationCompletedAt", "2026-08-09T11:30:00-03:00", /posterior/],
    ["validationCompletedAt", "2026-08-09T11:45:00-03:00", /no mínimo/],
    ["recordedAt", "2026-08-09T12:14:00-03:00", /não pode anteceder/],
    ["validationStartedAt", "data-inválida", /inválido/],
  ]) {
    assert.throws(() => evaluate({
      nextCycleValidationEvidence: validationEvidence(executionEvidence(), { [field]: value }),
    }), expected);
  }
});

test("Fase 26 reprova contrato que relaxa tolerâncias ou permite efeitos", () => {
  for (const [field, value] of [
    ["maximumFailedRequiredJourneys", 1],
    ["maximumCriticalIncidents", 1],
    ["maximumUnresolvedHighSeverityIncidents", 1],
    ["maximumMaterialRegressions", 1],
    ["requiredDatabaseMigrationsByGate", 1],
    ["requiredBootstrapExecutionsByGate", 1],
    ["requiredBusinessDataMutationsByGate", 1],
    ["requiredUsersProvisionedByGate", 1],
    ["requiredSecretValuesRecorded", true],
    ["requiredPersonalDataInEvidence", true],
    ["deploymentPerformedByGate", true],
    ["databaseMutationAllowedByGate", true],
    ["automaticUserProvisioningAllowed", true],
    ["automaticNextCycleValidationAllowed", true],
    ["automaticExpansionAllowed", true],
    ["automaticRollbackAllowed", true],
  ]) {
    assert.throws(() => evaluate({ contract: { ...contract, [field]: value } }));
  }
});

test("Fase 26 rejeita artefato diferente do contrato canônico", () => {
  assert.throws(
    () => evaluate({ executionResult: executionResult({ sha256: "outro" }) }),
    /SHA-256 da release/,
  );
  assert.throws(
    () => evaluate({ executionResult: executionResult({ sourceFingerprint: "outro" }) }),
    /Fingerprint da release/,
  );
});

test("Fase 26 interpreta argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
