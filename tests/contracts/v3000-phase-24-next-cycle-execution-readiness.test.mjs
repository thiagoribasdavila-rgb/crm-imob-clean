import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateNextCycleExecutionReadiness,
} from "../../scripts/check-v3000-phase-24-next-cycle-execution-readiness.mjs";

const sha256 = "sha256-prontidao-proximo-ciclo";
const sourceFingerprint = "sha256:fingerprint-prontidao-proximo-ciclo";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-24-next-cycle-execution-readiness.json", import.meta.url),
    "utf8",
  ),
);

function planningResult(overrides = {}) {
  return {
    phase: 23,
    ok: true,
    nextCyclePlanningStatus: "next-cycle-plan-approved",
    nextCyclePlanApproved: true,
    nextCycleExecutionReviewEligible: true,
    nextCycleExecutionAuthorized: false,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    plannedUserCeiling: 5,
    rolesPlanned: ["DIRETOR", "GERENTE", "CORRETOR"],
    minimumSuccessfulRequiredJourneys: 3,
    maximumRequiredJourneyFailures: 0,
    minimumAvailabilityPercent: 99.9,
    minimumMonitoringCoveragePercent: 100,
    maximumCriticalIncidents: 0,
    maximumUnresolvedHighSeverityIncidents: 0,
    estimatedCostCeilingCents: 10000,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    planningOwner: "responsavel-planejamento-fase-23",
    approvedBy: "responsavel-aprovacao-fase-23",
    plannedWindowStart: "2026-08-09T09:00:00-03:00",
    plannedWindowEnd: "2026-08-16T09:00:00-03:00",
    approvedAt: "2026-08-08T12:00:00-03:00",
    ...overrides,
  };
}

function planEvidence(overrides = {}) {
  return {
    phase: 23,
    status: "approved",
    decision: "approve-next-cycle-plan",
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    approvedAt: "2026-08-08T12:00:00-03:00",
    sanitizedPlanReference: "plano-sanitizado-fase-23",
    ...overrides,
  };
}

