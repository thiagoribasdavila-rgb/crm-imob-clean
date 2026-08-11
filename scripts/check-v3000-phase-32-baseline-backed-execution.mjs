import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyBaselineBackedExecutionReadiness,
} from "./check-v3000-phase-31-baseline-backed-execution-readiness.mjs";

export { canonicalEvidenceSha256 };

const requiredChecks = [
  "manualExecutionConfirmed",
  "authorizedReadinessPreserved",
  "readinessEvidenceReviewed",
  "evidenceChainReviewed",
  "sameArtifactConfirmed",
  "sameReleaseReferenceConfirmed",
  "verifiedBaselineReferenceConfirmed",
  "approvedPlanFollowed",
  "authorizedWindowRespected",
  "authorizedCohortPreserved",
  "authorizedRoleScopePreserved",
  "requiredJourneysCompleted",
  "metricCollectionCompleted",
  "availabilityThresholdMet",
  "monitoringThresholdMet",
  "monitoringActive",
  "supportAvailable",
  "rollbackStillReady",
  "privacyPreserved",
  "costCeilingRespected",
  "changeFreezeRespected",
  "noCriticalIncident",
  "noUnresolvedHighSeverityIncident",
  "noMaterialRegression",
  "noAutomaticDeploymentPerformed",
  "noAutomaticExecutionPerformed",
  "noAutomaticExpansionPerformed",
  "noAutomaticRollbackPerformed",
];

const requiredStringFields = [
  "releaseIdentifier",
  "baselineBackedExecutionReadinessEvidenceSha256",
  "sourceCycleIdentifier",
  "cycleIdentifier",
  "verifiedBaselineIdentifier",
  "sanitizedExecutionReference",
  "executionOwner",
  "witnessedBy",
  "executionStartedAt",
  "executionCompletedAt",
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
};

