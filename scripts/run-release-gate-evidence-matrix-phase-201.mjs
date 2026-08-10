import { readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { evaluateReleaseGateEvidenceMatrix } from "../lib/release/release-gate-evidence-matrix.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const graph = buildModuleDependencyGraph({
  completionMemory: readJson("config/release-module-completion-memory.json"),
  configuration: readJson("config/release-module-dependency-graph.json"),
});
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const matrix = evaluateReleaseGateEvidenceMatrix({
  decision,
  plan: readJson("config/release-gate-evidence-plan.json"),
  records: [],
  evaluatedAt: "2026-08-08T12:00:00.000Z",
});
console.log(JSON.stringify(matrix, null, 2));
