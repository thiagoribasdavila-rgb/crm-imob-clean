import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateBaselineBackedCycleClosure,
} from "../../scripts/check-v3000-phase-34-baseline-backed-cycle-closure.mjs";

const sha256 = "sha256-encerramento-validado";
const sourceFingerprint = "sha256:fingerprint-encerramento-validado";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL(
      "../../config/v3000-phase-34-baseline-backed-cycle-closure.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function phase33Evidence(overrides = {}) {
  return {
    phase: 33,
    status: "completed",
    decision: "independently-validate-baseline-backed-next-cycle-execution",
    candidateSha256: sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    recordedAt: "2026-08-10T11:50:00-03:00",
    ...overrides,
  };
}

function validationResult(overrides = {}) {
  return {
    phase: 33,
    ok: true,
    independentValidationStatus:
      "baseline-backed-next-cycle-execution-independently-validated",
    executionEvidenceVerified: true,
    independentValidationEvidenceVerified: true,
    manualNextCycleExecutionVerified: true,
    independentValidationCompleted: true,
    closureReviewRequired: true,
    closureReviewStarted: false,
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
    validatedUserCount: 5,
    rolesValidated: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    validatedAvailabilityPercent: 99.99,
    validatedMonitoringCoveragePercent: 100,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    materialRegressions: 0,
    observedCostCents: 8000,
    independentValidator: "validador-independente-fase-33",
    reviewedBy: "revisor-independente-fase-33",
    recordedAt: "2026-08-10T11:50:00-03:00",
    ...overrides,
  };
}