const defaults = {
  phase32Contract: "config/v3000-phase-32-baseline-backed-execution.json",
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

function pendingResult(status, executionReadinessResult) {
  return {
    phase: 32,
    ok: true,
    baselineBackedExecutionStatus: status,
    executionReadinessEvidenceVerified: false,
    executionEvidenceVerified: false,
    manualNextCycleExecutionVerified: false,
    nextCycleExecutionPerformed: false,
    independentValidationRequired: false,
    independentValidationStarted: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: executionReadinessResult.artifactVerified,
    sha256: executionReadinessResult.sha256,
    sourceFingerprint: executionReadinessResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

function assertSafeContract(contract) {
  assertEqual(contract.phase, 32, "Fase do contrato");
  assertEqual(contract.origin, "https://atlasaios.com.br", "Origem do contrato");
  assertEqual(contract.requiredStatus, "completed", "Status exigido pelo contrato");
  assertEqual(
    contract.requiredDecision,
    "confirm-baseline-backed-next-cycle-execution",
    "Decisão exigida pelo contrato",
  );
  if (!Array.isArray(contract.requiredChecks) || !sameMembers(contract.requiredChecks, requiredChecks)) {
    throw new Error("Contrato não preserva todas as confirmações obrigatórias da Fase 32.");
  }
  if (
    !Array.isArray(contract.requiredStringFields)
    || !sameMembers(contract.requiredStringFields, requiredStringFields)
  ) {
    throw new Error("Contrato não preserva todos os campos textuais obrigatórios da Fase 32.");
  }
  if (!Array.isArray(contract.requiredRoles) || !sameMembers(contract.requiredRoles, requiredRoles)) {
    throw new Error("Contrato deve exigir exatamente DIRETOR, GERENTE e CORRETOR.");
  }
  if (contract.minimumExecutionDurationMinutes < 30) {
    throw new Error("Duração mínima da execução não pode ser inferior a 30 minutos.");
  }
  for (const [field, expected, label] of [
    ["minimumExecutedUserCount", 1, "Mínimo de usuários executores"],
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

export function evaluateBaselineBackedExecution({
  executionReadinessResult,
  baselineBackedExecutionReadinessEvidence,
  baselineBackedExecutionEvidence,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(executionReadinessResult.ok, true, "Resultado da Fase 31");
  assertEqual(executionReadinessResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(executionReadinessResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    executionReadinessResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (
    executionReadinessResult.baselineBackedExecutionReadinessStatus
    !== "baseline-backed-next-cycle-execution-authorized"
  ) {
    return pendingResult(
      executionReadinessResult.baselineBackedExecutionReadinessStatus,
      executionReadinessResult,
    );
  }
  assertEqual(
    executionReadinessResult.manualNextCycleExecutionAuthorized,
    true,
    "Autorização manual da Fase 31",
  );
  assertEqual(
    executionReadinessResult.nextCycleExecutionEvidenceRequired,
    true,
    "Evidência exigida pela Fase 31",
  );
  assertEqual(executionReadinessResult.nextCycleExecutionStarted, false, "Execução iniciada pela Fase 31");
  assertEqual(executionReadinessResult.automaticExecutionAllowed, false, "Execução automática na Fase 31");
  assertEqual(executionReadinessResult.automaticExpansionAllowed, false, "Expansão automática na Fase 31");
  assertEqual(executionReadinessResult.automaticRollbackAllowed, false, "Rollback automático na Fase 31");
  assertEqual(executionReadinessResult.deploymentPerformedByGate, false, "Deploy pela Fase 31");
  assertEqual(executionReadinessResult.databaseMutationsByGate, 0, "Mutações de banco pela Fase 31");

  if (!baselineBackedExecutionEvidence) {
    return pendingResult(
      "awaiting-baseline-backed-next-cycle-execution-evidence",
      executionReadinessResult,
    );
  }
  if (!baselineBackedExecutionReadinessEvidence) {
    throw new Error("A evidência da Fase 31 é obrigatória para comprovar a execução manual.");
  }

  const evidence = baselineBackedExecutionEvidence;
  assertEqual(evidence.phase, 32, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da execução");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da execução");
  assertEqual(evidence.candidateSha256, executionReadinessResult.sha256, "SHA-256 da execução");
  assertEqual(
    evidence.sourceFingerprint,
    executionReadinessResult.sourceFingerprint,
    "Fingerprint da execução",
  );
  assertEqual(evidence.origin, contract.origin, "Origem da execução");
  assertEqual(
    evidence.releaseIdentifier,
    executionReadinessResult.releaseIdentifier,
    "Identificador da release",
  );
  assertEqual(
    evidence.baselineBackedExecutionReadinessEvidenceSha256,
    canonicalEvidenceSha256(baselineBackedExecutionReadinessEvidence),
    "Hash canônico da evidência da Fase 31",
  );
  assertEqual(
    evidence.sourceCycleIdentifier,
    executionReadinessResult.sourceCycleIdentifier,
    "Identificador do ciclo de origem",
  );
  assertEqual(evidence.cycleIdentifier, executionReadinessResult.cycleIdentifier, "Ciclo executado");
  assertEqual(
    evidence.verifiedBaselineIdentifier,
    executionReadinessResult.verifiedBaselineIdentifier,
    "Identificador da baseline verificada",
  );

  for (const field of contract.requiredChecks) assertEqual(evidence[field], true, field);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.executedUserCount, "Quantidade de usuários executores");
  if (evidence.executedUserCount < contract.minimumExecutedUserCount) {
    throw new Error("A execução deve comprovar pelo menos um usuário da coorte autorizada.");
  }
  if (evidence.executedUserCount > executionReadinessResult.authorizedUserCount) {
    throw new Error("A execução não pode superar a coorte autorizada na Fase 31.");
  }

  const roles = normalizedUniqueList(evidence.rolesExecuted, "Papéis executados");
  const authorizedRoles = normalizedUniqueList(
    executionReadinessResult.rolesAuthorized,
    "Papéis autorizados",
  );
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, authorizedRoles)) {
    throw new Error("Os papéis executados devem ser exatamente os autorizados na Fase 31.");
  }

  assertNonNegativeInteger(evidence.successfulRequiredJourneys, "Jornadas obrigatórias concluídas");
  if (evidence.successfulRequiredJourneys < executionReadinessResult.minimumSuccessfulRequiredJourneys) {
    throw new Error("A execução não comprovou a quantidade mínima de jornadas obrigatórias.");
  }
  assertNonNegativeInteger(evidence.requiredJourneyFailures, "Falhas em jornadas obrigatórias");
  if (
    evidence.requiredJourneyFailures > executionReadinessResult.maximumRequiredJourneyFailures
    || evidence.requiredJourneyFailures > contract.maximumRequiredJourneyFailures
  ) {
    throw new Error("A execução superou a tolerância de falhas em jornadas obrigatórias.");
  }

  assertPercent(evidence.observedAvailabilityPercent, "Disponibilidade observada");
  if (evidence.observedAvailabilityPercent < executionReadinessResult.minimumAvailabilityPercent) {
    throw new Error("A disponibilidade observada ficou abaixo do mínimo autorizado.");
  }
  assertPercent(evidence.monitoringCoveragePercent, "Cobertura de monitoramento");
  if (evidence.monitoringCoveragePercent < executionReadinessResult.minimumMonitoringCoveragePercent) {
    throw new Error("A cobertura de monitoramento ficou abaixo do mínimo autorizado.");
  }

  for (const [field, limit, label] of [
    ["criticalIncidents", contract.maximumCriticalIncidents, "Incidentes críticos"],
    [
      "unresolvedHighSeverityIncidents",
      contract.maximumUnresolvedHighSeverityIncidents,
      "Incidentes graves não resolvidos",
    ],
    ["materialRegressions", contract.maximumMaterialRegressions, "Regressões materiais"],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    if (evidence[field] > limit || evidence[field] > executionReadinessResult[`maximum${field[0].toUpperCase()}${field.slice(1)}`]) {
      throw new Error(`${label} superou o limite autorizado.`);
    }
  }

  assertNonNegativeInteger(evidence.observedCostCents, "Custo observado");
  if (evidence.observedCostCents > executionReadinessResult.authorizedCostCeilingCents) {
    throw new Error("O custo observado superou o teto autorizado.");
  }

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations executadas pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Execuções de bootstrap pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários provisionados pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) assertEqual(evidence[field], expected, label);

  const priorOwners = new Set([
    executionReadinessResult.executionReadinessOwner,
    executionReadinessResult.authorizedBy,
    executionReadinessResult.witnessedBy,
  ]);
  if (priorOwners.has(evidence.executionOwner)) {
    throw new Error("O executor deve ser independente dos responsáveis pela prontidão da Fase 31.");
  }
  if (priorOwners.has(evidence.witnessedBy) || evidence.witnessedBy === evidence.executionOwner) {
    throw new Error("A testemunha da execução deve ser independente dos responsáveis anteriores e do executor.");
  }

  const authorizedAt = timestamp(executionReadinessResult.authorizedAt, "authorizedAt");
  const windowStart = timestamp(executionReadinessResult.authorizedWindowStart, "authorizedWindowStart");
  const windowEnd = timestamp(executionReadinessResult.authorizedWindowEnd, "authorizedWindowEnd");
  const executionStartedAt = timestamp(evidence.executionStartedAt, "executionStartedAt");
  const executionCompletedAt = timestamp(evidence.executionCompletedAt, "executionCompletedAt");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (executionStartedAt < authorizedAt || executionStartedAt < windowStart) {
    throw new Error("A execução não pode começar antes da autorização e da janela aprovada.");
  }
  if (executionCompletedAt <= executionStartedAt) {
    throw new Error("executionCompletedAt deve ser posterior ao início da execução.");
  }
  if (executionCompletedAt > windowEnd) {
    throw new Error("A execução deve terminar dentro da janela autorizada.");
  }
  const durationMinutes = (executionCompletedAt - executionStartedAt) / 60_000;
  if (durationMinutes < contract.minimumExecutionDurationMinutes) {
    throw new Error(`A execução deve durar no mínimo ${contract.minimumExecutionDurationMinutes} minutos.`);
  }
  if (recordedAt < executionCompletedAt) {
    throw new Error("recordedAt não pode anteceder o fim da execução.");
  }

  return {
    phase: 32,
    ok: true,
    baselineBackedExecutionStatus: "baseline-backed-next-cycle-manual-execution-proven",
    executionReadinessEvidenceVerified: true,
    executionEvidenceVerified: true,
    manualNextCycleExecutionVerified: true,
    nextCycleExecutionPerformed: true,
    independentValidationRequired: true,
    independentValidationStarted: false,
    automaticProductionActionAllowed: false,
    automaticBaselineMutationAllowed: false,
    automaticExecutionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: true,
    sha256: executionReadinessResult.sha256,
    sourceFingerprint: executionReadinessResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    baselineBackedExecutionReadinessEvidenceSha256:
      evidence.baselineBackedExecutionReadinessEvidenceSha256,
    sourceCycleIdentifier: evidence.sourceCycleIdentifier,
    cycleIdentifier: evidence.cycleIdentifier,
    verifiedBaselineIdentifier: evidence.verifiedBaselineIdentifier,
    sanitizedExecutionReference: evidence.sanitizedExecutionReference,
    executedUserCount: evidence.executedUserCount,
    rolesExecuted: roles,
    successfulRequiredJourneys: evidence.successfulRequiredJourneys,
    requiredJourneyFailures: evidence.requiredJourneyFailures,
    observedAvailabilityPercent: evidence.observedAvailabilityPercent,
    monitoringCoveragePercent: evidence.monitoringCoveragePercent,
    criticalIncidents: evidence.criticalIncidents,
    unresolvedHighSeverityIncidents: evidence.unresolvedHighSeverityIncidents,
    materialRegressions: evidence.materialRegressions,
    observedCostCents: evidence.observedCostCents,
    executionOwner: evidence.executionOwner,
    witnessedBy: evidence.witnessedBy,
    executionStartedAt: evidence.executionStartedAt,
    executionCompletedAt: evidence.executionCompletedAt,
    recordedAt: evidence.recordedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyBaselineBackedExecution(input) {
  const executionReadinessResult = verifyBaselineBackedExecutionReadiness(input);
  return evaluateBaselineBackedExecution({
    executionReadinessResult,
    baselineBackedExecutionReadinessEvidence:
      input.baselineBackedExecutionReadinessEvidence,
    baselineBackedExecutionEvidence: input.baselineBackedExecutionEvidence,
    contract: input.phase32Contract,
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
    phase32Contract: contract(
      argv,
      "--phase-32-contract",
      defaults.phase32Contract,
      "Contrato da Fase 32",
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
    baselineBackedExecutionEvidence: [
      "--baseline-backed-execution-evidence",
      "Execução manual baseada na baseline da Fase 32",
    ],
  };
  const evidence = {};
  for (const [key, [flag, label]] of Object.entries(evidenceArguments)) {
    evidence[key] = optionalEvidence(argv, flag, label);
  }

  console.log(JSON.stringify(verifyBaselineBackedExecution({
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
    console.error(`Fase 32 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
