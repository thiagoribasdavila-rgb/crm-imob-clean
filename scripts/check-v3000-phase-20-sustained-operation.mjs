import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyExpandedCohortValidation } from "./check-v3000-phase-19-expanded-cohort-validation.mjs";

const defaults = {
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

function pendingResult(status, validationResult) {
  return {
    phase: 20,
    ok: true,
    sustainedOperationStatus: status,
    sustainedOperationAuthorized: false,
    manualSustainedOperationEligible: false,
    automaticProductionActionAllowed: false,
    artifactVerified: validationResult.artifactVerified,
    sha256: validationResult.sha256,
    sourceFingerprint: validationResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateSustainedOperationAuthorization({
  validationResult,
  sustainedOperationEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 20, "Fase do contrato");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(contract.automaticUserProvisioningAllowed, false, "Provisionamento automático");
  assertEqual(
    contract.automaticSustainedOperationExecutionAllowed,
    false,
    "Execução automática da operação sustentada",
  );
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
  assertEqual(validationResult.ok, true, "Gate da Fase 19");
  assertEqual(validationResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(validationResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    validationResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!validationResult.expandedCohortValidated || !validationResult.sustainedOperationEligible) {
    return pendingResult("awaiting-expanded-cohort-validation", validationResult);
  }
  if (!sustainedOperationEvidence) {
    return pendingResult("awaiting-sustained-operation-decision", validationResult);
  }

  const evidence = sustainedOperationEvidence;
  assertEqual(evidence.phase, 20, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da decisão");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão operacional");
  assertEqual(evidence.candidateSha256, validationResult.sha256, "SHA-256 da decisão");
  assertEqual(
    evidence.sourceFingerprint,
    validationResult.sourceFingerprint,
    "Fingerprint da decisão",
  );
  assertEqual(evidence.origin, contract.origin, "Origem da decisão");
  assertEqual(
    evidence.releaseIdentifier,
    validationResult.releaseIdentifier,
    "Identificador da release",
  );

  for (const check of contract.requiredChecks) {
    assertEqual(evidence[check], true, check);
  }
  for (const field of contract.requiredStringFields) {
    assertNonEmptyString(evidence[field], field);
  }
  assertEqual(
    evidence.decisionRole.trim().toUpperCase(),
    contract.requiredDecisionRole,
    "Papel responsável pela decisão",
  );

  assertNonNegativeInteger(evidence.authorizedUserCount, "Usuários autorizados");
  assertEqual(
    evidence.authorizedUserCount,
    validationResult.validatedUserCount,
    "Coorte autorizada",
  );
  assertEqual(
    evidence.authorizedUserCount,
    validationResult.expandedTotalUsers,
    "Total expandido autorizado",
  );

  const roles = normalizedUniqueList(evidence.rolesAuthorized, "rolesAuthorized");
  if (roles.length !== contract.requiredRoles.length) {
    throw new Error("A autorização deve preservar somente os papéis validados.");
  }
  for (const role of contract.requiredRoles) {
    if (!roles.includes(role) || !validationResult.rolesValidated.includes(role)) {
      throw new Error(`Papel obrigatório não autorizado: ${role}.`);
    }
  }

  assertNonNegativeInteger(evidence.criticalIncidents, "Incidentes críticos");
  assertNonNegativeInteger(
    evidence.unresolvedHighSeverityIncidents,
    "Incidentes graves não resolvidos",
  );
  assertEqual(
    evidence.criticalIncidents,
    contract.maximumCriticalIncidents,
    "Incidentes críticos",
  );
  assertEqual(
    evidence.unresolvedHighSeverityIncidents,
    contract.maximumUnresolvedHighSeverityIncidents,
    "Incidentes graves não resolvidos",
  );
  assertEqual(
    evidence.databaseMigrationsByGate,
    contract.requiredDatabaseMigrationsByGate,
    "Migrations executadas pelo gate",
  );
  assertEqual(
    evidence.bootstrapExecutionsByGate,
    contract.requiredBootstrapExecutionsByGate,
    "Execuções de bootstrap pelo gate",
  );
  assertEqual(
    evidence.businessDataMutationsByGate,
    contract.requiredBusinessDataMutationsByGate,
    "Mutações comerciais executadas pelo gate",
  );
  assertEqual(
    evidence.usersProvisionedByGate,
    contract.requiredUsersProvisionedByGate,
    "Usuários provisionados pelo gate",
  );
  assertEqual(
    evidence.secretValuesRecorded,
    contract.requiredSecretValuesRecorded,
    "Registro de segredos",
  );
  assertEqual(
    evidence.containsPersonalData,
    contract.requiredPersonalDataInEvidence,
    "Dados pessoais na evidência",
  );
  assertEqual(
    evidence.validationOwner,
    validationResult.validationOwner,
    "Responsável pela validação",
  );
  assertEqual(
    evidence.rollbackOwner,
    validationResult.rollbackOwner,
    "Responsável pelo rollback",
  );

  const phase19ReviewedAt = timestamp(validationResult.reviewedAt, "reviewedAt da Fase 19");
  const authorizedAt = timestamp(evidence.authorizedAt, "authorizedAt");
  const operationWindowStart = timestamp(evidence.operationWindowStart, "operationWindowStart");
  const operationWindowEnd = timestamp(evidence.operationWindowEnd, "operationWindowEnd");
  if (authorizedAt < phase19ReviewedAt) {
    throw new Error("A autorização não pode ser anterior à validação da Fase 19.");
  }
  if (operationWindowStart < authorizedAt) {
    throw new Error("A janela operacional não pode começar antes da autorização.");
  }
  if (operationWindowEnd <= operationWindowStart) {
    throw new Error("operationWindowEnd deve ser posterior ao início da janela.");
  }
  const windowHours = (operationWindowEnd - operationWindowStart) / 3_600_000;
  if (windowHours < contract.minimumAuthorizationWindowHours) {
    throw new Error(
      `A janela operacional deve durar no mínimo ${contract.minimumAuthorizationWindowHours} horas.`,
    );
  }
  if (windowHours > contract.maximumAuthorizationWindowHours) {
    throw new Error(
      `A janela operacional deve durar no máximo ${contract.maximumAuthorizationWindowHours} horas.`,
    );
  }

  return {
    phase: 20,
    ok: true,
    sustainedOperationStatus: "manual-sustained-operation-authorized",
    sustainedOperationAuthorized: true,
    manualSustainedOperationEligible: true,
    automaticProductionActionAllowed: false,
    authorizedUserCount: evidence.authorizedUserCount,
    rolesAuthorized: roles,
    tenantIsolationConfirmed: true,
    leadScopeConfirmed: true,
    taskScopeConfirmed: true,
    pipelineScopeConfirmed: true,
    monitoringCoverageConfirmed: true,
    supportCoverageConfirmed: true,
    rollbackReady: true,
    artifactVerified: true,
    sha256: validationResult.sha256,
    sourceFingerprint: validationResult.sourceFingerprint,
    releaseIdentifier: validationResult.releaseIdentifier,
    decisionOwner: evidence.decisionOwner,
    decisionRole: contract.requiredDecisionRole,
    validationOwner: evidence.validationOwner,
    rollbackOwner: evidence.rollbackOwner,
    reviewedBy: evidence.reviewedBy,
    sanitizedDecisionReference: evidence.sanitizedDecisionReference,
    authorizedAt: evidence.authorizedAt,
    operationWindowStart: evidence.operationWindowStart,
    operationWindowEnd: evidence.operationWindowEnd,
    authorizationWindowHours: windowHours,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifySustainedOperationAuthorization(input) {
  const validationResult = verifyExpandedCohortValidation(input);
  return evaluateSustainedOperationAuthorization({
    validationResult,
    sustainedOperationEvidence: input.sustainedOperationEvidence,
    contract: input.phase20Contract,
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

  console.log(JSON.stringify(verifySustainedOperationAuthorization({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
    phase20Contract: contract(argv, "--phase-20-contract", defaults.phase20Contract, "Contrato da Fase 20"),
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
    sustainedOperationEvidence: optionalEvidence(argv, "--sustained-operation-evidence", "Autorização da operação sustentada da Fase 20"),
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Fase 20 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
