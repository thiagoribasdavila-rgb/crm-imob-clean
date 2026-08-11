import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateNextCyclePlanning,
} from "../../scripts/check-v3000-phase-23-next-cycle-planning.mjs";

const sha256 = "sha256-planejamento-proximo-ciclo";
const sourceFingerprint = "sha256:fingerprint-planejamento-proximo-ciclo";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-23-next-cycle-planning.json", import.meta.url),
    "utf8",
  ),
);

function phase22Evidence(overrides = {}) {
  return {
    phase: 22,
    status: "approved",
    decision: "close-validated-window",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    sustainedOperationValidationEvidenceSha256: "hash-fase-21",
    humanDecisionRecorded: true,
    evidenceChainReviewed: true,
    sameReleaseConfirmed: true,
    sameOperationalScopeConfirmed: true,
    sameCohortConfirmed: true,
    roleScopeConfirmed: true,
    availabilityReviewed: true,
    monitoringReviewed: true,
    requiredJourneysReviewed: true,
    dailyReviewsReviewed: true,
    incidentReviewCompleted: true,
    supportReadinessConfirmed: true,
    rollbackReadinessConfirmed: true,
    privacyReviewed: true,
    costAndCapacityReviewed: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    noRequiredJourneyFailure: true,
    reviewedUserCount: 5,
    userAccessValidatedCount: 5,
    rolesReviewed: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    availabilityPercent: 99.9,
    monitoringCoveragePercent: 100,
    dailyReviewsCompleted: 7,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    decisionOwner: "responsavel-diretoria-fase-22",
    sanitizedDecisionReference: "decisao-sanitizada-fase-22",
    validatedWindowStart: "2026-08-01T09:00:00-03:00",
    validatedWindowEnd: "2026-08-08T09:00:00-03:00",
    phase21ReviewedAt: "2026-08-08T10:00:00-03:00",
    decidedAt: "2026-08-08T11:00:00-03:00",
    ...overrides,
  };
}

function reviewResult(overrides = {}) {
  return {
    phase: 22,
    ok: true,
    continuousOperationReviewStatus: "continuous-operation-review-approved",
    continuousOperationReviewApproved: true,
    validatedWindowClosed: true,
    nextCyclePlanningEligible: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    reviewedUserCount: 5,
    rolesReviewed: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    availabilityPercent: 99.9,
    monitoringCoveragePercent: 100,
    dailyReviewsCompleted: 7,
    decisionOwner: "responsavel-diretoria-fase-22",
    decidedAt: "2026-08-08T11:00:00-03:00",
    ...overrides,
  };
}

