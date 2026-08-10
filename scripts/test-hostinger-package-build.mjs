import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const packageName =
  process.env.ATLAS_PACKAGE_NAME || "atlas-v3-hostinger-homologation.zip";
const zip = resolve(root, "dist/hostinger", packageName);
const requestedEnvFile = resolve(
  root,
  process.env.ATLAS_PACKAGE_ENV_FILE || ".env.local",
);
const templateEnvFile = resolve(root, ".env.homologation.example");
const envFile = existsSync(requestedEnvFile) ? requestedEnvFile : templateEnvFile;
if (!existsSync(zip)) throw new Error("Gere o ZIP Hostinger antes do build limpo.");
if (!existsSync(envFile))
  throw new Error("Arquivo de ambiente ou template de homologação ausente para o ensaio.");
const envContents = readFileSync(envFile, "utf8");
const isTemplateEnvironment =
  envFile === templateEnvFile ||
  envContents.includes("replace-with-") ||
  envContents.includes("seu-dominio.com.br");
const environmentMode = isTemplateEnvironment
  ? "safe-template"
  : "configured-environment";

const stage = mkdtempSync(join(tmpdir(), "atlas-hostinger-clean-build-"));
try {
  execFileSync("unzip", ["-q", zip, "-d", stage]);
  copyFileSync(envFile, join(stage, ".env.local"));
  execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: stage, stdio: "inherit" });
  execFileSync("npm", ["run", "build"], { cwd: stage, stdio: "inherit" });
  console.log(
    JSON.stringify({
      ok: true,
      packageName,
      cleanInstall: true,
      cleanBuild: true,
      environmentMode,
      configuredEnvironmentBuild:
        environmentMode === "configured-environment",
      integrationConnectivityValidated: false,
      secretsPackaged: false,
    }),
  );
} finally {
  rmSync(stage, { recursive: true, force: true });
}
