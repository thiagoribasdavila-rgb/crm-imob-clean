import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateIndependentBaselineBackedExecutionValidation,
} from "../../scripts/check-v3000-phase-33-independent-baseline-backed-execution-validation.mjs";

const sha256 = "sha256-execucao-validada";
const sourceFingerprint = "sha256:fingerprint-execucao-validada";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL(
      "../../config/v3000-phase-33-independent-baseline-backed-execution-validation.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function phase32Evidence(overrides = {}) {
  return {
    phase: 32,
    status: "completed",
    decision: "confirm-baseline-backed-next-cycle-execution",
    candidateSha256: sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    recordedAt: "2026-08-10T10:20:00-03:00",
    ...overrides,
  };
}

function executionResult(overrides = {}) {
  return {
    phase: 32,
    ok: true,
    baselineBackedExecutionStatus: "baseline-backed-next-cycle-manual-execution-proven",
    executionEvidenceVerified: true,
    manualNextCycleExecutionVerified: true,
    nextCycleExecutionPerformed: true,
    independentValidationRequired: true,
    independentValidationStarted: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    deploymentPerformedByGate: false,
    databaseMutationsByGate: 0,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    executedUserCount: 5,
    rolesExecuted: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    requiredJourneyFailures: 0,
    observedAvailabilityPercent: 99.99,
    monitoringCoveragePercent: 100,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    materialRegressions: 0,
    observedCostCents: 8000,
    executionOwner: "responsavel-execucao-fase-32",
    witnessedBy: "testemunha-execucao-fase-32",
    recordedAt: "2026-08-10T10:20:00-03:00",
    ...overrides,
  };
}

function validationEvidence(previous = phase32Evidence(), overrides = {}) {
  const checks = Object.fromEntries(contract.requiredChecks.map((field) => [field, true]));
  return {
    phase: 33,
    status: "completed",
    decision: "independently-validate-baseline-backed-next-cycle-execution",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    baselineBackedExecutionEvidenceSha256: canonicalEvidenceSha256(previous),
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    ...checks,
    validatedUserCount: 5,
    rolesValidated: ["DIRETOR", "GERENTE", "CORRETOR"],
    validatedSuccessfulRequiredJourneys: 3,
    validatedFailedRequiredJourneys: 0,
    validatedAvailabilityPercent: 99.99,
    validatedMonitoringCoveragePercent: 100,
    validatedCriticalIncidents: 0,
    validatedUnresolvedHighSeverityIncidents: 0,
    validatedMaterialRegressions: 0,
    validatedObservedCostCents: 8000,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    sanitizedValidationReference: "validacao-sanitizada-ciclo-2026-08-16",
    independentValidator: "validador-independente-fase-33",
    reviewedBy: "revisor-independente-fase-33",
    validationStartedAt: "2026-08-10T11:00:00-03:00",
    validationCompletedAt: "2026-08-10T11:45:00-03:00",
    recordedAt: "2026-08-10T11:50:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previous = Object.hasOwn(input, "baselineBackedExecutionEvidence")
    ? input.baselineBackedExecutionEvidence
    : phase32Evidence();
  const evidence = Object.hasOwn(input, "validationEvidence")
    ? input.validationEvidence
    : validationEvidence(previous ?? phase32Evidence());
  return evaluateIndependentBaselineBackedExecutionValidation({
    executionResult: executionResult(),
    baselineBackedExecutionEvidence: previous,
    validationEvidence: evidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 33 preserva estados pendentes da cadeia", () => {
  const result = evaluate({
    executionResult: executionResult({
      baselineBackedExecutionStatus: "awaiting-baseline-backed-next-cycle-execution-evidence",
    }),
    baselineBackedExecutionEvidence: null,
    validationEvidence: null,
  });
  assert.equal(result.independentValidationStatus, "awaiting-baseline-backed-next-cycle-execution-evidence");
  assert.equal(result.independentValidationCompleted, false);
});

test("Fase 33 aguarda evidência independente sem executar ação", () => {
  const result = evaluate({ validationEvidence: null });
  assert.equal(
    result.independentValidationStatus,
    "awaiting-independent-baseline-backed-execution-validation-evidence",
  );
  assert.equal(result.automaticExecutionAllowed, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 33 valida a execução e abre apenas revisão de encerramento", () => {
  const result = evaluate();
  assert.equal(
    result.independentValidationStatus,
    "baseline-backed-next-cycle-execution-independently-validated",
  );
  assert.equal(result.executionEvidenceVerified, true);
  assert.equal(result.independentValidationEvidenceVerified, true);
  assert.equal(result.independentValidationCompleted, true);
  assert.equal(result.closureReviewRequired, true);
  assert.equal(result.closureReviewStarted, false);
  assert.equal(result.durationMinutes, 45);
  assert.equal(result.automaticProductionActionAllowed, false);
});

test("Fase 33 exige o resultado seguro da Fase 32", () => {
  for (const [field, value, expected] of [
    ["executionEvidenceVerified", false, /Evidência da execução/],
    ["manualNextCycleExecutionVerified", false, /Execução manual/],
    ["nextCycleExecutionPerformed", false, /Ciclo executado/],
    ["independentValidationRequired", false, /Validação independente exigida/],
    ["independentValidationStarted", true, /Validação iniciada/],
    ["automaticExecutionAllowed", true, /Execução automática/],
    ["automaticExpansionAllowed", true, /Expansão automática/],
    ["automaticRollbackAllowed", true, /Rollback automático/],
    ["deploymentPerformedByGate", true, /Deploy pela Fase 32/],
    ["databaseMutationsByGate", 1, /Mutações de banco pela Fase 32/],
  ]) {
    assert.throws(() => evaluate({ executionResult: executionResult({ [field]: value }) }), expected);
  }
});

test("Fase 33 exige a evidência factual da Fase 32", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: null }),
    /evidência da Fase 32 é obrigatória/,
  );
});