function closureEvidence(previous = phase33Evidence(), overrides = {}) {
  const checks = Object.fromEntries(contract.requiredChecks.map((field) => [field, true]));
  return {
    phase: 34,
    status: "approved",
    decision: "formally-close-independently-validated-baseline-backed-cycle",
    closureDecisionRole: "DIRETOR",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    independentValidationEvidenceSha256: canonicalEvidenceSha256(previous),
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    ...checks,
    closedUserCount: 5,
    rolesClosed: ["DIRETOR", "GERENTE", "CORRETOR"],
    acceptedSuccessfulRequiredJourneys: 3,
    acceptedFailedRequiredJourneys: 0,
    acceptedAvailabilityPercent: 99.99,
    acceptedMonitoringCoveragePercent: 100,
    acceptedCriticalIncidents: 0,
    acceptedUnresolvedHighSeverityIncidents: 0,
    acceptedMaterialRegressions: 0,
    acceptedObservedCostCents: 8000,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    closureDecidedBy: "diretor-encerramento-fase-34",
    witnessedBy: "testemunha-encerramento-fase-34",
    sanitizedClosureReference: "encerramento-sanitizado-ciclo-2026-08-16",
    closureReviewStartedAt: "2026-08-10T12:00:00-03:00",
    closureReviewCompletedAt: "2026-08-10T12:25:00-03:00",
    recordedAt: "2026-08-10T12:30:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previous = Object.hasOwn(input, "independentValidationEvidence")
    ? input.independentValidationEvidence
    : phase33Evidence();
  const evidence = Object.hasOwn(input, "closureEvidence")
    ? input.closureEvidence
    : closureEvidence(previous ?? phase33Evidence());
  return evaluateBaselineBackedCycleClosure({
    independentValidationResult: validationResult(),
    independentValidationEvidence: previous,
    closureEvidence: evidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 34 preserva estados pendentes da cadeia", () => {
  const result = evaluate({
    independentValidationResult: validationResult({
      independentValidationStatus: "awaiting-independent-validation-evidence",
    }),
    independentValidationEvidence: null,
    closureEvidence: null,
  });
  assert.equal(result.cycleClosureStatus, "awaiting-independent-validation-evidence");
  assert.equal(result.cycleFormallyClosed, false);
});

test("Fase 34 aguarda revisão formal sem executar ação", () => {
  const result = evaluate({ closureEvidence: null });
  assert.equal(result.cycleClosureStatus, "awaiting-baseline-backed-cycle-closure-review-evidence");
  assert.equal(result.automaticCycleClosureAllowed, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 34 encerra formalmente e abre somente lições aprendidas", () => {
  const result = evaluate();
  assert.equal(result.cycleClosureStatus, "baseline-backed-next-cycle-formally-closed");
  assert.equal(result.independentValidationEvidenceVerified, true);
  assert.equal(result.closureEvidenceVerified, true);
  assert.equal(result.manualCycleClosureVerified, true);
  assert.equal(result.cycleFormallyClosed, true);
  assert.equal(result.lessonsLearnedReviewRequired, true);
  assert.equal(result.lessonsLearnedReviewStarted, false);
  assert.equal(result.nextCyclePlanningAuthorized, false);
  assert.equal(result.durationMinutes, 25);
  assert.equal(result.automaticProductionActionAllowed, false);
});

test("Fase 34 exige o resultado seguro da Fase 33", () => {
  for (const [field, value, expected] of [
    ["executionEvidenceVerified", false, /Evidência da execução/],
    ["independentValidationEvidenceVerified", false, /Evidência da validação/],
    ["manualNextCycleExecutionVerified", false, /Execução manual/],
    ["independentValidationCompleted", false, /Validação independente concluída/],
    ["closureReviewRequired", false, /Revisão de encerramento exigida/],
    ["closureReviewStarted", true, /Revisão iniciada/],
    ["automaticProductionActionAllowed", true, /Ação automática/],
    ["automaticBaselineMutationAllowed", true, /Mutação automática/],
    ["automaticExecutionAllowed", true, /Execução automática/],
    ["automaticExpansionAllowed", true, /Expansão automática/],
    ["automaticRollbackAllowed", true, /Rollback automático/],
    ["deploymentPerformedByGate", true, /Deploy pela Fase 33/],
    ["databaseMutationsByGate", 1, /Mutações de banco pela Fase 33/],
  ]) {
    assert.throws(
      () => evaluate({ independentValidationResult: validationResult({ [field]: value }) }),
      expected,
    );
  }
});

test("Fase 34 exige a evidência factual da Fase 33", () => {
  assert.throws(
    () => evaluate({ independentValidationEvidence: null }),
    /evidência da Fase 33 é obrigatória/,
  );
});

test("Fase 34 exige fase, status, decisão e papel exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 33, /Fase da evidência/],
    ["status", "draft", /Status do encerramento/],
    ["decision", "close", /Decisão do encerramento/],
    ["closureDecisionRole", "GERENTE", /Papel decisor/],
  ]) {
    assert.throws(
      () => evaluate({ closureEvidence: closureEvidence(phase33Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 34 preserva artefato, release e origem", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 do encerramento/],
    ["sourceFingerprint", "outro", /Fingerprint do encerramento/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem do encerramento/],
  ]) {
    assert.throws(
      () => evaluate({ closureEvidence: closureEvidence(phase33Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 34 encadeia o hash canônico da Fase 33", () => {
  assert.throws(
    () => evaluate({
      closureEvidence: closureEvidence(phase33Evidence(), {
        independentValidationEvidenceSha256: "hash-adulterado",
      }),
    }),
    /Hash canônico/,
  );
});

test("Fase 34 preserva ciclos e baseline verificada", () => {
  for (const [field, value, expected] of [
    ["sourceCycleIdentifier", "outro", /Ciclo de origem/],
    ["cycleIdentifier", "outro", /Ciclo encerrado/],
    ["verifiedBaselineIdentifier", "outra", /Baseline verificada/],
  ]) {
    assert.throws(
      () => evaluate({ closureEvidence: closureEvidence(phase33Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 34 exige confirmações e campos textuais", () => {
  assert.throws(
    () => evaluate({
      closureEvidence: closureEvidence(phase33Evidence(), { privacyOutcomeAccepted: false }),
    }),
    /privacyOutcomeAccepted/,
  );
  assert.throws(
    () => evaluate({
      closureEvidence: closureEvidence(phase33Evidence(), { sanitizedClosureReference: "" }),
    }),
    /sanitizedClosureReference/,
  );
});

test("Fase 34 exige exatamente a mesma coorte e papéis", () => {
  assert.throws(
    () => evaluate({ closureEvidence: closureEvidence(phase33Evidence(), { closedUserCount: 6 }) }),
    /Usuários encerrados/,
  );
  assert.throws(
    () => evaluate({
      closureEvidence: closureEvidence(phase33Evidence(), {
        rolesClosed: ["DIRETOR", "GERENTE"],
      }),
    }),
    /papéis encerrados/,
  );
});

test("Fase 34 exige resultados idênticos de jornadas, segurança e custo", () => {
  for (const [field, value, expected] of [
    ["acceptedSuccessfulRequiredJourneys", 2, /Jornadas aceitas/],
    ["acceptedFailedRequiredJourneys", 1, /Falhas aceitas/],
    ["acceptedCriticalIncidents", 1, /Incidentes críticos aceitos/],
    ["acceptedUnresolvedHighSeverityIncidents", 1, /Incidentes graves aceitos/],
    ["acceptedMaterialRegressions", 1, /Regressões aceitas/],
    ["acceptedObservedCostCents", 8001, /Custo aceito/],
  ]) {
    assert.throws(
      () => evaluate({ closureEvidence: closureEvidence(phase33Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 34 exige disponibilidade e monitoramento idênticos", () => {
  assert.throws(
    () => evaluate({
      closureEvidence: closureEvidence(phase33Evidence(), {
        acceptedAvailabilityPercent: 99.98,
      }),
    }),
    /Disponibilidade aceita/,
  );
  assert.throws(
    () => evaluate({
      closureEvidence: closureEvidence(phase33Evidence(), {
        acceptedMonitoringCoveragePercent: 99,
      }),
    }),
    /Monitoramento aceito/,
  );
});

test("Fase 34 mantém tolerância zero a falhas e regressões", () => {
  for (const [field, resultField, expected] of [
    ["acceptedFailedRequiredJourneys", "failedRequiredJourneys", /tolerância de falhas/],
    ["acceptedCriticalIncidents", "criticalIncidents", /incidentes críticos/],
    [
      "acceptedUnresolvedHighSeverityIncidents",
      "unresolvedHighSeverityIncidents",
      /incidentes graves/,
    ],
    ["acceptedMaterialRegressions", "materialRegressions", /regressão material/],
  ]) {
    assert.throws(
      () => evaluate({
        independentValidationResult: validationResult({ [resultField]: 1 }),
        closureEvidence: closureEvidence(phase33Evidence(), { [field]: 1 }),
      }),
      expected,
    );
  }
});

test("Fase 34 rejeita efeitos colaterais, dados pessoais e segredos", () => {
  for (const [field, value, expected] of [
    ["databaseMigrationsByGate", 1, /Migrations pelo gate/],
    ["bootstrapExecutionsByGate", 1, /Bootstraps pelo gate/],
    ["businessDataMutationsByGate", 1, /Mutações comerciais pelo gate/],
    ["usersProvisionedByGate", 1, /Usuários pelo gate/],
    ["secretValuesRecorded", true, /Registro de segredos/],
    ["containsPersonalData", true, /Dados pessoais na evidência/],
  ]) {
    assert.throws(
      () => evaluate({ closureEvidence: closureEvidence(phase33Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 34 exige decisão e testemunho independentes", () => {
  for (const [field, value, expected] of [
    ["closureDecidedBy", "validador-independente-fase-33", /decisão.*independente/],
    ["witnessedBy", "revisor-independente-fase-33", /testemunho.*independente/],
    ["witnessedBy", "diretor-encerramento-fase-34", /testemunho.*independente/],
  ]) {
    assert.throws(
      () => evaluate({ closureEvidence: closureEvidence(phase33Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 34 respeita cronologia e duração mínima", () => {
  for (const [field, value, expected] of [
    ["closureReviewStartedAt", "2026-08-10T11:49:00-03:00", /não pode começar antes/],
    ["closureReviewCompletedAt", "2026-08-10T11:59:00-03:00", /posterior ao início/],
    ["closureReviewCompletedAt", "2026-08-10T12:10:00-03:00", /no mínimo 20 minutos/],
    ["recordedAt", "2026-08-10T12:24:00-03:00", /não pode anteceder/],
  ]) {
    assert.throws(
      () => evaluate({ closureEvidence: closureEvidence(phase33Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 34 rejeita contrato que enfraqueça segurança", () => {
  assert.throws(
    () => evaluate({ contract: { ...contract, automaticCycleClosureAllowed: true } }),
    /Encerramento automático/,
  );
  assert.throws(
    () => evaluate({ contract: { ...contract, minimumClosureReviewDurationMinutes: 5 } }),
    /não pode ser inferior a 20 minutos/,
  );
});

test("Fase 34 interpreta argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
