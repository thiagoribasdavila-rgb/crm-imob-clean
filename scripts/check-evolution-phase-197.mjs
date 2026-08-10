import { existsSync, readFileSync } from "node:fs";
import {
  inspectModuleArtifactMemory,
  inspectModuleArtifactSnapshot,
} from "../lib/release/module-artifact-memory.mjs";
import { inspectModuleCompletionMemory } from "../lib/release/module-completion-memory.mjs";

const fail = (message) => { throw new Error(`[phase-197] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-197-release-module-artifact-memory.json",
  "config/release-module-artifact-memory.json",
  "config/release-module-completion-memory.json",
  "docs/EVOLUTION_PHASE_197_RELEASE_MODULE_ARTIFACT_MEMORY.md",
  "lib/release/module-artifact-memory.mjs",
  "scripts/run-release-module-artifact-memory-phase-197.mjs",
  "tests/contracts/release-module-artifact-memory.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const phase = readJson(required[0]);
if (phase.phase !== 197 || phase.status !== "implemented") fail("fase ou status inválido");
for (const [key, value] of Object.entries(phase.safety)) if (value !== false) fail(`${key} deveria permanecer falso`);

const artifacts = readJson(required[1]);
const completion = readJson(required[2]);
const completionInspection = inspectModuleCompletionMemory(completion);
if (!completionInspection.ok) fail(`memória de conclusão inválida: ${completionInspection.reason}`);
const artifactInspection = inspectModuleArtifactMemory(artifacts);
if (!artifactInspection.ok) fail(`memória de artefatos inválida: ${artifactInspection.reason}`);
if (artifacts.snapshots.length !== completion.entries.length) fail("cada entrada precisa de exatamente um snapshot atual");

let artifactCount = 0;
let totalBytes = 0;
for (const entry of completion.entries) {
  const matches = artifacts.snapshots.filter(
    (snapshot) => snapshot.moduleId === entry.moduleId && snapshot.revision === entry.revision,
  );
  if (matches.length !== 1) fail(`snapshot atual ausente ou duplicado: ${entry.moduleId}@${entry.revision}`);
  const inspection = inspectModuleArtifactSnapshot({ rootDir: process.cwd(), entry, snapshot: matches[0] });
  if (!inspection.ok) fail(`artefatos divergentes: ${entry.moduleId}@${entry.revision}: ${inspection.reason}`);
  artifactCount += inspection.artifactCount;
  totalBytes += inspection.totalBytes;
}
if (artifactCount !== phase.currentState.artifactCount || totalBytes !== phase.currentState.totalBytes) {
  fail("totais do snapshot divergentes da fase");
}
if (completion.summary.zipEligible !== 0) fail("módulo foi promovido sem gates reais");

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 197) fail("programa principal não avançou");
const delivery = readJson("config/evolution-phase-171-operational-memory-delivery-program.json");
if (delivery.completionMemory?.artifactMemoryPath !== required[1]) fail("programa de entrega não aponta para a memória física");
if (delivery.completionMemory?.artifactBytesMustMatchBeforeZip !== true) fail("política de integridade anterior ao ZIP ausente");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-197:assess", "evolution:phase-197:check"]) {
  if (!scripts[name]) fail(`script ausente: ${name}`);
}

console.log(`[phase-197] PASS — ${artifactCount} artefatos/${totalBytes} bytes íntegros; nenhum módulo foi promovido ao ZIP.`);
