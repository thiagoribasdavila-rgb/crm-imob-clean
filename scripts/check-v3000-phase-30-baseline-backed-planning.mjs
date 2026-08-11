import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyBaselineVerification,
} from "./check-v3000-phase-29-baseline-verification.mjs";

export { canonicalEvidenceSha256 };

const requiredChecks = [
  "manualPlanningReviewConfirmed",
  "baselineVerificationEvidenceReviewed",
  "evidenceChainReviewed",
  "sameArtifactConfirmed",
  "sameReleaseReferenceConfirmed",
  "verifiedBaselineReferenceConfirmed",
  "lessonsSummaryReferenceConfirmed",
  "baselineChangeSetReferenceConfirmed",
  "objectivesDefined",
  "scopeBoundariesDefined",
  "nonGoalsDefined",
  "cohortCeilingDefined",
  "roleScopeDefined",
  "successMetricsDefined",
  "journeyTargetsDefined",
  "operationalTargetsDefined",
  "costCeilingDefined",
  "supportPlanDefined",
  "rollbackPlanDefined",
  "privacyReviewed",
  "riskReviewCompleted",
  "changeFreezeRespected",
  "documentaryPlanOnlyConfirmed",
  "noProductionExecutionRequested",
  "noDatabaseMutationRequested",
  "noUserProvisioningRequested",
  "noAutomaticDeploymentRequested",
  "noAutomaticPlanningRequested",
  "noAutomaticExecutionRequested",
];

const requiredStringFields = [
  "releaseIdentifier",
  "baselineVerificationEvidenceSha256",
  "sourceCycleIdentifier",
  "plannedCycleIdentifier",
  "verifiedBaselineIdentifier",
  "sanitizedLessonsSummaryReference",
  "sanitizedBaselineChangeSetReference",
  "sanitizedPlanReference",
  "planningOwner",
  "planningApprovedBy",
  "witnessedBy",
  "reviewStartedAt",
  "reviewCompletedAt",
  "plannedWindowStart",
  "plannedWindowEnd",
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
};

