import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyNextCycleExecution,
} from "./check-v3000-phase-25-next-cycle-execution.mjs";

export { canonicalEvidenceSha256 };

const defaults = {
  phase26Contract: "config/v3000-phase-26-next-cycle-validation.json",
  phase25Contract: "config/v3000-phase-25-next-cycle-execution.json",
  phase24Contract: "config/v3000-phase-24-next-cycle-execution-readiness.json",
  phase23Contract: "config/v3000-phase-23-next-cycle-planning.json",
  phase22Contract: "config/v3000-phase-22-continuous-operation-review.json",
  phase21Contract: "config/v3000-phase-21-sustained-operation-validation.json",
  phase20Contract: "config/v3000-phase-20-sustained-operation.json",
  phase19Contract: "config/v3000-phase-19-expanded-cohort-validation.json",
  phase18Contract: "config/v3000-phase-18-expansion-execution.json",
  phase17Contract: "config/v3000-phase-17-controlled-expansion.json",
  phase16Contract: "config/v3000-phase-16-pilot-validation.json",
  phase15Contract: "config/v3000-phase-15-controlled-pilot.json",
  phase14Contract: "config/v3000-phase-14-operational-observation.json",
  phase13Contract: "config/v3000-phase-13-release-closure.json",
  phase12Contract: "config/v3000-phase-12-installation-handoff.json",
  phase11Contract: "config/v3000-phase-11-homologation.json",
  handoff: "docs/evidence/V3000_PHASE_12_INSTALLATION_HANDOFF.json",
};

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

