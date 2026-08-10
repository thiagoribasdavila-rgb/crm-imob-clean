import { readFileSync } from "node:fs";
import {
  inspectModuleArtifactMemory,
  inspectModuleArtifactSnapshot,
} from "../lib/release/module-artifact-memory.mjs";
import { inspectModuleCompletionMemory } from "../lib/release/module-completion-memory.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const completion = readJson("config/release-module-completion-memory.json");
const artifacts = readJson("config/release-module-artifact-memory.json");
const moduleId = "conversion-core-isolated-readiness";
const entry = completion.entries.find((candidate) => candidate.moduleId === moduleId && candidate.revision === 1);
const snapshot = artifacts.snapshots.find((candidate) => candidate.moduleId === moduleId && candidate.revision === 1);
const completionInspection = inspectModuleCompletionMemory(completion);
const artifactMemoryInspection = inspectModuleArtifactMemory(artifacts);
const snapshotInspection = entry && snapshot
  ? inspectModuleArtifactSnapshot({ rootDir: process.cwd(), entry, snapshot })
  : { ok: false, reason: "module_or_snapshot_missing" };

const output = {
  phase: 198,
  mode: "conversion_core_isolated_readiness_memory",
  ok: completionInspection.ok && artifactMemoryInspection.ok && snapshotInspection.ok,
  completion: completion.summary,
  module: snapshotInspection,
  effects: { remote: false, database: false, migration: false, build: false, zip: false, deploy: false },
};

console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exitCode = 1;
