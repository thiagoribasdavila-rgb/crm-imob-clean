import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyLessonsLearnedBaseline,
} from "./check-v3000-phase-28-lessons-learned-baseline.mjs";

export { canonicalEvidenceSha256 };

const requiredChecks = [
  "manualBaselineVerificationConfirmed",
  "lessonsLearnedEvidenceReviewed",
  "evidenceChainReviewed",
  "sameArtifactConfirmed",
  "sameReleaseReferenceConfirmed",
  "sameCycleReferenceConfirmed",
  "previousBaselineReferenceConfirmed",
  "proposedBaselineReferenceConfirmed",
  "lessonsSummaryReferenceConfirmed",
  "baselineChangeSetReferenceConfirmed",
  "roleCoverageConfirmed",
  "lessonCategoryCoverageConfirmed",
  "actionOwnershipConfirmed",
  "cohortMetricsConfirmed",
  "journeyMetricsConfirmed",
  "operationalMetricsConfirmed",
  "costMetricsConfirmed",
  "incidentStatusConfirmed",
  "regressionStatusConfirmed",
  "documentaryOnlyBaselineConfirmed",
  "rollbackReadinessPreserved",
  "noCriticalIncident",
  "noUnresolvedHighSeverityIncident",
  "noMaterialRegressionDetected",
  "noBaselineMutationPerformed",
  "noAutomaticDeploymentPerformed",
  "noAutomaticPlanningPerformed",
  "noAutomaticExecutionPerformed",
];

const requiredStringFields = [
  "releaseIdentifier",
  "lessonsLearnedEvidenceSha256",
  "cycleIdentifier",
  "previousBaselineIdentifier",
  "verifiedBaselineIdentifier",
  "sanitizedLessonsSummaryReference",
  "sanitizedBaselineChangeSetReference",
  "verificationDecidedBy",
  "witnessedBy",
  "verificationStartedAt",
  "verificationCompletedAt",
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
  28: "lessons-learned-baseline",
};

