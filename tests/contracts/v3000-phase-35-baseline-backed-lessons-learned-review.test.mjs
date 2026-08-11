import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateBaselineBackedLessonsLearnedReview,
} from "../../scripts/check-v3000-phase-35-baseline-backed-lessons-learned-review.mjs";

const sha256 = "sha256-licoes-revisadas";
const sourceFingerprint = "sha256:fingerprint-licoes-revisadas";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL(
      "../../config/v3000-phase-35-baseline-backed-lessons-learned-review.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function phase34Evidence(overrides = {}) {
  return {
    phase: 34,
    status: "approved",
    decision: "formally-close-independently-validated-baseline-backed-cycle",
    candidateSha256: sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    recordedAt: "2026-08-10T12:30:00-03:00",
    ...overrides,
  };
}

function closureResult(overrides = {}) {
  return {
    phase: 34,
    ok: true,
    cycleClosureStatus: "baseline-backed-next-cycle-formally-closed",
    independentValidationEvidenceVerified: true,
    closureEvidenceVerified: true,
    manualCycleClosureVerified: true,
    cycleFormallyClosed: true,
    closureReviewRequired: false,
    closureReviewCompleted: true,
    lessonsLearnedReviewRequired: true,
    lessonsLearnedReviewStarted: false,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticCycleClosureAllowed: false,
    automaticNextCyclePlanningAllowed: false,
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
    closedUserCount: 5,
    rolesClosed: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    acceptedAvailabilityPercent: 99.99,
    acceptedMonitoringCoveragePercent: 100,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    materialRegressions: 0,
    observedCostCents: 8000,
    recordedAt: "2026-08-10T12:30:00-03:00",
    ...overrides,
  };
}