function pendingResult(status, executionResult) {
  return {
    phase: 26,
    ok: true,
    nextCycleValidationStatus: status,
    nextCycleValidationEvidenceVerified: false,
    manualNextCycleValidationVerified: false,
    nextCycleExecutionValidated: false,
    nextCycleClosureReviewRequired: false,
    automaticProductionActionAllowed: false,
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
  assertEqual(contract.phase, 26, "Fase do contrato");
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
  assertEqual(
    contract.requiredBusinessDataMutationsByGate,
    0,
    "Mutações comerciais exigidas pelo gate",
  );
  assertEqual(contract.requiredUsersProvisionedByGate, 0, "Usuários exigidos pelo gate");
  assertEqual(contract.requiredSecretValuesRecorded, false, "Registro de segredos exigido");
  assertEqual(
    contract.requiredPersonalDataInEvidence,
    false,
    "Dados pessoais exigidos na evidência",
  );
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(contract.automaticUserProvisioningAllowed, false, "Provisionamento automático");
  assertEqual(contract.automaticNextCycleValidationAllowed, false, "Validação automática");
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
}

export function evaluateNextCycleValidation({
  executionResult,
  nextCycleExecutionEvidence = null,
  nextCycleValidationEvidence = null,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(executionResult.ok, true, "Gate da Fase 25");
  assertEqual(executionResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(executionResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    executionResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (executionResult.nextCycleExecutionStatus !== "next-cycle-executed") {
    return pendingResult(executionResult.nextCycleExecutionStatus, executionResult);
  }
  if (!nextCycleValidationEvidence) {
    return pendingResult("awaiting-next-cycle-validation", executionResult);
  }
  if (!nextCycleExecutionEvidence) {
    throw new Error("A evidência da Fase 25 é obrigatória para validar o ciclo executado.");
  }

  const evidence = nextCycleValidationEvidence;
  assertEqual(evidence.phase, 26, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da validação");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da validação");
  assertEqual(evidence.candidateSha256, executionResult.sha256, "SHA-256 da validação");
  assertEqual(
    evidence.sourceFingerprint,
    executionResult.sourceFingerprint,
    "Fingerprint da validação",
  );
  assertEqual(evidence.origin, contract.origin, "Origem da validação");
  assertEqual(
    evidence.releaseIdentifier,
    executionResult.releaseIdentifier,
    "Identificador da release",
  );
  assertEqual(
    evidence.nextCycleExecutionEvidenceSha256,
    canonicalEvidenceSha256(nextCycleExecutionEvidence),
    "Hash canônico da evidência da Fase 25",
  );
  assertEqual(evidence.cycleIdentifier, executionResult.cycleIdentifier, "Identificador do ciclo");

  for (const check of contract.requiredChecks) assertEqual(evidence[check], true, check);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.validatedUserCount, "Quantidade de usuários validados");
  assertEqual(
    evidence.validatedUserCount,
    executionResult.executedUserCount,
    "Quantidade de usuários validados",
  );

  const roles = normalizedUniqueList(evidence.rolesValidated, "rolesValidated");
  const executedRoles = normalizedUniqueList(executionResult.rolesExecuted, "rolesExecuted");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, executedRoles)) {
    throw new Error("Os papéis validados devem ser exatamente os executados na Fase 25.");
  }

  for (const [field, expected, label] of [
    [
      "validatedSuccessfulRequiredJourneys",
      executionResult.successfulRequiredJourneys,
      "Jornadas obrigatórias bem-sucedidas validadas",
    ],
    [
      "validatedFailedRequiredJourneys",
      executionResult.requiredJourneyFailures,
      "Falhas de jornadas obrigatórias validadas",
    ],
    ["validatedCriticalIncidents", executionResult.criticalIncidents, "Incidentes críticos validados"],
    [
      "validatedUnresolvedHighSeverityIncidents",
      executionResult.unresolvedHighSeverityIncidents,
      "Incidentes graves não resolvidos validados",
    ],
    ["validatedObservedCostCents", executionResult.observedCostCents, "Custo observado validado"],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    assertEqual(evidence[field], expected, label);
  }

  assertFiniteNumber(evidence.validatedAvailabilityPercent, "Disponibilidade validada");
  assertEqual(
    evidence.validatedAvailabilityPercent,
    executionResult.observedAvailabilityPercent,
    "Disponibilidade validada",
  );
  assertFiniteNumber(evidence.validatedMonitoringCoveragePercent, "Monitoramento validado");
  assertEqual(
    evidence.validatedMonitoringCoveragePercent,
    executionResult.monitoringCoveragePercent,
    "Monitoramento validado",
  );

  assertNonNegativeInteger(evidence.materialRegressions, "Regressões materiais");
  if (evidence.materialRegressions > contract.maximumMaterialRegressions) {
    throw new Error("A validação identificou regressão material.");
  }
  if (evidence.validatedFailedRequiredJourneys > contract.maximumFailedRequiredJourneys) {
    throw new Error("A validação excedeu a tolerância de falhas em jornadas obrigatórias.");
  }
  if (evidence.validatedCriticalIncidents > contract.maximumCriticalIncidents) {
    throw new Error("A validação excedeu a tolerância de incidentes críticos.");
  }
  if (
    evidence.validatedUnresolvedHighSeverityIncidents >
    contract.maximumUnresolvedHighSeverityIncidents
  ) {
    throw new Error("A validação excedeu a tolerância de incidentes graves não resolvidos.");
  }

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations executadas pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Execuções de bootstrap pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais executadas pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários provisionados pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) {
    assertEqual(evidence[field], expected, label);
  }

  if (
    evidence.validatedBy === executionResult.executionOwner ||
    evidence.validatedBy === executionResult.witnessedBy
  ) {
    throw new Error("O validador deve ser independente da execução e do testemunho da Fase 25.");
  }
  if (
    evidence.reviewedBy === evidence.validatedBy ||
    evidence.reviewedBy === executionResult.executionOwner
  ) {
    throw new Error("A revisão final deve ser independente da validação e da execução.");
  }

  const executionCompletedAt = timestamp(
    executionResult.executionCompletedAt,
    "executionCompletedAt da Fase 25",
  );
  const validationStartedAt = timestamp(evidence.validationStartedAt, "validationStartedAt");
  const validationCompletedAt = timestamp(evidence.validationCompletedAt, "validationCompletedAt");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (validationStartedAt < executionCompletedAt) {
    throw new Error("A validação não pode começar antes do fim da execução da Fase 25.");
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
    phase: 26,
    ok: true,
    nextCycleValidationStatus: "next-cycle-validated",
    nextCycleValidationEvidenceVerified: true,
    manualNextCycleValidationVerified: true,
    nextCycleExecutionValidated: true,
    nextCycleClosureReviewRequired: true,
    automaticProductionActionAllowed: false,
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
    materialRegressions: evidence.materialRegressions,
    observedCostCents: evidence.validatedObservedCostCents,
    artifactVerified: true,
    sha256: executionResult.sha256,
    sourceFingerprint: executionResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    nextCycleExecutionEvidenceSha256: evidence.nextCycleExecutionEvidenceSha256,
    cycleIdentifier: evidence.cycleIdentifier,
    validatedBy: evidence.validatedBy,
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

export function verifyNextCycleValidation(input) {
  const executionResult = verifyNextCycleExecution(input);
  return evaluateNextCycleValidation({
    executionResult,
    nextCycleExecutionEvidence: input.nextCycleExecutionEvidence,
    nextCycleValidationEvidence: input.nextCycleValidationEvidence,
    contract: input.phase26Contract,
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

  const contractArgs = {};
  for (let phase = 11; phase <= 26; phase += 1) {
    const key = `phase${phase}Contract`;
    contractArgs[key] = contract(
      argv,
      `--phase-${phase}-contract`,
      defaults[key],
      `Contrato da Fase ${phase}`,
    );
  }

  console.log(JSON.stringify(verifyNextCycleValidation({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
    ...contractArgs,
    handoff: contract(argv, "--handoff", defaults.handoff, "Handoff da Fase 12"),
    productionEvidence: optionalEvidence(argv, "--production-evidence", "Evidência pós-deploy da Fase 11"),
    releaseEvidence: optionalEvidence(argv, "--release-evidence", "Aceite operacional da Fase 13"),
    observationEvidence: optionalEvidence(argv, "--observation-evidence", "Observação operacional da Fase 14"),
    pilotEvidence: optionalEvidence(argv, "--pilot-evidence", "Autorização do piloto da Fase 15"),
    pilotValidationEvidence: optionalEvidence(argv, "--pilot-validation-evidence", "Validação operacional do piloto da Fase 16"),
    expansionEvidence: optionalEvidence(argv, "--expansion-evidence", "Decisão de expansão da Fase 17"),
    executionEvidence: optionalEvidence(argv, "--execution-evidence", "Execução manual da Fase 18"),
    expandedCohortValidationEvidence: optionalEvidence(argv, "--expanded-cohort-validation-evidence", "Validação da coorte expandida da Fase 19"),
    sustainedOperationEvidence: optionalEvidence(argv, "--sustained-operation-evidence", "Autorização da operação sustentada da Fase 20"),
    sustainedOperationValidationEvidence: optionalEvidence(argv, "--sustained-operation-validation-evidence", "Validação da operação sustentada da Fase 21"),
    continuousOperationReviewEvidence: optionalEvidence(argv, "--continuous-operation-review-evidence", "Revisão da operação contínua da Fase 22"),
    nextCyclePlanningEvidence: optionalEvidence(argv, "--next-cycle-planning-evidence", "Plano controlado do próximo ciclo da Fase 23"),
    nextCycleExecutionReadinessEvidence: optionalEvidence(argv, "--next-cycle-execution-readiness-evidence", "Prontidão de execução da Fase 24"),
    nextCycleExecutionEvidence: optionalEvidence(argv, "--next-cycle-execution-evidence", "Execução manual do próximo ciclo da Fase 25"),
    nextCycleValidationEvidence: optionalEvidence(argv, "--next-cycle-validation-evidence", "Validação do próximo ciclo da Fase 26"),
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Fase 26 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
