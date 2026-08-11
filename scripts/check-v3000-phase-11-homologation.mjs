import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const defaultContractPath = resolve(
  process.cwd(),
  "config/v3000-phase-11-homologation.json",
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
  if (actual !== expected) {
    throw new Error(`${label} divergente do candidato aprovado.`);
  }
}

export function verifyCandidate({
  zipPath,
  checksumPath,
  proofPath,
  contract,
}) {
  for (const [path, label] of [
    [zipPath, "ZIP"],
    [checksumPath, "Checksum"],
    [proofPath, "Prova da Fase 10"],
  ]) {
    if (!path || !existsSync(path)) throw new Error(`${label} não encontrado.`);
  }

  const bytes = readFileSync(zipPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const checksum = readFileSync(checksumPath, "utf8").trim().split(/\s+/)[0];
  const proof = readJson(proofPath, "Prova da Fase 10");
  const expected = contract.candidate;

  assertEqual(basename(zipPath), expected.artifact, "Nome do artefato");
  assertEqual(statSync(zipPath).size, expected.bytes, "Tamanho do artefato");
  assertEqual(sha256, expected.sha256, "SHA-256 calculado");
  assertEqual(checksum, expected.sha256, "SHA-256 externo");
  assertEqual(proof.sha256, expected.sha256, "SHA-256 da prova");
  assertEqual(proof.bytes, expected.bytes, "Tamanho registrado na prova");
  assertEqual(proof.files, expected.files, "Inventário registrado na prova");
  assertEqual(
    proof.sourceFingerprint,
    expected.sourceFingerprint,
    "Fingerprint do snapshot",
  );
  assertEqual(
    proof.commitReference,
    expected.commitReference,
    "Referência de origem",
  );
  assertEqual(proof.cleanBuild, expected.cleanBuild, "Build limpo");
  assertEqual(
    proof.secretsPackaged,
    expected.secretsPackaged,
    "Empacotamento de segredos",
  );
  assertEqual(
    proof.databaseMutations,
    expected.databaseMutations,
    "Mutações de banco",
  );
  assertEqual(
    proof.deploymentPerformed,
    expected.deploymentPerformed,
    "Publicação registrada",
  );
  assertEqual(proof.phase, 10, "Fase da prova de artefato");
  assertEqual(proof.ok, true, "Resultado da prova de artefato");
  assertEqual(proof.route, contract.productionGate.route, "Rota piloto");
  assertEqual(proof.routeSourceIncluded, true, "Inclusão da rota piloto");

  return {
    artifact: expected.artifact,
    bytes: expected.bytes,
    files: expected.files,
    sha256,
    sourceFingerprint: expected.sourceFingerprint,
    artifactVerified: true,
  };
}

export function evaluateProductionEvidence({ evidence, contract }) {
  const gate = contract.productionGate;
  assertEqual(evidence.phase, 11, "Fase da evidência");
  assertEqual(evidence.status, gate.requiredStatus, "Status de homologação");
  assertEqual(
    evidence.candidateSha256,
    contract.candidate.sha256,
    "Artefato implantado",
  );
  assertEqual(
    evidence.sourceFingerprint,
    contract.candidate.sourceFingerprint,
    "Snapshot implantado",
  );
  assertEqual(evidence.origin, gate.origin, "Origem homologada");
  assertEqual(evidence.route, gate.route, "Rota homologada");
  assertEqual(evidence.httpStatus, gate.requiredHttpStatus, "HTTP da rota");
  assertEqual(
    evidence.consoleErrors,
    gate.requiredConsoleErrors,
    "Erros de console",
  );
  assertEqual(
    evidence.businessDataMutations,
    gate.requiredBusinessDataMutations,
    "Mutações de dados comerciais",
  );

  for (const check of gate.requiredChecks) {
    assertEqual(evidence[check], true, check);
  }
  if (!evidence.desktopEvidence || !evidence.mobileEvidence) {
    throw new Error("Evidências desktop e mobile são obrigatórias.");
  }
  if (!evidence.reviewedBy || !evidence.reviewedAt) {
    throw new Error("Revisor e data da homologação são obrigatórios.");
  }

  return {
    productionStatus: "approved",
    eligibleForTemplatePromotion: true,
    route: gate.route,
    reviewedBy: evidence.reviewedBy,
    reviewedAt: evidence.reviewedAt,
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function runCli() {
  const contractPath = resolve(argument("--contract") || defaultContractPath);
  const zipPath = argument("--zip");
  const checksumPath = argument("--checksum");
  const proofPath = argument("--proof");
  const evidencePath = argument("--evidence");
  if (!zipPath || !checksumPath || !proofPath) {
    throw new Error(
      "Use --zip, --checksum e --proof para identificar o candidato exato.",
    );
  }

  const contract = readJson(contractPath, "Contrato da Fase 11");
  const candidate = verifyCandidate({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
    contract,
  });
  const production = evidencePath
    ? evaluateProductionEvidence({
        evidence: readJson(resolve(evidencePath), "Evidência pós-deploy"),
        contract,
      })
    : {
        productionStatus: "pending-authorized-deployment",
        eligibleForTemplatePromotion: false,
        route: contract.productionGate.route,
      };

  console.log(
    JSON.stringify({ phase: 11, ok: true, ...candidate, ...production }),
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
        phase: 11,
        ok: false,
        error: error instanceof Error ? error.message : "Falha desconhecida.",
      }),
    );
    process.exitCode = 1;
  }
}
