import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateLessonsLearnedBaseline,
} from "../../scripts/check-v3000-phase-28-lessons-learned-baseline.mjs";

const sha256 = "sha256-baseline-licoes-aprendidas";
const sourceFingerprint = "sha256:fingerprint-baseline-licoes-aprendidas";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-28-lessons-learned-baseline.json", import.meta.url),
    "utf8",
  ),
);

function closureResult(overrides = {}) {
  return {
    phase: 27,
    ok: true,
    nextCycleClosureStatus: "next-cycle-formally-closed",
    nextCycleClosureEvidenceVerified: true,
    manualNextCycleClosureVerified: true,
    nextCycleFormallyClosed: true,
    lessonsLearnedReviewRequired: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    closedUserCount: 5,
    rolesClosed: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    acceptedAvailabilityPercent: 99.95,
    acceptedMonitoringCoveragePercent: 100,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    materialRegressions: 0,
    observedCostCents: 8500,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    closureDecidedBy: "responsavel-encerramento-fase-27",
    witnessedBy: "testemunha-independente-fase-27",
    closureReviewCompletedAt: "2026-08-09T12:50:00-03:00",
    ...overrides,
  };
}

function closureEvidence(overrides = {}) {
  return {
    phase: 27,
    status: "approved",
    decision: "close-validated-next-cycle",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    sanitizedClosureReference: "encerramento-sanitizado-fase-27",
    closureReviewCompletedAt: "2026-08-09T12:50:00-03:00",
    ...overrides,
  };
}

function lessonsEvidence(previousEvidence = closureEvidence(), overrides = {}) {
  return {
    phase: 28,
    status: "approved",
    decision: "commit-lessons-learned-baseline",
    reviewDecisionRole: "DIRETOR",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    nextCycleClosureEvidenceSha256: canonicalEvidenceSha256(previousEvidence),
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    previousBaselineIdentifier: "atlas-one-v3000-baseline-anterior",
    proposedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    sanitizedLessonsSummaryReference: "licoes-sanitizadas-fase-28",
    sanitizedBaselineChangeSetReference: "baseline-documental-sanitizada-fase-28",
    manualLessonsLearnedReviewConfirmed: true,
    nextCycleClosureEvidenceReviewed: true,
    evidenceChainReviewed: true,
    sameReleaseReferenceConfirmed: true,
    sameCycleReferenceConfirmed: true,
    closureOutcomeAccepted: true,
    roleFeedbackReviewed: true,
    journeyFindingsReviewed: true,
    operationsFindingsReviewed: true,
    supportFindingsReviewed: true,
    privacyFindingsReviewed: true,
    costFindingsReviewed: true,
    incidentReviewCompleted: true,
    regressionReviewCompleted: true,
    baselineChangesReviewed: true,
    baselineChangesAreDocumentaryOnly: true,
    actionOwnersAndDueDatesRecorded: true,
    rollbackReadinessPreserved: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    noMaterialRegressionDetected: true,
    noAutomaticDeploymentPerformed: true,
    noAutomaticPlanningPerformed: true,
    noAutomaticExecutionPerformed: true,
    noAutomaticBaselineMutationPerformed: true,
    rolesReviewed: ["DIRETOR", "GERENTE", "CORRETOR"],
    acceptedLessonCount: 5,
    lessonCategoryCounts: {
      journey: 1,
      operations: 1,
      support: 1,
      privacy: 1,
      cost: 1,
    },
    actionItemCount: 3,
    baselineChangeCount: 2,
    acceptedUserCount: 5,
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
    reviewDecidedBy: "responsavel-baseline-fase-28",
    witnessedBy: "testemunha-independente-fase-28",
    reviewStartedAt: "2026-08-09T13:00:00-03:00",
    reviewCompletedAt: "2026-08-09T13:25:00-03:00",
    recordedAt: "2026-08-09T13:30:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previousEvidence = Object.prototype.hasOwnProperty.call(
    input,
    "nextCycleClosureEvidence",
  )
    ? input.nextCycleClosureEvidence
    : closureEvidence();
  const defaultLessonsEvidence = previousEvidence
    ? lessonsEvidence(previousEvidence)
    : lessonsEvidence(closureEvidence());
  return evaluateLessonsLearnedBaseline({
    closureResult: closureResult(),
    nextCycleClosureEvidence: previousEvidence,
    lessonsLearnedEvidence: defaultLessonsEvidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 28 preserva estados pendentes das fases anteriores", () => {
  for (const status of [
    "awaiting-next-cycle-execution-evidence",
    "awaiting-next-cycle-validation",
    "awaiting-next-cycle-closure-review",
  ]) {
    const result = evaluate({
      closureResult: closureResult({ nextCycleClosureStatus: status }),
      nextCycleClosureEvidence: null,
      lessonsLearnedEvidence: null,
    });
    assert.equal(result.lessonsLearnedBaselineStatus, status);
    assert.equal(result.lessonsLearnedEvidenceVerified, false);
    assert.equal(result.nextCyclePlanningAuthorized, false);
  }
});

test("Fase 28 aguarda revisão humana das lições aprendidas", () => {
  const result = evaluate({ lessonsLearnedEvidence: null });
  assert.equal(result.lessonsLearnedBaselineStatus, "awaiting-lessons-learned-review");
  assert.equal(result.lessonsLearnedReviewRequired, true);
  assert.equal(result.baselineVerificationRequired, false);
});

test("Fase 28 compromete somente a evidência documental da baseline", () => {
  const result = evaluate();
  assert.equal(result.lessonsLearnedBaselineStatus, "lessons-learned-baseline-committed");
  assert.equal(result.lessonsLearnedEvidenceVerified, true);
  assert.equal(result.manualLessonsLearnedReviewVerified, true);
  assert.equal(result.baselineCommittedAsEvidenceOnly, true);
  assert.equal(result.baselineMutationPerformedByGate, false);
  assert.equal(result.baselineVerificationRequired, true);
  assert.equal(result.nextCyclePlanningAuthorized, false);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticBaselineMutationAllowed, false);
  assert.equal(result.automaticNextCyclePlanningAllowed, false);
  assert.equal(result.automaticExecutionAllowed, false);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 28 exige que a Fase 27 tenha solicitado lições aprendidas", () => {
  assert.throws(
    () => evaluate({ closureResult: closureResult({ lessonsLearnedReviewRequired: false }) }),
    /Revisão de lições aprendidas exigida pela Fase 27/,
  );
});