const defaults = {
  phase30Contract: "config/v3000-phase-30-baseline-backed-planning.json",
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

function pendingResult(status, baselineResult) {
  return {
    phase: 30,
    ok: true,
    baselineBackedPlanningStatus: status,
    baselineVerificationEvidenceVerified: false,
    humanPlanningReviewVerified: false,
    nextCyclePlanApproved: false,
    nextCyclePlanningReviewRequired: status === "awaiting-baseline-backed-next-cycle-plan",
    nextCyclePlanningAuthorized: false,
    nextCycleExecutionReadinessReviewRequired: false,
    nextCycleExecutionAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: baselineResult.artifactVerified,
    sha256: baselineResult.sha256,
    sourceFingerprint: baselineResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

function assertSafeContract(contract) {
  assertEqual(contract.phase, 30, "Fase do contrato");
  assertEqual(contract.origin, "https://atlasaios.com.br", "Origem do contrato");
  assertEqual(contract.requiredStatus, "approved", "Status exigido pelo contrato");
  assertEqual(
    contract.requiredDecision,
    "approve-baseline-backed-next-cycle-plan",
    "Decisão exigida pelo contrato",
  );
  assertEqual(contract.requiredDecisionRole, "DIRETOR", "Papel exigido pelo contrato");
  if (!Array.isArray(contract.requiredChecks) || !sameMembers(contract.requiredChecks, requiredChecks)) {
    throw new Error("Contrato não preserva todas as confirmações obrigatórias da Fase 30.");
  }
  if (
    !Array.isArray(contract.requiredStringFields)
    || !sameMembers(contract.requiredStringFields, requiredStringFields)
  ) {
    throw new Error("Contrato não preserva todos os campos textuais obrigatórios da Fase 30.");
  }
  if (!Array.isArray(contract.requiredRoles) || !sameMembers(contract.requiredRoles, requiredRoles)) {
    throw new Error("Contrato deve exigir exatamente DIRETOR, GERENTE e CORRETOR.");
  }
  if (contract.minimumPlanningDurationMinutes < 20) {
    throw new Error("Duração mínima do planejamento não pode ser inferior a 20 minutos.");
  }
  for (const [field, expected, label] of [
    ["minimumPlannedUserCount", 1, "Mínimo de usuários planejados"],
    ["minimumSuccessfulRequiredJourneys", 3, "Mínimo de jornadas obrigatórias"],
    ["maximumRequiredJourneyFailures", 0, "Falhas máximas de jornadas"],
    ["minimumAvailabilityPercent", 99, "Disponibilidade mínima"],
    ["minimumMonitoringCoveragePercent", 100, "Monitoramento mínimo"],
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
    ["automaticNextCyclePlanningAllowed", false, "Planejamento automático"],
    ["automaticExecutionAllowed", false, "Execução automática"],
    ["automaticExpansionAllowed", false, "Expansão automática"],
    ["automaticRollbackAllowed", false, "Rollback automático"],
  ]) assertEqual(contract[field], expected, label);
}

export function evaluateBaselineBackedPlanning({
  baselineResult,
  baselineVerificationEvidence,
  baselineBackedPlanningEvidence,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(baselineResult.ok, true, "Resultado da Fase 29");
  assertEqual(baselineResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(baselineResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    baselineResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (baselineResult.baselineVerificationStatus !== "lessons-learned-baseline-verified") {
    return pendingResult(baselineResult.baselineVerificationStatus, baselineResult);
  }
  assertEqual(
    baselineResult.nextCyclePlanningReviewRequired,
    true,
    "Revisão de planejamento exigida pela Fase 29",
  );
  assertEqual(
    baselineResult.nextCyclePlanningAuthorized,
    false,
    "Planejamento ainda não autorizado pela Fase 29",
  );
  assertEqual(
    baselineResult.baselineCommittedAsEvidenceOnly,
    true,
    "Baseline exclusivamente documental",
  );
  if (!baselineBackedPlanningEvidence) {
    return pendingResult("awaiting-baseline-backed-next-cycle-plan", baselineResult);
  }
  if (!baselineVerificationEvidence) {
    throw new Error("A evidência da Fase 29 é obrigatória para planejar o próximo ciclo.");
  }

  const evidence = baselineBackedPlanningEvidence;
  assertEqual(evidence.phase, 30, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status do planejamento");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão do planejamento");
  assertEqual(evidence.planningDecisionRole, contract.requiredDecisionRole, "Papel da decisão");
  assertEqual(evidence.candidateSha256, baselineResult.sha256, "SHA-256 do planejamento");
  assertEqual(
    evidence.sourceFingerprint,
    baselineResult.sourceFingerprint,
    "Fingerprint do planejamento",
  );
  assertEqual(evidence.origin, contract.origin, "Origem do planejamento");
  assertEqual(evidence.releaseIdentifier, baselineResult.releaseIdentifier, "Identificador da release");
  assertEqual(
    evidence.baselineVerificationEvidenceSha256,
    canonicalEvidenceSha256(baselineVerificationEvidence),
    "Hash canônico da evidência da Fase 29",
  );
  assertEqual(
    evidence.sourceCycleIdentifier,
    baselineResult.cycleIdentifier,
    "Identificador do ciclo de origem",
  );
  if (evidence.plannedCycleIdentifier === evidence.sourceCycleIdentifier) {
    throw new Error("O ciclo planejado deve ser distinto do ciclo já encerrado.");
  }
  assertEqual(
    evidence.verifiedBaselineIdentifier,
    baselineResult.verifiedBaselineIdentifier,
    "Identificador da baseline verificada",
  );
  assertEqual(
    evidence.sanitizedLessonsSummaryReference,
    baselineResult.sanitizedLessonsSummaryReference,
    "Referência sanitizada das lições",
  );
  assertEqual(
    evidence.sanitizedBaselineChangeSetReference,
    baselineResult.sanitizedBaselineChangeSetReference,
    "Referência sanitizada das mudanças",
  );

  for (const field of contract.requiredChecks) assertEqual(evidence[field], true, field);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.plannedUserCeiling, "Teto de usuários planejados");
  if (evidence.plannedUserCeiling < contract.minimumPlannedUserCount) {
    throw new Error("O plano deve incluir pelo menos um usuário já validado.");
  }
  if (evidence.plannedUserCeiling > baselineResult.acceptedUserCount) {
    throw new Error("O plano não pode superar a coorte validada na baseline.");
  }

  const roles = normalizedUniqueList(evidence.rolesPlanned, "Papéis planejados");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, baselineResult.rolesVerified)) {
    throw new Error("O plano deve preservar exatamente DIRETOR, GERENTE e CORRETOR.");
  }

  assertNonNegativeInteger(
    evidence.minimumSuccessfulRequiredJourneys,
    "Meta de jornadas obrigatórias",
  );
  if (
    evidence.minimumSuccessfulRequiredJourneys < contract.minimumSuccessfulRequiredJourneys
    || evidence.minimumSuccessfulRequiredJourneys < baselineResult.acceptedSuccessfulRequiredJourneys
  ) throw new Error("A meta de jornadas obrigatórias não pode regredir.");
  assertNonNegativeInteger(
    evidence.maximumRequiredJourneyFailures,
    "Tolerância de falhas em jornadas",
  );
  assertEqual(
    evidence.maximumRequiredJourneyFailures,
    contract.maximumRequiredJourneyFailures,
    "Tolerância de falhas em jornadas",
  );

  assertFiniteNumber(evidence.minimumAvailabilityPercent, "Meta de disponibilidade");
  if (
    evidence.minimumAvailabilityPercent < contract.minimumAvailabilityPercent
    || evidence.minimumAvailabilityPercent < baselineResult.acceptedAvailabilityPercent
  ) throw new Error("A meta de disponibilidade não pode regredir.");
  assertFiniteNumber(evidence.minimumMonitoringCoveragePercent, "Meta de monitoramento");
  if (
    evidence.minimumMonitoringCoveragePercent < contract.minimumMonitoringCoveragePercent
    || evidence.minimumMonitoringCoveragePercent < baselineResult.acceptedMonitoringCoveragePercent
  ) throw new Error("A meta de monitoramento não pode regredir.");

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
  }
  assertNonNegativeInteger(evidence.estimatedCostCeilingCents, "Teto de custo estimado");
  if (evidence.estimatedCostCeilingCents < baselineResult.acceptedObservedCostCents) {
    throw new Error("O teto de custo deve cobrir ao menos o custo já observado na baseline.");
  }

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations executadas pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Execuções de bootstrap pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais executadas pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários provisionados pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) assertEqual(evidence[field], expected, label);

  if (evidence.planningOwner === baselineResult.verificationDecidedBy) {
    throw new Error("O responsável pelo plano deve ser independente do decisor da Fase 29.");
  }
  if (evidence.planningApprovedBy === evidence.planningOwner) {
    throw new Error("O aprovador do plano deve ser independente do responsável pelo plano.");
  }
  if ([evidence.planningOwner, evidence.planningApprovedBy].includes(evidence.witnessedBy)) {
    throw new Error("A testemunha do plano deve ser independente dos responsáveis pela decisão.");
  }

  const phase29RecordedAt = timestamp(baselineResult.recordedAt, "recordedAt da Fase 29");
  const reviewStartedAt = timestamp(evidence.reviewStartedAt, "reviewStartedAt");
  const reviewCompletedAt = timestamp(evidence.reviewCompletedAt, "reviewCompletedAt");
  const plannedWindowStart = timestamp(evidence.plannedWindowStart, "plannedWindowStart");
  const plannedWindowEnd = timestamp(evidence.plannedWindowEnd, "plannedWindowEnd");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (reviewStartedAt < phase29RecordedAt) {
    throw new Error("O planejamento não pode começar antes do registro da Fase 29.");
  }
  if (reviewCompletedAt <= reviewStartedAt) {
    throw new Error("reviewCompletedAt deve ser posterior ao início da revisão.");
  }
  const durationMinutes = (reviewCompletedAt - reviewStartedAt) / 60_000;
  if (durationMinutes < contract.minimumPlanningDurationMinutes) {
    throw new Error(`A revisão deve durar no mínimo ${contract.minimumPlanningDurationMinutes} minutos.`);
  }
  if (plannedWindowStart < reviewCompletedAt) {
    throw new Error("A janela planejada não pode começar antes da aprovação do plano.");
  }
  if (plannedWindowEnd <= plannedWindowStart) {
    throw new Error("plannedWindowEnd deve ser posterior ao início da janela planejada.");
  }
  if (recordedAt < reviewCompletedAt) {
    throw new Error("recordedAt não pode anteceder o fim da revisão.");
  }

  return {
    phase: 30,
    ok: true,
    baselineBackedPlanningStatus: "baseline-backed-next-cycle-plan-approved",
    baselineVerificationEvidenceVerified: true,
    humanPlanningReviewVerified: true,
    nextCyclePlanApproved: true,
    nextCyclePlanningReviewRequired: false,
    nextCyclePlanningAuthorized: true,
    nextCycleExecutionReadinessReviewRequired: true,
    nextCycleExecutionAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: true,
    sha256: baselineResult.sha256,
    sourceFingerprint: baselineResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    baselineVerificationEvidenceSha256: evidence.baselineVerificationEvidenceSha256,
    sourceCycleIdentifier: evidence.sourceCycleIdentifier,
    plannedCycleIdentifier: evidence.plannedCycleIdentifier,
    verifiedBaselineIdentifier: evidence.verifiedBaselineIdentifier,
    sanitizedLessonsSummaryReference: evidence.sanitizedLessonsSummaryReference,
    sanitizedBaselineChangeSetReference: evidence.sanitizedBaselineChangeSetReference,
    sanitizedPlanReference: evidence.sanitizedPlanReference,
    plannedUserCeiling: evidence.plannedUserCeiling,
    rolesPlanned: roles,
    minimumSuccessfulRequiredJourneys: evidence.minimumSuccessfulRequiredJourneys,
    maximumRequiredJourneyFailures: evidence.maximumRequiredJourneyFailures,
    minimumAvailabilityPercent: evidence.minimumAvailabilityPercent,
    minimumMonitoringCoveragePercent: evidence.minimumMonitoringCoveragePercent,
    maximumCriticalIncidents: evidence.maximumCriticalIncidents,
    maximumUnresolvedHighSeverityIncidents: evidence.maximumUnresolvedHighSeverityIncidents,
    maximumMaterialRegressions: evidence.maximumMaterialRegressions,
    estimatedCostCeilingCents: evidence.estimatedCostCeilingCents,
    planningOwner: evidence.planningOwner,
    planningApprovedBy: evidence.planningApprovedBy,
    witnessedBy: evidence.witnessedBy,
    reviewStartedAt: evidence.reviewStartedAt,
    reviewCompletedAt: evidence.reviewCompletedAt,
    plannedWindowStart: evidence.plannedWindowStart,
    plannedWindowEnd: evidence.plannedWindowEnd,
    recordedAt: evidence.recordedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyBaselineBackedPlanning(input) {
  const baselineResult = verifyBaselineVerification(input);
  return evaluateBaselineBackedPlanning({
    baselineResult,
    baselineVerificationEvidence: input.baselineVerificationEvidence,
    baselineBackedPlanningEvidence: input.baselineBackedPlanningEvidence,
    contract: input.phase30Contract,
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
    phase30Contract: contract(
      argv,
      "--phase-30-contract",
      defaults.phase30Contract,
      "Contrato da Fase 30",
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
  };
  const evidence = {};
  for (const [key, [flag, label]] of Object.entries(evidenceArguments)) {
    evidence[key] = optionalEvidence(argv, flag, label);
  }

  console.log(JSON.stringify(verifyBaselineBackedPlanning({
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
    console.error(`Fase 30 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
