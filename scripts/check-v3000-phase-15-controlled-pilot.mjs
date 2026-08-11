import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyOperationalObservation } from "./check-v3000-phase-14-operational-observation.mjs";

const defaults = {
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

function assertIntegerBetween(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${label} deve ser inteiro entre ${minimum} e ${maximum}.`,
    );
  }
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido.`);
  return parsed;
}

function pendingResult(status, observationResult) {
  return {
    phase: 15,
    ok: true,
    pilotStatus: status,
    pilotAuthorized: false,
    productionExpansionAllowed: false,
    rollbackReady: observationResult.rollbackReady,
    artifactVerified: observationResult.artifactVerified,
    sha256: observationResult.sha256,
    sourceFingerprint: observationResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateControlledPilot({
  observationResult,
  pilotEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 15, "Fase do contrato");
  assertEqual(
    contract.deploymentPerformedByGate,
    false,
    "Publicação automática",
  );
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
  assertEqual(
    contract.automaticExpansionAllowed,
    false,
    "Expansão automática",
  );
  assertEqual(
    contract.automaticRollbackAllowed,
    false,
    "Rollback automático",
  );
  assertEqual(observationResult.ok, true, "Gate da Fase 14");
  assertEqual(observationResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(
    observationResult.sha256,
    phase11Contract.candidate.sha256,
    "SHA-256 da release",
  );
  assertEqual(
    observationResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!observationResult.observationClosed) {
    return pendingResult("awaiting-operational-observation", observationResult);
  }
  if (!pilotEvidence) {
    return pendingResult("awaiting-controlled-pilot-approval", observationResult);
  }

  assertEqual(pilotEvidence.phase, 15, "Fase da evidência");
  assertEqual(pilotEvidence.status, contract.requiredStatus, "Status do piloto");
  assertEqual(
    pilotEvidence.candidateSha256,
    phase11Contract.candidate.sha256,
    "SHA-256 do piloto",
  );
  assertEqual(
    pilotEvidence.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint do piloto",
  );
  assertEqual(pilotEvidence.origin, contract.origin, "Origem do piloto");
  assertEqual(
    pilotEvidence.releaseIdentifier,
    observationResult.releaseIdentifier,
    "Identificador da release",
  );

  for (const check of contract.requiredChecks) {
    assertEqual(pilotEvidence[check], true, check);
  }
  for (const field of contract.requiredStringFields) {
    assertNonEmptyString(pilotEvidence[field], field);
  }

  assertIntegerBetween(
    pilotEvidence.pilotUserCount,
    contract.minimumPilotUsers,
    contract.maximumPilotUsers,
    "Usuários do piloto",
  );
  if (!Array.isArray(pilotEvidence.rolesCovered)) {
    throw new Error("rolesCovered deve ser uma lista.");
  }
  const roles = pilotEvidence.rolesCovered.map((role) =>
    typeof role === "string" ? role.trim().toUpperCase() : role,
  );
  if (new Set(roles).size !== roles.length) {
    throw new Error("rolesCovered não pode conter papéis duplicados.");
  }
  for (const role of contract.requiredRoles) {
    if (!roles.includes(role)) {
      throw new Error(`Papel obrigatório ausente no piloto: ${role}.`);
    }
  }

  assertEqual(
    pilotEvidence.criticalIncidents,
    contract.maximumCriticalIncidents,
    "Incidentes críticos",
  );
  assertEqual(
    pilotEvidence.businessDataMutations,
    contract.requiredBusinessDataMutations,
    "Mutações de dados comerciais pelo gate",
  );
  assertEqual(
    pilotEvidence.databaseMigrations,
    contract.requiredDatabaseMigrations,
    "Migrations executadas pelo gate",
  );
  assertEqual(
    pilotEvidence.bootstrapExecutions,
    contract.requiredBootstrapExecutions,
    "Execuções de bootstrap",
  );
  assertEqual(
    pilotEvidence.secretValuesRecorded,
    contract.requiredSecretValuesRecorded,
    "Registro de segredos",
  );
  assertEqual(
    pilotEvidence.rollbackOwner,
    observationResult.rollbackOwner,
    "Responsável pelo rollback",
  );

  const observationEndedAt = timestamp(
    observationResult.observationEndedAt,
    "observationEndedAt da Fase 14",
  );
  const pilotStartedAt = timestamp(pilotEvidence.pilotStartedAt, "pilotStartedAt");
  const reviewedAt = timestamp(pilotEvidence.reviewedAt, "reviewedAt");
  if (pilotStartedAt < observationEndedAt) {
    throw new Error("O piloto não pode começar antes do fim da observação.");
  }
  if (reviewedAt < pilotStartedAt) {
    throw new Error("reviewedAt não pode ser anterior ao início do piloto.");
  }

  return {
    phase: 15,
    ok: true,
    pilotStatus: "controlled-pilot-authorized",
    pilotAuthorized: true,
    productionExpansionAllowed: false,
    pilotUserCount: pilotEvidence.pilotUserCount,
    rolesCovered: roles,
    rollbackReady: true,
    artifactVerified: true,
    sha256: observationResult.sha256,
    sourceFingerprint: observationResult.sourceFingerprint,
    releaseIdentifier: pilotEvidence.releaseIdentifier,
    rolloutOwner: pilotEvidence.rolloutOwner,
    rollbackOwner: pilotEvidence.rollbackOwner,
    reviewedBy: pilotEvidence.reviewedBy,
    pilotStartedAt: pilotEvidence.pilotStartedAt,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyControlledPilot({
  zipPath,
  checksumPath,
  proofPath,
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
}) {
  const observationResult = verifyOperationalObservation({
    zipPath,
    checksumPath,
    proofPath,
    phase14Contract,
    phase13Contract,
    phase12Contract,
    phase11Contract,
    handoff,
    productionEvidence,
    releaseEvidence,
    observationEvidence,
  });
  return evaluateControlledPilot({
    observationResult,
    pilotEvidence,
    contract: phase15Contract,
    phase11Contract,
  });
}

export function argument(argv, name) {
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1] || null;
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) || null : null;
}

function runCli() {
  const argv = process.argv.slice(2);
  const zipPath = argument(argv, "--zip");
  const checksumPath = argument(argv, "--checksum");
  const proofPath = argument(argv, "--proof");
  if (!zipPath || !checksumPath || !proofPath) {
    throw new Error("Use --zip, --checksum e --proof para o artefato aprovado.");
  }

  const phase15Contract = readJson(
    resolve(argument(argv, "--contract") || defaults.phase15Contract),
    "Contrato da Fase 15",
  );
  const phase14Contract = readJson(
    resolve(argument(argv, "--phase-14-contract") || defaults.phase14Contract),
    "Contrato da Fase 14",
  );
  const phase13Contract = readJson(
    resolve(argument(argv, "--phase-13-contract") || defaults.phase13Contract),
    "Contrato da Fase 13",
  );
  const phase12Contract = readJson(
    resolve(argument(argv, "--phase-12-contract") || defaults.phase12Contract),
    "Contrato da Fase 12",
  );
  const phase11Contract = readJson(
    resolve(argument(argv, "--phase-11-contract") || defaults.phase11Contract),
    "Contrato da Fase 11",
  );
  const handoff = readJson(
    resolve(argument(argv, "--handoff") || defaults.handoff),
    "Manifesto de instalação",
  );
  const productionEvidencePath = argument(argv, "--production-evidence");
  const releaseEvidencePath = argument(argv, "--release-evidence");
  const observationEvidencePath = argument(argv, "--observation-evidence");
  const pilotEvidencePath = argument(argv, "--pilot-evidence");

  console.log(
    JSON.stringify(
      verifyControlledPilot({
        zipPath: resolve(zipPath),
        checksumPath: resolve(checksumPath),
        proofPath: resolve(proofPath),
        phase15Contract,
        phase14Contract,
        phase13Contract,
        phase12Contract,
        phase11Contract,
        handoff,
        productionEvidence: productionEvidencePath
          ? readJson(resolve(productionEvidencePath), "Evidência pós-deploy da Fase 11")
          : null,
        releaseEvidence: releaseEvidencePath
          ? readJson(resolve(releaseEvidencePath), "Aceite operacional da Fase 13")
          : null,
        observationEvidence: observationEvidencePath
          ? readJson(resolve(observationEvidencePath), "Observação operacional da Fase 14")
          : null,
        pilotEvidence: pilotEvidencePath
          ? readJson(resolve(pilotEvidencePath), "Autorização do piloto da Fase 15")
          : null,
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
        phase: 15,
        ok: false,
        error: error instanceof Error ? error.message : "Falha desconhecida.",
      }),
    );
    process.exitCode = 1;
  }
}
