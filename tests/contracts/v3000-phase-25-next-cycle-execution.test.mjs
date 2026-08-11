import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  argument,
  canonicalEvidenceSha256,
  evaluateNextCycleExecution,
} from "../../scripts/check-v3000-phase-25-next-cycle-execution.mjs";

const sha256 = "sha256-execucao-proximo-ciclo";
const sourceFingerprint = "sha256:fingerprint-execucao-proximo-ciclo";
const phase11Contract = { candidate: { sha256, sourceFingerprint } };
const contract = JSON.parse(
  readFileSync(
    new URL("../../config/v3000-phase-25-next-cycle-execution.json", import.meta.url),
    "utf8",
  ),
);

function readinessResult(overrides = {}) {
  return {
    phase: 24,
    ok: true,
    nextCycleExecutionReviewStatus: "next-cycle-execution-authorized",
    nextCycleExecutionReviewApproved: true,
    manualNextCycleExecutionAuthorized: true,
    nextCycleExecutionEvidenceRequired: true,
    nextCycleExecutionPerformed: false,
    artifactVerified: true,
    sha256,
    sourceFingerprint,
    releaseIdentifier: "atlas-one-v3000-candidate",
    authorizedUserCount: 5,
    rolesAuthorized: ["DIRETOR", "GERENTE", "CORRETOR"],
    minimumSuccessfulRequiredJourneys: 3,
    maximumRequiredJourneyFailures: 0,
    minimumAvailabilityPercent: 99.9,
    minimumMonitoringCoveragePercent: 100,
    maximumCriticalIncidents: 0,
    maximumUnresolvedHighSeverityIncidents: 0,
    authorizedCostCeilingCents: 10000,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    executionReadinessOwner: "responsavel-prontidao-fase-24",
    authorizedBy: "responsavel-autorizacao-fase-24",
    authorizedWindowStart: "2026-08-09T09:00:00-03:00",
    authorizedWindowEnd: "2026-08-09T18:00:00-03:00",
    ...overrides,
  };
}

function readinessEvidence(overrides = {}) {
  return {
    phase: 24,
    status: "approved",
    decision: "authorize-next-cycle-execution",
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    sanitizedReadinessReference: "prontidao-sanitizada-fase-24",
    authorizedAt: "2026-08-08T14:00:00-03:00",
    ...overrides,
  };
}

function executionEvidence(previousEvidence = readinessEvidence(), overrides = {}) {
  return {
    phase: 25,
    status: "completed",
    decision: "confirm-next-cycle-execution",
    candidateSha256: sha256,
    sourceFingerprint,
    origin: contract.origin,
    releaseIdentifier: "atlas-one-v3000-candidate",
    nextCycleExecutionReadinessEvidenceSha256: canonicalEvidenceSha256(previousEvidence),
    manualExecutionConfirmed: true,
    authorizedReadinessPreserved: true,
    evidenceChainReviewed: true,
    sameReleaseReferenceConfirmed: true,
    approvedPlanFollowed: true,
    authorizedCohortPreserved: true,
    authorizedRoleScopePreserved: true,
    requiredJourneysCompleted: true,
    metricCollectionCompleted: true,
    availabilityThresholdMet: true,
    monitoringThresholdMet: true,
    monitoringActive: true,
    supportAvailable: true,
    rollbackStillReady: true,
    privacyPreserved: true,
    costCeilingRespected: true,
    changeFreezeRespected: true,
    noCriticalIncident: true,
    noUnresolvedHighSeverityIncident: true,
    noAutomaticDeploymentPerformed: true,
    noAutomaticExpansionPerformed: true,
    noAutomaticRollbackPerformed: true,
    executedUserCount: 5,
    rolesExecuted: ["DIRETOR", "GERENTE", "CORRETOR"],
    successfulRequiredJourneys: 3,
    requiredJourneyFailures: 0,
    observedAvailabilityPercent: 99.95,
    monitoringCoveragePercent: 100,
    criticalIncidents: 0,
    unresolvedHighSeverityIncidents: 0,
    observedCostCents: 8500,
    databaseMigrationsByGate: 0,
    bootstrapExecutionsByGate: 0,
    businessDataMutationsByGate: 0,
    usersProvisionedByGate: 0,
    secretValuesRecorded: false,
    containsPersonalData: false,
    cycleIdentifier: "ciclo-controlado-2026-08-09",
    executionOwner: "responsavel-execucao-fase-25",
    witnessedBy: "testemunha-independente-fase-25",
    sanitizedExecutionReference: "execucao-sanitizada-fase-25",
    executionStartedAt: "2026-08-09T10:00:00-03:00",
    executionCompletedAt: "2026-08-09T11:00:00-03:00",
    recordedAt: "2026-08-09T11:10:00-03:00",
    ...overrides,
  };
}