function readinessEvidence(previousEvidence = planEvidence(), overrides = {}) {
  return {
    phase: 24,
    status: "approved",
    decision: "authorize-next-cycle-execution",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    nextCyclePlanningEvidenceSha256: canonicalEvidenceSha256(previousEvidence),
    humanExecutionReviewCompleted: true,
    evidenceChainReviewed: true,
    sameReleaseReferenceConfirmed: true,
    approvedPlanConfirmed: true,
    cohortWithinApprovedCeiling: true,
    roleScopeConfirmed: true,
    metricThresholdsConfirmed: true,
    guardrailsConfirmed: true,
    monitoringReady: true,
    supportReady: true,
    rollbackReady: true,
    privacyReviewed: true,
    costCeilingConfirmed: true,
    changeFreezeRespected: true,
    manualExecutionRequired: true,
    noAutomaticDeploymentRequested: true,
    noAutomaticExpansionRequested: true,
    noAutomaticRollbackRequested: true,
    authorizedUserCount: 5,
    rolesAuthorized: ["DIRETOR", "GERENTE", "CORRETOR"],
    minimumSuccessfulRequiredJourneys: 3,
    maximumRequiredJourneyFailures: 0,
    minimumAvailabilityPercent: 99.9,
    minimumMonitoringCoveragePercent: 100,
    maximumCriticalIncidents: 0,
    maximumUnresolvedHighSeverityIncidents: 0,
    authorizedCostCeilingCents: 10000,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    executionReadinessOwner: "responsavel-prontidao-fase-24",
    authorizedBy: "responsavel-autorizacao-fase-24",
    sanitizedReadinessReference: "prontidao-sanitizada-fase-24",
    planApprovedAt: "2026-08-08T12:00:00-03:00",
    authorizedWindowStart: "2026-08-09T09:00:00-03:00",
    authorizedWindowEnd: "2026-08-16T09:00:00-03:00",
    reviewedAt: "2026-08-08T13:00:00-03:00",
    authorizedAt: "2026-08-08T14:00:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previousEvidence = Object.prototype.hasOwnProperty.call(
    input,
    "nextCyclePlanningEvidence",
  )
    ? input.nextCyclePlanningEvidence
    : planEvidence();
  const defaultReadinessEvidence = previousEvidence
    ? readinessEvidence(previousEvidence)
    : readinessEvidence(planEvidence());
  return evaluateNextCycleExecutionReadiness({
    planningResult: planningResult(),
    nextCyclePlanningEvidence: previousEvidence,
    nextCycleExecutionReadinessEvidence: defaultReadinessEvidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 24 aguarda a aprovação do plano da Fase 23", () => {
  const result = evaluate({
    planningResult: planningResult({
      nextCyclePlanApproved: false,
      nextCycleExecutionReviewEligible: false,
    }),
    nextCyclePlanningEvidence: null,
    nextCycleExecutionReadinessEvidence: null,
  });
  assert.equal(result.nextCycleExecutionReviewStatus, "awaiting-next-cycle-plan");
  assert.equal(result.manualNextCycleExecutionAuthorized, false);
});

test("Fase 24 aguarda a revisão humana de prontidão", () => {
  const result = evaluate({ nextCycleExecutionReadinessEvidence: null });
  assert.equal(result.nextCycleExecutionReviewStatus, "awaiting-next-cycle-execution-review");
  assert.equal(result.nextCycleExecutionEvidenceRequired, false);
});

test("Fase 24 autoriza somente execução manual e exige evidência posterior", () => {
  const result = evaluate();
  assert.equal(result.nextCycleExecutionReviewStatus, "next-cycle-execution-authorized");
  assert.equal(result.nextCycleExecutionReviewApproved, true);
  assert.equal(result.manualNextCycleExecutionAuthorized, true);
  assert.equal(result.nextCycleExecutionEvidenceRequired, true);
  assert.equal(result.nextCycleExecutionPerformed, false);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticExpansionAllowed, false);
  assert.equal(result.automaticRollbackAllowed, false);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 24 exige a evidência da Fase 23 quando há revisão", () => {
  assert.throws(
    () => evaluate({ nextCyclePlanningEvidence: null }),
    /evidência da Fase 23 é obrigatória/,
  );
});

test("Fase 24 exige identidade exata do artefato, release, origem e ciclo", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da revisão/],
    ["sourceFingerprint", "outro", /Fingerprint da revisão/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da revisão/],
    ["cycleIdentifier", "outro-ciclo", /Identificador do ciclo/],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), { [field]: value }),
      }),
      expected,
    );
  }
});

test("Fase 24 vincula a autorização ao hash canônico do plano", () => {
  const original = planEvidence();
  assert.throws(
    () => evaluate({
      nextCyclePlanningEvidence: planEvidence({ sanitizedPlanReference: "plano-alterado" }),
      nextCycleExecutionReadinessEvidence: readinessEvidence(original),
    }),
    /Hash canônico da evidência da Fase 23/,
  );
});

test("hash canônico preserva conteúdo e ignora a ordem das chaves", () => {
  const first = { z: 1, a: { c: 3, b: 2 } };
  const reordered = { a: { b: 2, c: 3 }, z: 1 };
  const changed = { a: { b: 2, c: 4 }, z: 1 };
  assert.equal(canonicalEvidenceSha256(first), canonicalEvidenceSha256(reordered));
  assert.notEqual(canonicalEvidenceSha256(first), canonicalEvidenceSha256(changed));
});

test("Fase 24 exige todas as confirmações humanas", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), { [field]: false }),
      }),
      new RegExp(field),
    );
  }
});

test("Fase 24 exige todos os identificadores de auditoria", () => {
  for (const field of contract.requiredStringFields) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), { [field]: "" }),
      }),
    );
  }
});

test("Fase 24 limita a autorização à coorte aprovada", () => {
  for (const value of [0, 6, 2.5]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
          authorizedUserCount: value,
        }),
      }),
      /usuário|coorte|inteiro/,
    );
  }
});

