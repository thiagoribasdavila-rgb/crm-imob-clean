import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyControlledExpansion } from "./check-v3000-phase-17-controlled-expansion.mjs";

const defaults = {
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

function pendingResult(status, expansionResult) {
  return {
    phase: 18,
    ok: true,
    expansionExecutionStatus: status,
    manualExpansionVerified: false,
    automaticExpansionAllowed: false,
    artifactVerified: expansionResult.artifactVerified,
    sha256: expansionResult.sha256,
    sourceFingerprint: expansionResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateExpansionExecution({
  expansionResult,
  executionEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 18, "Fase do contrato");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(
    contract.automaticUserProvisioningAllowed,
    false,
    "Provisionamento automático de usuários",
  );
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
  assertEqual(expansionResult.ok, true, "Gate da Fase 17");
  assertEqual(expansionResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(expansionResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    expansionResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!expansionResult.controlledExpansionAuthorized) {
    return pendingResult("awaiting-controlled-expansion-authorization", expansionResult);
  }
  if (!executionEvidence) {
    return pendingResult("awaiting-manual-expansion-execution", expansionResult);
  }

  assertEqual(executionEvidence.phase, 18, "Fase da evidência");
  assertEqual(executionEvidence.status, contract.requiredStatus, "Status da execução");
  assertEqual(
    executionEvidence.candidateSha256,
    phase11Contract.candidate.sha256,
    "SHA-256 da execução",
  );
  assertEqual(
    executionEvidence.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da execução",
  );
  assertEqual(
    executionEvidence.releaseIdentifier,
    expansionResult.releaseIdentifier,
    "Identificador da release",
  );

  for (const check of contract.requiredChecks) {
    assertEqual(executionEvidence[check], true, check);
  }
  for (const field of contract.requiredStringFields) {
    assertNonEmptyString(executionEvidence[field], field);
  }

  assertNonNegativeInteger(
    executionEvidence.previousPilotUserCount,
    "Quantidade anterior do piloto",
  );
  assertNonNegativeInteger(executionEvidence.expandedTotalUsers, "Total expandido");
  assertNonNegativeInteger(
    executionEvidence.manuallyOnboardedUsers,
    "Usuários incluídos manualmente",
  );
  assertNonNegativeInteger(
    executionEvidence.successfulAccessValidations,
    "Validações de acesso bem-sucedidas",
  );
  assertEqual(
    executionEvidence.previousPilotUserCount,
    expansionResult.currentPilotUserCount,
    "Quantidade anterior do piloto",
  );
  assertEqual(
    executionEvidence.expandedTotalUsers,
    expansionResult.authorizedTotalUsers,
    "Total expandido",
  );
  assertEqual(
    executionEvidence.manuallyOnboardedUsers,
    expansionResult.authorizedTotalUsers - expansionResult.currentPilotUserCount,
    "Usuários incluídos manualmente",
  );
  assertEqual(
    executionEvidence.successfulAccessValidations,
    executionEvidence.expandedTotalUsers,
    "Validações de acesso bem-sucedidas",
  );

  if (!Array.isArray(executionEvidence.rolesExecuted)) {
    throw new Error("rolesExecuted deve ser uma lista.");
  }
  const roles = executionEvidence.rolesExecuted.map((role) =>
    typeof role === "string" ? role.trim().toUpperCase() : role,
  );
  if (new Set(roles).size !== roles.length) {
    throw new Error("rolesExecuted não pode conter papéis duplicados.");
  }
  if (roles.length !== contract.requiredRoles.length) {
    throw new Error("A execução deve preservar somente os papéis autorizados.");
  }
  for (const role of contract.requiredRoles) {
    if (!roles.includes(role) || !expansionResult.rolesAuthorized.includes(role)) {
      throw new Error(`Papel obrigatório não comprovado na execução: ${role}.`);
    }
  }

  assertNonNegativeInteger(executionEvidence.criticalIncidents, "Incidentes críticos");
  assertNonNegativeInteger(
    executionEvidence.unresolvedHighSeverityIncidents,
    "Incidentes graves não resolvidos",
  );
  assertEqual(
    executionEvidence.criticalIncidents,
    contract.maximumCriticalIncidents,
    "Incidentes críticos",
  );
  assertEqual(
    executionEvidence.unresolvedHighSeverityIncidents,
    contract.maximumUnresolvedHighSeverityIncidents,
    "Incidentes graves não resolvidos",
  );
  assertEqual(
    executionEvidence.databaseMigrationsByGate,
    contract.requiredDatabaseMigrationsByGate,
    "Migrations executadas pelo gate",
  );
  assertEqual(
    executionEvidence.bootstrapExecutionsByGate,
    contract.requiredBootstrapExecutionsByGate,
    "Execuções de bootstrap pelo gate",
  );
  assertEqual(
    executionEvidence.businessDataMutationsByGate,
    contract.requiredBusinessDataMutationsByGate,
    "Mutações comerciais executadas pelo gate",
  );
  assertEqual(
    executionEvidence.usersProvisionedByGate,
    contract.requiredUsersProvisionedByGate,
    "Usuários provisionados pelo gate",
  );
  assertEqual(
    executionEvidence.secretValuesRecorded,
    contract.requiredSecretValuesRecorded,
    "Registro de segredos",
  );
  assertEqual(
    executionEvidence.containsPersonalData,
    contract.requiredPersonalDataInEvidence,
    "Dados pessoais na evidência",
  );
  assertEqual(
    executionEvidence.executionOwner,
    expansionResult.rolloutOwner,
    "Responsável pela execução",
  );
  assertEqual(
    executionEvidence.rollbackOwner,
    expansionResult.rollbackOwner,
    "Responsável pelo rollback",
  );

  const expansionWindowStart = timestamp(
    expansionResult.expansionWindowStart,
    "expansionWindowStart da Fase 17",
  );
  const executionStartedAt = timestamp(executionEvidence.executionStartedAt, "executionStartedAt");
  const executionEndedAt = timestamp(executionEvidence.executionEndedAt, "executionEndedAt");
  const validatedAt = timestamp(executionEvidence.validatedAt, "validatedAt");
  if (executionStartedAt < expansionWindowStart) {
    throw new Error("A execução não pode começar antes da janela autorizada.");
  }
  if (executionEndedAt <= executionStartedAt) {
    throw new Error("executionEndedAt deve ser posterior ao início da execução.");
  }
  const durationMinutes = (executionEndedAt - executionStartedAt) / 60_000;
  if (durationMinutes < contract.minimumExecutionDurationMinutes) {
    throw new Error(
      `A execução deve durar no mínimo ${contract.minimumExecutionDurationMinutes} minutos.`,
    );
  }
  if (validatedAt < executionEndedAt) {
    throw new Error("validatedAt não pode ser anterior ao fim da execução.");
  }

  return {
    phase: 18,
    ok: true,
    expansionExecutionStatus: "controlled-expansion-executed",
    manualExpansionVerified: true,
    automaticExpansionAllowed: false,
    expandedTotalUsers: executionEvidence.expandedTotalUsers,
    manuallyOnboardedUsers: executionEvidence.manuallyOnboardedUsers,
    successfulAccessValidations: executionEvidence.successfulAccessValidations,
    rolesExecuted: roles,
    tenantIsolationPreserved: true,
    monitoringActive: true,
    supportAvailable: true,
    rollbackReady: true,
    artifactVerified: true,
    sha256: expansionResult.sha256,
    sourceFingerprint: expansionResult.sourceFingerprint,
    releaseIdentifier: executionEvidence.releaseIdentifier,
    executionOwner: executionEvidence.executionOwner,
    rollbackOwner: executionEvidence.rollbackOwner,
    executionStartedAt: executionEvidence.executionStartedAt,
    executionEndedAt: executionEvidence.executionEndedAt,
    validatedAt: executionEvidence.validatedAt,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyExpansionExecution(input) {
  const expansionResult = verifyControlledExpansion(input);
  return evaluateExpansionExecution({
    expansionResult,
    executionEvidence: input.executionEvidence,
    contract: input.phase18Contract,
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

  console.log(JSON.stringify(verifyExpansionExecution({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
    phase18Contract: contract(argv, "--contract", defaults.phase18Contract, "Contrato da Fase 18"),
    phase17Contract: contract(argv, "--phase-17-contract", defaults.phase17Contract, "Contrato da Fase 17"),
    phase16Contract: contract(argv, "--phase-16-contract", defaults.phase16Contract, "Contrato da Fase 16"),
    phase15Contract: contract(argv, "--phase-15-contract", defaults.phase15Contract, "Contrato da Fase 15"),
    phase14Contract: contract(argv, "--phase-14-contract", defaults.phase14Contract, "Contrato da Fase 14"),
    phase13Contract: contract(argv, "--phase-13-contract", defaults.phase13Contract, "Contrato da Fase 13"),
    phase12Contract: contract(argv, "--phase-12-contract", defaults.phase12Contract, "Contrato da Fase 12"),
    phase11Contract: contract(argv, "--phase-11-contract", defaults.phase11Contract, "Contrato da Fase 11"),
    handoff: contract(argv, "--handoff", defaults.handoff, "Manifesto de instalação"),
    productionEvidence: optionalEvidence(argv, "--production-evidence", "Evidência pós-deploy da Fase 11"),
    releaseEvidence: optionalEvidence(argv, "--release-evidence", "Aceite operacional da Fase 13"),
    observationEvidence: optionalEvidence(argv, "--observation-evidence", "Observação operacional da Fase 14"),
    pilotEvidence: optionalEvidence(argv, "--pilot-evidence", "Autorização do piloto da Fase 15"),
    validationEvidence: optionalEvidence(argv, "--validation-evidence", "Validação operacional do piloto da Fase 16"),
    expansionEvidence: optionalEvidence(argv, "--expansion-evidence", "Decisão de expansão da Fase 17"),
    executionEvidence: optionalEvidence(argv, "--execution-evidence", "Execução manual da Fase 18"),
  })));
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (isMain) {
  try {
    runCli();
  } catch (error) {
    console.error(JSON.stringify({
      phase: 18,
      ok: false,
      error: error instanceof Error ? error.message : "Falha desconhecida.",
    }));
    process.exitCode = 1;
  }
}
