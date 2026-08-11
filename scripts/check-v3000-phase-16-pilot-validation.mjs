import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyControlledPilot } from "./check-v3000-phase-15-controlled-pilot.mjs";

const defaults = {
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

function pendingResult(status, pilotResult) {
  return {
    phase: 16,
    ok: true,
    pilotValidationStatus: status,
    pilotValidated: false,
    productionExpansionAllowed: false,
    rollbackReady: pilotResult.rollbackReady,
    artifactVerified: pilotResult.artifactVerified,
    sha256: pilotResult.sha256,
    sourceFingerprint: pilotResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluatePilotValidation({
  pilotResult,
  validationEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 16, "Fase do contrato");
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
  assertEqual(pilotResult.ok, true, "Gate da Fase 15");
  assertEqual(pilotResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(pilotResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    pilotResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!pilotResult.pilotAuthorized) {
    return pendingResult("awaiting-controlled-pilot-authorization", pilotResult);
  }
  if (!validationEvidence) {
    return pendingResult("awaiting-pilot-validation-evidence", pilotResult);
  }

  assertEqual(validationEvidence.phase, 16, "Fase da evidência");
  assertEqual(
    validationEvidence.status,
    contract.requiredStatus,
    "Status da validação",
  );
  assertEqual(
    validationEvidence.candidateSha256,
    phase11Contract.candidate.sha256,
    "SHA-256 da validação",
  );
  assertEqual(
    validationEvidence.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da validação",
  );
  assertEqual(validationEvidence.origin, contract.origin, "Origem da validação");
  assertEqual(
    validationEvidence.releaseIdentifier,
    pilotResult.releaseIdentifier,
    "Identificador da release",
  );

  for (const check of contract.requiredChecks) {
    assertEqual(validationEvidence[check], true, check);
  }
  for (const field of contract.requiredStringFields) {
    assertNonEmptyString(validationEvidence[field], field);
  }

  assertEqual(
    validationEvidence.pilotUserCount,
    pilotResult.pilotUserCount,
    "Quantidade de usuários do piloto",
  );
  if (!Array.isArray(validationEvidence.rolesValidated)) {
    throw new Error("rolesValidated deve ser uma lista.");
  }
  const roles = validationEvidence.rolesValidated.map((role) =>
    typeof role === "string" ? role.trim().toUpperCase() : role,
  );
  if (new Set(roles).size !== roles.length) {
    throw new Error("rolesValidated não pode conter papéis duplicados.");
  }
  for (const role of contract.requiredRoles) {
    if (!roles.includes(role)) {
      throw new Error(`Papel obrigatório não validado no piloto: ${role}.`);
    }
  }
  const pilotRoles = new Set(pilotResult.rolesCovered);
  for (const role of roles) {
    if (!pilotRoles.has(role)) {
      throw new Error(`Papel não autorizado no escopo do piloto: ${role}.`);
    }
  }

  assertNonNegativeInteger(validationEvidence.criticalIncidents, "Incidentes críticos");
  assertNonNegativeInteger(
    validationEvidence.unresolvedHighSeverityIncidents,
    "Incidentes graves não resolvidos",
  );
  assertNonNegativeInteger(
    validationEvidence.failedRequiredJourneys,
    "Jornadas obrigatórias com falha",
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
    validationEvidence.failedRequiredJourneys,
    contract.maximumFailedRequiredJourneys,
    "Jornadas obrigatórias com falha",
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
    validationEvidence.rolloutOwner,
    pilotResult.rolloutOwner,
    "Responsável pelo piloto",
  );
  assertEqual(
    validationEvidence.rollbackOwner,
    pilotResult.rollbackOwner,
    "Responsável pelo rollback",
  );

  const pilotStartedAt = timestamp(pilotResult.pilotStartedAt, "pilotStartedAt da Fase 15");
  const evidenceStartedAt = timestamp(
    validationEvidence.pilotStartedAt,
    "pilotStartedAt",
  );
  const pilotEndedAt = timestamp(validationEvidence.pilotEndedAt, "pilotEndedAt");
  const reviewedAt = timestamp(validationEvidence.reviewedAt, "reviewedAt");
  if (evidenceStartedAt !== pilotStartedAt) {
    throw new Error("pilotStartedAt deve preservar o início autorizado na Fase 15.");
  }
  if (pilotEndedAt <= evidenceStartedAt) {
    throw new Error("pilotEndedAt deve ser posterior ao início do piloto.");
  }
  const durationMinutes = (pilotEndedAt - evidenceStartedAt) / 60_000;
  if (durationMinutes < contract.minimumPilotDurationMinutes) {
    throw new Error(
      `O piloto deve observar no mínimo ${contract.minimumPilotDurationMinutes} minutos.`,
    );
  }
  if (reviewedAt < pilotEndedAt) {
    throw new Error("reviewedAt não pode ser anterior ao fim do piloto.");
  }

  return {
    phase: 16,
    ok: true,
    pilotValidationStatus: "controlled-pilot-validated",
    pilotValidated: true,
    productionExpansionAllowed: false,
    pilotUserCount: validationEvidence.pilotUserCount,
    rolesValidated: roles,
    requiredJourneysValidated: true,
    tenantIsolationPreserved: true,
    rollbackReady: true,
    artifactVerified: true,
    sha256: pilotResult.sha256,
    sourceFingerprint: pilotResult.sourceFingerprint,
    releaseIdentifier: validationEvidence.releaseIdentifier,
    rolloutOwner: validationEvidence.rolloutOwner,
    rollbackOwner: validationEvidence.rollbackOwner,
    reviewedBy: validationEvidence.reviewedBy,
    sanitizedFeedbackReference: validationEvidence.sanitizedFeedbackReference,
    pilotStartedAt: validationEvidence.pilotStartedAt,
    pilotEndedAt: validationEvidence.pilotEndedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyPilotValidation({
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
  productionEvidence = null,
  releaseEvidence = null,
  observationEvidence = null,
  pilotEvidence = null,
  validationEvidence = null,
}) {
  const pilotResult = verifyControlledPilot({
    zipPath,
    checksumPath,
    proofPath,
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
  });
  return evaluatePilotValidation({
    pilotResult,
    validationEvidence,
    contract: phase16Contract,
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
      verifyPilotValidation({
        zipPath: resolve(zipPath),
        checksumPath: resolve(checksumPath),
        proofPath: resolve(proofPath),
        phase16Contract: contract(
          argv,
          "--contract",
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
        phase: 16,
        ok: false,
        error: error instanceof Error ? error.message : "Falha desconhecida.",
      }),
    );
    process.exitCode = 1;
  }
}