function lessonsEvidence(previous = phase34Evidence(), overrides = {}) {
  const checks = Object.fromEntries(contract.requiredChecks.map((field) => [field, true]));
  return {
    phase: 35,
    status: "approved",
    decision: "accept-sanitized-cycle-lessons-for-improvement-proposal-review",
    reviewDecisionRole: "DIRETOR",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    cycleClosureEvidenceSha256: canonicalEvidenceSha256(previous),
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    ...checks,
    reviewedUserCount: 5,
    rolesReviewed: ["DIRETOR", "GERENTE", "CORRETOR"],
    reviewedSuccessfulRequiredJourneys: 3,
    reviewedFailedRequiredJourneys: 0,
    reviewedAvailabilityPercent: 99.99,
    reviewedMonitoringCoveragePercent: 100,
    reviewedCriticalIncidents: 0,
    reviewedUnresolvedHighSeverityIncidents: 0,
    reviewedMaterialRegressions: 0,
    reviewedObservedCostCents: 8000,
    acceptedLessonCount: 6,
    lessonCategoryCounts: {
      journey: 1,
      operations: 1,
      support: 1,
      security: 1,
      privacy: 1,
      cost: 1,
    },
    actionItemCount: 2,
    improvementProposalCount: 2,
    unsubstantiatedClaimCount: 0,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    lessonsReviewIdentifier: "revisao-licoes-ciclo-2026-08-16",
    sanitizedLessonsSummaryReference: "resumo-sanitizado-licoes-2026-08-16",
    sanitizedImprovementProposalReference: "propostas-sanitizadas-2026-08-16",
    reviewDecidedBy: "diretor-revisao-fase-35",
    witnessedBy: "testemunha-revisao-fase-35",
    reviewStartedAt: "2026-08-10T12:35:00-03:00",
    reviewCompletedAt: "2026-08-10T13:00:00-03:00",
    recordedAt: "2026-08-10T13:05:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previous = Object.hasOwn(input, "cycleClosureEvidence")
    ? input.cycleClosureEvidence
    : phase34Evidence();
  const evidence = Object.hasOwn(input, "lessonsLearnedEvidence")
    ? input.lessonsLearnedEvidence
    : lessonsEvidence(previous ?? phase34Evidence());
  return evaluateBaselineBackedLessonsLearnedReview({
    cycleClosureResult: closureResult(),
    cycleClosureEvidence: previous,
    lessonsLearnedEvidence: evidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 35 preserva estados pendentes da cadeia", () => {
  const result = evaluate({
    cycleClosureResult: closureResult({
      cycleClosureStatus: "awaiting-baseline-backed-cycle-closure-review-evidence",
    }),
    cycleClosureEvidence: null,
    lessonsLearnedEvidence: null,
  });
  assert.equal(
    result.lessonsLearnedReviewStatus,
    "awaiting-baseline-backed-cycle-closure-review-evidence",
  );
  assert.equal(result.lessonsLearnedReviewCompleted, false);
});

test("Fase 35 aguarda evidência sanitizada sem executar ação", () => {
  const result = evaluate({ lessonsLearnedEvidence: null });
  assert.equal(
    result.lessonsLearnedReviewStatus,
    "awaiting-baseline-backed-lessons-learned-review-evidence",
  );
  assert.equal(result.automaticImprovementProposalReviewAllowed, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 35 consolida lições e abre somente a revisão de propostas", () => {
  const result = evaluate();
  assert.equal(result.lessonsLearnedReviewStatus, "baseline-backed-cycle-lessons-reviewed");
  assert.equal(result.cycleClosureEvidenceVerified, true);
  assert.equal(result.lessonsLearnedEvidenceVerified, true);
  assert.equal(result.manualLessonsLearnedReviewVerified, true);
  assert.equal(result.lessonsLearnedReviewCompleted, true);
  assert.equal(result.improvementProposalReviewRequired, true);
  assert.equal(result.improvementProposalReviewStarted, false);
  assert.equal(result.nextCyclePlanningAuthorized, false);
  assert.equal(result.durationMinutes, 25);
  assert.equal(result.automaticProductionActionAllowed, false);
});

test("Fase 35 exige o resultado seguro da Fase 34", () => {
  for (const [field, value, expected] of [
    ["independentValidationEvidenceVerified", false, /Validação independente verificada/],
    ["closureEvidenceVerified", false, /Evidência de encerramento verificada/],
    ["manualCycleClosureVerified", false, /Encerramento manual verificado/],
    ["cycleFormallyClosed", false, /Ciclo formalmente encerrado/],
    ["closureReviewRequired", true, /Revisão de encerramento pendente/],
    ["closureReviewCompleted", false, /Revisão de encerramento concluída/],
    ["lessonsLearnedReviewRequired", false, /Revisão de lições exigida/],
    ["lessonsLearnedReviewStarted", true, /Revisão de lições iniciada/],
    ["nextCyclePlanningAuthorized", true, /Planejamento autorizado/],
    ["automaticProductionActionAllowed", true, /Ação automática/],
    ["automaticBaselineMutationAllowed", true, /Mutação automática/],
    ["automaticCycleClosureAllowed", true, /Encerramento automático/],
    ["automaticNextCyclePlanningAllowed", true, /Planejamento automático/],
    ["automaticExecutionAllowed", true, /Execução automática/],
    ["automaticExpansionAllowed", true, /Expansão automática/],
    ["automaticRollbackAllowed", true, /Rollback automático/],
    ["deploymentPerformedByGate", true, /Deploy pela Fase 34/],
    ["databaseMutationsByGate", 1, /Mutações de banco pela Fase 34/],
  ]) {
    assert.throws(
      () => evaluate({ cycleClosureResult: closureResult({ [field]: value }) }),
      expected,
    );
  }
});

test("Fase 35 exige a evidência factual da Fase 34", () => {
  assert.throws(
    () => evaluate({ cycleClosureEvidence: null }),
    /evidência da Fase 34 é obrigatória/,
  );
});

test("Fase 35 exige fase, status, decisão e papel exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 34, /Fase da evidência/],
    ["status", "draft", /Status da revisão/],
    ["decision", "review", /Decisão da revisão/],
    ["reviewDecisionRole", "GERENTE", /Papel decisor/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 35 preserva artefato, release e origem", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da revisão/],
    ["sourceFingerprint", "outro", /Fingerprint da revisão/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da revisão/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 35 encadeia o hash canônico da Fase 34", () => {
  assert.throws(
    () => evaluate({
      lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), {
        cycleClosureEvidenceSha256: "hash-adulterado",
      }),
    }),
    /Hash canônico/,
  );
});

test("Fase 35 preserva ciclos e baseline verificada", () => {
  for (const [field, value, expected] of [
    ["sourceCycleIdentifier", "outro", /Ciclo de origem/],
    ["cycleIdentifier", "outro", /Ciclo revisado/],
    ["verifiedBaselineIdentifier", "outra", /Baseline verificada/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 35 exige confirmações e campos textuais", () => {
  assert.throws(
    () => evaluate({
      lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), {
        privacyFindingsReviewed: false,
      }),
    }),
    /privacyFindingsReviewed/,
  );
  assert.throws(
    () => evaluate({
      lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), {
        sanitizedLessonsSummaryReference: "",
      }),
    }),
    /sanitizedLessonsSummaryReference/,
  );
});

test("Fase 35 exige exatamente a mesma coorte e papéis", () => {
  assert.throws(
    () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), { reviewedUserCount: 6 }) }),
    /Usuários revisados/,
  );
  assert.throws(
    () => evaluate({
      lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), {
        rolesReviewed: ["DIRETOR", "GERENTE"],
      }),
    }),
    /papéis revisados/,
  );
});

