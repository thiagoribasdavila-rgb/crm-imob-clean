import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  legacyComponentPaths,
  legacyRoutePaths,
} from "./legacy-route-paths.mjs";

const root = process.cwd();
const outputRoot = resolve(root, "dist/hostinger");
const stage = join(outputRoot, "atlas-v3");
const packageName = process.env.ATLAS_PACKAGE_NAME || "atlas-v3-hostinger-homologation.zip";
const requestedPackageSource = (
  process.env.ATLAS_PACKAGE_SOURCE || "commit"
).toLowerCase();
if (!["commit", "workspace"].includes(requestedPackageSource))
  throw new Error(
    "ATLAS_PACKAGE_SOURCE deve ser 'commit' ou 'workspace'.",
  );
if (
  !/^atlas-(?:v3|one)-[a-z0-9-]+\.zip$/.test(packageName) &&
  ![
    "ATLAS_AI_OS_RELEASE_v1.zip",
    "ATLAS_ONE_V1000_FINAL_CLEAN.zip",
    "ATLAS_ONE_V1000_BOOTSTRAP_FIXED.zip",
    "ATLAS_ONE_V1000_PHASE6_FINAL.zip",
    "ATLAS_ONE_FINAL_OPERACIONAL.zip",
  ].includes(packageName)
) throw new Error("Nome de pacote inválido.");
const zipPath = join(outputRoot, packageName);
const checksumPath = `${zipPath}.sha256`;
const releaseEvidenceSource = process.env.ATLAS_RELEASE_EVIDENCE_FILE
  ? resolve(root, process.env.ATLAS_RELEASE_EVIDENCE_FILE)
  : null;
const auditedRelease = /^atlas-one-audited-\d{8}-r\d{3}\.zip$/.test(packageName);
let releaseEvidence = null;
if (releaseEvidenceSource) {
  if (!existsSync(releaseEvidenceSource))
    throw new Error("Relatório de testes da release não encontrado.");
  releaseEvidence = JSON.parse(readFileSync(releaseEvidenceSource, "utf8"));
  const gates = Array.isArray(releaseEvidence.gates) ? releaseEvidence.gates : [];
  if (!gates.length || gates.some((gate) => gate.status !== "passed"))
    throw new Error("A release contém gate obrigatório sem aprovação.");
}
if (auditedRelease && !releaseEvidence)
  throw new Error("Release auditada exige relatório de testes aprovado.");
const isRealEnvironmentFile = (entry) => {
  const basename = entry.split("/").at(-1) || "";
  return (basename === ".env" || basename.startsWith(".env.")) && !basename.endsWith(".example");
};
const forbiddenPath = (relativePath) =>
  isRealEnvironmentFile(relativePath) ||
  /(^|\/)(?:hostinger\.env|node_modules|\.next|tmp|outputs|dist|\.git|logs)(?:\/|$)/.test(
    relativePath,
  ) || /\.(?:xlsx?|csv|pdf|pem|key|mov|mp4|zip)$/i.test(relativePath);
const gitWorkspace = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() === "true";
  } catch {
    return false;
  }
})();
const sourceMode =
  gitWorkspace && requestedPackageSource === "commit"
    ? "git-archive"
    : "workspace-content-hash";
if (sourceMode === "git-archive") {
  const trackedChanges = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  if (trackedChanges)
    throw new Error(
      "Existem alterações versionadas sem commit. Registre-as antes de gerar o pacote Hostinger.",
    );
}

mkdirSync(outputRoot, { recursive: true });
rmSync(stage, { recursive: true, force: true });
rmSync(zipPath, { force: true });
rmSync(checksumPath, { force: true });
mkdirSync(stage, { recursive: true });
if (sourceMode === "git-archive") {
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], {
    cwd: root,
    maxBuffer: 50 * 1024 * 1024,
  });
  execFileSync("tar", ["-xf", "-", "-C", stage], { input: archive });
} else {
  const rootFiles = [
    ".env.example",
    ".env.homologation.example",
    ".nvmrc",
    "CHECKLIST_FINAL.md",
    "INSTALACAO.md",
    "README.md",
    "components.json",
    "ecosystem.config.cjs",
    "eslint.config.mjs",
    "next-env.d.ts",
    "next.config.ts",
    "package-lock.json",
    "package.json",
    "playwright.config.mjs",
    "postcss.config.mjs",
    "prisma.config.ts",
    "proxy.ts",
    "tsconfig.active.json",
    "tsconfig.json",
  ];
  const rootDirectories = [
    "app",
    "components",
    "config",
    "docs",
    "infra",
    "lib",
    "prisma",
    "public",
    "scripts",
    "styles",
    "supabase",
    "tests",
    "types",
    "utils",
  ];
  const copyAllowed = (relativePath) => {
    const source = join(root, relativePath);
    if (!existsSync(source) || forbiddenPath(relativePath)) return;
    cpSync(source, join(stage, relativePath), {
      recursive: true,
      filter: (sourcePath) => {
        const normalized = sourcePath.replace(`${root}/`, "").replaceAll("\\", "/");
        return !forbiddenPath(normalized);
      },
    });
  };
  for (const file of rootFiles) copyAllowed(file);
  for (const directory of rootDirectories) copyAllowed(directory);
}

