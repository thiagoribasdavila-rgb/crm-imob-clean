import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateNextCycleClosure,
} from "../../scripts/check-v3000-phase-27-next-cycle-closure.mjs";

const sha256 = "sha256-encerramento-proximo-ciclo";
const sourceFingerprint = "sha256:fingerprint-encerramento-proximo-ciclo";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-27-next-cycle-closure.json", import.meta.url),
    "utf8",
  ),
);

function validationResult(overrides = {}) {
  return {
    phase: 26,
    ok: true,
    nextCycleValidationStatus: "next-cycle-validated",
    nextCycleValidationEvidenceVerified: true,
    nextCycleExecutionValidated: true,
    nextCycleClosureReviewRequired: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    validatedUserCount: 5,
    rolesValidated: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    validatedAvailabilityPercent: 99.95,
    validatedMonitoringCoveragePercent: 100,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    materialRegressions: 0,
    observedCostCents: 8500,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    validatedBy: "responsavel-validacao-fase-26",
    reviewedBy: "revisor-independente-fase-26",
    validationCompletedAt: "2026-08-09T12:15:00-03:00",
    ...overrides,
  };
}

function validationEvidence(overrides = {}) {
  return {
    phase: 26,
    status: "completed",
    decision: "validate-next-cycle-execution",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    sanitizedValidationReference: "validacao-sanitizada-fase-26",
    validationCompletedAt: "2026-08-09T12:15:00-03:00",
    ...overrides,
  };
}

function closureEvidence(previousEvidence = validationEvidence(), overrides = {}) {
  return {
    phase: 27,
    status: "approved",
    decision: "close-validated-next-cycle",
    closureDecisionRole: "DIRETOR",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    nextCycleValidationEvidenceSha256: canonicalEvidenceSha256(previousEvidence),
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    manualClosureReviewConfirmed: true,
    nextCycleValidationEvidenceReviewed: true,
    evidenceChainReviewed: true,
    sameReleaseReferenceConfirmed: true,
    sameCycleReferenceConfirmed: true,
    validatedOutcomeAccepted: true,
    authorizedCohortClosureConfirmed: true,
    authorizedRoleScopeClosureConfirmed: true,
    requiredJourneyOutcomeAccepted: true,
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
    noAutomaticCycleClosurePerformed: true,
    closedUserCount: 5,
    rolesClosed: ["DIRETOR", "GERENTE", "CORRETOR"],
    acceptedSuccessfulRequiredJourneys: 3,
    acceptedFailedRequiredJourneys: 0,
    acceptedAvailabilityPercent: 99.95,
    acceptedMonitoringCoveragePercent: 100,
    acceptedCriticalIncidents: 0,
    acceptedUnresolvedHighSeverityIncidents: 0,
    acceptedMaterialRegressions: 0,
    acceptedObservedCostCents: 8500,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    closureDecidedBy: "responsavel-encerramento-fase-27",
    witnessedBy: "testemunha-independente-fase-27",
    sanitizedClosureReference: "encerramento-sanitizado-fase-27",
    closureReviewStartedAt: "2026-08-09T12:30:00-03:00",
    closureReviewCompletedAt: "2026-08-09T12:50:00-03:00",
    recordedAt: "2026-08-09T12:55:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previousEvidence = Object.prototype.hasOwnProperty.call(
    input,
    "nextCycleValidationEvidence",
  )
    ? input.nextCycleValidationEvidence
    : validationEvidence();
  const defaultClosureEvidence = previousEvidence
    ? closureEvidence(previousEvidence)
    : closureEvidence(validationEvidence());
  return evaluateNextCycleClosure({
    validationResult: validationResult(),
    nextCycleValidationEvidence: previousEvidence,
    nextCycleClosureEvidence: defaultClosureEvidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 27 preserva estados pendentes das fases anteriores", () => {
  for (const status of [
    "awaiting-next-cycle-plan",
    "awaiting-next-cycle-execution-review",
    "awaiting-next-cycle-execution-evidence",
    "awaiting-next-cycle-validation",
  ]) {
    const result = evaluate({
      validationResult: validationResult({ nextCycleValidationStatus: status }),
      nextCycleValidationEvidence: null,
      nextCycleClosureEvidence: null,
    });
    assert.equal(result.nextCycleClosureStatus, status);
    assert.equal(result.nextCycleFormallyClosed, false);
    assert.equal(result.nextCycleClosureReviewRequired, false);
  }
});

test("Fase 27 aguarda revisão humana do encerramento", () => {
  const result = evaluate({ nextCycleClosureEvidence: null });
  assert.equal(result.nextCycleClosureStatus, "awaiting-next-cycle-closure-review");
  assert.equal(result.nextCycleClosureEvidenceVerified, false);
  assert.equal(result.nextCycleClosureReviewRequired, true);
  assert.equal(result.lessonsLearnedReviewRequired, false);
});

test("Fase 27 encerra formalmente sem executar ações externas", () => {
  const result = evaluate();
  assert.equal(result.nextCycleClosureStatus, "next-cycle-formally-closed");
  assert.equal(result.nextCycleClosureEvidenceVerified, true);
  assert.equal(result.manualNextCycleClosureVerified, true);
  assert.equal(result.nextCycleFormallyClosed, true);
  assert.equal(result.nextCycleClosureReviewRequired, false);
  assert.equal(result.lessonsLearnedReviewRequired, true);
  assert.equal(result.nextCyclePlanningAuthorized, false);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticCycleClosureAllowed, false);
  assert.equal(result.automaticNextCyclePlanningAllowed, false);
  assert.equal(result.automaticExpansionAllowed, false);
  assert.equal(result.automaticRollbackAllowed, false);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
  assert.equal(result.secretValuesRecordedByGate, false);
});