test("Fase 24 preserva exatamente os papéis aprovados", () => {
  for (const rolesAuthorized of [
    ["DIRETOR", "GERENTE"],
    ["DIRETOR", "GERENTE", "ADMIN"],
    ["DIRETOR", "GERENTE", "GERENTE"],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), { rolesAuthorized }),
      }),
      /papéis|duplicados/,
    );
  }
});

test("Fase 24 exige exatamente as jornadas aprovadas", () => {
  for (const value of [2, 4]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
          minimumSuccessfulRequiredJourneys: value,
        }),
      }),
      /Meta de jornadas obrigatórias divergente/,
    );
  }
});

test("Fase 24 mantém tolerância zero para falhas e incidentes", () => {
  for (const field of [
    "maximumRequiredJourneyFailures",
    "maximumCriticalIncidents",
    "maximumUnresolvedHighSeverityIncidents",
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), { [field]: 1 }),
      }),
      /divergente/,
    );
  }
});

test("Fase 24 exige exatamente as metas de disponibilidade e monitoramento", () => {
  for (const [field, value] of [
    ["minimumAvailabilityPercent", 99.8],
    ["minimumMonitoringCoveragePercent", 99.9],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), { [field]: value }),
      }),
      /divergente/,
    );
  }
});

test("Fase 24 limita o custo ao teto aprovado", () => {
  for (const value of [-1, 10001, 10.5]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
          authorizedCostCeilingCents: value,
        }),
      }),
      /Teto de custo autorizado|teto de custo autorizado/,
    );
  }
});

test("Fase 24 rejeita qualquer efeito colateral atribuído ao gate", () => {
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
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), { [field]: value }),
      }),
      /divergente/,
    );
  }
});

test("Fase 24 exige a aprovação exata do plano", () => {
  assert.throws(
    () => evaluate({
      nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
        planApprovedAt: "2026-08-08T12:01:00-03:00",
      }),
    }),
    /Aprovação do plano divergente/,
  );
});

test("Fase 24 separa planejamento, revisão e autorização", () => {
  for (const executionReadinessOwner of [
    "responsavel-planejamento-fase-23",
    "responsavel-aprovacao-fase-23",
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
          executionReadinessOwner,
        }),
      }),
      /independente do planejamento/,
    );
  }
  assert.throws(
    () => evaluate({
      nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
        authorizedBy: "responsavel-prontidao-fase-24",
      }),
    }),
    /independente do revisor/,
  );
});

test("Fase 24 exige revisão e autorização em ordem cronológica", () => {
  assert.throws(
    () => evaluate({
      nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
        reviewedAt: "2026-08-08T11:59:00-03:00",
      }),
    }),
    /anteceder a aprovação do plano/,
  );
  assert.throws(
    () => evaluate({
      nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
        authorizedAt: "2026-08-08T12:59:00-03:00",
      }),
    }),
    /anteceder a revisão de prontidão/,
  );
});

test("Fase 24 mantém a janela autorizada dentro da janela planejada", () => {
  assert.throws(
    () => evaluate({
      nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
        authorizedWindowStart: "2026-08-09T08:59:00-03:00",
      }),
    }),
    /dentro da janela aprovada/,
  );
  assert.throws(
    () => evaluate({
      nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
        authorizedWindowEnd: "2026-08-16T09:01:00-03:00",
      }),
    }),
    /dentro da janela aprovada/,
  );
  assert.throws(
    () => evaluate({
      nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
        authorizedWindowEnd: "2026-08-09T09:00:00-03:00",
      }),
    }),
    /posterior ao início/,
  );
});

test("Fase 24 não aceita início de janela antes da autorização", () => {
  assert.throws(
    () => evaluate({
      planningResult: planningResult({
        plannedWindowStart: "2026-08-08T13:30:00-03:00",
      }),
      nextCycleExecutionReadinessEvidence: readinessEvidence(planEvidence(), {
        authorizedWindowStart: "2026-08-08T13:30:00-03:00",
        authorizedWindowEnd: "2026-08-09T09:00:00-03:00",
      }),
    }),
    /antes da autorização humana/,
  );
});

test("parser aceita argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