function evaluate(input = {}) {
  const previousEvidence = Object.prototype.hasOwnProperty.call(
    input,
    "nextCycleExecutionReadinessEvidence",
  )
    ? input.nextCycleExecutionReadinessEvidence
    : readinessEvidence();
  const defaultExecutionEvidence = previousEvidence
    ? executionEvidence(previousEvidence)
    : executionEvidence(readinessEvidence());
  return evaluateNextCycleExecution({
    readinessResult: readinessResult(),
    nextCycleExecutionReadinessEvidence: previousEvidence,
    nextCycleExecutionEvidence: defaultExecutionEvidence,
    contract,
    phase11Contract,
    ...input,
  });
}

test("Fase 25 aguarda o plano do próximo ciclo", () => {
  const result = evaluate({
    readinessResult: readinessResult({
      nextCycleExecutionReviewStatus: "awaiting-next-cycle-plan",
      manualNextCycleExecutionAuthorized: false,
    }),
    nextCycleExecutionReadinessEvidence: null,
    nextCycleExecutionEvidence: null,
  });
  assert.equal(result.nextCycleExecutionStatus, "awaiting-next-cycle-plan");
  assert.equal(result.nextCycleExecutionPerformed, false);
});

test("Fase 25 aguarda a autorização manual da Fase 24", () => {
  const result = evaluate({
    readinessResult: readinessResult({
      nextCycleExecutionReviewStatus: "awaiting-next-cycle-execution-review",
      manualNextCycleExecutionAuthorized: false,
    }),
    nextCycleExecutionReadinessEvidence: null,
    nextCycleExecutionEvidence: null,
  });
  assert.equal(result.nextCycleExecutionStatus, "awaiting-next-cycle-execution-authorization");
});

test("Fase 25 aguarda evidência factual da execução manual", () => {
  const result = evaluate({ nextCycleExecutionEvidence: null });
  assert.equal(result.nextCycleExecutionStatus, "awaiting-next-cycle-execution-evidence");
  assert.equal(result.nextCycleExecutionEvidenceVerified, false);
  assert.equal(result.nextCycleValidationRequired, false);
});

test("Fase 25 confirma a execução sem realizar ações externas pelo gate", () => {
  const result = evaluate();
  assert.equal(result.nextCycleExecutionStatus, "next-cycle-executed");
  assert.equal(result.nextCycleExecutionEvidenceVerified, true);
  assert.equal(result.manualNextCycleExecutionVerified, true);
  assert.equal(result.nextCycleExecutionPerformed, true);
  assert.equal(result.nextCycleValidationRequired, true);
  assert.equal(result.automaticProductionActionAllowed, false);
  assert.equal(result.automaticExpansionAllowed, false);
  assert.equal(result.automaticRollbackAllowed, false);
  assert.equal(result.deploymentPerformedByGate, false);
  assert.equal(result.usersProvisionedByGate, 0);
  assert.equal(result.databaseMutationsByGate, 0);
  assert.equal(result.secretValuesRecordedByGate, false);
});

test("Fase 25 exige a evidência da Fase 24 quando há execução", () => {
  assert.throws(
    () => evaluate({ nextCycleExecutionReadinessEvidence: null }),
    /evidência da Fase 24 é obrigatória/,
  );
});

test("Fase 25 exige fase, status e decisão exatos", () => {
  for (const [field, value, expected] of [
    ["phase", 24, /Fase da evidência/],
    ["status", "approved", /Status da execução/],
    ["decision", "execute", /Decisão da execução/],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: value }),
      }),
      expected,
    );
  }
});

test("Fase 25 exige identidade exata do artefato, release, origem e ciclo", () => {
  for (const [field, value, expected] of [
    ["candidateSha256", "outro", /SHA-256 da execução/],
    ["sourceFingerprint", "outro", /Fingerprint da execução/],
    ["releaseIdentifier", "outra", /Identificador da release/],
    ["origin", "https://exemplo.invalid", /Origem da execução/],
    ["cycleIdentifier", "outro-ciclo", /Identificador do ciclo/],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: value }),
      }),
      expected,
    );
  }
});

test("Fase 25 vincula a execução ao hash canônico da prontidão", () => {
  const original = readinessEvidence();
  assert.throws(
    () => evaluate({
      nextCycleExecutionReadinessEvidence: readinessEvidence({
        sanitizedReadinessReference: "prontidao-alterada",
      }),
      nextCycleExecutionEvidence: executionEvidence(original),
    }),
    /Hash canônico da evidência da Fase 24/,
  );
});

test("Fase 25 exige todas as confirmações factuais", () => {
  for (const field of contract.requiredChecks) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: false }),
      }),
      new RegExp(field),
    );
  }
});