test("Fase 35 exige resultados idênticos de jornadas, segurança e custo", () => {
  for (const [field, value, expected] of [
    ["reviewedSuccessfulRequiredJourneys", 2, /Jornadas revisadas/],
    ["reviewedFailedRequiredJourneys", 1, /Falhas revisadas/],
    ["reviewedCriticalIncidents", 1, /Incidentes críticos revisados/],
    ["reviewedUnresolvedHighSeverityIncidents", 1, /Incidentes graves revisados/],
    ["reviewedMaterialRegressions", 1, /Regressões revisadas/],
    ["reviewedObservedCostCents", 8001, /Custo revisado/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 35 exige disponibilidade e monitoramento idênticos", () => {
  assert.throws(
    () => evaluate({
      lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), {
        reviewedAvailabilityPercent: 99.98,
      }),
    }),
    /Disponibilidade revisada/,
  );
  assert.throws(
    () => evaluate({
      lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), {
        reviewedMonitoringCoveragePercent: 99,
      }),
    }),
    /Monitoramento revisado/,
  );
});

test("Fase 35 exige as seis categorias e cobertura mínima", () => {
  assert.throws(
    () => evaluate({
      lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), {
        lessonCategoryCounts: {
          journey: 1,
          operations: 1,
          support: 1,
          security: 1,
          privacy: 1,
        },
      }),
    }),
    /categorias de aprendizado devem ser exatamente/,
  );
  assert.throws(
    () => evaluate({
      lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), {
        lessonCategoryCounts: {
          journey: 0,
          operations: 1,
          support: 1,
          security: 1,
          privacy: 1,
          cost: 1,
        },
      }),
    }),
    /categoria journey deve possuir ao menos uma lição/,
  );
});

test("Fase 35 exige lições, ações, propostas e alegações justificadas", () => {
  for (const [field, value, expected] of [
    ["acceptedLessonCount", 5, /no mínimo 6 lições/],
    ["actionItemCount", 0, /ao menos uma ação corretiva/],
    ["improvementProposalCount", 0, /ao menos uma proposta de melhoria/],
    ["unsubstantiatedClaimCount", 1, /não aceita alegações sem evidência/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 35 mantém tolerância zero a falhas e regressões", () => {
  for (const [field, resultField, expected] of [
    ["reviewedFailedRequiredJourneys", "failedRequiredJourneys", /tolerância de falhas/],
    ["reviewedCriticalIncidents", "criticalIncidents", /incidentes críticos/],
    [
      "reviewedUnresolvedHighSeverityIncidents",
      "unresolvedHighSeverityIncidents",
      /incidentes graves/,
    ],
    ["reviewedMaterialRegressions", "materialRegressions", /regressão material/],
  ]) {
    assert.throws(
      () => evaluate({
        cycleClosureResult: closureResult({ [resultField]: 1 }),
        lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), { [field]: 1 }),
      }),
      expected,
    );
  }
});

test("Fase 35 rejeita efeitos colaterais, dados pessoais e segredos", () => {
  for (const [field, value, expected] of [
    ["databaseMigrationsByGate", 1, /Migrations pelo gate/],
    ["bootstrapExecutionsByGate", 1, /Bootstraps pelo gate/],
    ["businessDataMutationsByGate", 1, /Mutações comerciais pelo gate/],
    ["usersProvisionedByGate", 1, /Usuários pelo gate/],
    ["secretValuesRecorded", true, /Registro de segredos/],
    ["containsPersonalData", true, /Dados pessoais na evidência/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 35 exige decisão e testemunho distintos", () => {
  assert.throws(
    () => evaluate({
      lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), {
        witnessedBy: "diretor-revisao-fase-35",
      }),
    }),
    /testemunha deve ser distinta/,
  );
});

test("Fase 35 respeita cronologia e duração mínima", () => {
  for (const [field, value, expected] of [
    ["reviewStartedAt", "2026-08-10T12:29:00-03:00", /não pode começar antes/],
    ["reviewCompletedAt", "2026-08-10T12:34:00-03:00", /posterior ao início/],
    ["reviewCompletedAt", "2026-08-10T12:50:00-03:00", /no mínimo 20 minutos/],
    ["recordedAt", "2026-08-10T12:59:00-03:00", /não pode anteceder/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(phase34Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 35 rejeita contrato que enfraqueça segurança", () => {
  assert.throws(
    () => evaluate({ contract: { ...contract, automaticImprovementProposalReviewAllowed: true } }),
    /Revisão automática de propostas/,
  );
  assert.throws(
    () => evaluate({ contract: { ...contract, minimumReviewDurationMinutes: 5 } }),
    /não pode ser inferior a 20 minutos/,
  );
});

test("Fase 35 interpreta argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
