import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateBaselineBackedExecution,
} from "../../scripts/check-v3000-phase-32-baseline-backed-execution.mjs";

const sha256 = "sha256-execucao-baseline";
const sourceFingerprint = "sha256:fingerprint-execucao-baseline";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-32-baseline-backed-execution.json", import.meta.url),
    "utf8",
  ),
);

function readinessResult(overrides = {}) {
  return {
    phase: 31,
    ok: true,
    baselineBackedExecutionReadinessStatus: "baseline-backed-next-cycle-execution-authorized",
    manualNextCycleExecutionAuthorized: true,
    nextCycleExecutionEvidenceRequired: true,
    nextCycleExecutionStarted: false,
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
    authorizedUserCount: 5,
    rolesAuthorized: ["DIRETOR", "GERENTE", "CORRETOR"],
    minimumSuccessfulRequiredJourneys: 3,
    maximumRequiredJourneyFailures: 0,
    minimumAvailabilityPercent: 99.95,
    minimumMonitoringCoveragePercent: 100,
    maximumCriticalIncidents: 0,
    maximumUnresolvedHighSeverityIncidents: 0,
    maximumMaterialRegressions: 0,
    authorizedCostCeilingCents: 8500,
    executionReadinessOwner: "responsavel-prontidao-fase-31",
    authorizedBy: "diretor-autorizador-fase-31",
    witnessedBy: "testemunha-independente-fase-31",
    authorizedAt: "2026-08-09T15:15:00-03:00",
    authorizedWindowStart: "2026-08-10T09:00:00-03:00",
    authorizedWindowEnd: "2026-08-17T18:00:00-03:00",
    ...overrides,
  };
}

function readinessEvidence(overrides = {}) {
  return {
    phase: 31,
    status: "approved",
    decision: "authorize-baseline-backed-next-cycle-execution",
    recordedAt: "2026-08-09T15:20:00-03:00",
    ...overrides,
  };
}

function executionEvidence(previousEvidence = readinessEvidence(), overrides = {}) {
  const checks = Object.fromEntries(contract.requiredChecks.map((field) => [field, true]));
  return {
    phase: 32,
    status: "completed",
    decision: "confirm-baseline-backed-next-cycle-execution",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    baselineBackedExecutionReadinessEvidenceSha256: canonicalEvidenceSha256(previousEvidence),
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    sanitizedExecutionReference: "execucao-sanitizada-ciclo-2026-08-16",
    ...checks,
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
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    executionOwner: "responsavel-execucao-fase-32",
    witnessedBy: "testemunha-independente-fase-32",
    executionStartedAt: "2026-08-10T09:30:00-03:00",
    executionCompletedAt: "2026-08-10T10:15:00-03:00",
    recordedAt: "2026-08-10T10:20:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previousEvidence = Object.prototype.hasOwnProperty.call(
    input,
    "baselineBackedExecutionReadinessEvidence",
  )
    ? input.baselineBackedExecutionReadinessEvidence
    : readinessEvidence();
  const evidence = Object.prototype.hasOwnProperty.call(input, "baselineBackedExecutionEvidence")
    ? input.baselineBackedExecutionEvidence
    : executionEvidence(previousEvidence ?? readinessEvidence());
  return evaluateBaselineBackedExecution({
    executionReadinessResult: readinessResult(),
    baselineBackedExecutionReadinessEvidence: previousEvidence,
    baselineBackedExecutionEvidence: evidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 32 preserva estados pendentes da cadeia", () => {
  const result = evaluate({
    executionReadinessResult: readinessResult({
      baselineBackedExecutionReadinessStatus: "awaiting-baseline-backed-next-cycle-plan",
    }),
    baselineBackedExecutionReadinessEvidence: null,
    baselineBackedExecutionEvidence: null,
  });
  assert.equal(result.baselineBackedExecutionStatus, "awaiting-baseline-backed-next-cycle-plan");
  assert.equal(result.nextCycleExecutionPerformed, false);
});

test("Fase 32 aguarda evidência sem executar ação", () => {
  const result = evaluate({ baselineBackedExecutionEvidence: null });
  assert.equal(
    result.baselineBackedExecutionStatus,
    "awaiting-baseline-backed-next-cycle-execution-evidence",
  );
  assert.equal(result.nextCycleExecutionPerformed, false);
  assert.equal(result.automaticExecutionAllowed, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 32 comprova somente a execução manual autorizada", () => {
  const result = evaluate();
  assert.equal(
    result.baselineBackedExecutionStatus,
    "baseline-backed-next-cycle-manual-execution-proven",
  );
  assert.equal(result.executionReadinessEvidenceVerified, true);
  assert.equal(result.executionEvidenceVerified, true);
  assert.equal(result.manualNextCycleExecutionVerified, true);
  assert.equal(result.nextCycleExecutionPerformed, true);
  assert.equal(result.independentValidationRequired, true);
  assert.equal(result.independentValidationStarted, false);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticExpansionAllowed, false);
  assert.equal(result.automaticRollbackAllowed, false);
  assert.equal(result.durationMinutes, 45);
});

test("Fase 32 exige o gate autorizado da Fase 31", () => {
  for (const [field, value, expected] of [
    ["manualNextCycleExecutionAuthorized", false, /Autorização manual/],
    ["nextCycleExecutionEvidenceRequired", false, /Evidência exigida/],
    ["nextCycleExecutionStarted", true, /Execução iniciada/],
    ["automaticExecutionAllowed", true, /Execução automática/],
    ["automaticExpansionAllowed", true, /Expansão automática/],
    ["automaticRollbackAllowed", true, /Rollback automático/],
    ["deploymentPerformedByGate", true, /Deploy pela Fase 31/],
    ["databaseMutationsByGate", 1, /Mutações de banco pela Fase 31/],
  ]) {
    assert.throws(
      () => evaluate({ executionReadinessResult: readinessResult({ [field]: value }) }),
      expected,
    );
  }
});

test("Fase 32 exige a evidência factual da Fase 31", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionReadinessEvidence: null }),
    /evidência da Fase 31 é obrigatória/,
  );
});

