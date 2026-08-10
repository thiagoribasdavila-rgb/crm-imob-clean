import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectModuleArtifactSnapshot } from "../../lib/release/module-artifact-memory.mjs";
import { inspectModuleCompletionMemory } from "../../lib/release/module-completion-memory.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

test("registra prontidão isolada como módulo independente e somente local", () => {
  const memory = readJson("config/release-module-completion-memory.json");
  assert.equal(inspectModuleCompletionMemory(memory).ok, true);
  const entry = memory.entries.find((candidate) => candidate.moduleId === "conversion-core-isolated-readiness");
  assert.ok(entry);
  assert.equal(entry.revision, 1);
  assert.equal(entry.completionLevel, "locally_verified");
  assert.deepEqual(entry.releaseGates, {
    runtimeHomologated: false,
    cleanBuildVerified: false,
    rollbackReady: false,
    directorApproved: false,
  });
  assert.equal(entry.packaging.zipEligible, false);
  assert.equal(entry.previousEntryHash, memory.entries[0].entryHash);
});

test("vincula os 46 artefatos físicos ao módulo e à revisão exatos", () => {
  const completion = readJson("config/release-module-completion-memory.json");
  const artifacts = readJson("config/release-module-artifact-memory.json");
  const entry = completion.entries.find((candidate) => candidate.moduleId === "conversion-core-isolated-readiness");
  const snapshot = artifacts.snapshots.find((candidate) => candidate.moduleId === entry.moduleId && candidate.revision === entry.revision);
  const inspection = inspectModuleArtifactSnapshot({ rootDir: process.cwd(), entry, snapshot });
  assert.equal(inspection.ok, true);
  assert.equal(inspection.artifactCount, 46);
  assert.equal(inspection.totalBytes, 161380);
});

test("não mistura evidência remota ou fases de governança posteriores", () => {
  const memory = readJson("config/release-module-completion-memory.json");
  const entry = memory.entries.find((candidate) => candidate.moduleId === "conversion-core-isolated-readiness");
  assert.equal(entry.evidencePaths.some((path) => path.includes("phase-184")), false);
  assert.equal(entry.evidencePaths.some((path) => path.includes("phase-183")), true);
  assert.equal(entry.sourcePaths.some((path) => path.includes("capture-procedure")), false);
});
