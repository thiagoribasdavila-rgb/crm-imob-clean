import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateBaselineVerification,
} from "../../scripts/check-v3000-phase-29-baseline-verification.mjs";

const sha256 = "sha256-verificacao-baseline";
const sourceFingerprint = "sha256:fingerprint-verificacao-baseline";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-29-baseline-verification.json", import.meta.url),
    "utf8",
  ),
);

function baselineResult(overrides = {}) {
  return {
    phase: 28,
    ok: true,
    lessonsLearnedBaselineStatus: "lessons-learned-baseline-committed",
    baselineVerificationRequired: true,
    baselineCommittedAsEvidenceOnly: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    previousBaselineIdentifier: "atlas-one-v3000-baseline-anterior",
    proposedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    sanitizedLessonsSummaryReference: "licoes-sanitizadas-fase-28",
    sanitizedBaselineChangeSetReference: "baseline-documental-sanitizada-fase-28",
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
    rolesReviewed: ["DIRETOR", "GERENTE", "CORRETOR"],
    acceptedUserCount: 5,
    acceptedSuccessfulRequiredJourneys: 3,
    acceptedFailedRequiredJourneys: 0,
    acceptedAvailabilityPercent: 99.95,
    acceptedMonitoringCoveragePercent: 100,
    acceptedCriticalIncidents: 0,
    acceptedUnresolvedHighSeverityIncidents: 0,
    acceptedMaterialRegressions: 0,
    acceptedObservedCostCents: 8500,
    reviewDecidedBy: "responsavel-baseline-fase-28",
    witnessedBy: "testemunha-independente-fase-28",
    reviewCompletedAt: "2026-08-09T13:25:00-03:00",
    ...overrides,
  };
}

function lessonsEvidence(overrides = {}) {
  return {
    phase: 28,
    status: "approved",
    decision: "commit-lessons-learned-baseline",
    releaseIdentifier: "atlas-one-v3000-candidate",
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    proposedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    recordedAt: "2026-08-09T13:30:00-03:00",
    ...overrides,
  };
}

