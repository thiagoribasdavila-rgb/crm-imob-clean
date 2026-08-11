import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateBaselineBackedExecutionReadiness,
} from "../../scripts/check-v3000-phase-31-baseline-backed-execution-readiness.mjs";

const sha256 = "sha256-prontidao-baseline";
const sourceFingerprint = "sha256:fingerprint-prontidao-baseline";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL(
      "../../config/v3000-phase-31-baseline-backed-execution-readiness.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function planningResult(overrides = {}) {
  return {
    phase: 30,
    ok: true,
    baselineBackedPlanningStatus: "baseline-backed-next-cycle-plan-approved",
    nextCycleExecutionReadinessReviewRequired: true,
    nextCycleExecutionAuthorized: false,
    automaticExecutionAllowed: false,
    deploymentPerformedByGate: false,
    databaseMutationsByGate: 0,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    plannedCycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    sanitizedPlanReference: "plano-sanitizado-ciclo-2026-08-16",
    plannedUserCeiling: 5,
    rolesPlanned: ["DIRETOR", "GERENTE", "CORRETOR"],
    minimumSuccessfulRequiredJourneys: 3,
    maximumRequiredJourneyFailures: 0,
    minimumAvailabilityPercent: 99.95,
    minimumMonitoringCoveragePercent: 100,
    maximumCriticalIncidents: 0,
    maximumUnresolvedHighSeverityIncidents: 0,
    maximumMaterialRegressions: 0,
    estimatedCostCeilingCents: 8500,
    planningOwner: "responsavel-planejamento-fase-30",
    planningApprovedBy: "diretor-aprovador-fase-30",
    witnessedBy: "testemunha-independente-fase-30",
    reviewCompletedAt: "2026-08-09T14:35:00-03:00",
    recordedAt: "2026-08-09T14:40:00-03:00",
    plannedWindowStart: "2026-08-10T09:00:00-03:00",
    plannedWindowEnd: "2026-08-17T18:00:00-03:00",
    ...overrides,
  };
}

function planningEvidence(overrides = {}) {
  return {
    phase: 30,
    status: "approved",
    decision: "approve-baseline-backed-next-cycle-plan",
    plannedCycleIdentifier: "ciclo-controlado-2026-08-16",
    recordedAt: "2026-08-09T14:40:00-03:00",
    ...overrides,
  };
}

