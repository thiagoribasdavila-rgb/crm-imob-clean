import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyInstallationHandoff } from "./check-v3000-phase-12-installation-handoff.mjs";

const defaults = {
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

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido.`);
  return parsed;
}

function pendingResult(status, handoffResult) {
  return {
    phase: 13,
    ok: true,
    releaseStatus: status,
    releaseClosed: false,
    rollbackReady: false,
    eligibleForControlledTemplatePromotion: false,
    artifactVerified: handoffResult.artifactVerified,
    sha256: handoffResult.sha256,
    sourceFingerprint: handoffResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateReleaseClosure({
  handoffResult,
  releaseEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 13, "Fase do contrato");
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
    contract.automaticPromotionAllowed,
    false,
    "Promoção automática",
  );
  assertEqual(handoffResult.ok, true, "Gate da Fase 12");
  assertEqual(handoffResult.installationReady, true, "Prontidão de instalação");
  assertEqual(handoffResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(
    handoffResult.sha256,
    phase11Contract.candidate.sha256,
    "SHA-256 do handoff",
  );
  assertEqual(
    handoffResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint do handoff",
  );

  if (handoffResult.productionStatus !== "approved") {
    return pendingResult("awaiting-post-deploy-evidence", handoffResult);
  }
  if (!releaseEvidence) {
    return pendingResult("awaiting-release-acceptance", handoffResult);
  }

  assertEqual(releaseEvidence.phase, 13, "Fase da evidência");
  assertEqual(
    releaseEvidence.status,
    contract.requiredStatus,
    "Status do aceite",
  );
  assertEqual(
    releaseEvidence.candidateSha256,
    phase11Contract.candidate.sha256,
    "SHA-256 instalado",
  );
  assertEqual(
    releaseEvidence.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint instalado",
  );
  assertEqual(releaseEvidence.origin, contract.origin, "Origem instalada");
  assertEqual(releaseEvidence.route, contract.route, "Rota piloto");

  for (const check of contract.requiredChecks) {
    assertEqual(releaseEvidence[check], true, check);
  }
  for (const field of contract.requiredStringFields) {
    assertNonEmptyString(releaseEvidence[field], field);
  }

  assertEqual(
    releaseEvidence.businessDataMutations,
    contract.requiredBusinessDataMutations,
    "Mutações de dados comerciais",
  );
  assertEqual(
    releaseEvidence.databaseMigrations,
    contract.requiredDatabaseMigrations,
    "Migrations executadas",
  );
  assertEqual(
    releaseEvidence.bootstrapExecutions,
    contract.requiredBootstrapExecutions,
    "Execuções de bootstrap",
  );
  assertEqual(
    releaseEvidence.secretValuesRecorded,
    contract.requiredSecretValuesRecorded,
    "Registro de segredos",
  );

  if (
    releaseEvidence.candidateReleaseIdentifier.trim() ===
    releaseEvidence.previousReleaseIdentifier.trim()
  ) {
    throw new Error("Release candidata e release de rollback devem ser distintas.");
  }

  const installedAt = timestamp(releaseEvidence.installedAt, "installedAt");
  const reviewedAt = timestamp(releaseEvidence.reviewedAt, "reviewedAt");
  if (reviewedAt < installedAt) {
    throw new Error("reviewedAt não pode ser anterior a installedAt.");
  }

  return {
    phase: 13,
    ok: true,
    releaseStatus: "operational-release-approved",
    releaseClosed: true,
    rollbackReady: true,
    eligibleForControlledTemplatePromotion: true,
    artifactVerified: true,
    sha256: handoffResult.sha256,
    sourceFingerprint: handoffResult.sourceFingerprint,
    candidateReleaseIdentifier: releaseEvidence.candidateReleaseIdentifier,
    previousReleaseIdentifier: releaseEvidence.previousReleaseIdentifier,
    rollbackOwner: releaseEvidence.rollbackOwner,
    reviewedBy: releaseEvidence.reviewedBy,
    reviewedAt: releaseEvidence.reviewedAt,
    deploymentPerformedByGate: false,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyReleaseClosure({
  zipPath,
  checksumPath,
  proofPath,
  phase13Contract,
  phase12Contract,
  phase11Contract,
  handoff,
  productionEvidence = null,
  releaseEvidence = null,
}) {
  const handoffResult = verifyInstallationHandoff({
    zipPath,
    checksumPath,
    proofPath,
    contract: phase12Contract,
    phase11Contract,
    handoff,
    productionEvidence,
  });
  return evaluateReleaseClosure({
    handoffResult,
    releaseEvidence,
    contract: phase13Contract,
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
    throw new Error(
      "Use --zip, --checksum e --proof para o artefato aprovado.",
    );
  }

  const phase13Contract = readJson(
    resolve(argument(argv, "--contract") || defaults.phase13Contract),
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

  console.log(
    JSON.stringify(
      verifyReleaseClosure({
        zipPath: resolve(zipPath),
        checksumPath: resolve(checksumPath),
        proofPath: resolve(proofPath),
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
        phase: 13,
        ok: false,
        error: error instanceof Error ? error.message : "Falha desconhecida.",
      }),
    );
    process.exitCode = 1;
  }
}
