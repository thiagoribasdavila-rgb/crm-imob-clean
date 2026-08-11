import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyExpansionExecution } from "./check-v3000-phase-18-expansion-execution.mjs";

const defaults = {
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

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido.`);
  return parsed;
}

function normalizedUniqueList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser uma lista.`);
  const normalized = value.map((entry) =>
    typeof entry === "string" ? entry.trim() : entry,
  );
  if (normalized.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${label} contém item inválido.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} não pode conter itens duplicados.`);
  }
  return normalized;
}

function pendingResult(status, executionResult) {
  return {
    phase: 19,
    ok: true,
    expandedCohortValidationStatus: status,
    expandedCohortValidated: false,
    sustainedOperationEligible: false,
    automaticProductionActionAllowed: false,
    artifactVerified: executionResult.artifactVerified,
    sha256: executionResult.sha256,
    sourceFingerprint: executionResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateExpandedCohortValidation({
  executionResult,
  validationEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 19, "Fase do contrato");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(contract.automaticUserProvisioningAllowed, false, "Provisionamento automático");
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
  assertEqual(executionResult.ok, true, "Gate da Fase 18");
  assertEqual(executionResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(executionResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    executionResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!executionResult.manualExpansionVerified) {
    return pendingResult("awaiting-controlled-expansion-execution", executionResult);
  }
  if (!validationEvidence) {
    return pendingResult("awaiting-expanded-cohort-validation", executionResult);
  }

  assertEqual(validationEvidence.phase, 19, "Fase da evidência");
  assertEqual(validationEvidence.status, contract.requiredStatus, "Status da validação");
  assertEqual(validationEvidence.candidateSha256, executionResult.sha256, "SHA-256 da validação");
  assertEqual(
    validationEvidence.sourceFingerprint,
    executionResult.sourceFingerprint,
    "Fingerprint da validação",
  );
  assertEqual(
    validationEvidence.releaseIdentifier,
    executionResult.releaseIdentifier,
    "Identificador da release",
  );

  for (const check of contract.requiredChecks) {
    assertEqual(validationEvidence[check], true, check);
  }
  for (const field of contract.requiredStringFields) {
    assertNonEmptyString(validationEvidence[field], field);
  }

  assertNonNegativeInteger(validationEvidence.expandedTotalUsers, "Total expandido");
  assertNonNegativeInteger(validationEvidence.validatedUserCount, "Usuários validados");
  assertEqual(
    validationEvidence.expandedTotalUsers,
    executionResult.expandedTotalUsers,
    "Total expandido",
  );
  assertEqual(
    validationEvidence.validatedUserCount,
    validationEvidence.expandedTotalUsers,
    "Usuários validados",
  );

  const roles = normalizedUniqueList(validationEvidence.rolesValidated, "rolesValidated")
    .map((role) => role.toUpperCase());
  if (roles.length !== contract.requiredRoles.length) {
    throw new Error("A validação deve cobrir somente os papéis obrigatórios.");
  }
  for (const role of contract.requiredRoles) {
    if (!roles.includes(role) || !executionResult.rolesExecuted.includes(role)) {
      throw new Error(`Papel obrigatório não validado: ${role}.`);
    }
  }

  const journeys = normalizedUniqueList(
    validationEvidence.journeysValidated,
    "journeysValidated",
  );
  if (journeys.length !== contract.requiredJourneys.length) {
    throw new Error("A validação deve cobrir exatamente as jornadas obrigatórias.");
  }
  for (const journey of contract.requiredJourneys) {
    if (!journeys.includes(journey)) {
      throw new Error(`Jornada obrigatória não validada: ${journey}.`);
    }
  }

  assertNonNegativeInteger(validationEvidence.criticalIncidents, "Incidentes críticos");
  assertNonNegativeInteger(
    validationEvidence.unresolvedHighSeverityIncidents,
    "Incidentes graves não resolvidos",
  );
  assertEqual(
    validationEvidence.criticalIncidents,
    contract.maximumCriticalIncidents,
    "Incidentes críticos",
  );
  assertEqual(
    validationEvidence.unresolvedHighSeverityIncidents,
    contract.maximumUnresolvedHighSeverityIncidents,
    "Incidentes graves não resolvidos",
  );
  assertEqual(
    validationEvidence.databaseMigrationsByGate,
    contract.requiredDatabaseMigrationsByGate,
    "Migrations executadas pelo gate",
  );
  assertEqual(
    validationEvidence.bootstrapExecutionsByGate,
    contract.requiredBootstrapExecutionsByGate,
    "Execuções de bootstrap pelo gate",
  );
  assertEqual(
    validationEvidence.businessDataMutationsByGate,
    contract.requiredBusinessDataMutationsByGate,
    "Mutações comerciais executadas pelo gate",
  );
  assertEqual(
    validationEvidence.usersProvisionedByGate,
    contract.requiredUsersProvisionedByGate,
    "Usuários provisionados pelo gate",
  );
  assertEqual(
    validationEvidence.secretValuesRecorded,
    contract.requiredSecretValuesRecorded,
    "Registro de segredos",
  );
  assertEqual(
    validationEvidence.containsPersonalData,
    contract.requiredPersonalDataInEvidence,
    "Dados pessoais na evidência",
  );
  assertEqual(
    validationEvidence.validationOwner,
    executionResult.executionOwner,
    "Responsável pela validação",
  );
  assertEqual(
    validationEvidence.rollbackOwner,
    executionResult.rollbackOwner,
    "Responsável pelo rollback",
  );

  const executionEndedAt = timestamp(executionResult.executionEndedAt, "executionEndedAt da Fase 18");
  const observationStartedAt = timestamp(
    validationEvidence.observationStartedAt,
    "observationStartedAt",
  );
  const observationEndedAt = timestamp(
    validationEvidence.observationEndedAt,
    "observationEndedAt",
  );
  const reviewedAt = timestamp(validationEvidence.reviewedAt, "reviewedAt");
  if (observationStartedAt < executionEndedAt) {
    throw new Error("A observação não pode começar antes do fim da expansão.");
  }
  if (observationEndedAt <= observationStartedAt) {
    throw new Error("observationEndedAt deve ser posterior ao início da observação.");
  }
  const observationMinutes = (observationEndedAt - observationStartedAt) / 60_000;
  if (observationMinutes < contract.minimumObservationDurationMinutes) {
    throw new Error(
      `A observação deve durar no mínimo ${contract.minimumObservationDurationMinutes} minutos.`,
    );
  }
  if (reviewedAt < observationEndedAt) {
    throw new Error("reviewedAt não pode ser anterior ao fim da observação.");
  }

  return {
    phase: 19,
    ok: true,
    expandedCohortValidationStatus: "expanded-cohort-validated",
    expandedCohortValidated: true,
    sustainedOperationEligible: true,
    automaticProductionActionAllowed: false,
    expandedTotalUsers: validationEvidence.expandedTotalUsers,
    validatedUserCount: validationEvidence.validatedUserCount,
    rolesValidated: roles,
    journeysValidated: journeys,
    tenantIsolationPreserved: true,
    leadScopePreserved: true,
    taskScopePreserved: true,
    pipelineScopePreserved: true,
    monitoringCoverageConfirmed: true,
    supportCoverageConfirmed: true,
    rollbackReady: true,
    artifactVerified: true,
    sha256: executionResult.sha256,
    sourceFingerprint: executionResult.sourceFingerprint,
    releaseIdentifier: executionResult.releaseIdentifier,
    validationOwner: validationEvidence.validationOwner,
    rollbackOwner: validationEvidence.rollbackOwner,
    observationStartedAt: validationEvidence.observationStartedAt,
    observationEndedAt: validationEvidence.observationEndedAt,
    reviewedAt: validationEvidence.reviewedAt,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyExpandedCohortValidation(input) {
  const executionResult = verifyExpansionExecution({
    ...input,
    validationEvidence: input.pilotValidationEvidence,
  });
  return evaluateExpandedCohortValidation({
    executionResult,
    validationEvidence: input.expandedCohortValidationEvidence,
    contract: input.phase19Contract,
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

  console.log(JSON.stringify(verifyExpandedCohortValidation({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
    phase19Contract: contract(argv, "--phase-19-contract", defaults.phase19Contract, "Contrato da Fase 19"),
    phase18Contract: contract(argv, "--phase-18-contract", defaults.phase18Contract, "Contrato da Fase 18"),
    phase17Contract: contract(argv, "--phase-17-contract", defaults.phase17Contract, "Contrato da Fase 17"),
    phase16Contract: contract(argv, "--phase-16-contract", defaults.phase16Contract, "Contrato da Fase 16"),
    phase15Contract: contract(argv, "--phase-15-contract", defaults.phase15Contract, "Contrato da Fase 15"),
    phase14Contract: contract(argv, "--phase-14-contract", defaults.phase14Contract, "Contrato da Fase 14"),
    phase13Contract: contract(argv, "--phase-13-contract", defaults.phase13Contract, "Contrato da Fase 13"),
    phase12Contract: contract(argv, "--phase-12-contract", defaults.phase12Contract, "Contrato da Fase 12"),
    phase11Contract: contract(argv, "--phase-11-contract", defaults.phase11Contract, "Contrato da Fase 11"),
    handoff: contract(argv, "--handoff", defaults.handoff, "Handoff da Fase 12"),
    productionEvidence: optionalEvidence(argv, "--production-evidence", "Evidência pós-deploy da Fase 11"),
    releaseEvidence: optionalEvidence(argv, "--release-evidence", "Aceite operacional da Fase 13"),
    observationEvidence: optionalEvidence(argv, "--observation-evidence", "Observação operacional da Fase 14"),
    pilotEvidence: optionalEvidence(argv, "--pilot-evidence", "Autorização do piloto da Fase 15"),
    pilotValidationEvidence: optionalEvidence(argv, "--pilot-validation-evidence", "Validação operacional do piloto da Fase 16"),
    expansionEvidence: optionalEvidence(argv, "--expansion-evidence", "Decisão de expansão da Fase 17"),
    executionEvidence: optionalEvidence(argv, "--execution-evidence", "Execução manual da Fase 18"),
    expandedCohortValidationEvidence: optionalEvidence(argv, "--expanded-cohort-validation-evidence", "Validação da coorte expandida da Fase 19"),
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Fase 19 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