function readinessEvidence(previousEvidence = planningEvidence(), overrides = {}) {
  return {
    phase: 31,
    status: "approved",
    decision: "authorize-baseline-backed-next-cycle-execution",
    readinessDecisionRole: "DIRETOR",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    baselineBackedPlanningEvidenceSha256: canonicalEvidenceSha256(previousEvidence),
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    sanitizedPlanReference: "plano-sanitizado-ciclo-2026-08-16",
    sanitizedReadinessReference: "prontidao-sanitizada-ciclo-2026-08-16",
    independentReadinessReviewConfirmed: true,
    baselineBackedPlanReviewed: true,
    planningEvidenceReviewed: true,
    evidenceChainReviewed: true,
    sameArtifactConfirmed: true,
    sameReleaseReferenceConfirmed: true,
    verifiedBaselineReferenceConfirmed: true,
    plannedCycleReferenceConfirmed: true,
    sanitizedPlanReferenceConfirmed: true,
    cohortWithinApprovedCeiling: true,
    roleScopeConfirmed: true,
    successMetricsConfirmed: true,
    journeyTargetsConfirmed: true,
    operationalTargetsConfirmed: true,
    guardrailsConfirmed: true,
    monitoringReady: true,
    supportReady: true,
    rollbackReady: true,
    privacyReviewed: true,
    riskReviewCompleted: true,
    costCeilingConfirmed: true,
    changeFreezeRespected: true,
    manualExecutionRequired: true,
    noProductionExecutionPerformed: true,
    noDatabaseMutationRequested: true,
    noUserProvisioningRequested: true,
    noAutomaticDeploymentRequested: true,
    noAutomaticExecutionRequested: true,
    noAutomaticExpansionRequested: true,
    noAutomaticRollbackRequested: true,
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
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    executionReadinessOwner: "responsavel-prontidao-fase-31",
    authorizedBy: "diretor-autorizador-fase-31",
    witnessedBy: "testemunha-independente-fase-31",
    planApprovedAt: "2026-08-09T14:35:00-03:00",
    planRecordedAt: "2026-08-09T14:40:00-03:00",
    reviewStartedAt: "2026-08-09T14:45:00-03:00",
    reviewCompletedAt: "2026-08-09T15:10:00-03:00",
    authorizedAt: "2026-08-09T15:15:00-03:00",
    authorizedWindowStart: "2026-08-10T09:00:00-03:00",
    authorizedWindowEnd: "2026-08-17T18:00:00-03:00",
    recordedAt: "2026-08-09T15:20:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previousEvidence = Object.prototype.hasOwnProperty.call(
    input,
    "baselineBackedPlanningEvidence",
  )
    ? input.baselineBackedPlanningEvidence
    : planningEvidence();
  const evidence = Object.prototype.hasOwnProperty.call(
    input,
    "baselineBackedExecutionReadinessEvidence",
  )
    ? input.baselineBackedExecutionReadinessEvidence
    : readinessEvidence(previousEvidence ?? planningEvidence());
  return evaluateBaselineBackedExecutionReadiness({
    planningResult: planningResult(),
    baselineBackedPlanningEvidence: previousEvidence,
    baselineBackedExecutionReadinessEvidence: evidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 31 preserva estados pendentes da cadeia", () => {
  for (const status of ["awaiting-baseline-verification", "awaiting-baseline-backed-next-cycle-plan"]) {
    const result = evaluate({
      planningResult: planningResult({ baselineBackedPlanningStatus: status }),
      baselineBackedPlanningEvidence: null,
      baselineBackedExecutionReadinessEvidence: null,
    });
    assert.equal(result.baselineBackedExecutionReadinessStatus, status);
    assert.equal(result.nextCycleExecutionAuthorized, false);
  }
});

test("Fase 31 aguarda revisão independente sem iniciar execução", () => {
  const result = evaluate({ baselineBackedExecutionReadinessEvidence: null });
  assert.equal(
    result.baselineBackedExecutionReadinessStatus,
    "awaiting-baseline-backed-execution-readiness-review",
  );
  assert.equal(result.nextCycleExecutionStarted, false);
  assert.equal(result.automaticExecutionAllowed, false);
});

test("Fase 31 autoriza somente a futura execução manual", () => {
  const result = evaluate();
  assert.equal(
    result.baselineBackedExecutionReadinessStatus,
    "baseline-backed-next-cycle-execution-authorized",
  );
  assert.equal(result.planningEvidenceVerified, true);
  assert.equal(result.independentReadinessReviewVerified, true);
  assert.equal(result.nextCycleExecutionAuthorized, true);
  assert.equal(result.manualNextCycleExecutionAuthorized, true);
  assert.equal(result.nextCycleExecutionEvidenceRequired, true);
  assert.equal(result.nextCycleExecutionStarted, false);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticExecutionAllowed, false);
  assert.equal(result.automaticExpansionAllowed, false);
  assert.equal(result.automaticRollbackAllowed, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 31 exige o gate correto da Fase 30 sem efeito colateral", () => {
  for (const [field, value, expected] of [
    ["nextCycleExecutionReadinessReviewRequired", false, /Revisão de prontidão exigida/],
    ["nextCycleExecutionAuthorized", true, /Execução ainda não autorizada/],
    ["automaticExecutionAllowed", true, /Execução automática na Fase 30/],
    ["deploymentPerformedByGate", true, /Deploy pela Fase 30/],
    ["databaseMutationsByGate", 1, /Mutações de banco pela Fase 30/],
  ]) {
    assert.throws(() => evaluate({ planningResult: planningResult({ [field]: value }) }), expected);
  }
});

test("Fase 31 exige a evidência factual da Fase 30", () => {
  assert.throws(
    () => evaluate({ baselineBackedPlanningEvidence: null }),
    /evidência da Fase 30 é obrigatória/,
  );
});

test("Fase 31 exige fase, status, decisão e papel exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 30, /Fase da evidência/],
    ["status", "draft", /Status da revisão de prontidão/],
    ["decision", "execute", /Decisão da revisão de prontidão/],
    ["readinessDecisionRole", "ADMIN", /Papel da decisão/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 31 preserva identidade do artefato, release e origem", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da revisão/],
    ["sourceFingerprint", "outro", /Fingerprint da revisão/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da revisão/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 31 recalcula o hash canônico da evidência de planejamento", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { baselineBackedPlanningEvidenceSha256: "outro" }) }),
    /Hash canônico/,
  );
});

test("Fase 31 exige ciclo, baseline e referências aprovadas", () => {
  for (const [field, value, expected] of [
    ["sourceCycleIdentifier", "outro", /ciclo de origem/],
    ["cycleIdentifier", "outro", /Ciclo autorizado/],
    ["verifiedBaselineIdentifier", "outra", /baseline verificada/],
    ["sanitizedPlanReference", "outra", /Referência do plano/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 31 exige todas as confirmações e campos textuais", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { [field]: false }) }),
      new RegExp(field),
    );
  }
  assert.throws(
    () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { sanitizedReadinessReference: "" }) }),
    /sanitizedReadinessReference é obrigatório/,
  );
});

