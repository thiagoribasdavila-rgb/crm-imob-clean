import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { verifyInstallationHandoff } from "../../scripts/check-v3000-phase-12-installation-handoff.mjs";

const requiredEntries = [
  ".env.example",
  ".env.homologation.example",
  ".nvmrc",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "postcss.config.mjs",
  "ecosystem.config.cjs",
  "proxy.ts",
  "scripts/build.mjs",
  "app/(crm)/notifications/page.tsx",
  "components/atlas/notifications-v3000-surface.tsx",
  "HOSTINGER_PACKAGE.json",
  "RELEASE_FILES.sha256",
  "INSTALACAO.md",
];
const requiredEnvironmentNames = [
  "ATLAS_ENV",
  "ATLAS_HOSTING_PROVIDER",
  "ATLAS_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "ATLAS_DEFAULT_ORGANIZATION_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "ATLAS_CRON_SECRET",
];

function write(root, relativePath, contents = "fixture\n") {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "atlas-v3000-phase-12-"));
  const source = join(directory, "source");
  mkdirSync(source);
  for (const entry of requiredEntries) write(source, entry);
  write(
    source,
    ".env.homologation.example",
    `${requiredEnvironmentNames.map((name) => `${name}=`).join("\n")}\n`,
  );
  write(
    source,
    "package.json",
    JSON.stringify({
      engines: { node: ">=22" },
      scripts: { build: "node scripts/build.mjs", start: "next start" },
    }),
  );
  write(
    source,
    "HOSTINGER_PACKAGE.json",
    JSON.stringify({
      application: "Atlas One",
      cleanInstall: true,
      privateDataIncluded: false,
      startCommand: "npm start",
      releaseVersion: "fixture",
    }),
  );

  const zipPath = join(directory, "candidate.zip");
  execFileSync("zip", ["-q", "-r", zipPath, "."], { cwd: source });
  const bytes = readFileSync(zipPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const files = requiredEntries.length;
  const sourceFingerprint = "sha256:snapshot-controlado";
  const commitReference = "commit-controlado";
  const checksumPath = `${zipPath}.sha256`;
  const proofPath = `${zipPath}.proof.json`;
  writeFileSync(checksumPath, `${sha256}  candidate.zip\n`);
  writeFileSync(
    proofPath,
    JSON.stringify({
      phase: 10,
      ok: true,
      sha256,
      bytes: bytes.length,
      files,
      sourceFingerprint,
      commitReference,
      cleanBuild: true,
      secretsPackaged: false,
      databaseMutations: 0,
      deploymentPerformed: false,
      route: "/notifications",
      routeSourceIncluded: true,
    }),
  );
  const phase11Contract = {
    candidate: {
      artifact: "candidate.zip",
      bytes: bytes.length,
      files,
      sha256,
      sourceFingerprint,
      commitReference,
      cleanBuild: true,
      secretsPackaged: false,
      databaseMutations: 0,
      deploymentPerformed: false,
    },
    productionGate: {
      origin: "https://atlasaios.com.br",
      route: "/notifications",
      requiredStatus: "approved",
      requiredHttpStatus: 200,
      requiredConsoleErrors: 0,
      requiredBusinessDataMutations: 0,
      requiredChecks: ["authenticatedSession"],
    },
  };
  const contract = {
    phase: 12,
    target: "hostinger",
    origin: phase11Contract.productionGate.origin,
    installationMode: "artifact-only-no-database-migration",
    environmentTemplate: ".env.homologation.example",
    node: ">=22",
    recommendedNode: "24",
    buildCommand: "npm run build",
    startCommand: "npm start",
    requiredArchiveEntries: requiredEntries,
    requiredEnvironmentNames,
    forbiddenArchiveBasenames: [".env", ".env.local", "hostinger.env"],
    forbiddenArchiveSuffixes: [".pem", ".p12", ".pfx"],
    bootstrapPolicy: "disabled-existing-administrator",
    rollbackPolicy: "retain-current-hostinger-release",
    databaseMigrationAllowed: false,
    secretValuesAllowed: false,
  };
  const handoff = {
    phase: 12,
    status: "ready-for-authorized-installation",
    artifact: "candidate.zip",
    candidateSha256: sha256,
    sourceFingerprint,
    target: contract.target,
    origin: contract.origin,
    installationMode: contract.installationMode,
    bootstrapPolicy: contract.bootstrapPolicy,
    existingAdministratorPreserved: true,
    databaseMutations: 0,
    deploymentPerformed: false,
    secretValuesIncluded: false,
    rollbackPolicy: contract.rollbackPolicy,
  };
  return {
    directory,
    source,
    zipPath,
    checksumPath,
    proofPath,
    contract,
    phase11Contract,
    handoff,
  };
}

test("Fase 12 libera somente instalação autorizada do artefato imutável", () => {
  const input = fixture();
  const result = verifyInstallationHandoff(input);
  assert.equal(result.installationReady, true);
  assert.equal(result.handoffStatus, "ready-for-authorized-installation");
  assert.equal(result.productionStatus, "pending-authorized-deployment");
  assert.equal(result.eligibleForTemplatePromotion, false);
  assert.equal(result.deploymentPerformed, false);
});

