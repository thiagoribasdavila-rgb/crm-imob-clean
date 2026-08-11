import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateBaselineBackedPlanning,
} from "../../scripts/check-v3000-phase-30-baseline-backed-planning.mjs";

const sha256 = "sha256-planejamento-baseline";
const sourceFingerprint = "sha256:fingerprint-planejamento-baseline";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-30-baseline-backed-planning.json", import.meta.url),
    "utf8",
  ),
);

function baselineResult(overrides = {}) {
  return {
    phase: 29,
    ok: true,
    baselineVerificationStatus: "lessons-learned-baseline-verified",
    nextCyclePlanningReviewRequired: true,
    nextCyclePlanningAuthorized: false,
    baselineCommittedAsEvidenceOnly: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    sanitizedLessonsSummaryReference: "licoes-sanitizadas-fase-28",
    sanitizedBaselineChangeSetReference: "baseline-documental-sanitizada-fase-28",
    rolesVerified: ["DIRETOR", "GERENTE", "CORRETOR"],
    acceptedUserCount: 5,
    acceptedSuccessfulRequiredJourneys: 3,
    acceptedAvailabilityPercent: 99.95,
    acceptedMonitoringCoveragePercent: 100,
    acceptedObservedCostCents: 8500,
    verificationDecidedBy: "responsavel-verificacao-fase-29",
    recordedAt: "2026-08-09T14:05:00-03:00",
    ...overrides,
  };
}

function verificationEvidence(overrides = {}) {
  return {
    phase: 29,
    status: "verified",
    decision: "verify-lessons-learned-baseline",
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    recordedAt: "2026-08-09T14:05:00-03:00",
    ...overrides,
  };
}

