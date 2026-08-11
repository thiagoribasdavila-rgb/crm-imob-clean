import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  evaluateBaselineBackedImprovementProposalReview,
} from "../../scripts/check-v3000-phase-36-baseline-backed-improvement-proposal-review.mjs";
import { canonicalEvidenceSha256 } from "../../scripts/check-v3000-phase-35-baseline-backed-lessons-learned-review.mjs";

const sha256 = "sha256-propostas-priorizadas";
const sourceFingerprint = "sha256:fingerprint-propostas-priorizadas";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL(
      "../../config/v3000-phase-36-baseline-backed-improvement-proposal-review.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function phase35Evidence(overrides = {}) {
  return {
    phase: 35,
    status: "approved",
    decision: "accept-sanitized-cycle-lessons-for-improvement-proposal-review",
    candidateSha256: sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    lessonsReviewIdentifier: "revisao-licoes-ciclo-2026-08-16",
    improvementProposalCount: 3,
    recordedAt: "2026-08-10T13:05:00-03:00",
    ...overrides,
  };
}

function lessonsResult(overrides = {}) {
  return {
    phase: 35,
    ok: true,
    lessonsLearnedReviewStatus: "baseline-backed-cycle-lessons-reviewed",
    cycleClosureEvidenceVerified: true,
    lessonsLearnedEvidenceVerified: true,
    manualLessonsLearnedReviewVerified: true,
    lessonsLearnedReviewRequired: false,
    lessonsLearnedReviewCompleted: true,
    improvementProposalReviewRequired: true,
    improvementProposalReviewStarted: false,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticImprovementProposalReviewAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticCycleActivationAllowed: false,
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
    lessonsReviewIdentifier: "revisao-licoes-ciclo-2026-08-16",
    improvementProposalCount: 3,
    recordedAt: "2026-08-10T13:05:00-03:00",
    ...overrides,
  };
}