test("Fase 27 exige que a Fase 26 tenha solicitado revisão de encerramento", () => {
  assert.throws(
    () => evaluate({
      validationResult: validationResult({ nextCycleClosureReviewRequired: false }),
    }),
    /Revisão de encerramento exigida pela Fase 26/,
  );
});

test("Fase 27 exige a evidência factual da Fase 26", () => {
  assert.throws(
    () => evaluate({ nextCycleValidationEvidence: null }),
    /evidência da Fase 26 é obrigatória/,
  );
});

test("Fase 27 exige fase, status, decisão e papel exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 26, /Fase da evidência/],
    ["status", "completed", /Status do encerramento/],
    ["decision", "close", /Decisão do encerramento/],
    ["closureDecisionRole", "ADMIN", /Papel da decisão/],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
          [field]: value,
        }),
      }),
      expected,
    );
  }
});

test("Fase 27 exige identidade exata de artefato, release, origem e ciclo", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 do encerramento/],
    ["sourceFingerprint", "outro", /Fingerprint do encerramento/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem do encerramento/],
    ["cycleIdentifier", "outro-ciclo", /Identificador do ciclo/],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
          [field]: value,
        }),
      }),
      expected,
    );
  }
});

test("Fase 27 vincula o encerramento ao hash canônico da validação", () => {
  const original = validationEvidence();
  assert.throws(
    () => evaluate({
      nextCycleValidationEvidence: validationEvidence({
        sanitizedValidationReference: "validacao-alterada",
      }),
      nextCycleClosureEvidence: closureEvidence(original),
    }),
    /Hash canônico da evidência da Fase 26/,
  );
});

test("Fase 27 exige todas as confirmações factuais", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({
        nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
          [field]: false,
        }),
      }),
      new RegExp(field),
    );
  }
});

test("Fase 27 exige todos os identificadores de auditoria", () => {
  for (const field of contract.requiredStringFields) {
    assert.throws(() => evaluate({
      nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
        [field]: "",
      }),
    }));
  }
});

test("Fase 27 encerra exatamente a mesma coorte validada", () => {
  for (const value of [0, 6, 2.5]) {
    assert.throws(() => evaluate({
      nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
        closedUserCount: value,
      }),
    }), /usuários|inteiro/i);
  }
});

test("Fase 27 encerra exatamente os mesmos papéis validados", () => {
  for (const rolesClosed of [
    ["DIRETOR", "GERENTE"],
    ["DIRETOR", "GERENTE", "ADMIN"],
    ["DIRETOR", "GERENTE", "GERENTE"],
  ]) {
    assert.throws(() => evaluate({
      nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
        rolesClosed,
      }),
    }), /papéis|duplicados/i);
  }
});

