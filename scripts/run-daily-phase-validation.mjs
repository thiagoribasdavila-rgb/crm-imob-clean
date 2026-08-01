import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, resolve } from "node:path";

const root = process.cwd();
const program = JSON.parse(readFileSync(resolve(root, "config/evolution-program-3000.json"), "utf8"));
const requested = Number(process.argv[2] || process.env.ATLAS_EVOLUTION_PHASE || program.currentPhase);
if (!Number.isInteger(requested) || requested < 1) throw new Error("Informe uma fase válida.");

const padded = String(requested).padStart(3, "0");
const configFiles = readdirSync(resolve(root, "config")).filter((name) => name.startsWith(`evolution-phase-${padded}-`) && name.endsWith(".json"));
if (configFiles.length !== 1) throw new Error(`A Fase ${padded} precisa de exatamente um contrato de entrega.`);
const phase = JSON.parse(readFileSync(resolve(root, "config", configFiles[0]), "utf8"));
if (phase.status !== "completed") throw new Error(`A Fase ${padded} ainda não está concluída.`);
if (phase.release?.buildExecuted === true) throw new Error("Uma entrega diária não pode executar build de release.");

const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
const startedAt = Date.now();

run(process.execPath, [`scripts/check-evolution-phase-${padded}.mjs`]);
run(process.execPath, ["scripts/scan-secrets.mjs"]);

const changed = new Set();
for (const args of [
  ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
  ["ls-files", "--others", "--exclude-standard"],
]) {
  const output = execFileSync("git", args, { cwd: root, encoding: "utf8" });
  for (const file of output.split(/\r?\n/).filter(Boolean)) {
    if (!/^(?:outputs|tmp|dist)\//.test(file)) changed.add(file);
  }
}

const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const changedCode = [...changed].filter((file) => codeExtensions.has(extname(file)) && existsSync(resolve(root, file)));
if (changedCode.length) {
  run("npm", ["run", "typecheck"]);
  run("npx", ["--no-install", "eslint", ...changedCode, "--max-warnings=0"]);
}

for (const check of phase.validation?.targetedChecks || []) run("npm", ["run", check]);

console.log(JSON.stringify({
  ok: true,
  phase: requested,
  validation: "daily-targeted",
  changedFiles: changed.size,
  changedCodeFiles: changedCode.length,
  buildExecuted: false,
  elapsedMs: Date.now() - startedAt,
}));
