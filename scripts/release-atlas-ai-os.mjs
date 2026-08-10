import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateRealUseReadinessDecision } from "./preflight-atlas-real-use-readiness-decision.mjs";

const root = process.cwd();
const gates = JSON.parse(readFileSync(resolve(root, "config/atlas-ai-os-release-gates.json"), "utf8"));
const missing = Object.entries(gates.gates || {}).filter(([, approved]) => approved !== true).map(([name]) => name);
if (gates.approved !== true || gates.status !== "approved" || missing.length) {
  throw new Error(`Release bloqueado. Gates pendentes: ${missing.join(", ") || "aprovação final"}.`);
}
if (gates.localBuildsRequired !== 1) throw new Error("O contrato de release exige exatamente um build local.");

const readinessDecisionFile = process.env.ATLAS_READINESS_DECISION_FILE || "config/atlas-real-use-readiness-decision.json";
const readinessDecisionPath = resolve(root, readinessDecisionFile);
if (!existsSync(readinessDecisionPath)) throw new Error("Release bloqueado. Recibo de prontidão ausente.");
const readinessDecision = validateRealUseReadinessDecision(JSON.parse(readFileSync(readinessDecisionPath, "utf8")));
if (!readinessDecision.approved) throw new Error(`Release bloqueado. Recibo de prontidão inválido: ${readinessDecision.issues.join(", ")}.`);

const trackedChanges = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8" }).trim();
if (trackedChanges) throw new Error("Registre as alterações versionadas antes do release.");

const run = (command, args, env = process.env) => execFileSync(command, args, { cwd: root, env, stdio: "inherit" });

run("npm", ["run", "release:prebuild-check"]);
run("npm", ["run", "build"]);

const releaseEnv = {
  ...process.env,
  ATLAS_PACKAGE_NAME: gates.artifact,
  ATLAS_EVOLUTION_PHASE: "",
};
run(process.execPath, ["scripts/package-hostinger.mjs"], releaseEnv);
run(process.execPath, ["scripts/verify-hostinger-package.mjs"], releaseEnv);

console.log(JSON.stringify({ ok: true, artifact: gates.artifact, localBuildsExecuted: 1, automaticDeploy: false, readinessDecision: readinessDecision.status }));