function planningEvidence(previousEvidence = verificationEvidence(), overrides = {}) {
  return {
    phase: 30,
    status: "approved",
    decision: "approve-baseline-backed-next-cycle-plan",
    planningDecisionRole: "DIRETOR",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    baselineVerificationEvidenceSha256: canonicalEvidenceSha256(previousEvidence),
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    plannedCycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    sanitizedLessonsSummaryReference: "licoes-sanitizadas-fase-28",
    sanitizedBaselineChangeSetReference: "baseline-documental-sanitizada-fase-28",
    sanitizedPlanReference: "plano-sanitizado-ciclo-2026-08-16",
    manualPlanningReviewConfirmed: true,
    baselineVerificationEvidenceReviewed: true,
    evidenceChainReviewed: true,
    sameArtifactConfirmed: true,
    sameReleaseReferenceConfirmed: true,
    verifiedBaselineReferenceConfirmed: true,
    lessonsSummaryReferenceConfirmed: true,
    baselineChangeSetReferenceConfirmed: true,
    objectivesDefined: true,
    scopeBoundariesDefined: true,
    nonGoalsDefined: true,
    cohortCeilingDefined: true,
    roleScopeDefined: true,
    successMetricsDefined: true,
    journeyTargetsDefined: true,
    operationalTargetsDefined: true,
    costCeilingDefined: true,
    supportPlanDefined: true,
    rollbackPlanDefined: true,
    privacyReviewed: true,
    riskReviewCompleted: true,
    changeFreezeRespected: true,
    documentaryPlanOnlyConfirmed: true,
    noProductionExecutionRequested: true,
    noDatabaseMutationRequested: true,
    noUserProvisioningRequested: true,
    noAutomaticDeploymentRequested: true,
    noAutomaticPlanningRequested: true,
    noAutomaticExecutionRequested: true,
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
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    planningOwner: "responsavel-planejamento-fase-30",
    planningApprovedBy: "diretor-aprovador-fase-30",
    witnessedBy: "testemunha-independente-fase-30",
    reviewStartedAt: "2026-08-09T14:10:00-03:00",
    reviewCompletedAt: "2026-08-09T14:35:00-03:00",
    plannedWindowStart: "2026-08-10T09:00:00-03:00",
    plannedWindowEnd: "2026-08-17T18:00:00-03:00",
    recordedAt: "2026-08-09T14:40:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const priorEvidence = Object.prototype.hasOwnProperty.call(input, "baselineVerificationEvidence")
    ? input.baselineVerificationEvidence
    : verificationEvidence();
  const evidence = Object.prototype.hasOwnProperty.call(input, "baselineBackedPlanningEvidence")
    ? input.baselineBackedPlanningEvidence
    : planningEvidence(priorEvidence ?? verificationEvidence());
  return evaluateBaselineBackedPlanning({
    baselineResult: baselineResult(),
    baselineVerificationEvidence: priorEvidence,
    baselineBackedPlanningEvidence: evidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 30 preserva estados pendentes da cadeia", () => {
  for (const status of ["awaiting-lessons-learned-review", "awaiting-baseline-verification"]) {
    const result = evaluate({
      baselineResult: baselineResult({ baselineVerificationStatus: status }),
      baselineVerificationEvidence: null,
      baselineBackedPlanningEvidence: null,
    });
    assert.equal(result.baselineBackedPlanningStatus, status);
    assert.equal(result.nextCyclePlanningAuthorized, false);
  }
});

test("Fase 30 aguarda plano humano baseado na baseline", () => {
  const result = evaluate({ baselineBackedPlanningEvidence: null });
  assert.equal(result.baselineBackedPlanningStatus, "awaiting-baseline-backed-next-cycle-plan");
  assert.equal(result.nextCyclePlanningReviewRequired, true);
  assert.equal(result.nextCycleExecutionAuthorized, false);
});

test("Fase 30 aprova somente o plano documental e exige revisão de prontidão", () => {
  const result = evaluate();
  assert.equal(result.baselineBackedPlanningStatus, "baseline-backed-next-cycle-plan-approved");
  assert.equal(result.baselineVerificationEvidenceVerified, true);
  assert.equal(result.humanPlanningReviewVerified, true);
  assert.equal(result.nextCyclePlanApproved, true);
  assert.equal(result.nextCyclePlanningAuthorized, true);
  assert.equal(result.nextCycleExecutionReadinessReviewRequired, true);
  assert.equal(result.nextCycleExecutionAuthorized, false);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticExecutionAllowed, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 30 exige revisão solicitada e baseline exclusivamente documental", () => {
  assert.throws(
    () => evaluate({ baselineResult: baselineResult({ nextCyclePlanningReviewRequired: false }) }),
    /Revisão de planejamento exigida/,
  );
  assert.throws(
    () => evaluate({ baselineResult: baselineResult({ nextCyclePlanningAuthorized: true }) }),
    /Planejamento ainda não autorizado/,
  );
  assert.throws(
    () => evaluate({ baselineResult: baselineResult({ baselineCommittedAsEvidenceOnly: false }) }),
    /Baseline exclusivamente documental/,
  );
});

test("Fase 30 exige a evidência factual da Fase 29", () => {
  assert.throws(
    () => evaluate({ baselineVerificationEvidence: null }),
    /evidência da Fase 29 é obrigatória/,
  );
});

test("Fase 30 exige fase, status, decisão e papel exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 29, /Fase da evidência/],
    ["status", "draft", /Status do planejamento/],
    ["decision", "execute", /Decisão do planejamento/],
    ["planningDecisionRole", "ADMIN", /Papel da decisão/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 30 preserva identidade do artefato, release e origem", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 do planejamento/],
    ["sourceFingerprint", "outro", /Fingerprint do planejamento/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem do planejamento/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 30 recalcula o hash canônico da evidência anterior", () => {
  assert.throws(
    () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { baselineVerificationEvidenceSha256: "outro" }) }),
    /Hash canônico/,
  );
});

test("Fase 30 exige ciclo futuro, baseline e referências sanitizadas", () => {
  for (const [field, value, expected] of [
    ["sourceCycleIdentifier", "outro", /ciclo de origem/],
    ["plannedCycleIdentifier", "ciclo-controlado-2026-08-09", /ciclo planejado deve ser distinto/],
    ["verifiedBaselineIdentifier", "outra", /baseline verificada/],
    ["sanitizedLessonsSummaryReference", "outra", /referência sanitizada das lições/i],
    ["sanitizedBaselineChangeSetReference", "outra", /referência sanitizada das mudanças/i],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 30 exige todas as confirmações e campos textuais", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { [field]: false }) }),
      new RegExp(field),
    );
  }
  assert.throws(
    () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { sanitizedPlanReference: "" }) }),
    /sanitizedPlanReference é obrigatório/,
  );
});