test("Fase 31 limita coorte e preserva exatamente os papéis planejados", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { authorizedUserCount: 6 }) }),
    /superar a coorte aprovada/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { rolesAuthorized: ["DIRETOR", "GERENTE"] }) }),
    /exatamente os aprovados/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { rolesAuthorized: ["DIRETOR", "GERENTE", "CORRETOR", "CORRETOR"] }) }),
    /duplicados/,
  );
});

test("Fase 31 impede regressão nas jornadas e metas operacionais", () => {
  assert.throws(
    () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { minimumSuccessfulRequiredJourneys: 2 }) }),
    /jornadas obrigatórias não pode regredir/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { minimumAvailabilityPercent: 99.9 }) }),
    /Meta de disponibilidade não pode regredir/,
  );
  assert.throws(
    () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { minimumMonitoringCoveragePercent: 99 }) }),
    /Meta de monitoramento não pode regredir/,
  );
});

test("Fase 31 mantém tolerância zero e teto de custo do plano", () => {
  for (const [field, value, expected] of [
    ["maximumRequiredJourneyFailures", 1, /Tolerância de falhas em jornadas/],
    ["maximumCriticalIncidents", 1, /incidentes críticos/i],
    ["maximumUnresolvedHighSeverityIncidents", 1, /incidentes graves/i],
    ["maximumMaterialRegressions", 1, /regressões materiais/i],
    ["authorizedCostCeilingCents", 8501, /não pode superar o plano/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 31 bloqueia mutações, provisionamento, segredos e dados pessoais", () => {
  for (const [field, value, expected] of [
    ["databaseMigrationsByGate", 1, /Migrations executadas pelo gate/],
    ["bootstrapExecutionsByGate", 1, /Execuções de bootstrap pelo gate/],
    ["businessDataMutationsByGate", 1, /Mutações comerciais executadas pelo gate/],
    ["usersProvisionedByGate", 1, /Usuários provisionados pelo gate/],
    ["secretValuesRecorded", true, /Registro de segredos/],
    ["containsPersonalData", true, /Dados pessoais na evidência/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 31 exige revisão, autorização e testemunha independentes", () => {
  for (const [field, value, expected] of [
    ["executionReadinessOwner", "responsavel-planejamento-fase-30", /revisor de prontidão deve ser independente/],
    ["authorizedBy", "diretor-aprovador-fase-30", /autorizador deve ser independente/],
    ["authorizedBy", "responsavel-prontidao-fase-31", /autorizador deve ser independente/],
    ["witnessedBy", "diretor-autorizador-fase-31", /testemunha deve ser independente/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 31 exige cronologia, duração mínima e janela dentro do plano", () => {
  for (const [field, value, expected] of [
    ["reviewStartedAt", "2026-08-09T14:39:00-03:00", /não pode começar antes do registro/],
    ["reviewCompletedAt", "2026-08-09T15:00:00-03:00", /no mínimo 20 minutos/],
    ["authorizedAt", "2026-08-09T15:09:00-03:00", /não pode anteceder o fim/],
    ["authorizedWindowStart", "2026-08-09T15:14:00-03:00", /não pode começar antes da autorização/],
    ["authorizedWindowEnd", "2026-08-18T18:00:00-03:00", /dentro da janela planejada/],
    ["recordedAt", "2026-08-09T15:14:00-03:00", /não pode anteceder a autorização/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedExecutionReadinessEvidence: readinessEvidence(planningEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 31 rejeita contrato enfraquecido", () => {
  assert.throws(
    () => evaluate({ contract: { ...contract, minimumReviewDurationMinutes: 10 } }),
    /não pode ser inferior a 20 minutos/,
  );
  assert.throws(
    () => evaluate({ contract: { ...contract, automaticNextCycleExecutionAllowed: true } }),
    /Execução automática divergente/,
  );
});

test("Fase 31 rejeita identidade divergente da Fase 11", () => {
  assert.throws(
    () => evaluate({ phase11Contract: { candidate: { sha256: "outro", sourceFingerprint } } }),
    /SHA-256 da release/,
  );
});

test("Fase 31 aceita argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "arquivo.zip"], "--zip"), "arquivo.zip");
  assert.equal(argument(["--zip=arquivo.zip"], "--zip"), "arquivo.zip");
  assert.equal(argument([], "--zip"), null);
});
