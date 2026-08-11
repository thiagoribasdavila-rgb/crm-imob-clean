import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyBaselineBackedCycleClosure,
} from "./check-v3000-phase-34-baseline-backed-cycle-closure.mjs";

export { canonicalEvidenceSha256 };

const requiredChecks = [
  "manualLessonsReviewConfirmed",
  "cycleClosureEvidenceReviewed",
  "evidenceChainReviewed",
  "sameArtifactConfirmed",
  "sameReleaseReferenceConfirmed",
  "sameSourceCycleReferenceConfirmed",
  "sameCycleReferenceConfirmed",
  "verifiedBaselineReferenceConfirmed",
  "closedOutcomeReviewed",
  "roleFeedbackReviewed",
  "journeyFindingsReviewed",
  "operationsFindingsReviewed",
  "supportFindingsReviewed",
  "securityFindingsReviewed",
  "privacyFindingsReviewed",
  "costFindingsReviewed",
  "incidentReviewCompleted",
  "regressionReviewCompleted",
  "improvementProposalsEvidenceBacked",
  "improvementProposalsAreDocumentaryOnly",
  "actionOwnersAndDueDatesRecorded",
  "rollbackReadinessPreserved",
  "noCriticalIncident",
  "noUnresolvedHighSeverityIncident",
  "noMaterialRegressionDetected",
  "noAutomaticDeploymentPerformed",
  "noAutomaticExecutionPerformed",
  "noAutomaticPlanningPerformed",
  "noAutomaticBaselineMutationPerformed",
  "noAutomaticCycleActivationPerformed",
];

const requiredStringFields = [
  "releaseIdentifier",
  "cycleClosureEvidenceSha256",
  "sourceCycleIdentifier",
  "cycleIdentifier",
  "verifiedBaselineIdentifier",
  "lessonsReviewIdentifier",
  "sanitizedLessonsSummaryReference",
  "sanitizedImprovementProposalReference",
  "reviewDecidedBy",
  "witnessedBy",
  "reviewStartedAt",
  "reviewCompletedAt",
  "recordedAt",
];

const requiredRoles = ["DIRETOR", "GERENTE", "CORRETOR"];
const requiredLessonCategories = [
  "journey",
  "operations",
  "support",
  "security",
  "privacy",
  "cost",
];

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
  31: "baseline-backed-execution-readiness",
  32: "baseline-backed-execution",
  33: "independent-baseline-backed-execution-validation",
  34: "baseline-backed-cycle-closure",
};

const defaults = {
  phase35Contract:
    "config/v3000-phase-35-baseline-backed-lessons-learned-review.json",
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

function assertPercent(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} deve estar entre 0 e 100.`);
  }
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido.`);
  return parsed;
}

