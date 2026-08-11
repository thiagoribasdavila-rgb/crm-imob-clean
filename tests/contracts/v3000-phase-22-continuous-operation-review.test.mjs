import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateContinuousOperationReview,
} from "../../scripts/check-v3000-phase-22-continuous-operation-review.mjs";

const sha256 = "sha256-revisao-operacao-continua";
const sourceFingerprint = "sha256:fingerprint-revisao-operacao-continua";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-22-continuous-operation-review.json", import.meta.url),
    "utf8",
  ),
);

function phase21Evidence(overrides = {}) {
  return {
    phase: 21,
    status: "approved",
    candidateSha256: sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    observedUserCount: 8,
    rolesObserved: ["DIRETOR", "GERENTE", "CORRETOR"],
    userAccessValidatedCount: 8,
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    availabilityPercent: 99.9,
    monitoringCoveragePercent: 100,
    dailyReviewsCompleted: 3,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    validationOwner: "responsavel-validacao",
    rollbackOwner: "responsavel-rollback",
    observedWindowStart: "2026-08-12T14:00:00-03:00",
    observedWindowEnd: "2026-08-15T14:00:00-03:00",
    reviewedAt: "2026-08-15T14:15:00-03:00",
    ...overrides,
  };
}

function validation(overrides = {}) {
  return {
    phase: 21,
    ok: true,
    sustainedOperationValidationStatus: "sustained-operation-validated",
    sustainedOperationValidated: true,
    continuousOperationReviewEligible: true,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    observedUserCount: 8,
    rolesObserved: ["DIRETOR", "GERENTE", "CORRETOR"],
    userAccessValidatedCount: 8,
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    availabilityPercent: 99.9,
    monitoringCoveragePercent: 100,
    dailyReviewsCompleted: 3,
    validationOwner: "responsavel-validacao",
    rollbackOwner: "responsavel-rollback",
    observedWindowStart: "2026-08-12T14:00:00-03:00",
    observedWindowEnd: "2026-08-15T14:00:00-03:00",
    reviewedAt: "2026-08-15T14:15:00-03:00",
    ...overrides,
  };
}

function evidence(previousEvidence = phase21Evidence(), overrides = {}) {
  return {
    phase: 22,
    status: "approved",
    decision: "close-validated-window",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    sustainedOperationValidationEvidenceSha256:
      canonicalEvidenceSha256(previousEvidence),
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
    reviewedUserCount: 8,
    userAccessValidatedCount: 8,
    rolesReviewed: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    failedRequiredJourneys: 0,
    availabilityPercent: 99.9,
    monitoringCoveragePercent: 100,
    dailyReviewsCompleted: 3,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    decisionOwner: "responsavel-diretoria",
    sanitizedDecisionReference: "decisao-sanitizada-022",
    validatedWindowStart: "2026-08-12T14:00:00-03:00",
    validatedWindowEnd: "2026-08-15T14:00:00-03:00",
    phase21ReviewedAt: "2026-08-15T14:15:00-03:00",
    decidedAt: "2026-08-15T15:00:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previousEvidence = input.sustainedOperationValidationEvidence ?? phase21Evidence();
  return evaluateContinuousOperationReview({
    validationResult: validation(),
    sustainedOperationValidationEvidence: previousEvidence,
    continuousOperationReviewEvidence: evidence(previousEvidence),
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 22 aguarda a validação da operação sustentada", () => {
  const result = evaluate({
    validationResult: validation({ sustainedOperationValidated: false }),
    sustainedOperationValidationEvidence: null,
    continuousOperationReviewEvidence: null,
  });
  assert.equal(
    result.continuousOperationReviewStatus,
    "awaiting-sustained-operation-validation",
  );
  assert.equal(result.continuousOperationReviewApproved, false);
});

test("Fase 22 aguarda a decisão humana depois da Fase 21", () => {
  const result = evaluate({ continuousOperationReviewEvidence: null });
  assert.equal(
    result.continuousOperationReviewStatus,
    "awaiting-continuous-operation-review",
  );
  assert.equal(result.nextCyclePlanningEligible, false);
});

test("Fase 22 encerra somente a janela validada sem executar produção", () => {
  const result = evaluate();
  assert.equal(
    result.continuousOperationReviewStatus,
    "continuous-operation-review-approved",
  );
  assert.equal(result.continuousOperationReviewApproved, true);
  assert.equal(result.validatedWindowClosed, true);
  assert.equal(result.nextCyclePlanningEligible, true);
  assert.equal(result.continuousOperationAutomaticallyAuthorized, false);
  assert.equal(result.automaticExpansionAllowed, false);
  assert.equal(result.automaticRollbackAllowed, false);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 22 exige a evidência da Fase 21 quando há uma decisão", () => {
  assert.throws(
    () => evaluate({ sustainedOperationValidationEvidence: null }),
    /evidência da Fase 21 é obrigatória/,
  );
});

test("Fase 22 exige identidade exata do artefato e da release", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da revisão/],
    ["sourceFingerprint", "outro", /Fingerprint da revisão/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da revisão/],
  ]) {
    assert.throws(
      () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 22 vincula a decisão ao hash canônico da evidência anterior", () => {
  const previousEvidence = phase21Evidence();
  assert.throws(
    () => evaluate({
      sustainedOperationValidationEvidence: phase21Evidence({ dailyReviewsCompleted: 4 }),
      continuousOperationReviewEvidence: evidence(previousEvidence),
    }),
    /Hash canônico da evidência da Fase 21/,
  );
});

