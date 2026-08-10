import { existsSync, readFileSync } from "node:fs";
import { inspectModuleCompletionMemory } from "../lib/release/module-completion-memory.mjs";

const fail = (message) => { throw new Error(`[phase-196] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-196-release-module-completion-memory.json",
  "config/release-module-completion-memory.json",
  "docs/EVOLUTION_PHASE_196_RELEASE_MODULE_COMPLETION_MEMORY.md",
  "lib/release/module-completion-memory.mjs",
  "scripts/run-release-module-completion-memory-phase-196.mjs",
  "tests/contracts/release-module-completion-memory.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
if (phase.phase !== 196 || phase.status !== "implemented") fail("fase ou status inválido");
for (const [key, value] of Object.entries(phase.safety)) if (value !== false) fail(`${key} deveria permanecer falso`);

const memory = readJson(required[1]);
const inspection = inspectModuleCompletionMemory(memory);
if (!inspection.ok) fail(`memória inválida: ${inspection.reason}`);
if (inspection.summary.registered !== 1 || inspection.summary.locallyVerified !== 1) fail("registro local inicial ausente");
if (inspection.summary.runtimeHomologated !== 0 || inspection.summary.zipEligible !== 0) fail("módulo foi promovido sem gates reais");
for (const entry of memory.entries) {
  for (const path of [...entry.sourcePaths, ...entry.evidencePaths]) {
    if (!existsSync(path)) fail(`evidência referenciada ausente: ${path}`);
  }
}

if (readJson("config/evolution-program-3000.json").currentPhase < 196) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-196:assess", "evolution:phase-196:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-196] PASS — memória por módulo íntegra; conclusão local não foi confundida com elegibilidade para ZIP.");