test("Fase 28 exige a evidência factual da Fase 27", () => {
  assert.throws(
    () => evaluate({ nextCycleClosureEvidence: null }),
    /evidência da Fase 27 é obrigatória/,
  );
});

test("Fase 28 exige fase, status, decisão e papel exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 27, /Fase da evidência/],
    ["status", "completed", /Status da revisão/],
    ["decision", "review", /Decisão da revisão/],
    ["reviewDecisionRole", "ADMIN", /Papel da decisão/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 28 exige identidade exata de artefato, release, origem e ciclo", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da revisão/],
    ["sourceFingerprint", "outro", /Fingerprint da revisão/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da revisão/],
    ["cycleIdentifier", "outro-ciclo", /Identificador do ciclo/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 28 vincula a baseline ao hash canônico do encerramento", () => {
  const original = closureEvidence();
  assert.throws(
    () => evaluate({
      nextCycleClosureEvidence: closureEvidence({ sanitizedClosureReference: "alterado" }),
      lessonsLearnedEvidence: lessonsEvidence(original),
    }),
    /Hash canônico da evidência da Fase 27/,
  );
});

test("Fase 28 exige todas as confirmações factuais", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: false }) }),
      new RegExp(field),
    );
  }
});

test("Fase 28 exige todos os campos textuais", () => {
  for (const field of contract.requiredStringFields) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: "" }) }),
    );
  }
});

test("Fase 28 exige identificadores diferentes para a nova baseline", () => {
  assert.throws(
    () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), {
      proposedBaselineIdentifier: "atlas-one-v3000-baseline-anterior",
    }) }),
    /identificador diferente/,
  );
});

test("Fase 28 exige exatamente diretor, gerente e corretor", () => {
  for (const rolesReviewed of [
    ["DIRETOR", "GERENTE"],
    ["DIRETOR", "GERENTE", "CORRETOR", "ADMIN"],
    ["DIRETOR", "GERENTE", "GERENTE"],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { rolesReviewed }) }),
      /papéis revisados|duplicados/,
    );
  }
});

test("Fase 28 exige as cinco categorias, todas positivas e somadas", () => {
  assert.throws(
    () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), {
      lessonCategoryCounts: { journey: 1, operations: 1, support: 1, privacy: 1 },
    }) }),
    /categorias de lições/,
  );
  assert.throws(
    () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), {
      lessonCategoryCounts: { journey: 2, operations: 1, support: 1, privacy: 1, cost: 0 },
      acceptedLessonCount: 5,
    }) }),
    /categoria cost/,
  );
  assert.throws(
    () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), {
      acceptedLessonCount: 6,
    }) }),
    /Soma das categorias/,
  );
});

