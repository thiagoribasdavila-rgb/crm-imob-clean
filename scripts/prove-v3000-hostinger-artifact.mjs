import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = process.cwd();
const packageName =
  process.env.ATLAS_PACKAGE_NAME ||
  "atlas-one-v3000-phase-10-homologation.zip";
const zip = resolve(root, "dist/hostinger", packageName);
if (!existsSync(zip)) throw new Error("ZIP V3000 da Fase 10 não encontrado.");

const verifierOutput = execFileSync(
  process.execPath,
  ["scripts/verify-hostinger-package.mjs"],
  {
    cwd: root,
    env: { ...process.env, ATLAS_PACKAGE_NAME: packageName },
    encoding: "utf8",
  },
).trim();
const verification = JSON.parse(verifierOutput.split(/\r?\n/).at(-1));
const entries = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
const manifest = JSON.parse(
  execFileSync("unzip", ["-p", zip, "HOSTINGER_PACKAGE.json"], {
    encoding: "utf8",
  }),
);
const packageJson = JSON.parse(
  execFileSync("unzip", ["-p", zip, "package.json"], { encoding: "utf8" }),
);

const requiredV3000Files = [
  "app/(crm)/notifications/page.tsx",
  "components/atlas/notifications-v3000-surface.tsx",
  "components/atlas/v3000-page-template.tsx",
  "docs/V3000_PHASE_09_CONTROLLED_RELEASE.md",
  "docs/V3000_PHASE_10_ARTIFACT_PROOF.md",
  "tests/contracts/v3000-page-template.test.mjs",
  "tests/contracts/v3000-phase-09-controlled-release.test.mjs",
  "tests/contracts/v3000-phase-10-artifact-proof.test.mjs",
];
const missing = requiredV3000Files.filter((file) => !entries.includes(file));
if (missing.length)
  throw new Error(`Contrato V3000 ausente do artefato: ${missing.join(", ")}`);

const buildDependencies = Object.fromEntries(
  [
    "next",
    "react",
    "react-dom",
    "tailwindcss",
    "@tailwindcss/postcss",
    "typescript",
  ].map((dependency) => [dependency, packageJson.dependencies?.[dependency] || null]),
);
if (Object.values(buildDependencies).some((version) => !version))
  throw new Error("Toolchain de build incompleta no pacote.");

const realEnvironmentFiles = entries.filter((entry) => {
  const name = entry.split("/").at(-1) || "";
  return (name === ".env" || name.startsWith(".env.")) &&
    !name.endsWith(".example");
});
if (realEnvironmentFiles.length)
  throw new Error("O pacote contém arquivo real de ambiente.");

const bytes = readFileSync(zip);
const proof = {
  phase: 10,
  ok: true,
  artifact: basename(zip),
  absolutePath: zip,
  bytes: statSync(zip).size,
  files: entries.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  sourceMode: manifest.sourceMode,
  sourceFingerprint: manifest.sourceFingerprint,
  commitReference: manifest.commit,
  route: "/notifications",
  routeSourceIncluded: true,
  v3000FilesIncluded: requiredV3000Files.length,
  buildDependencies,
  realEnvironmentFilesIncluded: false,
  secretsPackaged: false,
  databaseMutations: 0,
  deploymentPerformed: false,
  cleanBuild: process.env.ATLAS_CLEAN_BUILD_STATUS === "passed",
  verifier: verification,
};
const proofPath = `${zip}.proof.json`;
writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify({ ...proof, proofPath }));