function normalizedUniqueList(value, label, uppercase = true) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser uma lista.`);
  const normalized = value.map((entry) => {
    if (typeof entry !== "string") return entry;
    const trimmed = entry.trim();
    return uppercase ? trimmed.toUpperCase() : trimmed.toLowerCase();
  });
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
    phase: 35,
    ok: true,
    lessonsLearnedReviewStatus: status,
    cycleClosureEvidenceVerified: false,
    lessonsLearnedEvidenceVerified: false,
    manualLessonsLearnedReviewVerified: false,
    lessonsLearnedReviewRequired: false,
    lessonsLearnedReviewCompleted: false,
    improvementProposalReviewRequired: false,
    improvementProposalReviewStarted: false,
    baselineMutationAuthorized: false,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticImprovementProposalReviewAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticCycleActivationAllowed: false,
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
  assertEqual(contract.phase, 35, "Fase do contrato");
  assertEqual(contract.origin, "https://atlasaios.com.br", "Origem do contrato");
  assertEqual(contract.requiredStatus, "approved", "Status exigido pelo contrato");
  assertEqual(
    contract.requiredDecision,
    "accept-sanitized-cycle-lessons-for-improvement-proposal-review",
    "Decisão exigida pelo contrato",
  );
  assertEqual(contract.requiredDecisionRole, "DIRETOR", "Papel decisor exigido");
  if (!Array.isArray(contract.requiredChecks) || !sameMembers(contract.requiredChecks, requiredChecks)) {
    throw new Error("Contrato não preserva todas as confirmações obrigatórias da Fase 35.");
  }
  if (
    !Array.isArray(contract.requiredStringFields)
    || !sameMembers(contract.requiredStringFields, requiredStringFields)
  ) {
    throw new Error("Contrato não preserva todos os campos textuais obrigatórios da Fase 35.");
  }
  if (!Array.isArray(contract.requiredRoles) || !sameMembers(contract.requiredRoles, requiredRoles)) {
    throw new Error("Contrato deve exigir exatamente DIRETOR, GERENTE e CORRETOR.");
  }
  if (
    !Array.isArray(contract.requiredLessonCategories)
    || !sameMembers(contract.requiredLessonCategories, requiredLessonCategories)
  ) {
    throw new Error("Contrato deve exigir exatamente as seis categorias de aprendizado.");
  }
  if (contract.minimumAcceptedLessons < requiredLessonCategories.length) {
    throw new Error("O mínimo de lições deve cobrir todas as categorias obrigatórias.");
  }
  if (contract.minimumActionItems < 1) {
    throw new Error("A revisão deve registrar ao menos uma ação corretiva.");
  }
  if (contract.minimumImprovementProposals < 1) {
    throw new Error("A revisão deve registrar ao menos uma proposta de melhoria.");
  }
  if (contract.minimumReviewDurationMinutes < 20) {
    throw new Error("Duração mínima da revisão não pode ser inferior a 20 minutos.");
  }
  for (const [field, expected, label] of [
    ["maximumUnsubstantiatedClaims", 0, "Alegações sem evidência máximas"],
    ["maximumFailedRequiredJourneys", 0, "Falhas máximas de jornadas"],
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
    ["automaticImprovementProposalReviewAllowed", false, "Revisão automática de propostas"],
    ["automaticNextCyclePlanningAllowed", false, "Planejamento automático"],
    ["automaticBaselineMutationAllowed", false, "Mutação automática da baseline"],
    ["automaticCycleActivationAllowed", false, "Ativação automática de ciclo"],
    ["automaticExecutionAllowed", false, "Execução automática"],
    ["automaticExpansionAllowed", false, "Expansão automática"],
    ["automaticRollbackAllowed", false, "Rollback automático"],
  ]) assertEqual(contract[field], expected, label);
}

export function evaluateBaselineBackedLessonsLearnedReview({
  cycleClosureResult,
  cycleClosureEvidence = null,
  lessonsLearnedEvidence = null,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(cycleClosureResult.ok, true, "Gate da Fase 34");
  assertEqual(cycleClosureResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(cycleClosureResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    cycleClosureResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (cycleClosureResult.cycleClosureStatus !== "baseline-backed-next-cycle-formally-closed") {
    return pendingResult(cycleClosureResult.cycleClosureStatus, cycleClosureResult);
  }

  for (const [field, expected, label] of [
    ["independentValidationEvidenceVerified", true, "Validação independente verificada"],
    ["closureEvidenceVerified", true, "Evidência de encerramento verificada"],
    ["manualCycleClosureVerified", true, "Encerramento manual verificado"],
    ["cycleFormallyClosed", true, "Ciclo formalmente encerrado"],
    ["closureReviewRequired", false, "Revisão de encerramento pendente"],
    ["closureReviewCompleted", true, "Revisão de encerramento concluída"],
    ["lessonsLearnedReviewRequired", true, "Revisão de lições exigida"],
    ["lessonsLearnedReviewStarted", false, "Revisão de lições iniciada pela Fase 34"],
    ["nextCyclePlanningAuthorized", false, "Planejamento autorizado pela Fase 34"],
    ["automaticProductionActionAllowed", false, "Ação automática da Fase 34"],
    ["automaticBaselineMutationAllowed", false, "Mutação automática da baseline"],
    ["automaticCycleClosureAllowed", false, "Encerramento automático"],
    ["automaticNextCyclePlanningAllowed", false, "Planejamento automático"],
    ["automaticExecutionAllowed", false, "Execução automática da Fase 34"],
    ["automaticExpansionAllowed", false, "Expansão automática da Fase 34"],
    ["automaticRollbackAllowed", false, "Rollback automático da Fase 34"],
    ["deploymentPerformedByGate", false, "Deploy pela Fase 34"],
    ["databaseMutationsByGate", 0, "Mutações de banco pela Fase 34"],
  ]) assertEqual(cycleClosureResult[field], expected, label);

  if (!lessonsLearnedEvidence) {
    return pendingResult(
      "awaiting-baseline-backed-lessons-learned-review-evidence",
      cycleClosureResult,
    );
  }
  if (!cycleClosureEvidence) {
    throw new Error("A evidência da Fase 34 é obrigatória para revisar as lições.");
  }

  const evidence = lessonsLearnedEvidence;
  assertEqual(evidence.phase, 35, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da revisão");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da revisão");
  assertEqual(evidence.reviewDecisionRole, contract.requiredDecisionRole, "Papel decisor");
  assertEqual(evidence.candidateSha256, cycleClosureResult.sha256, "SHA-256 da revisão");
  assertEqual(
    evidence.sourceFingerprint,
    cycleClosureResult.sourceFingerprint,
    "Fingerprint da revisão",
  );
  assertEqual(evidence.origin, contract.origin, "Origem da revisão");
  assertEqual(evidence.releaseIdentifier, cycleClosureResult.releaseIdentifier, "Identificador da release");
  assertEqual(
    evidence.cycleClosureEvidenceSha256,
    canonicalEvidenceSha256(cycleClosureEvidence),
    "Hash canônico da evidência da Fase 34",
  );
  assertEqual(
    evidence.sourceCycleIdentifier,
    cycleClosureResult.sourceCycleIdentifier,
    "Ciclo de origem",
  );
  assertEqual(evidence.cycleIdentifier, cycleClosureResult.cycleIdentifier, "Ciclo revisado");
  assertEqual(
    evidence.verifiedBaselineIdentifier,
    cycleClosureResult.verifiedBaselineIdentifier,
    "Baseline verificada",
  );

  for (const field of contract.requiredChecks) assertEqual(evidence[field], true, field);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.reviewedUserCount, "Quantidade de usuários revisados");
  assertEqual(evidence.reviewedUserCount, cycleClosureResult.closedUserCount, "Usuários revisados");
  const roles = normalizedUniqueList(evidence.rolesReviewed, "Papéis revisados");
  const closedRoles = normalizedUniqueList(cycleClosureResult.rolesClosed, "Papéis encerrados");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, closedRoles)) {
    throw new Error("Os papéis revisados devem ser exatamente os encerrados na Fase 34.");
  }

  for (const [field, expected, label] of [
    ["reviewedSuccessfulRequiredJourneys", cycleClosureResult.successfulRequiredJourneys, "Jornadas revisadas"],
    ["reviewedFailedRequiredJourneys", cycleClosureResult.failedRequiredJourneys, "Falhas revisadas"],
    ["reviewedCriticalIncidents", cycleClosureResult.criticalIncidents, "Incidentes críticos revisados"],
    ["reviewedUnresolvedHighSeverityIncidents", cycleClosureResult.unresolvedHighSeverityIncidents, "Incidentes graves revisados"],
    ["reviewedMaterialRegressions", cycleClosureResult.materialRegressions, "Regressões revisadas"],
    ["reviewedObservedCostCents", cycleClosureResult.observedCostCents, "Custo revisado"],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    assertEqual(evidence[field], expected, label);
  }
  assertPercent(evidence.reviewedAvailabilityPercent, "Disponibilidade revisada");
  assertEqual(
    evidence.reviewedAvailabilityPercent,
    cycleClosureResult.acceptedAvailabilityPercent,
    "Disponibilidade revisada",
  );
  assertPercent(evidence.reviewedMonitoringCoveragePercent, "Monitoramento revisado");
  assertEqual(
    evidence.reviewedMonitoringCoveragePercent,
    cycleClosureResult.acceptedMonitoringCoveragePercent,
    "Monitoramento revisado",
  );

  assertNonNegativeInteger(evidence.acceptedLessonCount, "Lições aceitas");
  if (evidence.acceptedLessonCount < contract.minimumAcceptedLessons) {
    throw new Error(`A revisão deve aceitar no mínimo ${contract.minimumAcceptedLessons} lições.`);
  }
  if (
    !evidence.lessonCategoryCounts
    || typeof evidence.lessonCategoryCounts !== "object"
    || Array.isArray(evidence.lessonCategoryCounts)
  ) {
    throw new Error("lessonCategoryCounts deve ser um objeto.");
  }
  const categoryNames = normalizedUniqueList(
    Object.keys(evidence.lessonCategoryCounts),
    "Categorias de aprendizado",
    false,
  );
  if (!sameMembers(categoryNames, contract.requiredLessonCategories)) {
    throw new Error("As categorias de aprendizado devem ser exatamente as exigidas.");
  }
  let categorizedLessons = 0;
  for (const category of contract.requiredLessonCategories) {
    const count = evidence.lessonCategoryCounts[category];
    assertNonNegativeInteger(count, `Lições da categoria ${category}`);
    if (count < 1) throw new Error(`A categoria ${category} deve possuir ao menos uma lição.`);
    categorizedLessons += count;
  }
  assertEqual(categorizedLessons, evidence.acceptedLessonCount, "Soma das lições categorizadas");

  assertNonNegativeInteger(evidence.actionItemCount, "Ações corretivas");
  if (evidence.actionItemCount < contract.minimumActionItems) {
    throw new Error("A revisão deve registrar ao menos uma ação corretiva.");
  }
  assertNonNegativeInteger(evidence.improvementProposalCount, "Propostas de melhoria");
  if (evidence.improvementProposalCount < contract.minimumImprovementProposals) {
    throw new Error("A revisão deve registrar ao menos uma proposta de melhoria.");
  }
  assertNonNegativeInteger(evidence.unsubstantiatedClaimCount, "Alegações sem evidência");
  if (evidence.unsubstantiatedClaimCount > contract.maximumUnsubstantiatedClaims) {
    throw new Error("A revisão não aceita alegações sem evidência.");
  }

  if (evidence.reviewedFailedRequiredJourneys > contract.maximumFailedRequiredJourneys) {
    throw new Error("A revisão excedeu a tolerância de falhas em jornadas obrigatórias.");
  }
  if (evidence.reviewedCriticalIncidents > contract.maximumCriticalIncidents) {
    throw new Error("A revisão excedeu a tolerância de incidentes críticos.");
  }
  if (
    evidence.reviewedUnresolvedHighSeverityIncidents
    > contract.maximumUnresolvedHighSeverityIncidents
  ) {
    throw new Error("A revisão excedeu a tolerância de incidentes graves não resolvidos.");
  }
  if (evidence.reviewedMaterialRegressions > contract.maximumMaterialRegressions) {
    throw new Error("A revisão não aceita regressão material.");
  }

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Bootstraps pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) assertEqual(evidence[field], expected, label);

  if (evidence.reviewDecidedBy === evidence.witnessedBy) {
    throw new Error("A testemunha deve ser distinta de quem decidiu a revisão.");
  }

  const closureRecordedAt = timestamp(cycleClosureResult.recordedAt, "recordedAt da Fase 34");
  const reviewStartedAt = timestamp(evidence.reviewStartedAt, "reviewStartedAt");
  const reviewCompletedAt = timestamp(evidence.reviewCompletedAt, "reviewCompletedAt");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (reviewStartedAt < closureRecordedAt) {
    throw new Error("A revisão não pode começar antes do registro final da Fase 34.");
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
    baselineMutationAuthorized: false,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticImprovementProposalReviewAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticCycleActivationAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    reviewedUserCount: evidence.reviewedUserCount,
    rolesReviewed: roles,
    successfulRequiredJourneys: evidence.reviewedSuccessfulRequiredJourneys,
    failedRequiredJourneys: evidence.reviewedFailedRequiredJourneys,
    reviewedAvailabilityPercent: evidence.reviewedAvailabilityPercent,
    reviewedMonitoringCoveragePercent: evidence.reviewedMonitoringCoveragePercent,
    criticalIncidents: evidence.reviewedCriticalIncidents,
    unresolvedHighSeverityIncidents: evidence.reviewedUnresolvedHighSeverityIncidents,
    materialRegressions: evidence.reviewedMaterialRegressions,
    observedCostCents: evidence.reviewedObservedCostCents,
    acceptedLessonCount: evidence.acceptedLessonCount,
    lessonCategoryCounts: evidence.lessonCategoryCounts,
    actionItemCount: evidence.actionItemCount,
    improvementProposalCount: evidence.improvementProposalCount,
    unsubstantiatedClaimCount: evidence.unsubstantiatedClaimCount,
    artifactVerified: true,
    sha256: cycleClosureResult.sha256,
    sourceFingerprint: cycleClosureResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    cycleClosureEvidenceSha256: evidence.cycleClosureEvidenceSha256,
    sourceCycleIdentifier: evidence.sourceCycleIdentifier,
    cycleIdentifier: evidence.cycleIdentifier,
    verifiedBaselineIdentifier: evidence.verifiedBaselineIdentifier,
    lessonsReviewIdentifier: evidence.lessonsReviewIdentifier,
    reviewDecidedBy: evidence.reviewDecidedBy,
    witnessedBy: evidence.witnessedBy,
    sanitizedLessonsSummaryReference: evidence.sanitizedLessonsSummaryReference,
    sanitizedImprovementProposalReference: evidence.sanitizedImprovementProposalReference,
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

export function verifyBaselineBackedLessonsLearnedReview(input) {
  const cycleClosureResult = verifyBaselineBackedCycleClosure(input);
  return evaluateBaselineBackedLessonsLearnedReview({
    cycleClosureResult,
    cycleClosureEvidence: input.baselineBackedCycleClosureEvidence,
    lessonsLearnedEvidence: input.baselineBackedLessonsLearnedReviewEvidence,
    contract: input.phase35Contract,
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
    phase35Contract: contract(
      argv,
      "--phase-35-contract",
      defaults.phase35Contract,
      "Contrato da Fase 35",
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
    baselineBackedExecutionReadinessEvidence: ["--baseline-backed-execution-readiness-evidence", "Prontidão da Fase 31"],
    baselineBackedExecutionEvidence: ["--baseline-backed-execution-evidence", "Execução da Fase 32"],
    independentBaselineBackedExecutionValidationEvidence: [
      "--independent-baseline-backed-execution-validation-evidence",
      "Validação independente da Fase 33",
    ],
    baselineBackedCycleClosureEvidence: [
      "--baseline-backed-cycle-closure-evidence",
      "Encerramento formal da Fase 34",
    ],
    baselineBackedLessonsLearnedReviewEvidence: [
      "--baseline-backed-lessons-learned-review-evidence",
      "Revisão de lições da Fase 35",
    ],
  };
  const evidence = {};
  for (const [key, [flag, label]] of Object.entries(evidenceArguments)) {
    evidence[key] = optionalEvidence(argv, flag, label);
  }

  console.log(JSON.stringify(verifyBaselineBackedLessonsLearnedReview({
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
    console.error(`Fase 35 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