const defaults = {
  phase29Contract: "config/v3000-phase-29-baseline-verification.json",
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
    phase: 29,
    ok: true,
    baselineVerificationStatus: status,
    baselineVerificationEvidenceVerified: false,
    manualBaselineVerificationVerified: false,
    baselineVerified: false,
    baselineVerificationRequired: status === "awaiting-baseline-verification",
    nextCyclePlanningReviewRequired: false,
    nextCyclePlanningAuthorized: false,
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
  assertEqual(contract.phase, 29, "Fase do contrato");
  assertEqual(contract.origin, "https://atlasaios.com.br", "Origem do contrato");
  assertEqual(contract.requiredStatus, "verified", "Status exigido pelo contrato");
  assertEqual(
    contract.requiredDecision,
    "verify-lessons-learned-baseline",
    "Decisão exigida pelo contrato",
  );
  assertEqual(contract.requiredDecisionRole, "DIRETOR", "Papel exigido pelo contrato");

  if (!Array.isArray(contract.requiredChecks) || !sameMembers(contract.requiredChecks, requiredChecks)) {
    throw new Error("Contrato não preserva todas as confirmações obrigatórias da Fase 29.");
  }
  if (
    !Array.isArray(contract.requiredStringFields)
    || !sameMembers(contract.requiredStringFields, requiredStringFields)
  ) {
    throw new Error("Contrato não preserva todos os campos textuais obrigatórios da Fase 29.");
  }
  if (!Array.isArray(contract.requiredRoles) || !sameMembers(contract.requiredRoles, requiredRoles)) {
    throw new Error("Contrato deve exigir exatamente DIRETOR, GERENTE e CORRETOR.");
  }
  if (
    !Array.isArray(contract.requiredLessonCategories)
    || !sameMembers(contract.requiredLessonCategories, requiredLessonCategories)
  ) {
    throw new Error("Contrato deve exigir as cinco categorias de lições aprendidas.");
  }
  if (contract.minimumVerificationDurationMinutes < 20) {
    throw new Error("Duração mínima da verificação não pode ser inferior a 20 minutos.");
  }
  for (const [field, expected, label] of [
    ["maximumFailedRequiredJourneys", 0, "Falhas máximas de jornadas"],
    ["maximumCriticalIncidents", 0, "Incidentes críticos máximos"],
    ["maximumUnresolvedHighSeverityIncidents", 0, "Incidentes graves não resolvidos máximos"],
    ["maximumMaterialRegressions", 0, "Regressões materiais máximas"],
    ["requiredDatabaseMigrationsByGate", 0, "Migrations exigidas pelo gate"],
    ["requiredBootstrapExecutionsByGate", 0, "Bootstraps exigidos pelo gate"],
    ["requiredBusinessDataMutationsByGate", 0, "Mutações comerciais exigidas pelo gate"],
    ["requiredUsersProvisionedByGate", 0, "Usuários provisionados exigidos pelo gate"],
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

function assertLessonCategoryCounts(evidence, baselineResult, contract) {
  const counts = evidence.lessonCategoryCounts;
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    throw new Error("Contagens das categorias de lições são obrigatórias.");
  }
  const categories = Object.keys(counts);
  if (!sameMembers(categories, contract.requiredLessonCategories)) {
    throw new Error("A verificação deve reconciliar exatamente as cinco categorias de lições.");
  }
  for (const category of categories) {
    assertNonNegativeInteger(counts[category], `Categoria ${category}`);
    assertEqual(
      counts[category],
      baselineResult.lessonCategoryCounts[category],
      `Categoria ${category}`,
    );
  }
}

export function evaluateBaselineVerification({
  baselineResult,
  lessonsLearnedEvidence,
  baselineVerificationEvidence,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(baselineResult.ok, true, "Resultado da Fase 28");
  assertEqual(baselineResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    baselineResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (baselineResult.lessonsLearnedBaselineStatus !== "lessons-learned-baseline-committed") {
    return pendingResult(baselineResult.lessonsLearnedBaselineStatus, baselineResult);
  }
  assertEqual(
    baselineResult.baselineVerificationRequired,
    true,
    "Verificação independente exigida pela Fase 28",
  );
  assertEqual(
    baselineResult.baselineCommittedAsEvidenceOnly,
    true,
    "Baseline documental comprometida pela Fase 28",
  );
  if (!baselineVerificationEvidence) {
    return pendingResult("awaiting-baseline-verification", baselineResult);
  }
  if (!lessonsLearnedEvidence) throw new Error("A evidência da Fase 28 é obrigatória.");

  const evidence = baselineVerificationEvidence;
  assertEqual(evidence.phase, 29, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da verificação");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da verificação");
  assertEqual(
    evidence.verificationDecisionRole,
    contract.requiredDecisionRole,
    "Papel da decisão",
  );
  assertEqual(evidence.candidateSha256, baselineResult.sha256, "SHA-256 da verificação");
  assertEqual(
    evidence.sourceFingerprint,
    baselineResult.sourceFingerprint,
    "Fingerprint da verificação",
  );
  assertEqual(evidence.origin, contract.origin, "Origem da verificação");
  assertEqual(
    evidence.releaseIdentifier,
    baselineResult.releaseIdentifier,
    "Identificador da release",
  );
  assertEqual(evidence.cycleIdentifier, baselineResult.cycleIdentifier, "Identificador do ciclo");
  assertEqual(
    evidence.lessonsLearnedEvidenceSha256,
    canonicalEvidenceSha256(lessonsLearnedEvidence),
    "Hash canônico da evidência da Fase 28",
  );
  assertEqual(
    evidence.previousBaselineIdentifier,
    baselineResult.previousBaselineIdentifier,
    "Identificador da baseline anterior",
  );
  assertEqual(
    evidence.verifiedBaselineIdentifier,
    baselineResult.proposedBaselineIdentifier,
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

  const roles = normalizedUniqueList(evidence.rolesVerified, "Papéis verificados");
  if (!sameMembers(roles, contract.requiredRoles)) {
    throw new Error("A verificação deve cobrir exatamente DIRETOR, GERENTE e CORRETOR.");
  }
  if (!sameMembers(roles, baselineResult.rolesReviewed)) {
    throw new Error("Papéis verificados divergem dos papéis revisados na Fase 28.");
  }
  assertLessonCategoryCounts(evidence, baselineResult, contract);

  for (const [field, expected, label] of [
    ["verifiedLessonCount", baselineResult.acceptedLessonCount, "Lições verificadas"],
    ["verifiedActionItemCount", baselineResult.actionItemCount, "Ações verificadas"],
    ["verifiedBaselineChangeCount", baselineResult.baselineChangeCount, "Mudanças verificadas"],
    ["verifiedUserCount", baselineResult.acceptedUserCount, "Usuários verificados"],
    ["verifiedSuccessfulRequiredJourneys", baselineResult.acceptedSuccessfulRequiredJourneys, "Jornadas obrigatórias verificadas"],
    ["verifiedFailedRequiredJourneys", baselineResult.acceptedFailedRequiredJourneys, "Falhas de jornadas verificadas"],
    ["verifiedCriticalIncidents", baselineResult.acceptedCriticalIncidents, "Incidentes críticos verificados"],
    ["verifiedUnresolvedHighSeverityIncidents", baselineResult.acceptedUnresolvedHighSeverityIncidents, "Incidentes graves verificados"],
    ["verifiedMaterialRegressions", baselineResult.acceptedMaterialRegressions, "Regressões materiais verificadas"],
    ["verifiedObservedCostCents", baselineResult.acceptedObservedCostCents, "Custo observado verificado"],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    assertEqual(evidence[field], expected, label);
  }
  for (const [field, expected, label] of [
    ["verifiedAvailabilityPercent", baselineResult.acceptedAvailabilityPercent, "Disponibilidade verificada"],
    ["verifiedMonitoringCoveragePercent", baselineResult.acceptedMonitoringCoveragePercent, "Monitoramento verificado"],
  ]) {
    assertFiniteNumber(evidence[field], label);
    assertEqual(evidence[field], expected, label);
  }
  if (evidence.verifiedFailedRequiredJourneys > contract.maximumFailedRequiredJourneys) {
    throw new Error("A baseline excede a tolerância de falhas de jornadas obrigatórias.");
  }
  if (evidence.verifiedCriticalIncidents > contract.maximumCriticalIncidents) {
    throw new Error("A baseline excede a tolerância de incidentes críticos.");
  }
  if (
    evidence.verifiedUnresolvedHighSeverityIncidents
    > contract.maximumUnresolvedHighSeverityIncidents
  ) throw new Error("A baseline excede a tolerância de incidentes graves não resolvidos.");
  if (evidence.verifiedMaterialRegressions > contract.maximumMaterialRegressions) {
    throw new Error("A baseline excede a tolerância de regressões materiais.");
  }

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations executadas pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Execuções de bootstrap pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais executadas pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários provisionados pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) assertEqual(evidence[field], expected, label);

  const priorReviewers = [baselineResult.reviewDecidedBy, baselineResult.witnessedBy];
  if (priorReviewers.includes(evidence.verificationDecidedBy)) {
    throw new Error("O decisor da Fase 29 deve ser independente da revisão da Fase 28.");
  }
  if ([...priorReviewers, evidence.verificationDecidedBy].includes(evidence.witnessedBy)) {
    throw new Error("A testemunha da Fase 29 deve ser independente das revisões anteriores.");
  }

  const phase28CompletedAt = timestamp(
    baselineResult.reviewCompletedAt,
    "reviewCompletedAt da Fase 28",
  );
  const verificationStartedAt = timestamp(evidence.verificationStartedAt, "verificationStartedAt");
  const verificationCompletedAt = timestamp(
    evidence.verificationCompletedAt,
    "verificationCompletedAt",
  );
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (verificationStartedAt < phase28CompletedAt) {
    throw new Error("A verificação não pode começar antes da conclusão da Fase 28.");
  }
  if (verificationCompletedAt <= verificationStartedAt) {
    throw new Error("verificationCompletedAt deve ser posterior ao início da verificação.");
  }
  const durationMinutes = (verificationCompletedAt - verificationStartedAt) / 60_000;
  if (durationMinutes < contract.minimumVerificationDurationMinutes) {
    throw new Error(
      `A verificação deve durar no mínimo ${contract.minimumVerificationDurationMinutes} minutos.`,
    );
  }
  if (recordedAt < verificationCompletedAt) {
    throw new Error("recordedAt não pode anteceder o fim da verificação.");
  }

  return {
    phase: 29,
    ok: true,
    baselineVerificationStatus: "lessons-learned-baseline-verified",
    baselineVerificationEvidenceVerified: true,
    manualBaselineVerificationVerified: true,
    baselineVerified: true,
    baselineCommittedAsEvidenceOnly: true,
    baselineMutationPerformedByGate: false,
    baselineVerificationRequired: false,
    nextCyclePlanningReviewRequired: true,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    verifiedLessonCount: evidence.verifiedLessonCount,
    lessonCategoryCounts: evidence.lessonCategoryCounts,
    verifiedActionItemCount: evidence.verifiedActionItemCount,
    verifiedBaselineChangeCount: evidence.verifiedBaselineChangeCount,
    rolesVerified: roles,
    artifactVerified: true,
    sha256: baselineResult.sha256,
    sourceFingerprint: baselineResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    lessonsLearnedEvidenceSha256: evidence.lessonsLearnedEvidenceSha256,
    cycleIdentifier: evidence.cycleIdentifier,
    previousBaselineIdentifier: evidence.previousBaselineIdentifier,
    verifiedBaselineIdentifier: evidence.verifiedBaselineIdentifier,
    sanitizedLessonsSummaryReference: evidence.sanitizedLessonsSummaryReference,
    sanitizedBaselineChangeSetReference: evidence.sanitizedBaselineChangeSetReference,
    acceptedUserCount: evidence.verifiedUserCount,
    acceptedSuccessfulRequiredJourneys: evidence.verifiedSuccessfulRequiredJourneys,
    acceptedFailedRequiredJourneys: evidence.verifiedFailedRequiredJourneys,
    acceptedAvailabilityPercent: evidence.verifiedAvailabilityPercent,
    acceptedMonitoringCoveragePercent: evidence.verifiedMonitoringCoveragePercent,
    acceptedCriticalIncidents: evidence.verifiedCriticalIncidents,
    acceptedUnresolvedHighSeverityIncidents: evidence.verifiedUnresolvedHighSeverityIncidents,
    acceptedMaterialRegressions: evidence.verifiedMaterialRegressions,
    acceptedObservedCostCents: evidence.verifiedObservedCostCents,
    verificationDecidedBy: evidence.verificationDecidedBy,
    witnessedBy: evidence.witnessedBy,
    verificationStartedAt: evidence.verificationStartedAt,
    verificationCompletedAt: evidence.verificationCompletedAt,
    recordedAt: evidence.recordedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyBaselineVerification(input) {
  const baselineResult = verifyLessonsLearnedBaseline(input);
  return evaluateBaselineVerification({
    baselineResult,
    lessonsLearnedEvidence: input.lessonsLearnedEvidence,
    baselineVerificationEvidence: input.baselineVerificationEvidence,
    contract: input.phase29Contract,
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
    phase29Contract: contract(
      argv,
      "--phase-29-contract",
      defaults.phase29Contract,
      "Contrato da Fase 29",
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
    baselineVerificationEvidence: ["--baseline-verification-evidence", "Verificação independente da baseline da Fase 29"],
  };
  const evidence = {};
  for (const [key, [flag, label]] of Object.entries(evidenceArguments)) {
    evidence[key] = optionalEvidence(argv, flag, label);
  }

  console.log(JSON.stringify(verifyBaselineVerification({
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
    console.error(`Fase 29 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
