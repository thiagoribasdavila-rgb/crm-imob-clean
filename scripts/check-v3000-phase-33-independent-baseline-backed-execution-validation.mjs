import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyBaselineBackedExecution,
} from "./check-v3000-phase-32-baseline-backed-execution.mjs";

export { canonicalEvidenceSha256 };

const requiredChecks = [
  "manualIndependentValidationConfirmed",
  "executionEvidenceReviewed",
  "evidenceChainReviewed",
  "sameArtifactConfirmed",
  "sameReleaseReferenceConfirmed",
  "sameSourceCycleReferenceConfirmed",
  "sameCycleReferenceConfirmed",
  "verifiedBaselineReferenceConfirmed",
  "authorizedCohortOutcomeReviewed",
  "authorizedRoleScopeOutcomeReviewed",
  "requiredJourneysOutcomeReviewed",
  "metricCollectionOutcomeReviewed",
  "availabilityOutcomeAccepted",
  "monitoringOutcomeAccepted",
  "supportOutcomeAccepted",
  "rollbackReadinessPreserved",
  "privacyOutcomeAccepted",
  "costOutcomeAccepted",
  "changeFreezeOutcomeAccepted",
  "noCriticalIncident",
  "noUnresolvedHighSeverityIncident",
  "noMaterialRegressionDetected",
  "noAutomaticDeploymentPerformed",
  "noAutomaticExecutionPerformed",
  "noAutomaticExpansionPerformed",
  "noAutomaticRollbackPerformed",
  "noAutomaticBaselineMutationPerformed",
];

const requiredStringFields = [
  "releaseIdentifier",
  "baselineBackedExecutionEvidenceSha256",
  "sourceCycleIdentifier",
  "cycleIdentifier",
  "verifiedBaselineIdentifier",
  "sanitizedValidationReference",
  "independentValidator",
  "reviewedBy",
  "validationStartedAt",
  "validationCompletedAt",
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
  31: "baseline-backed-execution-readiness",
  32: "baseline-backed-execution",
};