// `git archive` preserves every tracked artifact, so sanitize the staging tree
// regardless of the source mode before calculating fingerprints or checksums.
const stagedCandidates = execFileSync("find", [".", "-type", "f"], {
  cwd: stage,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);
for (const entry of stagedCandidates) {
  const relativePath = entry.replace(/^\.\//, "").replaceAll("\\", "/");
  if (forbiddenPath(relativePath)) rmSync(join(stage, relativePath), { force: true });
}

for (const relativePath of legacyRoutePaths)
  rmSync(join(stage, relativePath), { recursive: true, force: true });
for (const relativePath of legacyComponentPaths)
  rmSync(join(stage, relativePath), { recursive: true, force: true });
for (const relativePath of [
  "AGENTS.md",
  "CLAUDE.md",
  "core",
  "logs",
  "application",
  "domain",
  "components/ui/ProtectedRoute.tsx",
  "lib/data",
  "lib/services",
  "public/file.svg",
  "public/globe.svg",
  "public/next.svg",
  "public/vercel.svg",
  "public/window.svg",
])
  rmSync(join(stage, relativePath), { recursive: true, force: true });

const commit = gitWorkspace
  ? execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim()
  : null;
if (releaseEvidence)
  writeFileSync(
    join(stage, "RELEASE_TEST_REPORT.json"),
    `${JSON.stringify(releaseEvidence, null, 2)}\n`,
  );
const fingerprintFiles = execFileSync("find", [".", "-type", "f"], {
  cwd: stage,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean)
  .filter(
    (file) =>
      !["./HOSTINGER_PACKAGE.json", "./RELEASE_FILES.sha256"].includes(file),
  )
  .sort();
const fingerprintHash = createHash("sha256");
for (const file of fingerprintFiles) {
  fingerprintHash.update(file.replace(/^\.\//, ""));
  fingerprintHash.update("\0");
  fingerprintHash.update(readFileSync(join(stage, file)));
  fingerprintHash.update("\0");
}
const sourceFingerprint = `sha256:${fingerprintHash.digest("hex")}`;
const snapshotEpochSeconds =
  Math.floor(Date.UTC(2020, 0, 1) / 1000) +
  (Number.parseInt(sourceFingerprint.slice(7, 15), 16) %
    (20 * 365 * 24 * 60 * 60));
const sourceTimestamp = sourceMode === "git-archive"
  ? execFileSync("git", ["show", "-s", "--format=%cI", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim()
  : new Date(snapshotEpochSeconds * 1000).toISOString();
const releaseVersion = JSON.parse(
  readFileSync(join(stage, "package.json"), "utf8"),
).version;
writeFileSync(
  join(stage, "HOSTINGER_PACKAGE.json"),
  `${JSON.stringify(
    {
      application: "Atlas One",
      commit,
      sourceMode,
      sourceFingerprint,
      releaseVersion,
      sourceTimestamp,
      target: "Hostinger Node.js 22+ (Node 24 recomendado)",
      releaseChannel: packageName === "atlas-v3-hostinger-homologation.zip"
        ? "hostinger-homologation-candidate"
        : "final-homologation-candidate",
      evolutionPhase: process.env.ATLAS_EVOLUTION_PHASE
        ? Number(process.env.ATLAS_EVOLUTION_PHASE)
        : null,
      cleanInstall: true,
      dependsOnV2: false,
      startCommand: "npm start",
      processManager: "pm2 start ecosystem.config.cjs",
      privateDataIncluded: false,
      legacyPrototypeRoutesIncluded: false,
      unusedConceptualCoreIncluded: false,
      fileInventory: "RELEASE_FILES.sha256",
      releaseTestReport: releaseEvidence ? "RELEASE_TEST_REPORT.json" : null,
    },
    null,
    2,
  )}\n`,
);

const stagedFiles = execFileSync("find", [".", "-type", "f"], {
  cwd: stage,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean)
  .sort();
const inventory = stagedFiles
  .map(
    (file) =>
      `${createHash("sha256")
        .update(readFileSync(join(stage, file)))
        .digest("hex")}  ${file.replace(/^\.\//, "")}`,
  )
  .join("\n");
writeFileSync(join(stage, "RELEASE_FILES.sha256"), `${inventory}\n`);
const releaseDate = new Date(sourceTimestamp);
const touchTimestamp = `${releaseDate.getUTCFullYear()}${String(releaseDate.getUTCMonth() + 1).padStart(2, "0")}${String(releaseDate.getUTCDate()).padStart(2, "0")}${String(releaseDate.getUTCHours()).padStart(2, "0")}${String(releaseDate.getUTCMinutes()).padStart(2, "0")}.${String(releaseDate.getUTCSeconds()).padStart(2, "0")}`;
execFileSync(
  "find",
  [".", "-type", "f", "-exec", "touch", "-t", touchTimestamp, "{}", ";"],
  { cwd: stage, env: { ...process.env, TZ: "UTC" } },
);
const zipFiles = execFileSync("find", [".", "-type", "f"], {
  cwd: stage,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean)
  .sort();
execFileSync("zip", ["-Xq", zipPath, "-@"], {
  cwd: stage,
  input: `${zipFiles.join("\n")}\n`,
  env: { ...process.env, TZ: "UTC" },
});
const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
const forbidden = entries.filter(
  (entry) =>
    isRealEnvironmentFile(entry) ||
    /(^|\/)(?:hostinger\.env|node_modules|\.next|tmp|outputs|dist|\.git)(?:\/|$)/.test(
      entry,
    ) || /\.(?:xlsx?|csv|pdf)$/i.test(entry),
);
if (forbidden.length)
  throw new Error(
    `Pacote contém arquivos proibidos: ${forbidden.slice(0, 10).join(", ")}`,
  );
for (const required of [
  "package.json",
  "package-lock.json",
  "ecosystem.config.cjs",
  ".env.example",
  ".env.homologation.example",
  "CHECKLIST_FINAL.md",
  "INSTALACAO.md",
  "HOSTINGER_PACKAGE.json",
  "RELEASE_FILES.sha256",
  "app/(auth)/setup/page.tsx",
  "app/(auth)/setup/layout.tsx",
  "app/api/bootstrap/admin/route.ts",
  "lib/bootstrap/installation-status.ts",
  "lib/bootstrap/policy.ts",
  "proxy.ts",
  "scripts/check-bootstrap-fixed.mjs",
  "tests/contracts/bootstrap-public-route.test.mjs",
  "docs/ATLAS_ONE_V1000_CLEAN_RELEASE.md",
  "docs/HOSTINGER_FINAL_RELEASE_PHASE_100.md",
  "docs/EVOLUTION_PHASE_101_HOMOLOGATION_PACKAGE.md",
  "lib/auth/safe-redirect.ts",
  "components/crm/lead-operational-bar.tsx",
  "playwright.config.mjs",
  "supabase/seed.sql",
  "tests/e2e/login.spec.mjs",
  "tests/e2e/authenticated-journeys.spec.mjs",
  "app/(crm)/notifications/page.tsx",
  "components/atlas/notifications-v3000-surface.tsx",
  "components/atlas/v3000-page-template.tsx",
  "docs/V3000_PHASE_05_NOTIFICATIONS_PILOT.md",
  "docs/V3000_PHASE_06_ACCESSIBILITY_CONSOLIDATION.md",
  "docs/V3000_PHASE_07_VISUAL_PROOF.md",
  "docs/V3000_PHASE_08_AUTHENTICATED_RELEASE_GATE.md",
  "docs/V3000_PHASE_09_CONTROLLED_RELEASE.md",
  "docs/V3000_PHASE_10_ARTIFACT_PROOF.md",
  "tests/contracts/v3000-page-template.test.mjs",
  "tests/contracts/v3000-phase-09-controlled-release.test.mjs",
  "tests/contracts/v3000-phase-10-artifact-proof.test.mjs",
]) {
  if (!entries.includes(required))
    throw new Error(`Arquivo obrigatório ausente no ZIP: ${required}`);
}
const bytes = readFileSync(zipPath);
const checksum = createHash("sha256").update(bytes).digest("hex");
writeFileSync(checksumPath, `${checksum}  ${packageName}\n`);
if (!existsSync(zipPath)) throw new Error("ZIP Hostinger não foi criado.");
console.log(
  JSON.stringify({
    ok: true,
    zipPath,
    checksumPath,
    commit,
    files: entries.length,
    bytes: bytes.length,
    checksum,
  }),
);