test("hash canônico independe da ordem das chaves, mas detecta conteúdo alterado", () => {
  const first = { z: 1, a: { c: 3, b: 2 } };
  const reordered = { a: { b: 2, c: 3 }, z: 1 };
  const changed = { a: { b: 2, c: 4 }, z: 1 };
  assert.equal(canonicalEvidenceSha256(first), canonicalEvidenceSha256(reordered));
  assert.notEqual(canonicalEvidenceSha256(first), canonicalEvidenceSha256(changed));
});

test("Fase 22 exige todas as confirmações humanas", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { [field]: false }) }),
      new RegExp(field),
    );
  }
});

test("Fase 22 preserva exatamente coorte e cobertura de acesso", () => {
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { reviewedUserCount: 7 }) }),
    /Coorte revisada/,
  );
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { userAccessValidatedCount: 7 }) }),
    /Cobertura de acessos revisada/,
  );
});

test("Fase 22 preserva exatamente os papéis validados", () => {
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { rolesReviewed: ["DIRETOR", "GERENTE"] }) }),
    /somente os papéis validados/,
  );
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { rolesReviewed: ["DIRETOR", "GERENTE", "ADMIN"] }) }),
    /CORRETOR/,
  );
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { rolesReviewed: ["DIRETOR", "GERENTE", "GERENTE"] }) }),
    /duplicados/,
  );
});

test("Fase 22 exige as mesmas métricas operacionais da Fase 21", () => {
  for (const [field, value, expected] of [
    ["successfulRequiredJourneys", 4, /Jornadas obrigatórias concluídas/],
    ["availabilityPercent", 99.8, /Disponibilidade revisada/],
    ["monitoringCoveragePercent", 99, /Cobertura de monitoramento revisada/],
    ["dailyReviewsCompleted", 2, /Revisões diárias revisadas/],
  ]) {
    assert.throws(
      () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 22 rejeita falhas e incidentes", () => {
  for (const [field, value, expected] of [
    ["failedRequiredJourneys", 1, /Falhas em jornadas obrigatórias/],
    ["criticalIncidents", 1, /Incidentes críticos/],
    ["unresolvedHighSeverityIncidents", 1, /Incidentes graves não resolvidos/],
  ]) {
    assert.throws(
      () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 22 rejeita qualquer ação de banco, bootstrap ou usuários", () => {
  for (const field of [
    "databaseMigrationsByGate",
    "bootstrapExecutionsByGate",
    "businessDataMutationsByGate",
    "usersProvisionedByGate",
  ]) {
    assert.throws(
      () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { [field]: 1 }) }),
      /divergente/,
    );
  }
});

test("Fase 22 rejeita segredos e dados pessoais na evidência", () => {
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { secretValuesRecorded: true }) }),
    /Registro de segredos/,
  );
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { containsPersonalData: true }) }),
    /Dados pessoais na evidência/,
  );
});

test("Fase 22 exige exatamente a janela e a revisão da Fase 21", () => {
  for (const [field, value, expected] of [
    ["validatedWindowStart", "2026-08-12T15:00:00-03:00", /Início da janela validada/],
    ["validatedWindowEnd", "2026-08-15T15:00:00-03:00", /Fim da janela validada/],
    ["phase21ReviewedAt", "2026-08-15T14:16:00-03:00", /Revisão registrada na Fase 21/],
  ]) {
    assert.throws(
      () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 22 exige responsável independente da validação e do rollback", () => {
  for (const decisionOwner of ["responsavel-validacao", "responsavel-rollback"]) {
    assert.throws(
      () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { decisionOwner }) }),
      /deve ser independente/,
    );
  }
});

test("Fase 22 rejeita decisão anterior à revisão da Fase 21", () => {
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { decidedAt: "2026-08-15T14:14:59-03:00" }) }),
    /não pode ocorrer antes/,
  );
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { decidedAt: "inválido" }) }),
    /decidedAt inválido/,
  );
});

test("Fase 22 aceita somente o status e a decisão contratuais", () => {
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { status: "pending" }) }),
    /Status da revisão/,
  );
  assert.throws(
    () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { decision: "continue-forever" }) }),
    /Decisão da revisão/,
  );
});

test("Fase 22 exige referências textuais sanitizadas", () => {
  for (const field of contract.requiredStringFields) {
    assert.throws(
      () => evaluate({ continuousOperationReviewEvidence: evidence(phase21Evidence(), { [field]: "" }) }),
      field === "releaseIdentifier"
        ? /Identificador da release/
        : field === "sustainedOperationValidationEvidenceSha256"
          ? /Hash canônico da evidência da Fase 21/
          : new RegExp(field),
    );
  }
});

test("parser aceita argumentos separados e inline", () => {
  assert.equal(argument(["--zip", "arquivo.zip"], "--zip"), "arquivo.zip");
  assert.equal(argument(["--zip=arquivo.zip"], "--zip"), "arquivo.zip");
  assert.equal(argument([], "--zip"), null);
});