test("Fase 33 exige fase, status e decisão exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 32, /Fase da evidência/],
    ["status", "draft", /Status da validação/],
    ["decision", "validate", /Decisão da validação/],
  ]) {
    assert.throws(
      () => evaluate({ validationEvidence: validationEvidence(phase32Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 33 preserva artefato, release e origem", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da validação/],
    ["sourceFingerprint", "outro", /Fingerprint da validação/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da validação/],
  ]) {
    assert.throws(
      () => evaluate({ validationEvidence: validationEvidence(phase32Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 33 encadeia o hash canônico da Fase 32", () => {
  assert.throws(
    () => evaluate({
      validationEvidence: validationEvidence(phase32Evidence(), {
        baselineBackedExecutionEvidenceSha256: "hash-adulterado",
      }),
    }),
    /Hash canônico/,
  );
});

test("Fase 33 preserva ciclos e baseline verificada", () => {
  for (const [field, value, expected] of [
    ["sourceCycleIdentifier", "outro", /Ciclo de origem/],
    ["cycleIdentifier", "outro", /Ciclo validado/],
    ["verifiedBaselineIdentifier", "outra", /Baseline verificada/],
  ]) {
    assert.throws(
      () => evaluate({ validationEvidence: validationEvidence(phase32Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 33 exige confirmações e campos textuais", () => {
  assert.throws(
    () => evaluate({
      validationEvidence: validationEvidence(phase32Evidence(), { monitoringOutcomeAccepted: false }),
    }),
    /monitoringOutcomeAccepted/,
  );
  assert.throws(
    () => evaluate({
      validationEvidence: validationEvidence(phase32Evidence(), { sanitizedValidationReference: "" }),
    }),
    /sanitizedValidationReference/,
  );
});

test("Fase 33 exige exatamente a mesma coorte e papéis", () => {
  assert.throws(
    () => evaluate({ validationEvidence: validationEvidence(phase32Evidence(), { validatedUserCount: 6 }) }),
    /Usuários validados/,
  );
  assert.throws(
    () => evaluate({
      validationEvidence: validationEvidence(phase32Evidence(), {
        rolesValidated: ["DIRETOR", "GERENTE"],
      }),
    }),
    /papéis validados/,
  );
});

test("Fase 33 exige resultados idênticos de jornadas e segurança", () => {
  for (const [field, value, expected] of [
    ["validatedSuccessfulRequiredJourneys", 2, /Jornadas concluídas/],
    ["validatedFailedRequiredJourneys", 1, /Falhas de jornadas/],
    ["validatedCriticalIncidents", 1, /Incidentes críticos/],
    ["validatedUnresolvedHighSeverityIncidents", 1, /Incidentes graves/],
    ["validatedMaterialRegressions", 1, /Regressões materiais/],
    ["validatedObservedCostCents", 8001, /Custo observado/],
  ]) {
    assert.throws(
      () => evaluate({ validationEvidence: validationEvidence(phase32Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 33 exige disponibilidade e monitoramento idênticos", () => {
  assert.throws(
    () => evaluate({
      validationEvidence: validationEvidence(phase32Evidence(), {
        validatedAvailabilityPercent: 99.98,
      }),
    }),
    /Disponibilidade validada/,
  );
  assert.throws(
    () => evaluate({
      validationEvidence: validationEvidence(phase32Evidence(), {
        validatedMonitoringCoveragePercent: 99,
      }),
    }),
    /Monitoramento validado/,
  );
});

test("Fase 33 rejeita efeitos colaterais, dados pessoais e segredos", () => {
  for (const [field, value, expected] of [
    ["databaseMigrationsByGate", 1, /Migrations pelo gate/],
    ["bootstrapExecutionsByGate", 1, /Bootstraps pelo gate/],
    ["businessDataMutationsByGate", 1, /Mutações comerciais pelo gate/],
    ["usersProvisionedByGate", 1, /Usuários pelo gate/],
    ["secretValuesRecorded", true, /Registro de segredos/],
    ["containsPersonalData", true, /Dados pessoais na evidência/],
  ]) {
    assert.throws(
      () => evaluate({ validationEvidence: validationEvidence(phase32Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 33 exige responsáveis independentes", () => {
  for (const [field, value, expected] of [
    ["independentValidator", "responsavel-execucao-fase-32", /validador deve ser independente/],
    ["reviewedBy", "testemunha-execucao-fase-32", /revisão deve ser independente/],
    ["reviewedBy", "validador-independente-fase-33", /revisão deve ser independente/],
  ]) {
    assert.throws(
      () => evaluate({ validationEvidence: validationEvidence(phase32Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 33 respeita cronologia e duração mínima", () => {
  for (const [field, value, expected] of [
    ["validationStartedAt", "2026-08-10T10:19:00-03:00", /não pode começar antes/],
    ["validationCompletedAt", "2026-08-10T10:59:00-03:00", /posterior ao início/],
    ["validationCompletedAt", "2026-08-10T11:20:00-03:00", /no mínimo 30 minutos/],
    ["recordedAt", "2026-08-10T11:44:00-03:00", /não pode anteceder/],
  ]) {
    assert.throws(
      () => evaluate({ validationEvidence: validationEvidence(phase32Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 33 rejeita contrato que enfraqueça segurança", () => {
  assert.throws(
    () => evaluate({ contract: { ...contract, automaticIndependentValidationAllowed: true } }),
    /Validação automática/,
  );
  assert.throws(
    () => evaluate({ contract: { ...contract, minimumValidationDurationMinutes: 5 } }),
    /não pode ser inferior a 30 minutos/,
  );
});

test("Fase 33 interpreta argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
