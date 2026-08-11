import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyIndependentBaselineBackedExecutionValidation,
} from "./check-v3000-phase-33-independent-baseline-backed-execution-validation.mjs";

export { canonicalEvidenceSha256 };

const requiredChecks = [
  "manualClosureReviewConfirmed",
  "independentValidationEvidenceReviewed",
  "evidenceChainReviewed",
  "sameArtifactConfirmed",
  "sameReleaseReferenceConfirmed",
  "sameSourceCycleReferenceConfirmed",
  "sameCycleReferenceConfirmed",
  "verifiedBaselineReferenceConfirmed",
  "validatedOutcomeAccepted",
  "authorizedCohortClosureConfirmed",
  "authorizedRoleScopeClosureConfirmed",
  "requiredJourneyOutcomeAccepted",
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
  "noAutomaticCycleClosurePerformed",
];

const requiredStringFields = [
  "releaseIdentifier",
  "independentValidationEvidenceSha256",
  "sourceCycleIdentifier",
  "cycleIdentifier",
  "verifiedBaselineIdentifier",
  "closureDecidedBy",
  "witnessedBy",
  "sanitizedClosureReference",
  "closureReviewStartedAt",
  "closureReviewCompletedAt",
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
  33: "independent-baseline-backed-execution-validation",
};

