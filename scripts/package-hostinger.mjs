import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const root = process.cwd();
const outputRoot = resolve(root, "dist/hostinger");
const stage = join(outputRoot, "atlas-v3");
const zipPath = join(outputRoot, "atlas-v3-hostinger.zip");
const checksumPath = `${zipPath}.sha256`;
const trackedChanges = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim();
if (trackedChanges) throw new Error("Existem alterações versionadas sem commit. Registre-as antes de gerar o pacote Hostinger.");

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], { cwd: root, maxBuffer: 50 * 1024 * 1024 });
execFileSync("tar", ["-xf", "-", "-C", stage], { input: archive });

for (const relativePath of legacyRoutePaths) rmSync(join(stage, relativePath), { recursive: true, force: true });
for (const relativePath of [
  "AGENTS.md", "CLAUDE.md", "core", "logs",
  "public/file.svg", "public/globe.svg", "public/next.svg", "public/vercel.svg", "public/window.svg",
]) rmSync(join(stage, relativePath), { recursive: true, force: true });

const commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
writeFileSync(join(stage, "HOSTINGER_PACKAGE.json"), `${JSON.stringify({
  application: "Atlas V3",
  commit,
  generatedAt: new Date().toISOString(),
  target: "Hostinger Node.js 24",
  startCommand: "npm start",
  processManager: "pm2 start ecosystem.config.cjs",
  privateDataIncluded: false,
  legacyPrototypeRoutesIncluded: false,
  unusedConceptualCoreIncluded: false,
}, null, 2)}\n`);

execFileSync("zip", ["-qr", zipPath, "."], { cwd: stage });
const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const forbidden = entries.filter((entry) => /(^|\/)(?:\.env\.local|node_modules|\.next|tmp|outputs|dist|\.git)(?:\/|$)/.test(entry) || /\.(?:xlsx?|csv|pdf)$/i.test(entry));
if (forbidden.length) throw new Error(`Pacote contém arquivos proibidos: ${forbidden.slice(0, 10).join(", ")}`);
for (const required of ["package.json", "package-lock.json", "ecosystem.config.cjs", ".env.example", "HOSTINGER_PACKAGE.json"]) {
  if (!entries.includes(required)) throw new Error(`Arquivo obrigatório ausente no ZIP: ${required}`);
}
const bytes = readFileSync(zipPath);
const checksum = createHash("sha256").update(bytes).digest("hex");
writeFileSync(checksumPath, `${checksum}  atlas-v3-hostinger.zip\n`);
if (!existsSync(zipPath)) throw new Error("ZIP Hostinger não foi criado.");
console.log(JSON.stringify({ ok: true, zipPath, checksumPath, commit, files: entries.length, bytes: bytes.length, checksum }));
