import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyReleaseClosure } from "./check-v3000-phase-13-release-closure.mjs";

const defaults = {
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

function assertIntegerAtLeast(value, minimum, label) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} deve ser inteiro e no mínimo ${minimum}.`);
  }
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido.`);
  return parsed;
}

function pendingResult(status, releaseResult) {
  return {
    phase: 14,
    ok: true,
    operationalStatus: status,
    observationClosed: false,
    stableForControlledExpansion: false,
    rollbackReady: releaseResult.rollbackReady,
    artifactVerified: releaseResult.artifactVerified,
    sha256: releaseResult.sha256,
    sourceFingerprint: releaseResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateOperationalObservation({
  releaseResult,
  observationEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 14, "Fase do contrato");
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
    contract.automaticExpansionAllowed,
    false,
    "Expansão automática",
  );
  assertEqual(
    contract.automaticRollbackAllowed,
    false,
    "Rollback automático",
  );
  assertEqual(releaseResult.ok, true, "Gate da Fase 13");
  assertEqual(releaseResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(
    releaseResult.sha256,
    phase11Contract.candidate.sha256,
    "SHA-256 da release",
  );
  assertEqual(
    releaseResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!releaseResult.releaseClosed) {
    return pendingResult("awaiting-release-closure", releaseResult);
  }
  if (!observationEvidence) {
    return pendingResult("awaiting-operational-observation", releaseResult);
  }

  assertEqual(observationEvidence.phase, 14, "Fase da evidência");
  assertEqual(
    observationEvidence.status,
    contract.requiredStatus,
    "Status da observação",
  );
  assertEqual(
    observationEvidence.candidateSha256,
    phase11Contract.candidate.sha256,
    "SHA-256 observado",
  );
  assertEqual(
    observationEvidence.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint observado",
  );
  assertEqual(observationEvidence.origin, contract.origin, "Origem observada");
  assertEqual(observationEvidence.route, contract.route, "Rota observada");
  assertEqual(
    observationEvidence.releaseIdentifier,
    releaseResult.candidateReleaseIdentifier,
    "Identificador da release",
  );
  assertEqual(
    observationEvidence.rollbackOwner,
    releaseResult.rollbackOwner,
    "Responsável pelo rollback",
  );

  for (const check of contract.requiredChecks) {
    assertEqual(observationEvidence[check], true, check);
  }
  for (const field of contract.requiredStringFields) {
    assertNonEmptyString(observationEvidence[field], field);
  }

  assertIntegerAtLeast(
    observationEvidence.authenticatedChecks,
    contract.minimumAuthenticatedChecks,
    "Checagens autenticadas",
  );
  assertIntegerAtLeast(
    observationEvidence.dashboardChecks,
    contract.minimumDashboardChecks,
    "Checagens do dashboard",
  );
  assertIntegerAtLeast(
    observationEvidence.notificationChecks,
    contract.minimumNotificationChecks,
    "Checagens de notificações",
  );
  assertEqual(
    observationEvidence.criticalIncidents,
    contract.maximumCriticalIncidents,
    "Incidentes críticos",
  );
  assertEqual(
    observationEvidence.businessDataMutations,
    contract.requiredBusinessDataMutations,
    "Mutações de dados comerciais",
  );
  assertEqual(
    observationEvidence.databaseMigrations,
    contract.requiredDatabaseMigrations,
    "Migrations executadas",
  );
  assertEqual(
    observationEvidence.bootstrapExecutions,
    contract.requiredBootstrapExecutions,
    "Execuções de bootstrap",
  );
  assertEqual(
    observationEvidence.secretValuesRecorded,
    contract.requiredSecretValuesRecorded,
    "Registro de segredos",
  );

  const releaseReviewedAt = timestamp(releaseResult.reviewedAt, "reviewedAt da release");
  const observationStartedAt = timestamp(
    observationEvidence.observationStartedAt,
    "observationStartedAt",
  );
  const observationEndedAt = timestamp(
    observationEvidence.observationEndedAt,
    "observationEndedAt",
  );
  const reviewedAt = timestamp(observationEvidence.reviewedAt, "reviewedAt");
  if (observationStartedAt < releaseReviewedAt) {
    throw new Error("A observação não pode começar antes do aceite da release.");
  }
  const durationMinutes = (observationEndedAt - observationStartedAt) / 60_000;
  if (durationMinutes < contract.minimumObservationMinutes) {
    throw new Error(
      `A janela de observação deve ter no mínimo ${contract.minimumObservationMinutes} minutos.`,
    );
  }
  if (reviewedAt < observationEndedAt) {
    throw new Error("reviewedAt não pode ser anterior ao fim da observação.");
  }

  return {
    phase: 14,
    ok: true,
    operationalStatus: "operational-observation-approved",
    observationClosed: true,
    stableForControlledExpansion: true,
    rollbackReady: true,
    artifactVerified: true,
    sha256: releaseResult.sha256,
    sourceFingerprint: releaseResult.sourceFingerprint,
    releaseIdentifier: observationEvidence.releaseIdentifier,
    rollbackOwner: observationEvidence.rollbackOwner,
    observedBy: observationEvidence.observedBy,
    reviewedBy: observationEvidence.reviewedBy,
    observationStartedAt: observationEvidence.observationStartedAt,
    observationEndedAt: observationEvidence.observationEndedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyOperationalObservation({
  zipPath,
  checksumPath,
  proofPath,
  phase14Contract,
  phase13Contract,
  phase12Contract,
  phase11Contract,
  handoff,
  productionEvidence = null,
  releaseEvidence = null,
  observationEvidence = null,
}) {
  const releaseResult = verifyReleaseClosure({
    zipPath,
    checksumPath,
    proofPath,
    phase13Contract,
    phase12Contract,
    phase11Contract,
    handoff,
    productionEvidence,
    releaseEvidence,
  });
  return evaluateOperationalObservation({
    releaseResult,
    observationEvidence,
    contract: phase14Contract,
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

  const phase14Contract = readJson(
    resolve(argument(argv, "--contract") || defaults.phase14Contract),
    "Contrato da Fase 14",
  );
  const phase13Contract = readJson(
    resolve(
      argument(argv, "--phase-13-contract") || defaults.phase13Contract,
    ),
    "Contrato da Fase 13",
  );
  const phase12Contract = readJson(
    resolve(
      argument(argv, "--phase-12-contract") || defaults.phase12Contract,
    ),
    "Contrato da Fase 12",
  );
  const phase11Contract = readJson(
    resolve(
      argument(argv, "--phase-11-contract") || defaults.phase11Contract,
    ),
    "Contrato da Fase 11",
  );
  const handoff = readJson(
    resolve(argument(argv, "--handoff") || defaults.handoff),
    "Manifesto de instalação",
  );
  const productionEvidencePath = argument(argv, "--production-evidence");
  const releaseEvidencePath = argument(argv, "--release-evidence");
  const observationEvidencePath = argument(argv, "--observation-evidence");

  console.log(
    JSON.stringify(
      verifyOperationalObservation({
        zipPath: resolve(zipPath),
        checksumPath: resolve(checksumPath),
        proofPath: resolve(proofPath),
        phase14Contract,
        phase13Contract,
        phase12Contract,
        phase11Contract,
        handoff,
        productionEvidence: productionEvidencePath
          ? readJson(
              resolve(productionEvidencePath),
              "Evidência pós-deploy da Fase 11",
            )
          : null,
        releaseEvidence: releaseEvidencePath
          ? readJson(
              resolve(releaseEvidencePath),
              "Aceite operacional da Fase 13",
            )
          : null,
        observationEvidence: observationEvidencePath
          ? readJson(
              resolve(observationEvidencePath),
              "Observação operacional da Fase 14",
            )
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
        phase: 14,
        ok: false,
        error: error instanceof Error ? error.message : "Falha desconhecida.",
      }),
    );
    process.exitCode = 1;
  }
}
