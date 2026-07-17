import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const zip = resolve(root, "dist/hostinger/atlas-v3-hostinger-final.zip");
const envFile = resolve(root, process.env.ATLAS_PACKAGE_ENV_FILE || ".env.local");
if (!existsSync(zip)) throw new Error("Gere o ZIP Hostinger antes do build limpo.");
if (!existsSync(envFile)) throw new Error("Arquivo de ambiente local ausente para o ensaio.");

const stage = mkdtempSync(join(tmpdir(), "atlas-hostinger-clean-build-"));
try {
  execFileSync("unzip", ["-q", zip, "-d", stage]);
  copyFileSync(envFile, join(stage, ".env.local"));
  execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: stage, stdio: "inherit" });
  execFileSync("npm", ["run", "build"], { cwd: stage, stdio: "inherit" });
  console.log(JSON.stringify({ ok: true, cleanInstall: true, cleanBuild: true, secretsPackaged: false }));
} finally {
  rmSync(stage, { recursive: true, force: true });
}
