import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const graph = buildModuleDependencyGraph({
  completionMemory: readJson("config/release-module-completion-memory.json"),
  configuration: readJson("config/release-module-dependency-graph.json"),
});

console.log(JSON.stringify({
  phase: 199,
  mode: "release_module_dependency_graph",
  ok: graph.ok,
  graphHash: graph.graphHash,
  summary: graph.summary,
  cycles: graph.cycles,
  effects: { remote: false, database: false, migration: false, build: false, zip: false, deploy: false },
}, null, 2));
if (!graph.ok) process.exitCode = 1;