function verificationEvidence(previousEvidence = lessonsEvidence(), overrides = {}) {
  return {
    phase: 29,
    status: "verified",
    decision: "verify-lessons-learned-baseline",
    verificationDecisionRole: "DIRETOR",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    lessonsLearnedEvidenceSha256: canonicalEvidenceSha256(previousEvidence),
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    previousBaselineIdentifier: "atlas-one-v3000-baseline-anterior",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    sanitizedLessonsSummaryReference: "licoes-sanitizadas-fase-28",
    sanitizedBaselineChangeSetReference: "baseline-documental-sanitizada-fase-28",
    manualBaselineVerificationConfirmed: true,
    lessonsLearnedEvidenceReviewed: true,
    evidenceChainReviewed: true,
    sameArtifactConfirmed: true,
    sameReleaseReferenceConfirmed: true,
    sameCycleReferenceConfirmed: true,
    previousBaselineReferenceConfirmed: true,
    proposedBaselineReferenceConfirmed: true,
    lessonsSummaryReferenceConfirmed: true,
    baselineChangeSetReferenceConfirmed: true,
    roleCoverageConfirmed: true,
    lessonCategoryCoverageConfirmed: true,
    actionOwnershipConfirmed: true,
    cohortMetricsConfirmed: true,
    journeyMetricsConfirmed: true,
    operationalMetricsConfirmed: true,
    costMetricsConfirmed: true,
    incidentStatusConfirmed: true,
    regressionStatusConfirmed: true,
    documentaryOnlyBaselineConfirmed: true,
    rollbackReadinessPreserved: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    noMaterialRegressionDetected: true,
    noBaselineMutationPerformed: true,
    noAutomaticDeploymentPerformed: true,
    noAutomaticPlanningPerformed: true,
    noAutomaticExecutionPerformed: true,
    rolesVerified: ["DIRETOR", "GERENTE", "CORRETOR"],
    verifiedLessonCount: 5,
    lessonCategoryCounts: {
      journey: 1,
      operations: 1,
      support: 1,
      privacy: 1,
      cost: 1,
    },
    verifiedActionItemCount: 3,
    verifiedBaselineChangeCount: 2,
    verifiedUserCount: 5,
    verifiedSuccessfulRequiredJourneys: 3,
    verifiedFailedRequiredJourneys: 0,
    verifiedAvailabilityPercent: 99.95,
    verifiedMonitoringCoveragePercent: 100,
    verifiedCriticalIncidents: 0,
    verifiedUnresolvedHighSeverityIncidents: 0,
    verifiedMaterialRegressions: 0,
    verifiedObservedCostCents: 8500,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    verificationDecidedBy: "responsavel-verificacao-fase-29",
    witnessedBy: "testemunha-independente-fase-29",
    verificationStartedAt: "2026-08-09T13:35:00-03:00",
    verificationCompletedAt: "2026-08-09T14:00:00-03:00",
    recordedAt: "2026-08-09T14:05:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const priorEvidence = Object.prototype.hasOwnProperty.call(input, "lessonsLearnedEvidence")
    ? input.lessonsLearnedEvidence
    : lessonsEvidence();
  const evidence = Object.prototype.hasOwnProperty.call(input, "baselineVerificationEvidence")
    ? input.baselineVerificationEvidence
    : verificationEvidence(priorEvidence ?? lessonsEvidence());
  return evaluateBaselineVerification({
    baselineResult: baselineResult(),
    lessonsLearnedEvidence: priorEvidence,
    baselineVerificationEvidence: evidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 29 preserva estados pendentes da cadeia", () => {
  for (const status of ["awaiting-next-cycle-closure-review", "awaiting-lessons-learned-review"]) {
    const result = evaluate({
      baselineResult: baselineResult({ lessonsLearnedBaselineStatus: status }),
      lessonsLearnedEvidence: null,
      baselineVerificationEvidence: null,
    });
    assert.equal(result.baselineVerificationStatus, status);
    assert.equal(result.baselineVerified, false);
  }
});

test("Fase 29 aguarda evidência independente", () => {
  const result = evaluate({ baselineVerificationEvidence: null });
  assert.equal(result.baselineVerificationStatus, "awaiting-baseline-verification");
  assert.equal(result.baselineVerificationRequired, true);
  assert.equal(result.nextCyclePlanningAuthorized, false);
});

test("Fase 29 verifica a baseline sem mutação ou autorização automática", () => {
  const result = evaluate();
  assert.equal(result.baselineVerificationStatus, "lessons-learned-baseline-verified");
  assert.equal(result.baselineVerificationEvidenceVerified, true);
  assert.equal(result.manualBaselineVerificationVerified, true);
  assert.equal(result.baselineVerified, true);
  assert.equal(result.baselineCommittedAsEvidenceOnly, true);
  assert.equal(result.baselineMutationPerformedByGate, false);
  assert.equal(result.baselineVerificationRequired, false);
  assert.equal(result.nextCyclePlanningReviewRequired, true);
  assert.equal(result.nextCyclePlanningAuthorized, false);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticNextCyclePlanningAllowed, false);
  assert.equal(result.automaticExecutionAllowed, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 29 exige solicitação e natureza documental da Fase 28", () => {
  assert.throws(
    () => evaluate({ baselineResult: baselineResult({ baselineVerificationRequired: false }) }),
    /Verificação independente exigida/,
  );
  assert.throws(
    () => evaluate({ baselineResult: baselineResult({ baselineCommittedAsEvidenceOnly: false }) }),
    /Baseline documental/,
  );
});

test("Fase 29 exige evidência factual da Fase 28", () => {
  assert.throws(
    () => evaluate({ lessonsLearnedEvidence: null }),
    /evidência da Fase 28 é obrigatória/,
  );
});

test("Fase 29 exige fase, status, decisão e papel exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 28, /Fase da evidência/],
    ["status", "approved", /Status da verificação/],
    ["decision", "review", /Decisão da verificação/],
    ["verificationDecisionRole", "ADMIN", /Papel da decisão/],
  ]) {
    assert.throws(
      () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 29 exige identidade imutável do artefato, release, origem e ciclo", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da verificação/],
    ["sourceFingerprint", "outro", /Fingerprint da verificação/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da verificação/],
    ["cycleIdentifier", "outro", /Identificador do ciclo/],
  ]) {
    assert.throws(
      () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 29 recalcula o hash canônico da evidência anterior", () => {
  assert.throws(
    () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { lessonsLearnedEvidenceSha256: "outro" }) }),
    /Hash canônico/,
  );
});

test("Fase 29 exige referências exatas da baseline", () => {
  for (const [field, value, expected] of [
    ["previousBaselineIdentifier", "outra", /baseline anterior/],
    ["verifiedBaselineIdentifier", "outra", /baseline verificada/],
    ["sanitizedLessonsSummaryReference", "outra", /lições/],
    ["sanitizedBaselineChangeSetReference", "outra", /mudanças/],
  ]) {
    assert.throws(
      () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 29 exige todas as confirmações e referências textuais", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { [field]: false }) }),
    );
  }
  for (const field of contract.requiredStringFields) {
    assert.throws(
      () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { [field]: "" }) }),
    );
  }
});

