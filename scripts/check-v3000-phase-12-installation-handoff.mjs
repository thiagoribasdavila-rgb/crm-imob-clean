import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  evaluateProductionEvidence,
  verifyCandidate,
} from "./check-v3000-phase-11-homologation.mjs";

const defaultContractPath = resolve(
  process.cwd(),
  "config/v3000-phase-12-installation-handoff.json",
);
const defaultPhase11ContractPath = resolve(
  process.cwd(),
  "config/v3000-phase-11-homologation.json",
);
const defaultHandoffPath = resolve(
  process.cwd(),
  "docs/evidence/V3000_PHASE_12_INSTALLATION_HANDOFF.json",
);

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

function archiveOutput(zipPath, args, label) {
  try {
    return execFileSync("unzip", [...args, zipPath], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    throw new Error(`${label} não pôde ser lido no ZIP.`);
  }
}

function listArchiveEntries(zipPath) {
  return archiveOutput(zipPath, ["-Z1"], "Inventário")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readArchiveEntry(zipPath, entry) {
  try {
    return execFileSync("unzip", ["-p", zipPath, entry], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    throw new Error(`${entry} não pôde ser lido no ZIP.`);
  }
}

function parseEnvironmentNames(contents) {
  const names = new Set();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (match) names.add(match[1]);
  }
  return names;
}

function assertArchiveIsSafe(entries, contract) {
  const required = new Set(contract.requiredArchiveEntries);
  for (const entry of required) {
    if (!entries.includes(entry)) {
      throw new Error(`Entrada obrigatória ausente do ZIP: ${entry}.`);
    }
  }

  const forbiddenBasenames = new Set(contract.forbiddenArchiveBasenames);
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/");
    const entryBasename = posix.basename(normalized).toLowerCase();
    if (forbiddenBasenames.has(entryBasename)) {
      throw new Error(`Arquivo sensível proibido no ZIP: ${entry}.`);
    }
    if (
      contract.forbiddenArchiveSuffixes.some((suffix) =>
        entryBasename.endsWith(suffix),
      )
    ) {
      throw new Error(`Credencial privada proibida no ZIP: ${entry}.`);
    }
  }
}

function assertPackageContract(zipPath, contract) {
  const packageJson = JSON.parse(readArchiveEntry(zipPath, "package.json"));
  assertEqual(packageJson.engines?.node, contract.node, "Versão Node");
  assertEqual(
    packageJson.scripts?.build,
    "node scripts/build.mjs",
    "Script de build",
  );
  assertEqual(packageJson.scripts?.start, "next start", "Script de start");

  const metadata = JSON.parse(
    readArchiveEntry(zipPath, "HOSTINGER_PACKAGE.json"),
  );
  assertEqual(metadata.application, "Atlas One", "Aplicação do pacote");
  assertEqual(metadata.cleanInstall, true, "Instalação limpa");
  assertEqual(metadata.privateDataIncluded, false, "Dados privados");
  assertEqual(metadata.startCommand, contract.startCommand, "Comando Hostinger");
  return metadata;
}

function assertEnvironmentContract(zipPath, contract) {
  const environmentNames = parseEnvironmentNames(
    readArchiveEntry(zipPath, contract.environmentTemplate),
  );
  const missing = contract.requiredEnvironmentNames.filter(
    (name) => !environmentNames.has(name),
  );
  if (missing.length > 0) {
    throw new Error(
      `Variáveis obrigatórias ausentes do modelo: ${missing.join(", ")}.`,
    );
  }
  return contract.requiredEnvironmentNames.length;
}

function assertHandoffManifest({ handoff, contract, phase11Contract }) {
  const candidate = phase11Contract.candidate;
  assertEqual(handoff.phase, 12, "Fase do manifesto");
  assertEqual(
    handoff.status,
    "ready-for-authorized-installation",
    "Status do manifesto",
  );
  assertEqual(handoff.artifact, candidate.artifact, "Artefato do manifesto");
  assertEqual(
    handoff.candidateSha256,
    candidate.sha256,
    "SHA-256 do manifesto",
  );
  assertEqual(
    handoff.sourceFingerprint,
    candidate.sourceFingerprint,
    "Fingerprint do manifesto",
  );
  for (const field of [
    "target",
    "origin",
    "installationMode",
    "bootstrapPolicy",
    "rollbackPolicy",
  ]) {
    assertEqual(handoff[field], contract[field], `${field} do manifesto`);
  }
  assertEqual(
    handoff.existingAdministratorPreserved,
    true,
    "Preservação do administrador",
  );
  assertEqual(handoff.databaseMutations, 0, "Mutações de banco");
  assertEqual(handoff.deploymentPerformed, false, "Publicação antecipada");
  assertEqual(handoff.secretValuesIncluded, false, "Segredos no manifesto");
}

export function verifyInstallationHandoff({
  zipPath,
  checksumPath,
  proofPath,
  contract,
  phase11Contract,
  handoff,
  productionEvidence = null,
}) {
  assertEqual(contract.phase, 12, "Fase do contrato");
  assertEqual(contract.databaseMigrationAllowed, false, "Migração de banco");
  assertEqual(contract.secretValuesAllowed, false, "Valores secretos");
  assertHandoffManifest({ handoff, contract, phase11Contract });

  const candidate = verifyCandidate({
    zipPath,
    checksumPath,
    proofPath,
    contract: phase11Contract,
  });
  const entries = listArchiveEntries(zipPath);
  assertArchiveIsSafe(entries, contract);
  const environmentNamesVerified = assertEnvironmentContract(zipPath, contract);
  const metadata = assertPackageContract(zipPath, contract);

  const production = productionEvidence
    ? evaluateProductionEvidence({
        evidence: productionEvidence,
        contract: phase11Contract,
      })
    : {
        productionStatus: "pending-authorized-deployment",
        eligibleForTemplatePromotion: false,
        route: phase11Contract.productionGate.route,
      };

  return {
    phase: 12,
    ok: true,
    installationReady: true,
    handoffStatus: productionEvidence
      ? "post-deploy-approved"
      : "ready-for-authorized-installation",
    artifact: basename(zipPath),
    artifactVerified: candidate.artifactVerified,
    sha256: candidate.sha256,
    sourceFingerprint: candidate.sourceFingerprint,
    archiveEntries: entries.length,
    environmentNamesVerified,
    node: contract.node,
    recommendedNode: contract.recommendedNode,
    buildCommand: contract.buildCommand,
    startCommand: contract.startCommand,
    releaseVersion: metadata.releaseVersion,
    bootstrapPolicy: contract.bootstrapPolicy,
    rollbackPolicy: contract.rollbackPolicy,
    databaseMutations: 0,
    deploymentPerformed: false,
    secretValuesIncluded: false,
    ...production,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] || null;
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) || null : null;
}