test("Fase 28 aplica mínimos de lições, ações e mudanças", () => {
  for (const [field, value, expected] of [
    ["acceptedLessonCount", 4, /no mínimo 5 lições/],
    ["actionItemCount", 0, /no mínimo 1 ação/],
    ["baselineChangeCount", 0, /no mínimo 1 mudança/],
  ]) {
    const overrides = { [field]: value };
    if (field === "acceptedLessonCount") {
      overrides.lessonCategoryCounts = { journey: 1, operations: 1, support: 1, privacy: 1, cost: 0 };
    }
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), overrides) }),
      expected,
    );
  }
});

test("Fase 28 preserva coorte e jornadas encerradas", () => {
  for (const [field, value, expected] of [
    ["acceptedUserCount", 6, /Usuários aceitos/],
    ["acceptedSuccessfulRequiredJourneys", 2, /Jornadas obrigatórias aceitas/],
    ["acceptedFailedRequiredJourneys", 1, /Falhas de jornadas obrigatórias aceitas/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 28 preserva disponibilidade, monitoramento e custo encerrados", () => {
  for (const [field, value, expected] of [
    ["acceptedAvailabilityPercent", 99.94, /Disponibilidade aceita/],
    ["acceptedMonitoringCoveragePercent", 99, /Monitoramento aceito/],
    ["acceptedObservedCostCents", 8501, /Custo observado aceito/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 28 mantém tolerância zero a incidentes e regressões", () => {
  for (const field of [
    "acceptedCriticalIncidents",
    "acceptedUnresolvedHighSeverityIncidents",
    "acceptedMaterialRegressions",
  ]) {
    const priorField = field.replace(/^accepted/, "");
    const normalizedPriorField = priorField.charAt(0).toLowerCase() + priorField.slice(1);
    assert.throws(
      () => evaluate({
        closureResult: closureResult({ [normalizedPriorField]: 1 }),
        lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: 1 }),
      }),
      /tolerância|regressão material/,
    );
  }
});

test("Fase 28 rejeita efeitos colaterais, segredos e dados pessoais", () => {
  for (const [field, value, expected] of [
    ["databaseMigrationsByGate", 1, /Migrations executadas/],
    ["bootstrapExecutionsByGate", 1, /Execuções de bootstrap/],
    ["businessDataMutationsByGate", 1, /Mutações comerciais/],
    ["usersProvisionedByGate", 1, /Usuários provisionados/],
    ["secretValuesRecorded", true, /Registro de segredos/],
    ["containsPersonalData", true, /Dados pessoais/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 28 exige decisor e testemunha independentes", () => {
  for (const [field, value, expected] of [
    ["reviewDecidedBy", "responsavel-encerramento-fase-27", /decisor da baseline/],
    ["witnessedBy", "responsavel-baseline-fase-28", /testemunha da baseline/],
    ["witnessedBy", "testemunha-independente-fase-27", /testemunha da baseline/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 28 exige cronologia e revisão mínima de vinte minutos", () => {
  for (const [field, value, expected] of [
    ["reviewStartedAt", "2026-08-09T12:49:00-03:00", /não pode começar antes/],
    ["reviewCompletedAt", "2026-08-09T13:10:00-03:00", /no mínimo 20 minutos/],
    ["recordedAt", "2026-08-09T13:20:00-03:00", /não pode anteceder/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedEvidence: lessonsEvidence(closureEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 28 reprova contrato enfraquecido", () => {
  for (const mutate of [
    (copy) => { copy.requiredChecks.pop(); },
    (copy) => { copy.requiredStringFields.pop(); },
    (copy) => { copy.requiredRoles = ["DIRETOR"]; },
    (copy) => { copy.requiredLessonCategories = ["journey"]; },
    (copy) => { copy.minimumReviewDurationMinutes = 19; },
    (copy) => { copy.automaticBaselineMutationAllowed = true; },
  ]) {
    const unsafe = structuredClone(contract);
    mutate(unsafe);
    assert.throws(
      () => evaluate({ contract: unsafe }),
      /contrato|obrigatóri|Duração mínima|Mutação automática/,
    );
  }
});

test("Fase 28 reprova identidade divergente do artefato", () => {
  assert.throws(
    () => evaluate({ closureResult: closureResult({ sha256: "outro" }) }),
    /SHA-256 da release/,
  );
});

test("Fase 28 interpreta argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
