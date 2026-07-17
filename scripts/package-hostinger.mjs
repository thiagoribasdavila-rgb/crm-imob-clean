import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const root = process.cwd();
const outputRoot = resolve(root, "dist/hostinger");
const stage = join(outputRoot, "atlas-v3");
const zipPath = join(outputRoot, "atlas-v3-hostinger-final.zip");
const checksumPath = `${zipPath}.sha256`;
const trackedChanges = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=no"],
  { cwd: root, encoding: "utf8" },
).trim();
if (trackedChanges)
  throw new Error(
    "Existem alterações versionadas sem commit. Registre-as antes de gerar o pacote Hostinger.",
  );

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], {
  cwd: root,
  maxBuffer: 50 * 1024 * 1024,
});
execFileSync("tar", ["-xf", "-", "-C", stage], { input: archive });

for (const relativePath of legacyRoutePaths)
  rmSync(join(stage, relativePath), { recursive: true, force: true });
for (const relativePath of [
  "AGENTS.md",
  "CLAUDE.md",
  "core",
  "logs",
  "application",
  "domain",
  "components/crm",
  "components/analytics",
  "components/pipeline",
  "components/ui/ProtectedRoute.tsx",
  "lib/auth",
  "lib/data",
  "lib/services",
  "public/file.svg",
  "public/globe.svg",
  "public/next.svg",
  "public/vercel.svg",
  "public/window.svg",
])
  rmSync(join(stage, relativePath), { recursive: true, force: true });

const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const sourceTimestamp = execFileSync(
  "git",
  ["show", "-s", "--format=%cI", "HEAD"],
  { cwd: root, encoding: "utf8" },
).trim();
const releaseVersion = JSON.parse(
  readFileSync(join(stage, "package.json"), "utf8"),
).version;
writeFileSync(
  join(stage, "HOSTINGER_PACKAGE.json"),
  `${JSON.stringify(
    {
      application: "Atlas V3",
      commit,
      releaseVersion,
      sourceTimestamp,
      target: "Hostinger Node.js 24",
      releaseChannel: "final-homologation-candidate",
      cleanInstall: true,
      dependsOnV2: false,
      startCommand: "npm start",
      processManager: "pm2 start ecosystem.config.cjs",
      privateDataIncluded: false,
      legacyPrototypeRoutesIncluded: false,
      unusedConceptualCoreIncluded: false,
      fileInventory: "RELEASE_FILES.sha256",
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
const releaseEpoch = execFileSync(
  "git",
  ["show", "-s", "--format=%ct", "HEAD"],
  { cwd: root, encoding: "utf8" },
).trim();
const releaseDate = new Date(Number(releaseEpoch) * 1000);
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
    /(^|\/)(?:\.env\.local|node_modules|\.next|tmp|outputs|dist|\.git)(?:\/|$)/.test(
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
  "HOSTINGER_PACKAGE.json",
  "RELEASE_FILES.sha256",
  "docs/HOSTINGER_FINAL_RELEASE_PHASE_100.md",
]) {
  if (!entries.includes(required))
    throw new Error(`Arquivo obrigatório ausente no ZIP: ${required}`);
}
const bytes = readFileSync(zipPath);
const checksum = createHash("sha256").update(bytes).digest("hex");
writeFileSync(checksumPath, `${checksum}  atlas-v3-hostinger-final.zip\n`);
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