function proposalEvidence(previous = phase35Evidence(), overrides = {}) {
  const checks = Object.fromEntries(contract.requiredChecks.map((field) => [field, true]));
  return {
    phase: 36,
    status: "approved",
    decision: "accept-prioritized-improvement-proposals-for-planning-review",
    reviewDecisionRole: "DIRETOR",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    lessonsReviewEvidenceSha256: canonicalEvidenceSha256(previous),
    sourceCycleIdentifier: "ciclo-controlado-2026-08-09",
    cycleIdentifier: "ciclo-controlado-2026-08-16",
    verifiedBaselineIdentifier: "atlas-one-v3000-baseline-fase-28",
    lessonsReviewIdentifier: "revisao-licoes-ciclo-2026-08-16",
    proposalReviewIdentifier: "revisao-propostas-ciclo-2026-08-16",
    prioritizedImprovementBacklogReference: "backlog-priorizado-2026-08-16",
    ...checks,
    reviewedProposalCount: 3,
    acceptedProposalCount: 2,
    deferredProposalCount: 1,
    rejectedProposalCount: 0,
    evidenceBackedProposalCount: 3,
    priorityCounts: { P0: 0, P1: 1, P2: 1, P3: 0 },
    assignedAcceptedProposalCount: 2,
    acceptedProposalsWithDueDateCount: 2,
    acceptedProposalsWithAcceptanceCriteriaCount: 2,
    dependencyAssessmentCount: 3,
    unsubstantiatedProposalCount: 0,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    reviewDecidedBy: "diretor-revisao-fase-36",
    witnessedBy: "testemunha-revisao-fase-36",
    reviewStartedAt: "2026-08-10T13:10:00-03:00",
    reviewCompletedAt: "2026-08-10T13:35:00-03:00",
    recordedAt: "2026-08-10T13:40:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previous = Object.hasOwn(input, "lessonsLearnedReviewEvidence")
    ? input.lessonsLearnedReviewEvidence
    : phase35Evidence();
  const evidence = Object.hasOwn(input, "proposalReviewEvidence")
    ? input.proposalReviewEvidence
    : proposalEvidence(previous ?? phase35Evidence());
  return evaluateBaselineBackedImprovementProposalReview({
    lessonsLearnedReviewResult: lessonsResult(),
    lessonsLearnedReviewEvidence: previous,
    proposalReviewEvidence: evidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 36 preserva estados pendentes da cadeia", () => {
  const result = evaluate({
    lessonsLearnedReviewResult: lessonsResult({
      lessonsLearnedReviewStatus: "awaiting-baseline-backed-lessons-learned-review-evidence",
    }),
    lessonsLearnedReviewEvidence: null,
    proposalReviewEvidence: null,
  });
  assert.equal(
    result.improvementProposalReviewStatus,
    "awaiting-baseline-backed-lessons-learned-review-evidence",
  );
  assert.equal(result.improvementProposalReviewCompleted, false);
});

test("Fase 36 aguarda evidência sem planejar ou executar", () => {
  const result = evaluate({ proposalReviewEvidence: null });
  assert.equal(
    result.improvementProposalReviewStatus,
    "awaiting-baseline-backed-improvement-proposal-review-evidence",
  );
  assert.equal(result.automaticImprovementPlanningAllowed, false);
  assert.equal(result.databaseMutationsByGate, 0);
});

test("Fase 36 prioriza propostas e abre somente revisão de planejamento", () => {
  const result = evaluate();
  assert.equal(
    result.improvementProposalReviewStatus,
    "baseline-backed-improvement-proposals-reviewed",
  );
  assert.equal(result.proposalReviewEvidenceVerified, true);
  assert.equal(result.manualImprovementProposalReviewVerified, true);
  assert.equal(result.improvementProposalReviewCompleted, true);
  assert.equal(result.improvementPlanningReviewRequired, true);
  assert.equal(result.improvementPlanningReviewStarted, false);
  assert.equal(result.nextCyclePlanningAuthorized, false);
  assert.equal(result.durationMinutes, 25);
  assert.equal(result.acceptedProposalCount, 2);
});

test("Fase 36 exige o resultado seguro da Fase 35", () => {
  for (const [field, value, expected] of [
    ["cycleClosureEvidenceVerified", false, /Encerramento verificado/],
    ["lessonsLearnedEvidenceVerified", false, /Lições verificadas/],
    ["manualLessonsLearnedReviewVerified", false, /Revisão manual/],
    ["lessonsLearnedReviewRequired", true, /Revisão de lições pendente/],
    ["lessonsLearnedReviewCompleted", false, /Revisão de lições concluída/],
    ["improvementProposalReviewRequired", false, /Revisão de propostas exigida/],
    ["improvementProposalReviewStarted", true, /Revisão iniciada/],
    ["nextCyclePlanningAuthorized", true, /Planejamento autorizado/],
    ["automaticProductionActionAllowed", true, /Ação automática/],
    ["automaticImprovementProposalReviewAllowed", true, /Revisão automática/],
    ["automaticNextCyclePlanningAllowed", true, /Planejamento automático/],
    ["automaticBaselineMutationAllowed", true, /Mutação automática/],
    ["automaticCycleActivationAllowed", true, /Ativação automática/],
    ["automaticExecutionAllowed", true, /Execução automática/],
    ["automaticExpansionAllowed", true, /Expansão automática/],
    ["automaticRollbackAllowed", true, /Rollback automático/],
    ["deploymentPerformedByGate", true, /Deploy pela Fase 35/],
    ["databaseMutationsByGate", 1, /Mutações de banco pela Fase 35/],
  ]) {
    assert.throws(
      () => evaluate({ lessonsLearnedReviewResult: lessonsResult({ [field]: value }) }),
      expected,
    );
  }
});

test("Fase 36 exige a evidência factual da Fase 35", () => {
  assert.throws(
    () => evaluate({ lessonsLearnedReviewEvidence: null }),
    /evidência da Fase 35 é obrigatória/,
  );
});

test("Fase 36 exige fase, status, decisão e papel exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 35, /Fase da evidência/],
    ["status", "draft", /Status da revisão/],
    ["decision", "review", /Decisão da revisão/],
    ["reviewDecisionRole", "GERENTE", /Papel decisor/],
  ]) {
    assert.throws(
      () => evaluate({ proposalReviewEvidence: proposalEvidence(phase35Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 36 preserva artefato, release e origem", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da revisão/],
    ["sourceFingerprint", "outro", /Fingerprint da revisão/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da revisão/],
  ]) {
    assert.throws(
      () => evaluate({ proposalReviewEvidence: proposalEvidence(phase35Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 36 encadeia o hash canônico da Fase 35", () => {
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        lessonsReviewEvidenceSha256: "hash-adulterado",
      }),
    }),
    /Hash canônico/,
  );
});

test("Fase 36 preserva ciclos, baseline e revisão de lições", () => {
  for (const field of [
    "sourceCycleIdentifier",
    "cycleIdentifier",
    "verifiedBaselineIdentifier",
    "lessonsReviewIdentifier",
  ]) {
    assert.throws(
      () => evaluate({ proposalReviewEvidence: proposalEvidence(phase35Evidence(), { [field]: "outro" }) }),
      new RegExp(field),
    );
  }
});

test("Fase 36 exige todas as confirmações e referências", () => {
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        businessImpactAssessed: false,
      }),
    }),
    /businessImpactAssessed/,
  );
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        prioritizedImprovementBacklogReference: "",
      }),
    }),
    /prioritizedImprovementBacklogReference/,
  );
});