test("Fase 29 exige cobertura exata de papéis e categorias", () => {
  assert.throws(
    () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { rolesVerified: ["DIRETOR", "GERENTE"] }) }),
    /exatamente DIRETOR, GERENTE e CORRETOR/,
  );
  assert.throws(
    () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { lessonCategoryCounts: { journey: 5 } }) }),
    /cinco categorias/,
  );
  assert.throws(
    () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { lessonCategoryCounts: { journey: 2, operations: 1, support: 1, privacy: 1, cost: 0 } }) }),
    /Categoria journey divergente/,
  );
});

test("Fase 29 reconcilia contagens, jornadas, operação e custo", () => {
  for (const [field, value, expected] of [
    ["verifiedLessonCount", 6, /Lições verificadas/],
    ["verifiedActionItemCount", 4, /Ações verificadas/],
    ["verifiedBaselineChangeCount", 3, /Mudanças verificadas/],
    ["verifiedUserCount", 6, /Usuários verificados/],
    ["verifiedSuccessfulRequiredJourneys", 4, /Jornadas obrigatórias/],
    ["verifiedAvailabilityPercent", 99.9, /Disponibilidade verificada/],
    ["verifiedMonitoringCoveragePercent", 99, /Monitoramento verificado/],
    ["verifiedObservedCostCents", 8501, /Custo observado/],
  ]) {
    assert.throws(
      () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 29 mantém tolerância zero", () => {
  for (const [field, resultField, expected] of [
    ["verifiedFailedRequiredJourneys", "acceptedFailedRequiredJourneys", /falhas de jornadas/i],
    ["verifiedCriticalIncidents", "acceptedCriticalIncidents", /incidentes críticos/i],
    ["verifiedUnresolvedHighSeverityIncidents", "acceptedUnresolvedHighSeverityIncidents", /incidentes graves/i],
    ["verifiedMaterialRegressions", "acceptedMaterialRegressions", /regressões materiais/i],
  ]) {
    assert.throws(
      () => evaluate({
        baselineResult: baselineResult({ [resultField]: 1 }),
        baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { [field]: 1 }),
      }),
      expected,
    );
  }
});

test("Fase 29 rejeita efeitos colaterais, segredos e dados pessoais", () => {
  for (const [field, value, expected] of [
    ["databaseMigrationsByGate", 1, /Migrations/],
    ["bootstrapExecutionsByGate", 1, /bootstrap/],
    ["businessDataMutationsByGate", 1, /Mutações comerciais/],
    ["usersProvisionedByGate", 1, /Usuários provisionados/],
    ["secretValuesRecorded", true, /segredos/],
    ["containsPersonalData", true, /Dados pessoais/],
  ]) {
    assert.throws(
      () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 29 exige decisor e testemunha independentes", () => {
  for (const [field, value, expected] of [
    ["verificationDecidedBy", "responsavel-baseline-fase-28", /decisor.*independente/i],
    ["witnessedBy", "testemunha-independente-fase-28", /testemunha.*independente/i],
    ["witnessedBy", "responsavel-verificacao-fase-29", /testemunha.*independente/i],
  ]) {
    assert.throws(
      () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 29 exige cronologia e duração mínimas", () => {
  assert.throws(
    () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { verificationStartedAt: "2026-08-09T13:20:00-03:00" }) }),
    /antes da conclusão da Fase 28/,
  );
  assert.throws(
    () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { verificationCompletedAt: "2026-08-09T13:50:00-03:00" }) }),
    /no mínimo 20 minutos/,
  );
  assert.throws(
    () => evaluate({ baselineVerificationEvidence: verificationEvidence(lessonsEvidence(), { recordedAt: "2026-08-09T13:55:00-03:00" }) }),
    /não pode anteceder/,
  );
});

test("Fase 29 rejeita contrato enfraquecido", () => {
  assert.throws(
    () => evaluate({ contract: { ...contract, automaticNextCyclePlanningAllowed: true } }),
    /Planejamento automático divergente/,
  );
  assert.throws(
    () => evaluate({ contract: { ...contract, minimumVerificationDurationMinutes: 19 } }),
    /não pode ser inferior/,
  );
});

test("Fase 29 rejeita artefato diferente do contrato da Fase 11", () => {
  assert.throws(
    () => evaluate({ baselineResult: baselineResult({ sha256: "outro" }) }),
    /SHA-256 da release/,
  );
});

test("argument aceita formas separada e inline", () => {
  assert.equal(argument(["--proof", "arquivo.json"], "--proof"), "arquivo.json");
  assert.equal(argument(["--proof=arquivo.json"], "--proof"), "arquivo.json");
  assert.equal(argument([], "--proof"), null);
});
