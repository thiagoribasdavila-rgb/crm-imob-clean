import { readFileSync } from "node:fs";
import {
  inspectModuleArtifactMemory,
  inspectModuleArtifactSnapshot,
} from "../lib/release/module-artifact-memory.mjs";
import { inspectModuleCompletionMemory } from "../lib/release/module-completion-memory.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const completion = readJson("config/release-module-completion-memory.json");
const artifacts = readJson("config/release-module-artifact-memory.json");
const completionInspection = inspectModuleCompletionMemory(completion);
const artifactInspection = inspectModuleArtifactMemory(artifacts);

const results = completion.entries.map((entry) => {
  const snapshot = artifacts.snapshots.find(
    (candidate) => candidate.moduleId === entry.moduleId && candidate.revision === entry.revision,
  );
  if (!snapshot) return { ok: false, moduleId: entry.moduleId, revision: entry.revision, reason: "snapshot_missing" };
  return inspectModuleArtifactSnapshot({ rootDir: process.cwd(), entry, snapshot });
});

const output = {
  phase: 197,
  mode: "local_release_module_artifact_memory",
  ok: completionInspection.ok && artifactInspection.ok && results.every((result) => result.ok),
  registeredModules: completion.entries.length,
  registeredSnapshots: artifacts.snapshots.length,
  intactSnapshots: results.filter((result) => result.ok).length,
  artifactCount: results.reduce((total, result) => total + (result.artifactCount ?? 0), 0),
  totalBytes: results.reduce((total, result) => total + (result.totalBytes ?? 0), 0),
  zipEligible: completion.summary.zipEligible,
  results,
  effects: { remote: false, database: false, migration: false, build: false, zip: false, deploy: false },
};

console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exitCode = 1;
