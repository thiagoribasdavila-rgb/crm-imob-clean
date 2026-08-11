import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyNextCycleClosure,
} from "./check-v3000-phase-27-next-cycle-closure.mjs";

export { canonicalEvidenceSha256 };

const requiredChecks = [
  "manualLessonsLearnedReviewConfirmed",
  "nextCycleClosureEvidenceReviewed",
  "evidenceChainReviewed",
  "sameReleaseReferenceConfirmed",
  "sameCycleReferenceConfirmed",
  "closureOutcomeAccepted",
  "roleFeedbackReviewed",
  "journeyFindingsReviewed",
  "operationsFindingsReviewed",
  "supportFindingsReviewed",
  "privacyFindingsReviewed",
  "costFindingsReviewed",
  "incidentReviewCompleted",
  "regressionReviewCompleted",
  "baselineChangesReviewed",
  "baselineChangesAreDocumentaryOnly",
  "actionOwnersAndDueDatesRecorded",
  "rollbackReadinessPreserved",
  "noCriticalIncident",
  "noUnresolvedHighSeverityIncident",
  "noMaterialRegressionDetected",
  "noAutomaticDeploymentPerformed",
  "noAutomaticPlanningPerformed",
  "noAutomaticExecutionPerformed",
  "noAutomaticBaselineMutationPerformed",
];

const requiredStringFields = [
  "releaseIdentifier",
  "nextCycleClosureEvidenceSha256",
  "cycleIdentifier",
  "previousBaselineIdentifier",
  "proposedBaselineIdentifier",
  "sanitizedLessonsSummaryReference",
  "sanitizedBaselineChangeSetReference",
  "reviewDecidedBy",
  "witnessedBy",
  "reviewStartedAt",
  "reviewCompletedAt",
  "recordedAt",
];

const requiredRoles = ["DIRETOR", "GERENTE", "CORRETOR"];
const requiredLessonCategories = ["journey", "operations", "support", "privacy", "cost"];

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
};