function planEvidence(previousEvidence = phase22Evidence(), overrides = {}) {
  return {
    phase: 23,
    status: "approved",
    decision: "approve-next-cycle-plan",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    continuousOperationReviewEvidenceSha256:
      canonicalEvidenceSha256(previousEvidence),
    humanPlanReviewed: true,
    evidenceChainReviewed: true,
    sameReleaseReferenceConfirmed: true,
    priorWindowClosureConfirmed: true,
    objectivesDefined: true,
    scopeBoundariesDefined: true,
    cohortCeilingDefined: true,
    roleScopeDefined: true,
    successMetricsDefined: true,
    guardrailsDefined: true,
    supportPlanDefined: true,
    rollbackPlanDefined: true,
    privacyReviewed: true,
    costCeilingDefined: true,
    changeFreezeRespected: true,
    noProductionExecutionRequested: true,
    noAutomaticExpansionRequested: true,
    noAutomaticRollbackRequested: true,
    plannedUserCeiling: 5,
    rolesPlanned: ["DIRETOR", "GERENTE", "CORRETOR"],
    minimumSuccessfulRequiredJourneys: 3,
    maximumRequiredJourneyFailures: 0,
    minimumAvailabilityPercent: 99.9,
    minimumMonitoringCoveragePercent: 100,
    maximumCriticalIncidents: 0,
    maximumUnresolvedHighSeverityIncidents: 0,
    estimatedCostCeilingCents: 10000,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    planningOwner: "responsavel-planejamento-fase-23",
    approvedBy: "responsavel-aprovacao-fase-23",
    sanitizedPlanReference: "plano-sanitizado-fase-23",
    priorWindowClosedAt: "2026-08-08T11:00:00-03:00",
    plannedWindowStart: "2026-08-09T09:00:00-03:00",
    plannedWindowEnd: "2026-08-16T09:00:00-03:00",
    approvedAt: "2026-08-08T12:00:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previousEvidence = input.continuousOperationReviewEvidence ?? phase22Evidence();
  return evaluateNextCyclePlanning({
    reviewResult: reviewResult(),
    continuousOperationReviewEvidence: previousEvidence,
    nextCyclePlanningEvidence: planEvidence(previousEvidence),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 23 aguarda o encerramento humano da janela anterior", () => {
  const result = evaluate({
    reviewResult: reviewResult({
      continuousOperationReviewApproved: false,
      nextCyclePlanningEligible: false,
    }),
    continuousOperationReviewEvidence: null,
    nextCyclePlanningEvidence: null,
  });
  assert.equal(
    result.nextCyclePlanningStatus,
    "awaiting-continuous-operation-review",
  );
  assert.equal(result.nextCyclePlanApproved, false);
});

test("Fase 23 aguarda o plano humano depois da Fase 22", () => {
  const result = evaluate({ nextCyclePlanningEvidence: null });
  assert.equal(result.nextCyclePlanningStatus, "awaiting-next-cycle-plan");
  assert.equal(result.nextCycleExecutionReviewEligible, false);
});

test("Fase 23 aprova somente o plano e não autoriza execução", () => {
  const result = evaluate();
  assert.equal(result.nextCyclePlanningStatus, "next-cycle-plan-approved");
  assert.equal(result.nextCyclePlanApproved, true);
  assert.equal(result.nextCycleExecutionReviewEligible, true);
  assert.equal(result.nextCycleExecutionAuthorized, false);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticExpansionAllowed, false);
  assert.equal(result.automaticRollbackAllowed, false);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 23 exige a evidência da Fase 22 quando há um plano", () => {
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: null }),
    /evidência da Fase 22 é obrigatória/,
  );
});

test("Fase 23 exige identidade exata do artefato, release e origem", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 do plano/],
    ["sourceFingerprint", "outro", /Fingerprint do plano/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem do plano/],
  ]) {
    assert.throws(
      () => evaluate({
        nextCyclePlanningEvidence: planEvidence(phase22Evidence(), { [field]: value }),
      }),
      expected,
    );
  }
});

test("Fase 23 vincula o plano ao hash canônico da decisão anterior", () => {
  const previousEvidence = phase22Evidence();
  assert.throws(
    () => evaluate({
      continuousOperationReviewEvidence: phase22Evidence({ dailyReviewsCompleted: 8 }),
      nextCyclePlanningEvidence: planEvidence(previousEvidence),
    }),
    /Hash canônico da evidência da Fase 22/,
  );
});

test("hash canônico preserva conteúdo e ignora a ordem das chaves", () => {
  const first = { z: 1, a: { c: 3, b: 2 } };
  const reordered = { a: { b: 2, c: 3 }, z: 1 };
  const changed = { a: { b: 2, c: 4 }, z: 1 };
  assert.equal(canonicalEvidenceSha256(first), canonicalEvidenceSha256(reordered));
  assert.notEqual(canonicalEvidenceSha256(first), canonicalEvidenceSha256(changed));
});

test("Fase 23 exige todas as confirmações humanas", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({
        nextCyclePlanningEvidence: planEvidence(phase22Evidence(), { [field]: false }),
      }),
      new RegExp(field),
    );
  }
});

test("Fase 23 exige todos os identificadores de auditoria", () => {
  for (const field of contract.requiredStringFields) {
    assert.throws(
      () => evaluate({
        nextCyclePlanningEvidence: planEvidence(phase22Evidence(), { [field]: "" }),
      }),
    );
  }
});

test("Fase 23 limita a coorte aos usuários já revisados", () => {
  for (const value of [0, 6, 2.5]) {
    assert.throws(
      () => evaluate({
        nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
          plannedUserCeiling: value,
        }),
      }),
      /usuário|coorte|inteiro/,
    );
  }
});

