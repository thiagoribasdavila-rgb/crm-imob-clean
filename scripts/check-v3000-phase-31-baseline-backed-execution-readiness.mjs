import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyBaselineBackedPlanning,
} from "./check-v3000-phase-30-baseline-backed-planning.mjs";

export { canonicalEvidenceSha256 };

const requiredChecks = [
  "independentReadinessReviewConfirmed",
  "baselineBackedPlanReviewed",
  "planningEvidenceReviewed",
  "evidenceChainReviewed",
  "sameArtifactConfirmed",
  "sameReleaseReferenceConfirmed",
  "verifiedBaselineReferenceConfirmed",
  "plannedCycleReferenceConfirmed",
  "sanitizedPlanReferenceConfirmed",
  "cohortWithinApprovedCeiling",
  "roleScopeConfirmed",
  "successMetricsConfirmed",
  "journeyTargetsConfirmed",
  "operationalTargetsConfirmed",
  "guardrailsConfirmed",
  "monitoringReady",
  "supportReady",
  "rollbackReady",
  "privacyReviewed",
  "riskReviewCompleted",
  "costCeilingConfirmed",
  "changeFreezeRespected",
  "manualExecutionRequired",
  "noProductionExecutionPerformed",
  "noDatabaseMutationRequested",
  "noUserProvisioningRequested",
  "noAutomaticDeploymentRequested",
  "noAutomaticExecutionRequested",
  "noAutomaticExpansionRequested",
  "noAutomaticRollbackRequested",
];

const requiredStringFields = [
  "releaseIdentifier",
  "baselineBackedPlanningEvidenceSha256",
  "sourceCycleIdentifier",
  "cycleIdentifier",
  "verifiedBaselineIdentifier",
  "sanitizedPlanReference",
  "sanitizedReadinessReference",
  "executionReadinessOwner",
  "authorizedBy",
  "witnessedBy",
  "planApprovedAt",
  "planRecordedAt",
  "reviewStartedAt",
  "reviewCompletedAt",
  "authorizedAt",
  "authorizedWindowStart",
  "authorizedWindowEnd",
  "recordedAt",
];

const requiredRoles = ["DIRETOR", "GERENTE", "CORRETOR"];

const contractSlugs = {
  11: "homologation",
  12: "installation-handoff",
  13: "release-closure",
  14: "operational-observation",
  15: "controlled-pilot",
  16: "pilot-validation",
  17: "controlled-expansion",
  18: "expansion-execution",
  19: "expanded-cohort-validation",
  20: "sustained-operation",
  21: "sustained-operation-validation",
  22: "continuous-operation-review",
  23: "next-cycle-planning",
  24: "next-cycle-execution-readiness",
  25: "next-cycle-execution",
  26: "next-cycle-validation",
  27: "next-cycle-closure",
  28: "lessons-learned-baseline",
  29: "baseline-verification",
  30: "baseline-backed-planning",
};

