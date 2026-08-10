import { existsSync, readFileSync } from "node:fs";
import {
  inspectModuleArtifactMemory,
  inspectModuleArtifactSnapshot,
} from "../lib/release/module-artifact-memory.mjs";
import { inspectModuleCompletionMemory } from "../lib/release/module-completion-memory.mjs";

const fail = (message) => { throw new Error(`[phase-198] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-198-conversion-core-isolated-readiness-memory.json",
  "config/release-module-completion-memory.json",
  "config/release-module-artifact-memory.json",
  "docs/EVOLUTION_PHASE_198_CONVERSION_CORE_ISOLATED_READINESS_MEMORY.md",
  "scripts/run-conversion-core-isolated-readiness-memory-phase-198.mjs",
  "tests/contracts/conversion-core-isolated-readiness-memory.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
const completion = readJson(required[1]);
const artifacts = readJson(required[2]);
if (phase.phase !== 198 || phase.status !== "implemented") fail("fase ou status inválido");
for (const [key, value] of Object.entries(phase.safety)) if (value !== false) fail(`${key} deveria permanecer falso`);
if (phase.runtimeHomologated !== false) fail("runtime não pode ser homologado por evidência local");

const completionInspection = inspectModuleCompletionMemory(completion);
if (!completionInspection.ok) fail(`memória de conclusão inválida: ${completionInspection.reason}`);
const artifactInspection = inspectModuleArtifactMemory(artifacts);
if (!artifactInspection.ok) fail(`memória física inválida: ${artifactInspection.reason}`);
const entries = completion.entries.filter((entry) => entry.moduleId === "conversion-core-isolated-readiness");
if (entries.length !== 1 || entries[0].revision !== 1) fail("módulo isolado ausente ou duplicado");
const entry = entries[0];
const snapshot = artifacts.snapshots.find((candidate) => candidate.moduleId === entry.moduleId && candidate.revision === entry.revision);
if (!snapshot) fail("snapshot do módulo isolado ausente");
const snapshotInspection = inspectModuleArtifactSnapshot({ rootDir: process.cwd(), entry, snapshot });
if (!snapshotInspection.ok) fail(`snapshot divergente: ${snapshotInspection.reason}`);
if (snapshotInspection.artifactCount !== phase.currentState.moduleArtifactCount) fail("quantidade do módulo divergente");
if (snapshotInspection.totalBytes !== phase.currentState.moduleTotalBytes) fail("bytes do módulo divergentes");
if (completion.summary.registered !== 2 || artifacts.snapshots.length !== 2) fail("memórias não possuem dois módulos");
if (completion.summary.runtimeHomologated !== 0 || completion.summary.zipEligible !== 0) fail("promoção indevida detectada");
if (entry.releaseGates.runtimeHomologated || entry.releaseGates.cleanBuildVerified || entry.releaseGates.rollbackReady || entry.releaseGates.directorApproved) fail("gate real foi aberto sem prova");
if (entry.previousEntryHash !== completion.entries[0].entryHash) fail("cadeia entre módulos inválida");
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 198) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-198:assess", "evolution:phase-198:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);

console.log(`[phase-198] PASS — ${snapshotInspection.artifactCount} artefatos/${snapshotInspection.totalBytes} bytes registrados como evidência local; 0 módulos elegíveis para ZIP.`);