function runCli() {
  const zipPath = argument("--zip");
  const checksumPath = argument("--checksum");
  const proofPath = argument("--proof");
  if (!zipPath || !checksumPath || !proofPath) {
    throw new Error(
      "Use --zip, --checksum e --proof para o artefato aprovado.",
    );
  }

  const contract = readJson(
    resolve(argument("--contract") || defaultContractPath),
    "Contrato da Fase 12",
  );
  const phase11Contract = readJson(
    resolve(argument("--phase-11-contract") || defaultPhase11ContractPath),
    "Contrato da Fase 11",
  );
  const handoff = readJson(
    resolve(argument("--handoff") || defaultHandoffPath),
    "Manifesto de instalação",
  );
  const evidencePath = argument("--evidence");
  const productionEvidence = evidencePath
    ? readJson(resolve(evidencePath), "Evidência pós-deploy")
    : null;

  console.log(
    JSON.stringify(
      verifyInstallationHandoff({
        zipPath: resolve(zipPath),
        checksumPath: resolve(checksumPath),
        proofPath: resolve(proofPath),
        contract,
        phase11Contract,
        handoff,
        productionEvidence,
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
        phase: 12,
        ok: false,
        error: error instanceof Error ? error.message : "Falha desconhecida.",
      }),
    );
    process.exitCode = 1;
  }
}
