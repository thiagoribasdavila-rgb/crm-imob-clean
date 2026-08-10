import { readFileSync } from "node:fs";
import { inspectModuleCompletionMemory } from "../lib/release/module-completion-memory.mjs";

const memory = JSON.parse(readFileSync("config/release-module-completion-memory.json", "utf8"));
const inspection = inspectModuleCompletionMemory(memory);

console.log(JSON.stringify({
  phase: 196,
  mode: "local_release_module_completion_memory",
  ...inspection,
  effects: { remote: false, database: false, migration: false, build: false, zip: false, deploy: false },
}, null, 2));

if (!inspection.ok) process.exitCode = 1;