test("Fase 32 exige fase, status e decisão exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 31, /Fase da evidência/],
    ["status", "draft", /Status da execução/],
    ["decision", "execute", /Decisão da execução/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 32 preserva artefato, release e origem", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da execução/],
    ["sourceFingerprint", "outro", /Fingerprint da execução/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da execução/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 32 encadeia a evidência canônica da Fase 31", () => {
  assert.throws(
    () => evaluate({
      baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), {
        baselineBackedExecutionReadinessEvidenceSha256: "hash-adulterado",
      }),
    }),
    /Hash canônico/,
  );
});

test("Fase 32 preserva ciclo e baseline verificada", () => {
  for (const [field, value, expected] of [
    ["sourceCycleIdentifier", "outro", /ciclo de origem/],
    ["cycleIdentifier", "outro", /Ciclo executado/],
    ["verifiedBaselineIdentifier", "outra", /baseline verificada/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 32 exige todas as confirmações e campos textuais", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { monitoringActive: false }) }),
    /monitoringActive/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { sanitizedExecutionReference: "" }) }),
    /sanitizedExecutionReference/,
  );
});

test("Fase 32 mantém a coorte dentro do teto autorizado", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { executedUserCount: 6 }) }),
    /superar a coorte autorizada/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { executedUserCount: 0 }) }),
    /pelo menos um usuário/,
  );
});

test("Fase 32 exige exatamente os papéis autorizados", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { rolesExecuted: ["DIRETOR", "GERENTE"] }) }),
    /papéis executados/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { rolesExecuted: ["DIRETOR", "GERENTE", "CORRETOR", "CORRETOR"] }) }),
    /duplicados/,
  );
});

test("Fase 32 exige jornadas aprovadas sem falha", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { successfulRequiredJourneys: 2 }) }),
    /quantidade mínima de jornadas/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { requiredJourneyFailures: 1 }) }),
    /tolerância de falhas/,
  );
});

test("Fase 32 exige disponibilidade e monitoramento aprovados", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { observedAvailabilityPercent: 99.9 }) }),
    /disponibilidade observada/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { monitoringCoveragePercent: 99 }) }),
    /cobertura de monitoramento/,
  );
});

test("Fase 32 bloqueia incidentes, regressões e custo excedido", () => {
  for (const [field, value, expected] of [
    ["criticalIncidents", 1, /Incidentes críticos/],
    ["unresolvedHighSeverityIncidents", 1, /Incidentes graves/],
    ["materialRegressions", 1, /Regressões materiais/],
    ["observedCostCents", 8501, /custo observado/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 32 não aceita efeitos colaterais nem dados sensíveis", () => {
  for (const [field, value, expected] of [
    ["databaseMigrationsByGate", 1, /Migrations executadas/],
    ["bootstrapExecutionsByGate", 1, /Execuções de bootstrap/],
    ["businessDataMutationsByGate", 1, /Mutações comerciais/],
    ["usersProvisionedByGate", 1, /Usuários provisionados/],
    ["secretValuesRecorded", true, /Registro de segredos/],
    ["containsPersonalData", true, /Dados pessoais/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 32 exige executor e testemunha independentes", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { executionOwner: "diretor-autorizador-fase-31" }) }),
    /executor deve ser independente/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { witnessedBy: "responsavel-execucao-fase-32" }) }),
    /testemunha da execução deve ser independente/,
  );
});

test("Fase 32 respeita autorização, janela, duração e registro", () => {
  for (const [field, value, expected] of [
    ["executionStartedAt", "2026-08-09T15:00:00-03:00", /começar antes da autorização/],
    ["executionCompletedAt", "2026-08-10T09:45:00-03:00", /no mínimo 30 minutos/],
    ["executionCompletedAt", "2026-08-17T18:01:00-03:00", /dentro da janela autorizada/],
    ["recordedAt", "2026-08-10T10:00:00-03:00", /não pode anteceder/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 32 rejeita contrato enfraquecido", () => {
  assert.throws(
    () => evaluate({ contract: { ...contract, automaticExpansionAllowed: true } }),
    /Expansão automática/,
  );
  assert.throws(
    () => evaluate({ contract: { ...contract, minimumExecutionDurationMinutes: 29 } }),
    /Duração mínima/,
  );
});

test("Fase 32 interpreta argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