const defaults = {
  phase31Contract: "config/v3000-phase-31-baseline-backed-execution-readiness.json",
  handoff: "docs/evidence/V3000_PHASE_12_INSTALLATION_HANDOFF.json",
};
for (const [phase, slug] of Object.entries(contractSlugs)) {
  defaults[`phase${phase}Contract`] = `config/v3000-phase-${phase}-${slug}.json`;
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} não encontrado.`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} não contém JSON válido.`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} divergente.`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} é obrigatório.`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} deve ser um inteiro não negativo.`);
  }
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} deve ser um número finito.`);
  }
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido.`);
  return parsed;
}

function normalizedUniqueList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser uma lista.`);
  const normalized = value.map((entry) =>
    typeof entry === "string" ? entry.trim().toUpperCase() : entry,
  );
  if (normalized.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${label} contém item inválido.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} não pode conter itens duplicados.`);
  }
  return normalized;
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && actual.every((value) => expected.includes(value));
}

function pendingResult(status, planningResult) {
  return {
    phase: 31,
    ok: true,
    baselineBackedExecutionReadinessStatus: status,
    planningEvidenceVerified: false,
    independentReadinessReviewVerified: false,
    nextCycleExecutionAuthorized: false,
    manualNextCycleExecutionAuthorized: false,
    nextCycleExecutionEvidenceRequired: false,
    nextCycleExecutionStarted: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: planningResult.artifactVerified,
    sha256: planningResult.sha256,
    sourceFingerprint: planningResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

function assertSafeContract(contract) {
  assertEqual(contract.phase, 31, "Fase do contrato");
  assertEqual(contract.origin, "https://atlasaios.com.br", "Origem do contrato");
  assertEqual(contract.requiredStatus, "approved", "Status exigido pelo contrato");
  assertEqual(
    contract.requiredDecision,
    "authorize-baseline-backed-next-cycle-execution",
    "Decisão exigida pelo contrato",
  );
  assertEqual(contract.requiredDecisionRole, "DIRETOR", "Papel exigido pelo contrato");
  if (!Array.isArray(contract.requiredChecks) || !sameMembers(contract.requiredChecks, requiredChecks)) {
    throw new Error("Contrato não preserva todas as confirmações obrigatórias da Fase 31.");
  }
  if (
    !Array.isArray(contract.requiredStringFields)
    || !sameMembers(contract.requiredStringFields, requiredStringFields)
  ) {
    throw new Error("Contrato não preserva todos os campos textuais obrigatórios da Fase 31.");
  }
  if (!Array.isArray(contract.requiredRoles) || !sameMembers(contract.requiredRoles, requiredRoles)) {
    throw new Error("Contrato deve exigir exatamente DIRETOR, GERENTE e CORRETOR.");
  }
  if (contract.minimumReviewDurationMinutes < 20) {
    throw new Error("Duração mínima da revisão não pode ser inferior a 20 minutos.");
  }
  for (const [field, expected, label] of [
    ["minimumAuthorizedUserCount", 1, "Mínimo de usuários autorizados"],
    ["maximumRequiredJourneyFailures", 0, "Falhas máximas de jornadas"],
    ["maximumCriticalIncidents", 0, "Incidentes críticos máximos"],
    ["maximumUnresolvedHighSeverityIncidents", 0, "Incidentes graves máximos"],
    ["maximumMaterialRegressions", 0, "Regressões materiais máximas"],
    ["requiredDatabaseMigrationsByGate", 0, "Migrations exigidas pelo gate"],
    ["requiredBootstrapExecutionsByGate", 0, "Bootstraps exigidos pelo gate"],
    ["requiredBusinessDataMutationsByGate", 0, "Mutações comerciais exigidas pelo gate"],
    ["requiredUsersProvisionedByGate", 0, "Usuários provisionados pelo gate"],
    ["requiredSecretValuesRecorded", false, "Segredos no contrato"],
    ["requiredPersonalDataInEvidence", false, "Dados pessoais no contrato"],
    ["deploymentPerformedByGate", false, "Deploy pelo gate"],
    ["databaseMutationAllowedByGate", false, "Mutação de banco pelo gate"],
    ["automaticUserProvisioningAllowed", false, "Provisionamento automático"],
    ["automaticBaselineMutationAllowed", false, "Mutação automática da baseline"],
    ["automaticNextCycleExecutionAllowed", false, "Execução automática"],
    ["automaticExpansionAllowed", false, "Expansão automática"],
    ["automaticRollbackAllowed", false, "Rollback automático"],
  ]) assertEqual(contract[field], expected, label);
}

export function evaluateBaselineBackedExecutionReadiness({
  planningResult,
  baselineBackedPlanningEvidence,
  baselineBackedExecutionReadinessEvidence,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(planningResult.ok, true, "Resultado da Fase 30");
  assertEqual(planningResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(planningResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    planningResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (planningResult.baselineBackedPlanningStatus !== "baseline-backed-next-cycle-plan-approved") {
    return pendingResult(planningResult.baselineBackedPlanningStatus, planningResult);
  }
  assertEqual(
    planningResult.nextCycleExecutionReadinessReviewRequired,
    true,
    "Revisão de prontidão exigida pela Fase 30",
  );
  assertEqual(
    planningResult.nextCycleExecutionAuthorized,
    false,
    "Execução ainda não autorizada pela Fase 30",
  );
  assertEqual(planningResult.automaticExecutionAllowed, false, "Execução automática na Fase 30");
  assertEqual(planningResult.deploymentPerformedByGate, false, "Deploy pela Fase 30");
  assertEqual(planningResult.databaseMutationsByGate, 0, "Mutações de banco pela Fase 30");
  if (!baselineBackedExecutionReadinessEvidence) {
    return pendingResult("awaiting-baseline-backed-execution-readiness-review", planningResult);
  }
  if (!baselineBackedPlanningEvidence) {
    throw new Error("A evidência da Fase 30 é obrigatória para revisar a prontidão da execução.");
  }

  const evidence = baselineBackedExecutionReadinessEvidence;
  assertEqual(evidence.phase, 31, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da revisão de prontidão");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da revisão de prontidão");
  assertEqual(evidence.readinessDecisionRole, contract.requiredDecisionRole, "Papel da decisão");
  assertEqual(evidence.candidateSha256, planningResult.sha256, "SHA-256 da revisão");
  assertEqual(evidence.sourceFingerprint, planningResult.sourceFingerprint, "Fingerprint da revisão");
  assertEqual(evidence.origin, contract.origin, "Origem da revisão");
  assertEqual(evidence.releaseIdentifier, planningResult.releaseIdentifier, "Identificador da release");
  assertEqual(
    evidence.baselineBackedPlanningEvidenceSha256,
    canonicalEvidenceSha256(baselineBackedPlanningEvidence),
    "Hash canônico da evidência da Fase 30",
  );
  assertEqual(
    evidence.sourceCycleIdentifier,
    planningResult.sourceCycleIdentifier,
    "Identificador do ciclo de origem",
  );
  assertEqual(evidence.cycleIdentifier, planningResult.plannedCycleIdentifier, "Ciclo autorizado");
  assertEqual(
    evidence.verifiedBaselineIdentifier,
    planningResult.verifiedBaselineIdentifier,
    "Identificador da baseline verificada",
  );
  assertEqual(evidence.sanitizedPlanReference, planningResult.sanitizedPlanReference, "Referência do plano");

  for (const field of contract.requiredChecks) assertEqual(evidence[field], true, field);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.authorizedUserCount, "Quantidade de usuários autorizados");
  if (evidence.authorizedUserCount < contract.minimumAuthorizedUserCount) {
    throw new Error("A autorização deve incluir pelo menos um usuário da coorte planejada.");
  }
  if (evidence.authorizedUserCount > planningResult.plannedUserCeiling) {
    throw new Error("A autorização não pode superar a coorte aprovada na Fase 30.");
  }

  const roles = normalizedUniqueList(evidence.rolesAuthorized, "Papéis autorizados");
  const plannedRoles = normalizedUniqueList(planningResult.rolesPlanned, "Papéis planejados");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, plannedRoles)) {
    throw new Error("Os papéis autorizados devem ser exatamente os aprovados na Fase 30.");
  }

  assertNonNegativeInteger(evidence.minimumSuccessfulRequiredJourneys, "Meta de jornadas obrigatórias");
  if (evidence.minimumSuccessfulRequiredJourneys < planningResult.minimumSuccessfulRequiredJourneys) {
    throw new Error("A meta de jornadas obrigatórias não pode regredir em relação ao plano.");
  }
  assertNonNegativeInteger(evidence.maximumRequiredJourneyFailures, "Tolerância de falhas em jornadas");
  assertEqual(
    evidence.maximumRequiredJourneyFailures,
    planningResult.maximumRequiredJourneyFailures,
    "Tolerância de falhas em jornadas",
  );
  assertEqual(
    evidence.maximumRequiredJourneyFailures,
    contract.maximumRequiredJourneyFailures,
    "Tolerância máxima de falhas",
  );

  for (const [field, label] of [
    ["minimumAvailabilityPercent", "Meta de disponibilidade"],
    ["minimumMonitoringCoveragePercent", "Meta de monitoramento"],
  ]) {
    assertFiniteNumber(evidence[field], label);
    if (evidence[field] < planningResult[field]) {
      throw new Error(`${label} não pode regredir em relação ao plano.`);
    }
  }
  for (const [field, expected, label] of [
    ["maximumCriticalIncidents", contract.maximumCriticalIncidents, "Tolerância de incidentes críticos"],
    [
      "maximumUnresolvedHighSeverityIncidents",
      contract.maximumUnresolvedHighSeverityIncidents,
      "Tolerância de incidentes graves não resolvidos",
    ],
    ["maximumMaterialRegressions", contract.maximumMaterialRegressions, "Tolerância de regressões materiais"],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    assertEqual(evidence[field], expected, label);
    assertEqual(evidence[field], planningResult[field], label);
  }

  assertNonNegativeInteger(evidence.authorizedCostCeilingCents, "Teto de custo autorizado");
  if (evidence.authorizedCostCeilingCents > planningResult.estimatedCostCeilingCents) {
    throw new Error("O teto de custo autorizado não pode superar o plano aprovado.");
  }

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations executadas pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Execuções de bootstrap pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais executadas pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários provisionados pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) assertEqual(evidence[field], expected, label);

  assertEqual(evidence.planApprovedAt, planningResult.reviewCompletedAt, "Aprovação do plano");
  assertEqual(evidence.planRecordedAt, planningResult.recordedAt, "Registro do plano");
  const priorReviewers = new Set([
    planningResult.planningOwner,
    planningResult.planningApprovedBy,
    planningResult.witnessedBy,
  ]);
  if (priorReviewers.has(evidence.executionReadinessOwner)) {
    throw new Error("O revisor de prontidão deve ser independente dos responsáveis da Fase 30.");
  }
  if (priorReviewers.has(evidence.authorizedBy) || evidence.authorizedBy === evidence.executionReadinessOwner) {
    throw new Error("O autorizador deve ser independente do plano e do revisor de prontidão.");
  }
  if (
    priorReviewers.has(evidence.witnessedBy)
    || evidence.witnessedBy === evidence.executionReadinessOwner
    || evidence.witnessedBy === evidence.authorizedBy
  ) {
    throw new Error("A testemunha deve ser independente de todos os responsáveis anteriores.");
  }

  const planApprovedAt = timestamp(evidence.planApprovedAt, "planApprovedAt");
  const planRecordedAt = timestamp(evidence.planRecordedAt, "planRecordedAt");
  const reviewStartedAt = timestamp(evidence.reviewStartedAt, "reviewStartedAt");
  const reviewCompletedAt = timestamp(evidence.reviewCompletedAt, "reviewCompletedAt");
  const authorizedAt = timestamp(evidence.authorizedAt, "authorizedAt");
  const plannedWindowStart = timestamp(planningResult.plannedWindowStart, "plannedWindowStart");
  const plannedWindowEnd = timestamp(planningResult.plannedWindowEnd, "plannedWindowEnd");
  const authorizedWindowStart = timestamp(evidence.authorizedWindowStart, "authorizedWindowStart");
  const authorizedWindowEnd = timestamp(evidence.authorizedWindowEnd, "authorizedWindowEnd");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (planRecordedAt < planApprovedAt) throw new Error("O registro do plano não pode anteceder sua aprovação.");
  if (reviewStartedAt < planRecordedAt) {
    throw new Error("A revisão de prontidão não pode começar antes do registro da Fase 30.");
  }
  if (reviewCompletedAt <= reviewStartedAt) {
    throw new Error("reviewCompletedAt deve ser posterior ao início da revisão.");
  }
  const durationMinutes = (reviewCompletedAt - reviewStartedAt) / 60_000;
  if (durationMinutes < contract.minimumReviewDurationMinutes) {
    throw new Error(`A revisão deve durar no mínimo ${contract.minimumReviewDurationMinutes} minutos.`);
  }
  if (authorizedAt < reviewCompletedAt) {
    throw new Error("A autorização não pode anteceder o fim da revisão de prontidão.");
  }
  if (authorizedWindowStart < authorizedAt) {
    throw new Error("A janela autorizada não pode começar antes da autorização humana.");
  }
  if (authorizedWindowEnd <= authorizedWindowStart) {
    throw new Error("authorizedWindowEnd deve ser posterior ao início da janela autorizada.");
  }
  if (authorizedWindowStart < plannedWindowStart || authorizedWindowEnd > plannedWindowEnd) {
    throw new Error("A janela autorizada deve permanecer dentro da janela planejada na Fase 30.");
  }
  if (recordedAt < authorizedAt) {
    throw new Error("recordedAt não pode anteceder a autorização humana.");
  }

  return {
    phase: 31,
    ok: true,
    baselineBackedExecutionReadinessStatus: "baseline-backed-next-cycle-execution-authorized",
    planningEvidenceVerified: true,
    independentReadinessReviewVerified: true,
    readinessDecision: evidence.decision,
    nextCycleExecutionAuthorized: true,
    manualNextCycleExecutionAuthorized: true,
    nextCycleExecutionEvidenceRequired: true,
    nextCycleExecutionStarted: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: true,
    sha256: planningResult.sha256,
    sourceFingerprint: planningResult.sourceFingerprint,
    releaseIdentifier: planningResult.releaseIdentifier,
    baselineBackedPlanningEvidenceSha256: evidence.baselineBackedPlanningEvidenceSha256,
    sourceCycleIdentifier: evidence.sourceCycleIdentifier,
    cycleIdentifier: evidence.cycleIdentifier,
    verifiedBaselineIdentifier: evidence.verifiedBaselineIdentifier,
    sanitizedPlanReference: evidence.sanitizedPlanReference,
    sanitizedReadinessReference: evidence.sanitizedReadinessReference,
    authorizedUserCount: evidence.authorizedUserCount,
    rolesAuthorized: roles,
    minimumSuccessfulRequiredJourneys: evidence.minimumSuccessfulRequiredJourneys,
    maximumRequiredJourneyFailures: evidence.maximumRequiredJourneyFailures,
    minimumAvailabilityPercent: evidence.minimumAvailabilityPercent,
    minimumMonitoringCoveragePercent: evidence.minimumMonitoringCoveragePercent,
    maximumCriticalIncidents: evidence.maximumCriticalIncidents,
    maximumUnresolvedHighSeverityIncidents: evidence.maximumUnresolvedHighSeverityIncidents,
    maximumMaterialRegressions: evidence.maximumMaterialRegressions,
    authorizedCostCeilingCents: evidence.authorizedCostCeilingCents,
    executionReadinessOwner: evidence.executionReadinessOwner,
    authorizedBy: evidence.authorizedBy,
    witnessedBy: evidence.witnessedBy,
    planApprovedAt: evidence.planApprovedAt,
    planRecordedAt: evidence.planRecordedAt,
    reviewStartedAt: evidence.reviewStartedAt,
    reviewCompletedAt: evidence.reviewCompletedAt,
    authorizedAt: evidence.authorizedAt,
    authorizedWindowStart: evidence.authorizedWindowStart,
    authorizedWindowEnd: evidence.authorizedWindowEnd,
    recordedAt: evidence.recordedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyBaselineBackedExecutionReadiness(input) {
  const planningResult = verifyBaselineBackedPlanning(input);
  return evaluateBaselineBackedExecutionReadiness({
    planningResult,
    baselineBackedPlanningEvidence: input.baselineBackedPlanningEvidence,
    baselineBackedExecutionReadinessEvidence:
      input.baselineBackedExecutionReadinessEvidence,
    contract: input.phase31Contract,
    phase11Contract: input.phase11Contract,
  });
}

export function argument(argv, name) {
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1] || null;
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) || null : null;
}

function contract(argv, argumentName, fallback, label) {
  return readJson(resolve(argument(argv, argumentName) || fallback), label);
}

function optionalEvidence(argv, argumentName, label) {
  const path = argument(argv, argumentName);
  return path ? readJson(resolve(path), label) : null;
}

function runCli() {
  const argv = process.argv.slice(2);
  const zipPath = argument(argv, "--zip");
  const checksumPath = argument(argv, "--checksum");
  const proofPath = argument(argv, "--proof");
  if (!zipPath || !checksumPath || !proofPath) {
    throw new Error("Use --zip, --checksum e --proof para o artefato aprovado.");
  }

  const contractArgs = {
    phase31Contract: contract(
      argv,
      "--phase-31-contract",
      defaults.phase31Contract,
      "Contrato da Fase 31",
    ),
  };
  for (const phase of Object.keys(contractSlugs).map(Number)) {
    const key = `phase${phase}Contract`;
    contractArgs[key] = contract(
      argv,
      `--phase-${phase}-contract`,
      defaults[key],
      `Contrato da Fase ${phase}`,
    );
  }

  const evidenceArguments = {
    productionEvidence: ["--production-evidence", "Evidência pós-deploy da Fase 11"],
    releaseEvidence: ["--release-evidence", "Aceite operacional da Fase 13"],
    observationEvidence: ["--observation-evidence", "Observação operacional da Fase 14"],
    pilotEvidence: ["--pilot-evidence", "Autorização do piloto da Fase 15"],
    pilotValidationEvidence: ["--pilot-validation-evidence", "Validação do piloto da Fase 16"],
    expansionEvidence: ["--expansion-evidence", "Decisão de expansão da Fase 17"],
    executionEvidence: ["--execution-evidence", "Execução manual da Fase 18"],
    expandedCohortValidationEvidence: ["--expanded-cohort-validation-evidence", "Validação da coorte da Fase 19"],
    sustainedOperationEvidence: ["--sustained-operation-evidence", "Operação sustentada da Fase 20"],
    sustainedOperationValidationEvidence: ["--sustained-operation-validation-evidence", "Validação da Fase 21"],
    continuousOperationReviewEvidence: ["--continuous-operation-review-evidence", "Revisão da Fase 22"],
    nextCyclePlanningEvidence: ["--next-cycle-planning-evidence", "Plano da Fase 23"],
    nextCycleExecutionReadinessEvidence: ["--next-cycle-execution-readiness-evidence", "Prontidão da Fase 24"],
    nextCycleExecutionEvidence: ["--next-cycle-execution-evidence", "Execução da Fase 25"],
    nextCycleValidationEvidence: ["--next-cycle-validation-evidence", "Validação da Fase 26"],
    nextCycleClosureEvidence: ["--next-cycle-closure-evidence", "Encerramento da Fase 27"],
    lessonsLearnedEvidence: ["--lessons-learned-evidence", "Lições da Fase 28"],
    baselineVerificationEvidence: ["--baseline-verification-evidence", "Verificação da Fase 29"],
    baselineBackedPlanningEvidence: ["--baseline-backed-planning-evidence", "Planejamento da Fase 30"],
    baselineBackedExecutionReadinessEvidence: [
      "--baseline-backed-execution-readiness-evidence",
      "Prontidão baseada na baseline da Fase 31",
    ],
  };
  const evidence = {};
  for (const [key, [flag, label]] of Object.entries(evidenceArguments)) {
    evidence[key] = optionalEvidence(argv, flag, label);
  }

  console.log(JSON.stringify(verifyBaselineBackedExecutionReadiness({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
    ...contractArgs,
    handoff: contract(argv, "--handoff", defaults.handoff, "Handoff da Fase 12"),
    ...evidence,
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Fase 31 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
