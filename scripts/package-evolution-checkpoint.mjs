import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const policy = JSON.parse(readFileSync(resolve(root, "config/evolution-zip-checkpoints.json"), "utf8"));
if (policy.active === false) {
  throw new Error("Pacotes recorrentes por fase foram encerrados. Use o release oficial somente após aprovação dos gates.");
}
const requested = process.argv[2] || process.env.ATLAS_EVOLUTION_PHASE || "";
const phase = Number(requested);

const isSpecialCheckpoint = policy.specialCheckpoints?.includes(phase) === true;
const isRecurringCheckpoint = Number.isInteger(phase) && phase >= policy.firstCheckpoint && phase <= policy.lastCheckpoint && phase % policy.interval === 0;

if (!Number.isInteger(phase) || (!isSpecialCheckpoint && !isRecurringCheckpoint)) {
  throw new Error(`Checkpoint inválido. Use uma fase especial autorizada ou um múltiplo de ${policy.interval} entre ${policy.firstCheckpoint} e ${policy.lastCheckpoint}.`);
}

const padded = String(phase).padStart(3, "0");
const matchingConfig = execFileSync("find", ["config", "-maxdepth", "1", "-name", `evolution-phase-${padded}-*.json`, "-print"], {
  cwd: root,
  encoding: "utf8",
}).trim().split(/\r?\n/).filter(Boolean);

if (matchingConfig.length !== 1 || !existsSync(resolve(root, matchingConfig[0]))) {
  throw new Error(`A Fase ${padded} precisa ter exatamente um registro de conclusão antes do ZIP.`);
}

const phaseState = JSON.parse(readFileSync(resolve(root, matchingConfig[0]), "utf8"));
if (phaseState.phase !== phase || phaseState.status !== "completed") {
  throw new Error(`A Fase ${padded} ainda não possui evidência de conclusão.`);
}

const run = (command, args, env = process.env) => execFileSync(command, args, {
  cwd: root,
  env,
  stdio: "inherit",
});

run(process.execPath, [`scripts/check-evolution-phase-${padded}.mjs`]);
run("npm", ["run", "evolution-2000:check"]);
run("npm", ["run", "typecheck"]);
run("npm", ["run", "lint"]);
run("npm", ["run", "build"]);

const packageName = policy.artifactPattern.replace("{phase}", padded);
const env = { ...process.env, ATLAS_PACKAGE_NAME: packageName, ATLAS_EVOLUTION_PHASE: String(phase) };
run(process.execPath, ["scripts/package-hostinger.mjs"], env);
run(process.execPath, ["scripts/verify-hostinger-package.mjs"], env);

console.log(JSON.stringify({ ok: true, phase, packageName, privateDataIncluded: false }));