const defaults = {
  phase34Contract: "config/v3000-phase-34-baseline-backed-cycle-closure.json",
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

function pendingResult(status, validationResult) {
  return {
    phase: 34,
    ok: true,
    cycleClosureStatus: status,
    independentValidationEvidenceVerified: false,
    closureEvidenceVerified: false,
    manualCycleClosureVerified: false,
    cycleFormallyClosed: false,
    closureReviewRequired: false,
    closureReviewCompleted: false,
    lessonsLearnedReviewRequired: false,
    lessonsLearnedReviewStarted: false,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticCycleClosureAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: validationResult.artifactVerified,
    sha256: validationResult.sha256,
    sourceFingerprint: validationResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

function assertSafeContract(contract) {
  assertEqual(contract.phase, 34, "Fase do contrato");
  assertEqual(contract.origin, "https://atlasaios.com.br", "Origem do contrato");
  assertEqual(contract.requiredStatus, "approved", "Status exigido pelo contrato");
  assertEqual(
    contract.requiredDecision,
    "formally-close-independently-validated-baseline-backed-cycle",
    "Decisão exigida pelo contrato",
  );
  assertEqual(contract.requiredDecisionRole, "DIRETOR", "Papel decisor exigido");
  if (!Array.isArray(contract.requiredChecks) || !sameMembers(contract.requiredChecks, requiredChecks)) {
    throw new Error("Contrato não preserva todas as confirmações obrigatórias da Fase 34.");
  }
  if (
    !Array.isArray(contract.requiredStringFields)
    || !sameMembers(contract.requiredStringFields, requiredStringFields)
  ) {
    throw new Error("Contrato não preserva todos os campos textuais obrigatórios da Fase 34.");
  }
  if (!Array.isArray(contract.requiredRoles) || !sameMembers(contract.requiredRoles, requiredRoles)) {
    throw new Error("Contrato deve exigir exatamente DIRETOR, GERENTE e CORRETOR.");
  }
  if (contract.minimumClosureReviewDurationMinutes < 20) {
    throw new Error("Duração mínima da revisão não pode ser inferior a 20 minutos.");
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
    ["automaticCycleClosureAllowed", false, "Encerramento automático"],
    ["automaticNextCyclePlanningAllowed", false, "Planejamento automático"],
    ["automaticBaselineMutationAllowed", false, "Mutação automática da baseline"],
    ["automaticExecutionAllowed", false, "Execução automática"],
    ["automaticExpansionAllowed", false, "Expansão automática"],
    ["automaticRollbackAllowed", false, "Rollback automático"],
  ]) assertEqual(contract[field], expected, label);
}

export function evaluateBaselineBackedCycleClosure({
  independentValidationResult,
  independentValidationEvidence = null,
  closureEvidence = null,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(independentValidationResult.ok, true, "Gate da Fase 33");
  assertEqual(independentValidationResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(independentValidationResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    independentValidationResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (
    independentValidationResult.independentValidationStatus
    !== "baseline-backed-next-cycle-execution-independently-validated"
  ) {
    return pendingResult(independentValidationResult.independentValidationStatus, independentValidationResult);
  }

  for (const [field, expected, label] of [
    ["executionEvidenceVerified", true, "Evidência da execução da Fase 32"],
    ["independentValidationEvidenceVerified", true, "Evidência da validação da Fase 33"],
    ["manualNextCycleExecutionVerified", true, "Execução manual validada"],
    ["independentValidationCompleted", true, "Validação independente concluída"],
    ["closureReviewRequired", true, "Revisão de encerramento exigida"],
    ["closureReviewStarted", false, "Revisão iniciada pela Fase 33"],
    ["automaticProductionActionAllowed", false, "Ação automática da Fase 33"],
    ["automaticBaselineMutationAllowed", false, "Mutação automática da baseline"],
    ["automaticExecutionAllowed", false, "Execução automática da Fase 33"],
    ["automaticExpansionAllowed", false, "Expansão automática da Fase 33"],
    ["automaticRollbackAllowed", false, "Rollback automático da Fase 33"],
    ["deploymentPerformedByGate", false, "Deploy pela Fase 33"],
    ["databaseMutationsByGate", 0, "Mutações de banco pela Fase 33"],
  ]) assertEqual(independentValidationResult[field], expected, label);

  if (!closureEvidence) {
    return pendingResult(
      "awaiting-baseline-backed-cycle-closure-review-evidence",
      independentValidationResult,
    );
  }
  if (!independentValidationEvidence) {
    throw new Error("A evidência da Fase 33 é obrigatória para o encerramento formal.");
  }

  const evidence = closureEvidence;
  assertEqual(evidence.phase, 34, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status do encerramento");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão do encerramento");
  assertEqual(evidence.closureDecisionRole, contract.requiredDecisionRole, "Papel decisor");
  assertEqual(evidence.candidateSha256, independentValidationResult.sha256, "SHA-256 do encerramento");
  assertEqual(
    evidence.sourceFingerprint,
    independentValidationResult.sourceFingerprint,
    "Fingerprint do encerramento",
  );
  assertEqual(evidence.origin, contract.origin, "Origem do encerramento");
  assertEqual(
    evidence.releaseIdentifier,
    independentValidationResult.releaseIdentifier,
    "Identificador da release",
  );
  assertEqual(
    evidence.independentValidationEvidenceSha256,
    canonicalEvidenceSha256(independentValidationEvidence),
    "Hash canônico da evidência da Fase 33",
  );
  assertEqual(
    evidence.sourceCycleIdentifier,
    independentValidationResult.sourceCycleIdentifier,
    "Ciclo de origem",
  );
  assertEqual(evidence.cycleIdentifier, independentValidationResult.cycleIdentifier, "Ciclo encerrado");
  assertEqual(
    evidence.verifiedBaselineIdentifier,
    independentValidationResult.verifiedBaselineIdentifier,
    "Baseline verificada",
  );

  for (const field of contract.requiredChecks) assertEqual(evidence[field], true, field);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.closedUserCount, "Quantidade de usuários encerrados");
  assertEqual(evidence.closedUserCount, independentValidationResult.validatedUserCount, "Usuários encerrados");
  const roles = normalizedUniqueList(evidence.rolesClosed, "Papéis encerrados");
  const validatedRoles = normalizedUniqueList(independentValidationResult.rolesValidated, "Papéis validados");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, validatedRoles)) {
    throw new Error("Os papéis encerrados devem ser exatamente os validados na Fase 33.");
  }

  for (const [field, expected, label] of [
    ["acceptedSuccessfulRequiredJourneys", independentValidationResult.successfulRequiredJourneys, "Jornadas aceitas"],
    ["acceptedFailedRequiredJourneys", independentValidationResult.failedRequiredJourneys, "Falhas aceitas"],
    ["acceptedCriticalIncidents", independentValidationResult.criticalIncidents, "Incidentes críticos aceitos"],
    ["acceptedUnresolvedHighSeverityIncidents", independentValidationResult.unresolvedHighSeverityIncidents, "Incidentes graves aceitos"],
    ["acceptedMaterialRegressions", independentValidationResult.materialRegressions, "Regressões aceitas"],
    ["acceptedObservedCostCents", independentValidationResult.observedCostCents, "Custo aceito"],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    assertEqual(evidence[field], expected, label);
  }
  assertPercent(evidence.acceptedAvailabilityPercent, "Disponibilidade aceita");
  assertEqual(
    evidence.acceptedAvailabilityPercent,
    independentValidationResult.validatedAvailabilityPercent,
    "Disponibilidade aceita",
  );
  assertPercent(evidence.acceptedMonitoringCoveragePercent, "Monitoramento aceito");
  assertEqual(
    evidence.acceptedMonitoringCoveragePercent,
    independentValidationResult.validatedMonitoringCoveragePercent,
    "Monitoramento aceito",
  );

  if (evidence.acceptedFailedRequiredJourneys > contract.maximumFailedRequiredJourneys) {
    throw new Error("O encerramento excedeu a tolerância de falhas em jornadas obrigatórias.");
  }
  if (evidence.acceptedCriticalIncidents > contract.maximumCriticalIncidents) {
    throw new Error("O encerramento excedeu a tolerância de incidentes críticos.");
  }
  if (
    evidence.acceptedUnresolvedHighSeverityIncidents
    > contract.maximumUnresolvedHighSeverityIncidents
  ) {
    throw new Error("O encerramento excedeu a tolerância de incidentes graves não resolvidos.");
  }
  if (evidence.acceptedMaterialRegressions > contract.maximumMaterialRegressions) {
    throw new Error("O encerramento não aceita regressão material.");
  }

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Bootstraps pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) assertEqual(evidence[field], expected, label);

  const validationParticipants = new Set([
    independentValidationResult.independentValidator,
    independentValidationResult.reviewedBy,
  ]);
  if (validationParticipants.has(evidence.closureDecidedBy)) {
    throw new Error("A decisão de encerramento deve ser independente da validação da Fase 33.");
  }
  if (
    evidence.witnessedBy === evidence.closureDecidedBy
    || validationParticipants.has(evidence.witnessedBy)
  ) {
    throw new Error("O testemunho deve ser independente da decisão e da validação da Fase 33.");
  }

  const validationRecordedAt = timestamp(independentValidationResult.recordedAt, "recordedAt da Fase 33");
  const reviewStartedAt = timestamp(evidence.closureReviewStartedAt, "closureReviewStartedAt");
  const reviewCompletedAt = timestamp(evidence.closureReviewCompletedAt, "closureReviewCompletedAt");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (reviewStartedAt < validationRecordedAt) {
    throw new Error("A revisão não pode começar antes do registro final da Fase 33.");
  }
  if (reviewCompletedAt <= reviewStartedAt) {
    throw new Error("closureReviewCompletedAt deve ser posterior ao início da revisão.");
  }
  const durationMinutes = (reviewCompletedAt - reviewStartedAt) / 60_000;
  if (durationMinutes < contract.minimumClosureReviewDurationMinutes) {
    throw new Error(
      `A revisão deve durar no mínimo ${contract.minimumClosureReviewDurationMinutes} minutos.`,
    );
  }
  if (recordedAt < reviewCompletedAt) {
    throw new Error("recordedAt não pode anteceder o fim da revisão.");
  }

  return {
    phase: 34,
    ok: true,
    cycleClosureStatus: "baseline-backed-next-cycle-formally-closed",
    independentValidationEvidenceVerified: true,
    closureEvidenceVerified: true,
    manualCycleClosureVerified: true,
    cycleFormallyClosed: true,
    closureReviewRequired: false,
    closureReviewCompleted: true,
    lessonsLearnedReviewRequired: true,
    lessonsLearnedReviewStarted: false,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticCycleClosureAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    closedUserCount: evidence.closedUserCount,
    rolesClosed: roles,
    successfulRequiredJourneys: evidence.acceptedSuccessfulRequiredJourneys,
    failedRequiredJourneys: evidence.acceptedFailedRequiredJourneys,
    acceptedAvailabilityPercent: evidence.acceptedAvailabilityPercent,
    acceptedMonitoringCoveragePercent: evidence.acceptedMonitoringCoveragePercent,
    criticalIncidents: evidence.acceptedCriticalIncidents,
    unresolvedHighSeverityIncidents: evidence.acceptedUnresolvedHighSeverityIncidents,
    materialRegressions: evidence.acceptedMaterialRegressions,
    observedCostCents: evidence.acceptedObservedCostCents,
    artifactVerified: true,
    sha256: independentValidationResult.sha256,
    sourceFingerprint: independentValidationResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    independentValidationEvidenceSha256: evidence.independentValidationEvidenceSha256,
    sourceCycleIdentifier: evidence.sourceCycleIdentifier,
    cycleIdentifier: evidence.cycleIdentifier,
    verifiedBaselineIdentifier: evidence.verifiedBaselineIdentifier,
    closureDecidedBy: evidence.closureDecidedBy,
    witnessedBy: evidence.witnessedBy,
    sanitizedClosureReference: evidence.sanitizedClosureReference,
    closureReviewStartedAt: evidence.closureReviewStartedAt,
    closureReviewCompletedAt: evidence.closureReviewCompletedAt,
    recordedAt: evidence.recordedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyBaselineBackedCycleClosure(input) {
  const independentValidationResult = verifyIndependentBaselineBackedExecutionValidation(input);
  return evaluateBaselineBackedCycleClosure({
    independentValidationResult,
    independentValidationEvidence: input.independentBaselineBackedExecutionValidationEvidence,
    closureEvidence: input.baselineBackedCycleClosureEvidence,
    contract: input.phase34Contract,
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
    phase34Contract: contract(
      argv,
      "--phase-34-contract",
      defaults.phase34Contract,
      "Contrato da Fase 34",
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
  };
  const evidence = {};
  for (const [key, [flag, label]] of Object.entries(evidenceArguments)) {
    evidence[key] = optionalEvidence(argv, flag, label);
  }

  console.log(JSON.stringify(verifyBaselineBackedCycleClosure({
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
    console.error(`Fase 34 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