test("Fase 12 rejeita um arquivo de ambiente real dentro do ZIP", () => {
  const input = fixture();
  write(input.source, ".env.local", "SEGREDO=nao-deve-entrar\n");
  const unsafeZip = join(input.directory, "unsafe.zip");
  execFileSync("zip", ["-q", "-r", unsafeZip, "."], { cwd: input.source });
  const unsafeBytes = readFileSync(unsafeZip);
  const unsafeSha = createHash("sha256").update(unsafeBytes).digest("hex");
  const checksumPath = `${unsafeZip}.sha256`;
  const proofPath = `${unsafeZip}.proof.json`;
  writeFileSync(checksumPath, `${unsafeSha}  unsafe.zip\n`);
  const proof = JSON.parse(readFileSync(input.proofPath, "utf8"));
  writeFileSync(
    proofPath,
    JSON.stringify({ ...proof, sha256: unsafeSha, bytes: unsafeBytes.length }),
  );
  input.phase11Contract.candidate = {
    ...input.phase11Contract.candidate,
    artifact: "unsafe.zip",
    sha256: unsafeSha,
    bytes: unsafeBytes.length,
  };
  input.handoff.artifact = "unsafe.zip";
  input.handoff.candidateSha256 = unsafeSha;
  assert.throws(
    () =>
      verifyInstallationHandoff({
        ...input,
        zipPath: unsafeZip,
        checksumPath,
        proofPath,
      }),
    /Arquivo sensível proibido/,
  );
});

test("Fase 12 rejeita variável obrigatória removida do modelo", () => {
  const input = fixture();
  const modified = join(input.directory, "missing-env");
  cpSync(input.source, modified, { recursive: true });
  write(
    modified,
    ".env.homologation.example",
    `${requiredEnvironmentNames
      .filter((name) => name !== "DATABASE_URL")
      .map((name) => `${name}=`)
      .join("\n")}\n`,
  );
  const zipPath = join(input.directory, "missing-env.zip");
  execFileSync("zip", ["-q", "-r", zipPath, "."], { cwd: modified });
  const bytes = readFileSync(zipPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const checksumPath = `${zipPath}.sha256`;
  const proofPath = `${zipPath}.proof.json`;
  writeFileSync(checksumPath, `${sha256}  missing-env.zip\n`);
  const proof = JSON.parse(readFileSync(input.proofPath, "utf8"));
  writeFileSync(
    proofPath,
    JSON.stringify({ ...proof, sha256, bytes: bytes.length }),
  );
  input.phase11Contract.candidate = {
    ...input.phase11Contract.candidate,
    artifact: "missing-env.zip",
    sha256,
    bytes: bytes.length,
  };
  input.handoff.artifact = "missing-env.zip";
  input.handoff.candidateSha256 = sha256;
  assert.throws(
    () =>
      verifyInstallationHandoff({
        ...input,
        zipPath,
        checksumPath,
        proofPath,
      }),
    /DATABASE_URL/,
  );
});

test("Fase 12 só conclui pós-deploy com a evidência da Fase 11", () => {
  const input = fixture();
  const productionEvidence = {
    phase: 11,
    status: "approved",
    candidateSha256: input.phase11Contract.candidate.sha256,
    sourceFingerprint: input.phase11Contract.candidate.sourceFingerprint,
    origin: input.phase11Contract.productionGate.origin,
    route: input.phase11Contract.productionGate.route,
    httpStatus: 200,
    consoleErrors: 0,
    businessDataMutations: 0,
    authenticatedSession: true,
    desktopEvidence: "desktop.png",
    mobileEvidence: "mobile.png",
    reviewedBy: "homologador",
    reviewedAt: "2026-08-10T22:30:00-03:00",
  };
  const result = verifyInstallationHandoff({ ...input, productionEvidence });
  assert.equal(result.handoffStatus, "post-deploy-approved");
  assert.equal(result.eligibleForTemplatePromotion, true);
});

test("Fase 12 aceita argumentos CLI no formato documentado --chave=valor", () => {
  const input = fixture();
  const contractPath = join(input.directory, "phase-12-contract.json");
  const phase11ContractPath = join(input.directory, "phase-11-contract.json");
  const handoffPath = join(input.directory, "handoff.json");
  writeFileSync(contractPath, JSON.stringify(input.contract));
  writeFileSync(phase11ContractPath, JSON.stringify(input.phase11Contract));
  writeFileSync(handoffPath, JSON.stringify(input.handoff));

  const stdout = execFileSync(
    process.execPath,
    [
      "scripts/check-v3000-phase-12-installation-handoff.mjs",
      `--zip=${input.zipPath}`,
      `--checksum=${input.checksumPath}`,
      `--proof=${input.proofPath}`,
      `--contract=${contractPath}`,
      `--phase-11-contract=${phase11ContractPath}`,
      `--handoff=${handoffPath}`,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
  assert.equal(result.installationReady, true);
});