const defaults = {
  phase28Contract: "config/v3000-phase-28-lessons-learned-baseline.json",
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

function pendingResult(status, closureResult) {
  return {
    phase: 28,
    ok: true,
    lessonsLearnedBaselineStatus: status,
    lessonsLearnedEvidenceVerified: false,
    manualLessonsLearnedReviewVerified: false,
    baselineCommittedAsEvidenceOnly: false,
    lessonsLearnedReviewRequired: status === "awaiting-lessons-learned-review",
    baselineVerificationRequired: false,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: closureResult.artifactVerified,
    sha256: closureResult.sha256,
    sourceFingerprint: closureResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

function assertSafeContract(contract) {
  assertEqual(contract.phase, 28, "Fase do contrato");
  assertEqual(contract.origin, "https://atlasaios.com.br", "Origem do contrato");
  assertEqual(contract.requiredStatus, "approved", "Status exigido pelo contrato");
  assertEqual(
    contract.requiredDecision,
    "commit-lessons-learned-baseline",
    "Decisão exigida pelo contrato",
  );
  assertEqual(contract.requiredDecisionRole, "DIRETOR", "Papel da decisão");
  if (!sameMembers(contract.requiredChecks, requiredChecks)) {
    throw new Error("As verificações obrigatórias do contrato da Fase 28 foram alteradas.");
  }
  if (!sameMembers(contract.requiredStringFields, requiredStringFields)) {
    throw new Error("Os campos textuais obrigatórios do contrato da Fase 28 foram alterados.");
  }
  if (!sameMembers(contract.requiredRoles, requiredRoles)) {
    throw new Error("Os papéis obrigatórios do contrato da Fase 28 foram alterados.");
  }
  if (!sameMembers(contract.requiredLessonCategories, requiredLessonCategories)) {
    throw new Error("As categorias obrigatórias de lições da Fase 28 foram alteradas.");
  }
  assertEqual(contract.minimumAcceptedLessons >= 5, true, "Mínimo de lições aceitas");
  assertEqual(contract.minimumActionItems >= 1, true, "Mínimo de ações registradas");
  assertEqual(contract.minimumBaselineChanges >= 1, true, "Mínimo de mudanças documentais");
  assertEqual(contract.minimumReviewDurationMinutes >= 20, true, "Duração mínima da revisão");
  assertEqual(contract.maximumFailedRequiredJourneys, 0, "Tolerância a falhas de jornada");
  assertEqual(contract.maximumCriticalIncidents, 0, "Tolerância a incidentes críticos");
  assertEqual(
    contract.maximumUnresolvedHighSeverityIncidents,
    0,
    "Tolerância a incidentes graves não resolvidos",
  );
  assertEqual(contract.maximumMaterialRegressions, 0, "Tolerância a regressões materiais");
  assertEqual(contract.requiredDatabaseMigrationsByGate, 0, "Migrations exigidas pelo gate");
  assertEqual(contract.requiredBootstrapExecutionsByGate, 0, "Bootstraps exigidos pelo gate");
  assertEqual(contract.requiredBusinessDataMutationsByGate, 0, "Mutações comerciais exigidas pelo gate");
  assertEqual(contract.requiredUsersProvisionedByGate, 0, "Usuários exigidos pelo gate");
  assertEqual(contract.requiredSecretValuesRecorded, false, "Registro de segredos exigido");
  assertEqual(contract.requiredPersonalDataInEvidence, false, "Dados pessoais exigidos na evidência");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(contract.automaticUserProvisioningAllowed, false, "Provisionamento automático");
  assertEqual(contract.automaticBaselineMutationAllowed, false, "Mutação automática da baseline");
  assertEqual(contract.automaticNextCyclePlanningAllowed, false, "Planejamento automático");
  assertEqual(contract.automaticExecutionAllowed, false, "Execução automática");
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
}

function assertLessonCategories(evidence, contract) {
  const counts = evidence.lessonCategoryCounts;
  if (!counts || Array.isArray(counts) || typeof counts !== "object") {
    throw new Error("lessonCategoryCounts deve ser um objeto.");
  }
  const expected = [...contract.requiredLessonCategories].sort();
  const actual = Object.keys(counts).sort();
  if (!sameMembers(actual, expected)) {
    throw new Error("As categorias de lições devem ser exatamente as exigidas pelo contrato.");
  }
  let total = 0;
  for (const category of expected) {
    assertNonNegativeInteger(counts[category], `Lições da categoria ${category}`);
    if (counts[category] < 1) {
      throw new Error(`A categoria ${category} deve registrar ao menos uma lição.`);
    }
    total += counts[category];
  }
  assertEqual(total, evidence.acceptedLessonCount, "Soma das categorias de lições");
}

export function evaluateLessonsLearnedBaseline({
  closureResult,
  nextCycleClosureEvidence = null,
  lessonsLearnedEvidence = null,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(closureResult.ok, true, "Gate da Fase 27");
  assertEqual(closureResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(closureResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    closureResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (closureResult.nextCycleClosureStatus !== "next-cycle-formally-closed") {
    return pendingResult(closureResult.nextCycleClosureStatus, closureResult);
  }
  assertEqual(
    closureResult.lessonsLearnedReviewRequired,
    true,
    "Revisão de lições aprendidas exigida pela Fase 27",
  );
  if (!lessonsLearnedEvidence) {
    return pendingResult("awaiting-lessons-learned-review", closureResult);
  }
  if (!nextCycleClosureEvidence) {
    throw new Error("A evidência da Fase 27 é obrigatória para revisar as lições aprendidas.");
  }

  const evidence = lessonsLearnedEvidence;
  assertEqual(evidence.phase, 28, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da revisão");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da revisão");
  assertEqual(evidence.reviewDecisionRole, contract.requiredDecisionRole, "Papel da decisão");
  assertEqual(evidence.candidateSha256, closureResult.sha256, "SHA-256 da revisão");
  assertEqual(evidence.sourceFingerprint, closureResult.sourceFingerprint, "Fingerprint da revisão");
  assertEqual(evidence.origin, contract.origin, "Origem da revisão");
  assertEqual(evidence.releaseIdentifier, closureResult.releaseIdentifier, "Identificador da release");
  assertEqual(
    evidence.nextCycleClosureEvidenceSha256,
    canonicalEvidenceSha256(nextCycleClosureEvidence),
    "Hash canônico da evidência da Fase 27",
  );
  assertEqual(evidence.cycleIdentifier, closureResult.cycleIdentifier, "Identificador do ciclo");

  for (const check of contract.requiredChecks) assertEqual(evidence[check], true, check);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);
  if (evidence.previousBaselineIdentifier === evidence.proposedBaselineIdentifier) {
    throw new Error("A baseline proposta deve possuir identificador diferente da baseline anterior.");
  }

  const roles = normalizedUniqueList(evidence.rolesReviewed, "rolesReviewed");
  const closedRoles = normalizedUniqueList(closureResult.rolesClosed, "rolesClosed da Fase 27");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, closedRoles)) {
    throw new Error("Os papéis revisados devem ser exatamente os encerrados na Fase 27.");
  }

  assertNonNegativeInteger(evidence.acceptedLessonCount, "Quantidade de lições aceitas");
  if (evidence.acceptedLessonCount < contract.minimumAcceptedLessons) {
    throw new Error(`A revisão deve aceitar no mínimo ${contract.minimumAcceptedLessons} lições.`);
  }
  assertLessonCategories(evidence, contract);
  assertNonNegativeInteger(evidence.actionItemCount, "Quantidade de ações registradas");
  if (evidence.actionItemCount < contract.minimumActionItems) {
    throw new Error(`A revisão deve registrar no mínimo ${contract.minimumActionItems} ação.`);
  }
  assertNonNegativeInteger(evidence.baselineChangeCount, "Quantidade de mudanças na baseline");
  if (evidence.baselineChangeCount < contract.minimumBaselineChanges) {
    throw new Error(`A revisão deve registrar no mínimo ${contract.minimumBaselineChanges} mudança documental.`);
  }

  for (const [field, expected, label] of [
    ["acceptedUserCount", closureResult.closedUserCount, "Usuários aceitos"],
    ["acceptedSuccessfulRequiredJourneys", closureResult.successfulRequiredJourneys, "Jornadas obrigatórias aceitas"],
    ["acceptedFailedRequiredJourneys", closureResult.failedRequiredJourneys, "Falhas de jornadas obrigatórias aceitas"],
    ["acceptedCriticalIncidents", closureResult.criticalIncidents, "Incidentes críticos aceitos"],
    ["acceptedUnresolvedHighSeverityIncidents", closureResult.unresolvedHighSeverityIncidents, "Incidentes graves não resolvidos aceitos"],
    ["acceptedMaterialRegressions", closureResult.materialRegressions, "Regressões materiais aceitas"],
    ["acceptedObservedCostCents", closureResult.observedCostCents, "Custo observado aceito"],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    assertEqual(evidence[field], expected, label);
  }
  assertFiniteNumber(evidence.acceptedAvailabilityPercent, "Disponibilidade aceita");
  assertEqual(evidence.acceptedAvailabilityPercent, closureResult.acceptedAvailabilityPercent, "Disponibilidade aceita");
  assertFiniteNumber(evidence.acceptedMonitoringCoveragePercent, "Monitoramento aceito");
  assertEqual(
    evidence.acceptedMonitoringCoveragePercent,
    closureResult.acceptedMonitoringCoveragePercent,
    "Monitoramento aceito",
  );

  if (evidence.acceptedFailedRequiredJourneys > contract.maximumFailedRequiredJourneys) {
    throw new Error("A baseline excedeu a tolerância de falhas em jornadas.");
  }
  if (evidence.acceptedCriticalIncidents > contract.maximumCriticalIncidents) {
    throw new Error("A baseline excedeu a tolerância de incidentes críticos.");
  }
  if (
    evidence.acceptedUnresolvedHighSeverityIncidents >
    contract.maximumUnresolvedHighSeverityIncidents
  ) {
    throw new Error("A baseline excedeu a tolerância de incidentes graves.");
  }
  if (evidence.acceptedMaterialRegressions > contract.maximumMaterialRegressions) {
    throw new Error("A baseline aceitou regressão material.");
  }

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations executadas pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Execuções de bootstrap pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais executadas pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários provisionados pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) assertEqual(evidence[field], expected, label);

  if ([closureResult.closureDecidedBy, closureResult.witnessedBy].includes(evidence.reviewDecidedBy)) {
    throw new Error("O decisor da baseline deve ser independente do encerramento da Fase 27.");
  }
  if (
    [
      evidence.reviewDecidedBy,
      closureResult.closureDecidedBy,
      closureResult.witnessedBy,
    ].includes(evidence.witnessedBy)
  ) {
    throw new Error("A testemunha da baseline deve ser independente da revisão e do encerramento.");
  }

  const closureCompletedAt = timestamp(
    closureResult.closureReviewCompletedAt,
    "closureReviewCompletedAt da Fase 27",
  );
  const reviewStartedAt = timestamp(evidence.reviewStartedAt, "reviewStartedAt");
  const reviewCompletedAt = timestamp(evidence.reviewCompletedAt, "reviewCompletedAt");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (reviewStartedAt < closureCompletedAt) {
    throw new Error("A revisão de lições não pode começar antes do encerramento da Fase 27.");
  }
  if (reviewCompletedAt <= reviewStartedAt) {
    throw new Error("reviewCompletedAt deve ser posterior ao início da revisão.");
  }
  const durationMinutes = (reviewCompletedAt - reviewStartedAt) / 60_000;
  if (durationMinutes < contract.minimumReviewDurationMinutes) {
    throw new Error(`A revisão deve durar no mínimo ${contract.minimumReviewDurationMinutes} minutos.`);
  }
  if (recordedAt < reviewCompletedAt) {
    throw new Error("recordedAt não pode anteceder o fim da revisão.");
  }

  return {
    phase: 28,
    ok: true,
    lessonsLearnedBaselineStatus: "lessons-learned-baseline-committed",
    lessonsLearnedEvidenceVerified: true,
    manualLessonsLearnedReviewVerified: true,
    baselineCommittedAsEvidenceOnly: true,
    baselineMutationPerformedByGate: false,
    lessonsLearnedReviewRequired: false,
    baselineVerificationRequired: true,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    acceptedLessonCount: evidence.acceptedLessonCount,
    lessonCategoryCounts: evidence.lessonCategoryCounts,
    actionItemCount: evidence.actionItemCount,
    baselineChangeCount: evidence.baselineChangeCount,
    rolesReviewed: roles,
    acceptedUserCount: evidence.acceptedUserCount,
    acceptedSuccessfulRequiredJourneys: evidence.acceptedSuccessfulRequiredJourneys,
    acceptedFailedRequiredJourneys: evidence.acceptedFailedRequiredJourneys,
    acceptedAvailabilityPercent: evidence.acceptedAvailabilityPercent,
    acceptedMonitoringCoveragePercent: evidence.acceptedMonitoringCoveragePercent,
    acceptedCriticalIncidents: evidence.acceptedCriticalIncidents,
    acceptedUnresolvedHighSeverityIncidents:
      evidence.acceptedUnresolvedHighSeverityIncidents,
    acceptedMaterialRegressions: evidence.acceptedMaterialRegressions,
    acceptedObservedCostCents: evidence.acceptedObservedCostCents,
    artifactVerified: true,
    sha256: closureResult.sha256,
    sourceFingerprint: closureResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    nextCycleClosureEvidenceSha256: evidence.nextCycleClosureEvidenceSha256,
    cycleIdentifier: evidence.cycleIdentifier,
    previousBaselineIdentifier: evidence.previousBaselineIdentifier,
    proposedBaselineIdentifier: evidence.proposedBaselineIdentifier,
    sanitizedLessonsSummaryReference: evidence.sanitizedLessonsSummaryReference,
    sanitizedBaselineChangeSetReference: evidence.sanitizedBaselineChangeSetReference,
    reviewDecidedBy: evidence.reviewDecidedBy,
    witnessedBy: evidence.witnessedBy,
    reviewStartedAt: evidence.reviewStartedAt,
    reviewCompletedAt: evidence.reviewCompletedAt,
    recordedAt: evidence.recordedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyLessonsLearnedBaseline(input) {
  const closureResult = verifyNextCycleClosure(input);
  return evaluateLessonsLearnedBaseline({
    closureResult,
    nextCycleClosureEvidence: input.nextCycleClosureEvidence,
    lessonsLearnedEvidence: input.lessonsLearnedEvidence,
    contract: input.phase28Contract,
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
    phase28Contract: contract(
      argv,
      "--phase-28-contract",
      defaults.phase28Contract,
      "Contrato da Fase 28",
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
    pilotValidationEvidence: ["--pilot-validation-evidence", "Validação operacional do piloto da Fase 16"],
    expansionEvidence: ["--expansion-evidence", "Decisão de expansão da Fase 17"],
    executionEvidence: ["--execution-evidence", "Execução manual da Fase 18"],
    expandedCohortValidationEvidence: ["--expanded-cohort-validation-evidence", "Validação da coorte expandida da Fase 19"],
    sustainedOperationEvidence: ["--sustained-operation-evidence", "Autorização da operação sustentada da Fase 20"],
    sustainedOperationValidationEvidence: ["--sustained-operation-validation-evidence", "Validação da operação sustentada da Fase 21"],
    continuousOperationReviewEvidence: ["--continuous-operation-review-evidence", "Revisão da operação contínua da Fase 22"],
    nextCyclePlanningEvidence: ["--next-cycle-planning-evidence", "Plano controlado do próximo ciclo da Fase 23"],
    nextCycleExecutionReadinessEvidence: ["--next-cycle-execution-readiness-evidence", "Prontidão de execução da Fase 24"],
    nextCycleExecutionEvidence: ["--next-cycle-execution-evidence", "Execução manual do próximo ciclo da Fase 25"],
    nextCycleValidationEvidence: ["--next-cycle-validation-evidence", "Validação do próximo ciclo da Fase 26"],
    nextCycleClosureEvidence: ["--next-cycle-closure-evidence", "Encerramento formal do próximo ciclo da Fase 27"],
    lessonsLearnedEvidence: ["--lessons-learned-evidence", "Lições aprendidas e baseline da Fase 28"],
  };
  const evidence = {};
  for (const [key, [flag, label]] of Object.entries(evidenceArguments)) {
    evidence[key] = optionalEvidence(argv, flag, label);
  }

  console.log(JSON.stringify(verifyLessonsLearnedBaseline({
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
    console.error(`Fase 28 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
