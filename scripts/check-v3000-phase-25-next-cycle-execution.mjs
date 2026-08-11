import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyNextCycleExecutionReadiness,
} from "./check-v3000-phase-24-next-cycle-execution-readiness.mjs";

export { canonicalEvidenceSha256 };

const defaults = {
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

function pendingResult(status, readinessResult) {
  return {
    phase: 25,
    ok: true,
    nextCycleExecutionStatus: status,
    nextCycleExecutionEvidenceVerified: false,
    manualNextCycleExecutionVerified: false,
    nextCycleExecutionPerformed: false,
    nextCycleValidationRequired: false,
    automaticProductionActionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: readinessResult.artifactVerified,
    sha256: readinessResult.sha256,
    sourceFingerprint: readinessResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateNextCycleExecution({
  readinessResult,
  nextCycleExecutionReadinessEvidence = null,
  nextCycleExecutionEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 25, "Fase do contrato");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(contract.automaticUserProvisioningAllowed, false, "Provisionamento automático");
  assertEqual(contract.automaticNextCycleExecutionAllowed, false, "Execução automática do ciclo");
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
  assertEqual(readinessResult.ok, true, "Gate da Fase 24");
  assertEqual(readinessResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(readinessResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    readinessResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!readinessResult.manualNextCycleExecutionAuthorized) {
    const status = readinessResult.nextCycleExecutionReviewStatus === "awaiting-next-cycle-plan"
      ? "awaiting-next-cycle-plan"
      : "awaiting-next-cycle-execution-authorization";
    return pendingResult(status, readinessResult);
  }
  if (!nextCycleExecutionEvidence) {
    return pendingResult("awaiting-next-cycle-execution-evidence", readinessResult);
  }
  if (!nextCycleExecutionReadinessEvidence) {
    throw new Error("A evidência da Fase 24 é obrigatória para comprovar a execução do ciclo.");
  }

  const evidence = nextCycleExecutionEvidence;
  assertEqual(evidence.phase, 25, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da execução");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da execução");
  assertEqual(evidence.candidateSha256, readinessResult.sha256, "SHA-256 da execução");
  assertEqual(evidence.sourceFingerprint, readinessResult.sourceFingerprint, "Fingerprint da execução");
  assertEqual(evidence.origin, contract.origin, "Origem da execução");
  assertEqual(evidence.releaseIdentifier, readinessResult.releaseIdentifier, "Identificador da release");
  assertEqual(
    evidence.nextCycleExecutionReadinessEvidenceSha256,
    canonicalEvidenceSha256(nextCycleExecutionReadinessEvidence),
    "Hash canônico da evidência da Fase 24",
  );
  assertEqual(evidence.cycleIdentifier, readinessResult.cycleIdentifier, "Identificador do ciclo");

  for (const check of contract.requiredChecks) assertEqual(evidence[check], true, check);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.executedUserCount, "Quantidade de usuários executados");
  if (evidence.executedUserCount < contract.minimumExecutedUserCount) {
    throw new Error("A execução deve comprovar pelo menos um usuário autorizado.");
  }
  if (evidence.executedUserCount > readinessResult.authorizedUserCount) {
    throw new Error("A execução não pode superar a coorte autorizada na Fase 24.");
  }

  const roles = normalizedUniqueList(evidence.rolesExecuted, "rolesExecuted");
  const authorizedRoles = normalizedUniqueList(readinessResult.rolesAuthorized, "rolesAuthorized");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, authorizedRoles)) {
    throw new Error("Os papéis executados devem ser exatamente os autorizados na Fase 24.");
  }

  assertNonNegativeInteger(
    evidence.successfulRequiredJourneys,
    "Jornadas obrigatórias bem-sucedidas",
  );
  if (evidence.successfulRequiredJourneys < readinessResult.minimumSuccessfulRequiredJourneys) {
    throw new Error("A execução não comprovou o mínimo de jornadas obrigatórias bem-sucedidas.");
  }
  assertNonNegativeInteger(evidence.requiredJourneyFailures, "Falhas em jornadas obrigatórias");
  if (
    evidence.requiredJourneyFailures > readinessResult.maximumRequiredJourneyFailures ||
    evidence.requiredJourneyFailures > contract.maximumRequiredJourneyFailures
  ) {
    throw new Error("A execução excedeu a tolerância de falhas em jornadas obrigatórias.");
  }

  for (const [field, minimum, label] of [
    ["observedAvailabilityPercent", readinessResult.minimumAvailabilityPercent, "Disponibilidade observada"],
    ["monitoringCoveragePercent", readinessResult.minimumMonitoringCoveragePercent, "Cobertura de monitoramento"],
  ]) {
    assertFiniteNumber(evidence[field], label);
    if (evidence[field] < minimum || evidence[field] > 100) {
      throw new Error(`${label} fora do limite autorizado.`);
    }
  }

  for (const [field, maximum, label] of [
    ["criticalIncidents", contract.maximumCriticalIncidents, "Incidentes críticos"],
    [
      "unresolvedHighSeverityIncidents",
      contract.maximumUnresolvedHighSeverityIncidents,
      "Incidentes graves não resolvidos",
    ],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    const readinessMaximum = field === "criticalIncidents"
      ? readinessResult.maximumCriticalIncidents
      : readinessResult.maximumUnresolvedHighSeverityIncidents;
    if (evidence[field] > maximum || evidence[field] > readinessMaximum) {
      throw new Error(`${label} acima do limite autorizado.`);
    }
  }

  assertNonNegativeInteger(evidence.observedCostCents, "Custo observado");
  if (evidence.observedCostCents > readinessResult.authorizedCostCeilingCents) {
    throw new Error("O custo observado excedeu o teto autorizado na Fase 24.");
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
    evidence.executionOwner === readinessResult.executionReadinessOwner ||
    evidence.executionOwner === readinessResult.authorizedBy
  ) {
    throw new Error("O executor deve ser independente da revisão e da autorização da Fase 24.");
  }
  if (evidence.witnessedBy === evidence.executionOwner) {
    throw new Error("A testemunha da execução deve ser independente do executor.");
  }

  const authorizedWindowStart = timestamp(
    readinessResult.authorizedWindowStart,
    "authorizedWindowStart da Fase 24",
  );
  const authorizedWindowEnd = timestamp(
    readinessResult.authorizedWindowEnd,
    "authorizedWindowEnd da Fase 24",
  );
  const executionStartedAt = timestamp(evidence.executionStartedAt, "executionStartedAt");
  const executionCompletedAt = timestamp(evidence.executionCompletedAt, "executionCompletedAt");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (executionStartedAt < authorizedWindowStart || executionCompletedAt > authorizedWindowEnd) {
    throw new Error("A execução deve permanecer integralmente dentro da janela autorizada.");
  }
  if (executionCompletedAt <= executionStartedAt) {
    throw new Error("executionCompletedAt deve ser posterior ao início da execução.");
  }
  const durationMinutes = (executionCompletedAt - executionStartedAt) / 60_000;
  if (durationMinutes < contract.minimumExecutionDurationMinutes) {
    throw new Error(
      `A execução deve durar no mínimo ${contract.minimumExecutionDurationMinutes} minutos.`,
    );
  }
  if (recordedAt < executionCompletedAt) {
    throw new Error("recordedAt não pode anteceder o fim da execução.");
  }

  return {
    phase: 25,
    ok: true,
    nextCycleExecutionStatus: "next-cycle-executed",
    nextCycleExecutionEvidenceVerified: true,
    manualNextCycleExecutionVerified: true,
    nextCycleExecutionPerformed: true,
    nextCycleValidationRequired: true,
    automaticProductionActionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    executedUserCount: evidence.executedUserCount,
    rolesExecuted: roles,
    successfulRequiredJourneys: evidence.successfulRequiredJourneys,
    requiredJourneyFailures: evidence.requiredJourneyFailures,
    observedAvailabilityPercent: evidence.observedAvailabilityPercent,
    monitoringCoveragePercent: evidence.monitoringCoveragePercent,
    criticalIncidents: evidence.criticalIncidents,
    unresolvedHighSeverityIncidents: evidence.unresolvedHighSeverityIncidents,
    observedCostCents: evidence.observedCostCents,
    artifactVerified: true,
    sha256: readinessResult.sha256,
    sourceFingerprint: readinessResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    nextCycleExecutionReadinessEvidenceSha256:
      evidence.nextCycleExecutionReadinessEvidenceSha256,
    cycleIdentifier: evidence.cycleIdentifier,
    executionOwner: evidence.executionOwner,
    witnessedBy: evidence.witnessedBy,
    sanitizedExecutionReference: evidence.sanitizedExecutionReference,
    executionStartedAt: evidence.executionStartedAt,
    executionCompletedAt: evidence.executionCompletedAt,
    recordedAt: evidence.recordedAt,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyNextCycleExecution(input) {
  const readinessResult = verifyNextCycleExecutionReadiness(input);
  return evaluateNextCycleExecution({
    readinessResult,
    nextCycleExecutionReadinessEvidence: input.nextCycleExecutionReadinessEvidence,
    nextCycleExecutionEvidence: input.nextCycleExecutionEvidence,
    contract: input.phase25Contract,
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
  for (let phase = 11; phase <= 25; phase += 1) {
    const key = `phase${phase}Contract`;
    contractArgs[key] = contract(
      argv,
      `--phase-${phase}-contract`,
      defaults[key],
      `Contrato da Fase ${phase}`,
    );
  }

  console.log(JSON.stringify(verifyNextCycleExecution({
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
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Fase 25 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