test("Fase 25 exige todos os identificadores de auditoria", () => {
  for (const field of contract.requiredStringFields) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: "" }),
      }),
    );
  }
});

test("Fase 25 limita a execução à coorte autorizada", () => {
  for (const value of [0, 6, 2.5]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), {
          executedUserCount: value,
        }),
      }),
      /usuário|coorte|inteiro/,
    );
  }
});

test("Fase 25 preserva exatamente os papéis autorizados", () => {
  for (const rolesExecuted of [
    ["DIRETOR", "GERENTE"],
    ["DIRETOR", "GERENTE", "ADMIN"],
    ["DIRETOR", "GERENTE", "GERENTE"],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), { rolesExecuted }),
      }),
      /papéis|duplicados/,
    );
  }
});

test("Fase 25 reprova jornadas obrigatórias insuficientes", () => {
  assert.throws(
    () => evaluate({
      nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), {
        successfulRequiredJourneys: 2,
      }),
    }),
    /mínimo de jornadas obrigatórias/,
  );
});

test("Fase 25 mantém tolerância zero para falhas de jornada", () => {
  for (const value of [1, -1, 0.5]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), {
          requiredJourneyFailures: value,
        }),
      }),
      /falhas|inteiro/i,
    );
  }
});

test("Fase 25 exige disponibilidade dentro do limite autorizado", () => {
  for (const value of [99.8, 100.1, Number.NaN]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), {
          observedAvailabilityPercent: value,
        }),
      }),
      /Disponibilidade observada/,
    );
  }
});

test("Fase 25 exige cobertura de monitoramento dentro do limite autorizado", () => {
  for (const value of [99.9, 100.1, Number.NaN]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), {
          monitoringCoveragePercent: value,
        }),
      }),
      /Cobertura de monitoramento/,
    );
  }
});

test("Fase 25 reprova incidentes críticos ou graves não resolvidos", () => {
  for (const field of ["criticalIncidents", "unresolvedHighSeverityIncidents"]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: 1 }),
      }),
      /limite autorizado/,
    );
  }
});

test("Fase 25 reprova custo acima do teto autorizado", () => {
  assert.throws(
    () => evaluate({
      nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), {
        observedCostCents: 10001,
      }),
    }),
    /custo observado excedeu/,
  );
});

test("Fase 25 não aceita efeitos colaterais ou dados sensíveis do gate", () => {
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
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), { [field]: value }),
      }),
    );
  }
});

test("Fase 25 exige executor e testemunha independentes", () => {
  for (const overrides of [
    { executionOwner: "responsavel-prontidao-fase-24" },
    { executionOwner: "responsavel-autorizacao-fase-24" },
    {
      executionOwner: "responsavel-execucao-fase-25",
      witnessedBy: "responsavel-execucao-fase-25",
    },
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), overrides),
      }),
      /independente/,
    );
  }
});

test("Fase 25 exige execução integral dentro da janela autorizada", () => {
  for (const overrides of [
    { executionStartedAt: "2026-08-09T08:59:00-03:00" },
    { executionCompletedAt: "2026-08-09T18:01:00-03:00" },
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), overrides),
      }),
      /janela autorizada/,
    );
  }
});

test("Fase 25 exige duração mínima e registro posterior à execução", () => {
  for (const [overrides, expected] of [
    [
      { executionCompletedAt: "2026-08-09T10:20:00-03:00" },
      /no mínimo 30 minutos/,
    ],
    [
      { executionCompletedAt: "2026-08-09T09:59:00-03:00" },
      /posterior ao início/,
    ],
    [
      { recordedAt: "2026-08-09T10:59:00-03:00" },
      /não pode anteceder/,
    ],
  ]) {
    assert.throws(
      () => evaluate({
        nextCycleExecutionEvidence: executionEvidence(readinessEvidence(), overrides),
      }),
      expected,
    );
  }
});

test("Fase 25 reprova contrato que permita automação ou mutação", () => {
  for (const field of [
    "deploymentPerformedByGate",
    "databaseMutationAllowedByGate",
    "automaticUserProvisioningAllowed",
    "automaticNextCycleExecutionAllowed",
    "automaticExpansionAllowed",
    "automaticRollbackAllowed",
  ]) {
    assert.throws(
      () => evaluate({ contract: { ...contract, [field]: true } }),
      /divergente/,
    );
  }
});

test("argument aceita sintaxe separada e inline", () => {
  assert.equal(argument(["--zip", "release.zip"], "--zip"), "release.zip");
  assert.equal(argument(["--zip=release.zip"], "--zip"), "release.zip");
  assert.equal(argument([], "--zip"), null);
});