test("Fase 27 exige os mesmos resultados das jornadas validadas", () => {
  for (const [field, values] of [
    ["acceptedSuccessfulRequiredJourneys", [2, 4, -1, 2.5]],
    ["acceptedFailedRequiredJourneys", [1, -1, 0.5]],
  ]) {
    for (const value of values) {
      assert.throws(() => evaluate({
        nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
          [field]: value,
        }),
      }));
    }
  }
});

test("Fase 27 exige métricas e custo idênticos à validação", () => {
  for (const [field, values] of [
    ["acceptedAvailabilityPercent", [99.9, 100, Number.NaN]],
    ["acceptedMonitoringCoveragePercent", [99, 101, Number.NaN]],
    ["acceptedObservedCostCents", [8499, 8501, -1, 0.5]],
  ]) {
    for (const value of values) {
      assert.throws(() => evaluate({
        nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
          [field]: value,
        }),
      }));
    }
  }
});

test("Fase 27 mantém tolerância zero para incidentes e regressões", () => {
  for (const field of [
    "acceptedCriticalIncidents",
    "acceptedUnresolvedHighSeverityIncidents",
    "acceptedMaterialRegressions",
  ]) {
    for (const value of [1, -1, 0.5]) {
      assert.throws(() => evaluate({
        nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
          [field]: value,
        }),
      }));
    }
  }
});

test("Fase 27 não admite efeitos colaterais nem dados sensíveis", () => {
  for (const [field, value] of [
    ["databaseMigrationsByGate", 1],
    ["bootstrapExecutionsByGate", 1],
    ["businessDataMutationsByGate", 1],
    ["usersProvisionedByGate", 1],
    ["secretValuesRecorded", true],
    ["containsPersonalData", true],
  ]) {
    assert.throws(() => evaluate({
      nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
        [field]: value,
      }),
    }));
  }
});

test("Fase 27 exige decisão e testemunho independentes da Fase 26", () => {
  for (const [field, value] of [
    ["closureDecidedBy", "responsavel-validacao-fase-26"],
    ["closureDecidedBy", "revisor-independente-fase-26"],
    ["witnessedBy", "responsavel-encerramento-fase-27"],
    ["witnessedBy", "responsavel-validacao-fase-26"],
    ["witnessedBy", "revisor-independente-fase-26"],
  ]) {
    assert.throws(() => evaluate({
      nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
        [field]: value,
      }),
    }), /independente/);
  }
});

test("Fase 27 exige cronologia válida após a validação", () => {
  for (const [field, value, expected] of [
    ["closureReviewStartedAt", "2026-08-09T12:14:00-03:00", /não pode começar/],
    ["closureReviewCompletedAt", "2026-08-09T12:30:00-03:00", /posterior/],
    ["closureReviewCompletedAt", "2026-08-09T12:40:00-03:00", /no mínimo/],
    ["recordedAt", "2026-08-09T12:49:00-03:00", /não pode anteceder/],
    ["closureReviewStartedAt", "data-inválida", /inválido/],
  ]) {
    assert.throws(() => evaluate({
      nextCycleClosureEvidence: closureEvidence(validationEvidence(), {
        [field]: value,
      }),
    }), expected);
  }
});

test("Fase 27 reprova contrato que relaxa tolerâncias ou permite efeitos", () => {
  for (const [field, value] of [
    ["requiredDecisionRole", "ADMIN"],
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
    ["automaticCycleClosureAllowed", true],
    ["automaticNextCyclePlanningAllowed", true],
    ["automaticExpansionAllowed", true],
    ["automaticRollbackAllowed", true],
  ]) {
    assert.throws(() => evaluate({ contract: { ...contract, [field]: value } }));
  }
});

test("Fase 27 rejeita artefato diferente do contrato canônico", () => {
  assert.throws(
    () => evaluate({ validationResult: validationResult({ sha256: "outro" }) }),
    /SHA-256 da release/,
  );
  assert.throws(
    () => evaluate({
      validationResult: validationResult({ sourceFingerprint: "outro" }),
    }),
    /Fingerprint da release/,
  );
});

test("Fase 27 interpreta argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