test("Fase 23 preserva exatamente os papéis validados", () => {
  for (const rolesPlanned of [
    ["DIRETOR", "GERENTE"],
    ["DIRETOR", "GERENTE", "ADMIN"],
    ["DIRETOR", "GERENTE", "GERENTE"],
  ]) {
    assert.throws(
      () => evaluate({
        nextCyclePlanningEvidence: planEvidence(phase22Evidence(), { rolesPlanned }),
      }),
      /papéis|Papel obrigatório|duplicados/,
    );
  }
});

test("Fase 23 não aceita regressão da meta de jornadas", () => {
  assert.throws(
    () => evaluate({
      reviewResult: reviewResult({ successfulRequiredJourneys: 4 }),
      nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
        minimumSuccessfulRequiredJourneys: 3,
      }),
    }),
    /jornadas obrigatórias não pode regredir/,
  );
});

test("Fase 23 mantém tolerância zero para falhas e incidentes", () => {
  for (const [field, value] of [
    ["maximumRequiredJourneyFailures", 1],
    ["maximumCriticalIncidents", 1],
    ["maximumUnresolvedHighSeverityIncidents", 1],
  ]) {
    assert.throws(
      () => evaluate({
        nextCyclePlanningEvidence: planEvidence(phase22Evidence(), { [field]: value }),
      }),
      /divergente/,
    );
  }
});

test("Fase 23 não aceita regressão de disponibilidade", () => {
  assert.throws(
    () => evaluate({
      nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
        minimumAvailabilityPercent: 99.8,
      }),
    }),
    /disponibilidade não pode regredir/,
  );
});

test("Fase 23 não aceita regressão de monitoramento", () => {
  assert.throws(
    () => evaluate({
      nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
        minimumMonitoringCoveragePercent: 99.9,
      }),
    }),
    /monitoramento não pode regredir/,
  );
});

test("Fase 23 exige teto de custo explícito e inteiro", () => {
  for (const value of [-1, 10.5, Number.NaN]) {
    assert.throws(
      () => evaluate({
        nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
          estimatedCostCeilingCents: value,
        }),
      }),
      /Teto de custo estimado/,
    );
  }
});

test("Fase 23 rejeita qualquer efeito colateral atribuído ao gate", () => {
  for (const [field, value] of [
    ["databaseMigrationsByGate", 1],
    ["bootstrapExecutionsByGate", 1],
    ["businessDataMutationsByGate", 1],
    ["usersProvisionedByGate", 1],
    ["secretValuesRecorded", true],
    ["containsPersonalData", true],
  ]) {
    assert.throws(
      () => evaluate({
        nextCyclePlanningEvidence: planEvidence(phase22Evidence(), { [field]: value }),
      }),
      /divergente/,
    );
  }
});

test("Fase 23 exige o encerramento exato da janela anterior", () => {
  assert.throws(
    () => evaluate({
      nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
        priorWindowClosedAt: "2026-08-08T10:59:00-03:00",
      }),
    }),
    /Encerramento da janela anterior/,
  );
});

test("Fase 23 separa decisão anterior, planejamento e aprovação", () => {
  assert.throws(
    () => evaluate({
      nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
        planningOwner: "responsavel-diretoria-fase-22",
      }),
    }),
    /independente da decisão da Fase 22/,
  );
  assert.throws(
    () => evaluate({
      nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
        approvedBy: "responsavel-planejamento-fase-23",
      }),
    }),
    /independente do planejador/,
  );
});

test("Fase 23 exige aprovação posterior ao fechamento anterior", () => {
  assert.throws(
    () => evaluate({
      nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
        approvedAt: "2026-08-08T10:59:00-03:00",
      }),
    }),
    /antes do encerramento da Fase 22/,
  );
});

test("Fase 23 exige janela futura válida depois da aprovação", () => {
  assert.throws(
    () => evaluate({
      nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
        plannedWindowStart: "2026-08-08T11:30:00-03:00",
      }),
    }),
    /começar antes da aprovação humana/,
  );
  assert.throws(
    () => evaluate({
      nextCyclePlanningEvidence: planEvidence(phase22Evidence(), {
        plannedWindowEnd: "2026-08-09T08:59:00-03:00",
      }),
    }),
    /posterior ao início/,
  );
});

test("parser aceita argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