const defaults = {
  phase33Contract:
    "config/v3000-phase-33-independent-baseline-backed-execution-validation.json",
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

function pendingResult(status, executionResult) {
  return {
    phase: 33,
    ok: true,
    independentValidationStatus: status,
    executionEvidenceVerified: false,
    independentValidationEvidenceVerified: false,
    manualNextCycleExecutionVerified: false,
    independentValidationCompleted: false,
    closureReviewRequired: false,
    closureReviewStarted: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: executionResult.artifactVerified,
    sha256: executionResult.sha256,
    sourceFingerprint: executionResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

function assertSafeContract(contract) {
  assertEqual(contract.phase, 33, "Fase do contrato");
  assertEqual(contract.origin, "https://atlasaios.com.br", "Origem do contrato");
  assertEqual(contract.requiredStatus, "completed", "Status exigido pelo contrato");
  assertEqual(
    contract.requiredDecision,
    "independently-validate-baseline-backed-next-cycle-execution",
    "Decisão exigida pelo contrato",
  );
  if (!Array.isArray(contract.requiredChecks) || !sameMembers(contract.requiredChecks, requiredChecks)) {
    throw new Error("Contrato não preserva todas as confirmações obrigatórias da Fase 33.");
  }
  if (
    !Array.isArray(contract.requiredStringFields)
    || !sameMembers(contract.requiredStringFields, requiredStringFields)
  ) {
    throw new Error("Contrato não preserva todos os campos textuais obrigatórios da Fase 33.");
  }
  if (!Array.isArray(contract.requiredRoles) || !sameMembers(contract.requiredRoles, requiredRoles)) {
    throw new Error("Contrato deve exigir exatamente DIRETOR, GERENTE e CORRETOR.");
  }
  if (contract.minimumValidationDurationMinutes < 30) {
    throw new Error("Duração mínima da validação não pode ser inferior a 30 minutos.");
  }
  for (const [field, expected, label] of [
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
    ["automaticIndependentValidationAllowed", false, "Validação automática"],
    ["automaticBaselineMutationAllowed", false, "Mutação automática da baseline"],
    ["automaticNextCycleExecutionAllowed", false, "Execução automática"],
    ["automaticExpansionAllowed", false, "Expansão automática"],
    ["automaticRollbackAllowed", false, "Rollback automático"],
  ]) assertEqual(contract[field], expected, label);
}

export function evaluateIndependentBaselineBackedExecutionValidation({
  executionResult,
  baselineBackedExecutionEvidence = null,
  validationEvidence = null,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(executionResult.ok, true, "Gate da Fase 32");
  assertEqual(executionResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(executionResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    executionResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (
    executionResult.baselineBackedExecutionStatus
    !== "baseline-backed-next-cycle-manual-execution-proven"
  ) {
    return pendingResult(executionResult.baselineBackedExecutionStatus, executionResult);
  }
  for (const [field, expected, label] of [
    ["executionEvidenceVerified", true, "Evidência da execução da Fase 32"],
    ["manualNextCycleExecutionVerified", true, "Execução manual da Fase 32"],
    ["nextCycleExecutionPerformed", true, "Ciclo executado na Fase 32"],
    ["independentValidationRequired", true, "Validação independente exigida"],
    ["independentValidationStarted", false, "Validação iniciada pela Fase 32"],
    ["automaticProductionActionAllowed", false, "Ação automática da Fase 32"],
    ["automaticBaselineMutationAllowed", false, "Mutação automática da baseline"],
    ["automaticExecutionAllowed", false, "Execução automática da Fase 32"],
    ["automaticExpansionAllowed", false, "Expansão automática da Fase 32"],
    ["automaticRollbackAllowed", false, "Rollback automático da Fase 32"],
    ["deploymentPerformedByGate", false, "Deploy pela Fase 32"],
    ["databaseMutationsByGate", 0, "Mutações de banco pela Fase 32"],
  ]) assertEqual(executionResult[field], expected, label);

  if (!validationEvidence) {
    return pendingResult(
      "awaiting-independent-baseline-backed-execution-validation-evidence",
      executionResult,
    );
  }
  if (!baselineBackedExecutionEvidence) {
    throw new Error("A evidência da Fase 32 é obrigatória para a validação independente.");
  }

  const evidence = validationEvidence;
  assertEqual(evidence.phase, 33, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da validação");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da validação");
  assertEqual(evidence.candidateSha256, executionResult.sha256, "SHA-256 da validação");
  assertEqual(evidence.sourceFingerprint, executionResult.sourceFingerprint, "Fingerprint da validação");
  assertEqual(evidence.origin, contract.origin, "Origem da validação");
  assertEqual(evidence.releaseIdentifier, executionResult.releaseIdentifier, "Identificador da release");
  assertEqual(
    evidence.baselineBackedExecutionEvidenceSha256,
    canonicalEvidenceSha256(baselineBackedExecutionEvidence),
    "Hash canônico da evidência da Fase 32",
  );
  assertEqual(evidence.sourceCycleIdentifier, executionResult.sourceCycleIdentifier, "Ciclo de origem");
  assertEqual(evidence.cycleIdentifier, executionResult.cycleIdentifier, "Ciclo validado");
  assertEqual(
    evidence.verifiedBaselineIdentifier,
    executionResult.verifiedBaselineIdentifier,
    "Baseline verificada",
  );

  for (const field of contract.requiredChecks) assertEqual(evidence[field], true, field);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.validatedUserCount, "Quantidade de usuários validados");
  assertEqual(evidence.validatedUserCount, executionResult.executedUserCount, "Usuários validados");
  const roles = normalizedUniqueList(evidence.rolesValidated, "Papéis validados");
  const executedRoles = normalizedUniqueList(executionResult.rolesExecuted, "Papéis executados");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, executedRoles)) {
    throw new Error("Os papéis validados devem ser exatamente os executados na Fase 32.");
  }

  for (const [field, expected, label] of [
    ["validatedSuccessfulRequiredJourneys", executionResult.successfulRequiredJourneys, "Jornadas concluídas"],
    ["validatedFailedRequiredJourneys", executionResult.requiredJourneyFailures, "Falhas de jornadas"],
    ["validatedCriticalIncidents", executionResult.criticalIncidents, "Incidentes críticos"],
    ["validatedUnresolvedHighSeverityIncidents", executionResult.unresolvedHighSeverityIncidents, "Incidentes graves"],
    ["validatedMaterialRegressions", executionResult.materialRegressions, "Regressões materiais"],
    ["validatedObservedCostCents", executionResult.observedCostCents, "Custo observado"],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    assertEqual(evidence[field], expected, label);
  }
  assertPercent(evidence.validatedAvailabilityPercent, "Disponibilidade validada");
  assertEqual(
    evidence.validatedAvailabilityPercent,
    executionResult.observedAvailabilityPercent,
    "Disponibilidade validada",
  );
  assertPercent(evidence.validatedMonitoringCoveragePercent, "Monitoramento validado");
  assertEqual(
    evidence.validatedMonitoringCoveragePercent,
    executionResult.monitoringCoveragePercent,
    "Monitoramento validado",
  );

  if (evidence.validatedFailedRequiredJourneys > contract.maximumFailedRequiredJourneys) {
    throw new Error("A validação excedeu a tolerância de falhas em jornadas obrigatórias.");
  }
  if (evidence.validatedCriticalIncidents > contract.maximumCriticalIncidents) {
    throw new Error("A validação excedeu a tolerância de incidentes críticos.");
  }
  if (
    evidence.validatedUnresolvedHighSeverityIncidents
    > contract.maximumUnresolvedHighSeverityIncidents
  ) {
    throw new Error("A validação excedeu a tolerância de incidentes graves não resolvidos.");
  }
  if (evidence.validatedMaterialRegressions > contract.maximumMaterialRegressions) {
    throw new Error("A validação identificou regressão material.");
  }

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Bootstraps pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) assertEqual(evidence[field], expected, label);

  const executionParticipants = new Set([executionResult.executionOwner, executionResult.witnessedBy]);
  if (executionParticipants.has(evidence.independentValidator)) {
    throw new Error("O validador deve ser independente da execução e do testemunho da Fase 32.");
  }
  if (
    evidence.reviewedBy === evidence.independentValidator
    || executionParticipants.has(evidence.reviewedBy)
  ) {
    throw new Error("A revisão deve ser independente da validação e dos participantes da execução.");
  }

  const executionRecordedAt = timestamp(executionResult.recordedAt, "recordedAt da Fase 32");
  const validationStartedAt = timestamp(evidence.validationStartedAt, "validationStartedAt");
  const validationCompletedAt = timestamp(evidence.validationCompletedAt, "validationCompletedAt");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (validationStartedAt < executionRecordedAt) {
    throw new Error("A validação não pode começar antes do registro final da Fase 32.");
  }
  if (validationCompletedAt <= validationStartedAt) {
    throw new Error("validationCompletedAt deve ser posterior ao início da validação.");
  }
  const durationMinutes = (validationCompletedAt - validationStartedAt) / 60_000;
  if (durationMinutes < contract.minimumValidationDurationMinutes) {
    throw new Error(
      `A validação deve durar no mínimo ${contract.minimumValidationDurationMinutes} minutos.`,
    );
  }
  if (recordedAt < validationCompletedAt) {
    throw new Error("recordedAt não pode anteceder o fim da validação.");
  }

  return {
    phase: 33,
    ok: true,
    independentValidationStatus:
      "baseline-backed-next-cycle-execution-independently-validated",
    executionEvidenceVerified: true,
    independentValidationEvidenceVerified: true,
    manualNextCycleExecutionVerified: true,
    independentValidationCompleted: true,
    closureReviewRequired: true,
    closureReviewStarted: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    validatedUserCount: evidence.validatedUserCount,
    rolesValidated: roles,
    successfulRequiredJourneys: evidence.validatedSuccessfulRequiredJourneys,
    failedRequiredJourneys: evidence.validatedFailedRequiredJourneys,
    validatedAvailabilityPercent: evidence.validatedAvailabilityPercent,
    validatedMonitoringCoveragePercent: evidence.validatedMonitoringCoveragePercent,
    criticalIncidents: evidence.validatedCriticalIncidents,
    unresolvedHighSeverityIncidents: evidence.validatedUnresolvedHighSeverityIncidents,
    materialRegressions: evidence.validatedMaterialRegressions,
    observedCostCents: evidence.validatedObservedCostCents,
    artifactVerified: true,
    sha256: executionResult.sha256,
    sourceFingerprint: executionResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    baselineBackedExecutionEvidenceSha256: evidence.baselineBackedExecutionEvidenceSha256,
    sourceCycleIdentifier: evidence.sourceCycleIdentifier,
    cycleIdentifier: evidence.cycleIdentifier,
    verifiedBaselineIdentifier: evidence.verifiedBaselineIdentifier,
    independentValidator: evidence.independentValidator,
    reviewedBy: evidence.reviewedBy,
    sanitizedValidationReference: evidence.sanitizedValidationReference,
    validationStartedAt: evidence.validationStartedAt,
    validationCompletedAt: evidence.validationCompletedAt,
    recordedAt: evidence.recordedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyIndependentBaselineBackedExecutionValidation(input) {
  const executionResult = verifyBaselineBackedExecution(input);
  return evaluateIndependentBaselineBackedExecutionValidation({
    executionResult,
    baselineBackedExecutionEvidence: input.baselineBackedExecutionEvidence,
    validationEvidence: input.independentBaselineBackedExecutionValidationEvidence,
    contract: input.phase33Contract,
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
    phase33Contract: contract(
      argv,
      "--phase-33-contract",
      defaults.phase33Contract,
      "Contrato da Fase 33",
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
  };
  const evidence = {};
  for (const [key, [flag, label]] of Object.entries(evidenceArguments)) {
    evidence[key] = optionalEvidence(argv, flag, label);
  }

  console.log(JSON.stringify(verifyIndependentBaselineBackedExecutionValidation({
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
    console.error(`Fase 33 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