test("Fase 36 exige revisar e classificar todas as propostas", () => {
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        reviewedProposalCount: 2,
      }),
    }),
    /Propostas revisadas/,
  );
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        deferredProposalCount: 0,
      }),
    }),
    /Classificação das propostas/,
  );
});

test("Fase 36 exige ao menos uma proposta aceita", () => {
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        acceptedProposalCount: 0,
        deferredProposalCount: 3,
        assignedAcceptedProposalCount: 0,
        acceptedProposalsWithDueDateCount: 0,
        acceptedProposalsWithAcceptanceCriteriaCount: 0,
        priorityCounts: { P0: 0, P1: 0, P2: 0, P3: 0 },
      }),
    }),
    /aceitar ao menos uma proposta/,
  );
});

test("Fase 36 exige evidência, responsável, prazo, aceite e dependências", () => {
  for (const [field, value, expected] of [
    ["evidenceBackedProposalCount", 2, /sustentadas por evidência/],
    ["assignedAcceptedProposalCount", 1, /com responsável/],
    ["acceptedProposalsWithDueDateCount", 1, /com prazo/],
    ["acceptedProposalsWithAcceptanceCriteriaCount", 1, /critério de aceite/],
    ["dependencyAssessmentCount", 2, /dependências avaliadas/],
    ["unsubstantiatedProposalCount", 1, /sem evidência/],
  ]) {
    assert.throws(
      () => evaluate({ proposalReviewEvidence: proposalEvidence(phase35Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 36 exige prioridades exatas e compatíveis", () => {
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        priorityCounts: { P1: 1, P2: 1, P3: 0 },
      }),
    }),
    /exatamente P0, P1, P2 e P3/,
  );
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        priorityCounts: { P0: 0, P1: 1, P2: 0, P3: 0 },
      }),
    }),
    /Propostas aceitas priorizadas/,
  );
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        priorityCounts: { P0: 1, P1: 1, P2: 0, P3: 0 },
      }),
    }),
    /P0 exige tratamento/,
  );
});

test("Fase 36 não aceita efeitos colaterais, dados pessoais ou segredos", () => {
  for (const [field, value, expected] of [
    ["databaseMigrationsByGate", 1, /Migrations pelo gate/],
    ["bootstrapExecutionsByGate", 1, /Bootstraps pelo gate/],
    ["businessDataMutationsByGate", 1, /Mutações comerciais pelo gate/],
    ["usersProvisionedByGate", 1, /Usuários pelo gate/],
    ["secretValuesRecorded", true, /Registro de segredos/],
    ["containsPersonalData", true, /Dados pessoais na evidência/],
  ]) {
    assert.throws(
      () => evaluate({ proposalReviewEvidence: proposalEvidence(phase35Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 36 exige testemunha distinta", () => {
  assert.throws(
    () => evaluate({
      proposalReviewEvidence: proposalEvidence(phase35Evidence(), {
        witnessedBy: "diretor-revisao-fase-36",
      }),
    }),
    /testemunha deve ser distinta/,
  );
});

test("Fase 36 exige cronologia e duração mínimas", () => {
  for (const [field, value, expected] of [
    ["reviewStartedAt", "2026-08-10T13:00:00-03:00", /não pode começar antes/],
    ["reviewCompletedAt", "2026-08-10T13:09:00-03:00", /posterior ao início/],
    ["reviewCompletedAt", "2026-08-10T13:20:00-03:00", /no mínimo 20 minutos/],
    ["recordedAt", "2026-08-10T13:30:00-03:00", /não pode anteceder/],
  ]) {
    assert.throws(
      () => evaluate({ proposalReviewEvidence: proposalEvidence(phase35Evidence(), { [field]: value }) }),
      expected,
    );
  }
});

test("Fase 36 rejeita contrato enfraquecido", () => {
  for (const [field, value, expected] of [
    ["maximumP0Proposals", 1, /não pode aceitar proposta P0/],
    ["minimumReviewDurationMinutes", 10, /no mínimo 20 minutos/],
    ["automaticImprovementPlanningAllowed", true, /Planejamento automático/],
    ["databaseMutationAllowedByGate", true, /Mutação de banco/],
  ]) {
    assert.throws(
      () => evaluate({ contract: { ...contract, [field]: value } }),
      expected,
    );
  }
});

test("Fase 36 interpreta argumentos separados e inline", () => {
  assert.equal(argument(["--phase-36-evidence", "fase-36.json"], "--phase-36-evidence"), "fase-36.json");
  assert.equal(argument(["--phase-36-evidence=fase-36.json"], "--phase-36-evidence"), "fase-36.json");
  assert.equal(argument([], "--phase-36-evidence"), null);
});
