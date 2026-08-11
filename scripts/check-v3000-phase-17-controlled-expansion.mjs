import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyPilotValidation } from "./check-v3000-phase-16-pilot-validation.mjs";

const defaults = {
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

function pendingResult(status, validationResult) {
  return {
    phase: 17,
    ok: true,
    controlledExpansionStatus: status,
    controlledExpansionAuthorized: false,
    automaticExpansionAllowed: false,
    productionExpansionPerformedByGate: false,
    rollbackReady: validationResult.rollbackReady,
    artifactVerified: validationResult.artifactVerified,
    sha256: validationResult.sha256,
    sourceFingerprint: validationResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateControlledExpansion({
  validationResult,
  expansionEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 17, "Fase do contrato");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(
    contract.databaseMutationAllowedByGate,
    false,
    "Mutação automática de banco",
  );
  assertEqual(
    contract.automaticUserProvisioningAllowed,
    false,
    "Provisionamento automático de usuários",
  );
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
  assertEqual(validationResult.ok, true, "Gate da Fase 16");
  assertEqual(validationResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(
    validationResult.sha256,
    phase11Contract.candidate.sha256,
    "SHA-256 da release",
  );
  assertEqual(
    validationResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!validationResult.pilotValidated) {
    return pendingResult("awaiting-pilot-validation", validationResult);
  }
  if (!expansionEvidence) {
    return pendingResult("awaiting-human-expansion-decision", validationResult);
  }

  assertEqual(expansionEvidence.phase, 17, "Fase da evidência");
  assertEqual(expansionEvidence.status, contract.requiredStatus, "Status da decisão");
  assertEqual(
    expansionEvidence.candidateSha256,
    phase11Contract.candidate.sha256,
    "SHA-256 da decisão",
  );
  assertEqual(
    expansionEvidence.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da decisão",
  );
  assertEqual(expansionEvidence.origin, contract.origin, "Origem da decisão");
  assertEqual(
    expansionEvidence.releaseIdentifier,
    validationResult.releaseIdentifier,
    "Identificador da release",
  );

  for (const check of contract.requiredChecks) {
    assertEqual(expansionEvidence[check], true, check);
  }
  for (const field of contract.requiredStringFields) {
    assertNonEmptyString(expansionEvidence[field], field);
  }

  assertEqual(
    expansionEvidence.currentPilotUserCount,
    validationResult.pilotUserCount,
    "Quantidade atual de usuários do piloto",
  );
  assertNonNegativeInteger(
    expansionEvidence.authorizedTotalUsers,
    "Total de usuários autorizado",
  );
  if (
    expansionEvidence.authorizedTotalUsers < contract.minimumAuthorizedTotalUsers ||
    expansionEvidence.authorizedTotalUsers > contract.maximumAuthorizedTotalUsers
  ) {
    throw new Error(
      `A expansão deve autorizar entre ${contract.minimumAuthorizedTotalUsers} e ${contract.maximumAuthorizedTotalUsers} usuários no total.`,
    );
  }
  if (expansionEvidence.authorizedTotalUsers <= validationResult.pilotUserCount) {
    throw new Error("A expansão deve aumentar de forma controlada o grupo validado.");
  }

  if (!Array.isArray(expansionEvidence.rolesAuthorized)) {
    throw new Error("rolesAuthorized deve ser uma lista.");
  }
  const roles = expansionEvidence.rolesAuthorized.map((role) =>
    typeof role === "string" ? role.trim().toUpperCase() : role,
  );
  if (new Set(roles).size !== roles.length) {
    throw new Error("rolesAuthorized não pode conter papéis duplicados.");
  }
  if (roles.length !== contract.requiredRoles.length) {
    throw new Error("A expansão deve preservar somente os papéis homologados.");
  }
  for (const role of contract.requiredRoles) {
    if (!roles.includes(role)) {
      throw new Error(`Papel obrigatório não autorizado na expansão: ${role}.`);
    }
  }

  assertNonNegativeInteger(expansionEvidence.criticalIncidents, "Incidentes críticos");
  assertNonNegativeInteger(
    expansionEvidence.unresolvedHighSeverityIncidents,
    "Incidentes graves não resolvidos",
  );
  assertEqual(
    expansionEvidence.criticalIncidents,
    contract.maximumCriticalIncidents,
    "Incidentes críticos",
  );
  assertEqual(
    expansionEvidence.unresolvedHighSeverityIncidents,
    contract.maximumUnresolvedHighSeverityIncidents,
    "Incidentes graves não resolvidos",
  );
  assertEqual(
    expansionEvidence.databaseMigrationsByGate,
    contract.requiredDatabaseMigrationsByGate,
    "Migrations executadas pelo gate",
  );
  assertEqual(
    expansionEvidence.bootstrapExecutionsByGate,
    contract.requiredBootstrapExecutionsByGate,
    "Execuções de bootstrap pelo gate",
  );
  assertEqual(
    expansionEvidence.businessDataMutationsByGate,
    contract.requiredBusinessDataMutationsByGate,
    "Mutações comerciais executadas pelo gate",
  );
  assertEqual(
    expansionEvidence.usersProvisionedByGate,
    contract.requiredUsersProvisionedByGate,
    "Usuários provisionados pelo gate",
  );
  assertEqual(
    expansionEvidence.secretValuesRecorded,
    contract.requiredSecretValuesRecorded,
    "Registro de segredos",
  );
  assertEqual(
    expansionEvidence.containsPersonalData,
    contract.requiredPersonalDataInEvidence,
    "Dados pessoais na evidência",
  );
  assertEqual(
    expansionEvidence.rolloutOwner,
    validationResult.rolloutOwner,
    "Responsável pela expansão",
  );
  assertEqual(
    expansionEvidence.rollbackOwner,
    validationResult.rollbackOwner,
    "Responsável pelo rollback",
  );

  const pilotEndedAt = timestamp(validationResult.pilotEndedAt, "pilotEndedAt da Fase 16");
  const reviewedAt = timestamp(expansionEvidence.reviewedAt, "reviewedAt");
  const expansionWindowStart = timestamp(
    expansionEvidence.expansionWindowStart,
    "expansionWindowStart",
  );
  if (reviewedAt < pilotEndedAt) {
    throw new Error("A decisão não pode ser anterior ao fim do piloto validado.");
  }
  if (expansionWindowStart < reviewedAt) {
    throw new Error("A janela de expansão não pode começar antes da aprovação humana.");
  }

  return {
    phase: 17,
    ok: true,
    controlledExpansionStatus: "authorized-for-manual-execution",
    controlledExpansionAuthorized: true,
    automaticExpansionAllowed: false,
    productionExpansionPerformedByGate: false,
    currentPilotUserCount: expansionEvidence.currentPilotUserCount,
    authorizedTotalUsers: expansionEvidence.authorizedTotalUsers,
    rolesAuthorized: roles,
    tenantIsolationPlanReviewed: true,
    monitoringCoverageConfirmed: true,
    supportCoverageConfirmed: true,
    rollbackReady: true,
    artifactVerified: true,
    sha256: validationResult.sha256,
    sourceFingerprint: validationResult.sourceFingerprint,
    releaseIdentifier: expansionEvidence.releaseIdentifier,
    decisionOwner: expansionEvidence.decisionOwner,
    rolloutOwner: expansionEvidence.rolloutOwner,
    rollbackOwner: expansionEvidence.rollbackOwner,
    reviewedBy: expansionEvidence.reviewedBy,
    sanitizedDecisionReference: expansionEvidence.sanitizedDecisionReference,
    expansionWindowStart: expansionEvidence.expansionWindowStart,
    reviewedAt: expansionEvidence.reviewedAt,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyControlledExpansion({
  zipPath,
  checksumPath,
  proofPath,
  phase17Contract,
  phase16Contract,
  phase15Contract,
  phase14Contract,
  phase13Contract,
  phase12Contract,
  phase11Contract,
  handoff,
  productionEvidence = null,
  releaseEvidence = null,
  observationEvidence = null,
  pilotEvidence = null,
  validationEvidence = null,
  expansionEvidence = null,
}) {
  const validationResult = verifyPilotValidation({
    zipPath,
    checksumPath,
    proofPath,
    phase16Contract,
    phase15Contract,
    phase14Contract,
    phase13Contract,
    phase12Contract,
    phase11Contract,
    handoff,
    productionEvidence,
    releaseEvidence,
    observationEvidence,
    pilotEvidence,
    validationEvidence,
  });
  return evaluateControlledExpansion({
    validationResult,
    expansionEvidence,
    contract: phase17Contract,
    phase11Contract,
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

  console.log(
    JSON.stringify(
      verifyControlledExpansion({
        zipPath: resolve(zipPath),
        checksumPath: resolve(checksumPath),
        proofPath: resolve(proofPath),
        phase17Contract: contract(
          argv,
          "--contract",
          defaults.phase17Contract,
          "Contrato da Fase 17",
        ),
        phase16Contract: contract(
          argv,
          "--phase-16-contract",
          defaults.phase16Contract,
          "Contrato da Fase 16",
        ),
        phase15Contract: contract(
          argv,
          "--phase-15-contract",
          defaults.phase15Contract,
          "Contrato da Fase 15",
        ),
        phase14Contract: contract(
          argv,
          "--phase-14-contract",
          defaults.phase14Contract,
          "Contrato da Fase 14",
        ),
        phase13Contract: contract(
          argv,
          "--phase-13-contract",
          defaults.phase13Contract,
          "Contrato da Fase 13",
        ),
        phase12Contract: contract(
          argv,
          "--phase-12-contract",
          defaults.phase12Contract,
          "Contrato da Fase 12",
        ),
        phase11Contract: contract(
          argv,
          "--phase-11-contract",
          defaults.phase11Contract,
          "Contrato da Fase 11",
        ),
        handoff: contract(argv, "--handoff", defaults.handoff, "Manifesto de instalação"),
        productionEvidence: optionalEvidence(
          argv,
          "--production-evidence",
          "Evidência pós-deploy da Fase 11",
        ),
        releaseEvidence: optionalEvidence(
          argv,
          "--release-evidence",
          "Aceite operacional da Fase 13",
        ),
        observationEvidence: optionalEvidence(
          argv,
          "--observation-evidence",
          "Observação operacional da Fase 14",
        ),
        pilotEvidence: optionalEvidence(
          argv,
          "--pilot-evidence",
          "Autorização do piloto da Fase 15",
        ),
        validationEvidence: optionalEvidence(
          argv,
          "--validation-evidence",
          "Validação operacional do piloto da Fase 16",
        ),
        expansionEvidence: optionalEvidence(
          argv,
          "--expansion-evidence",
          "Decisão de expansão controlada da Fase 17",
        ),
      }),
    ),
  );
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;
if (isMain) {
  try {
    runCli();
  } catch (error) {
    console.error(
      JSON.stringify({
        phase: 17,
        ok: false,
        error: error instanceof Error ? error.message : "Falha desconhecida.",
      }),
    );
    process.exitCode = 1;
  }
}