test("Fase 30 limita coorte e preserva exatamente os três papéis", () => {
  assert.throws(
    () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { plannedUserCeiling: 6 }) }),
    /superar a coorte validada/,
  );
  assert.throws(
    () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { rolesPlanned: ["DIRETOR", "GERENTE"] }) }),
    /preservar exatamente/,
  );
  assert.throws(
    () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { rolesPlanned: ["DIRETOR", "GERENTE", "CORRETOR", "CORRETOR"] }) }),
    /duplicados/,
  );
});

test("Fase 30 impede regressão de jornadas e metas operacionais", () => {
  for (const [field, value, expected] of [
    ["minimumSuccessfulRequiredJourneys", 2, /jornadas obrigatórias não pode regredir/],
    ["maximumRequiredJourneyFailures", 1, /Tolerância de falhas/],
    ["minimumAvailabilityPercent", 99.9, /disponibilidade não pode regredir/],
    ["minimumMonitoringCoveragePercent", 99, /monitoramento não pode regredir/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 30 mantém tolerância zero e teto de custo coerente", () => {
  for (const field of [
    "maximumCriticalIncidents",
    "maximumUnresolvedHighSeverityIncidents",
    "maximumMaterialRegressions",
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { [field]: 1 }) }),
      /Tolerância/,
    );
  }
  assert.throws(
    () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { estimatedCostCeilingCents: 8499 }) }),
    /custo deve cobrir/,
  );
});

test("Fase 30 proíbe mutações, provisionamento, segredos e dados pessoais", () => {
  for (const [field, value, expected] of [
    ["databaseMigrationsByGate", 1, /Migrations executadas/],
    ["bootstrapExecutionsByGate", 1, /bootstrap/],
    ["businessDataMutationsByGate", 1, /Mutações comerciais/],
    ["usersProvisionedByGate", 1, /Usuários provisionados/],
    ["secretValuesRecorded", true, /Registro de segredos/],
    ["containsPersonalData", true, /Dados pessoais/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 30 exige responsáveis independentes e cronologia válida", () => {
  for (const [field, value, expected] of [
    ["planningOwner", "responsavel-verificacao-fase-29", /independente do decisor/],
    ["planningApprovedBy", "responsavel-planejamento-fase-30", /aprovador do plano/],
    ["witnessedBy", "diretor-aprovador-fase-30", /testemunha do plano/],
    ["reviewStartedAt", "2026-08-09T14:00:00-03:00", /antes do registro da Fase 29/],
    ["reviewCompletedAt", "2026-08-09T14:25:00-03:00", /no mínimo 20 minutos/],
    ["plannedWindowStart", "2026-08-09T14:30:00-03:00", /antes da aprovação do plano/],
    ["plannedWindowEnd", "2026-08-10T08:00:00-03:00", /posterior ao início da janela/],
    ["recordedAt", "2026-08-09T14:30:00-03:00", /não pode anteceder/],
  ]) {
    assert.throws(
      () => evaluate({ baselineBackedPlanningEvidence: planningEvidence(verificationEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 30 rejeita contrato enfraquecido", () => {
  assert.throws(
    () => evaluate({ contract: { ...contract, automaticExecutionAllowed: true } }),
    /Execução automática divergente/,
  );
  assert.throws(
    () => evaluate({ contract: { ...contract, minimumPlanningDurationMinutes: 10 } }),
    /não pode ser inferior a 20 minutos/,
  );
});

test("helper de argumentos aceita formato separado e inline", () => {
  assert.equal(argument(["--zip", "a.zip"], "--zip"), "a.zip");
  assert.equal(argument(["--zip=b.zip"], "--zip"), "b.zip");
  assert.equal(argument([], "--zip"), null);
});
