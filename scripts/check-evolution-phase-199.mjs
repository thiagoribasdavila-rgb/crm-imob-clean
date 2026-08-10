import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";

const fail = (message) => { throw new Error(`[phase-199] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-199-release-module-dependency-graph.json",
  "config/release-module-dependency-graph.json",
  "docs/EVOLUTION_PHASE_199_RELEASE_MODULE_DEPENDENCY_GRAPH.md",
  "lib/release/module-dependency-graph.mjs",
  "scripts/run-release-module-dependency-graph-phase-199.mjs",
  "tests/contracts/release-module-dependency-graph.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);
const phase = readJson(required[0]);
const graph = buildModuleDependencyGraph({
  completionMemory: readJson("config/release-module-completion-memory.json"),
  configuration: readJson(required[1]),
});
if (phase.phase !== 199 || phase.status !== "implemented") fail("fase ou status inválido");
for (const [key, value] of Object.entries(phase.safety)) if (value !== false) fail(`${key} deveria permanecer falso`);
if (!graph.ok) fail("grafo contém problema estrutural");
if (graph.summary.nodes !== 2 || graph.summary.edges !== 1 || graph.summary.resolvedEdges !== 1) fail("topologia inesperada");
if (graph.summary.releaseReady !== 0 || graph.summary.blocked !== 2) fail("promoção indevida detectada");
if (graph.cycles.length !== 0 || graph.unconfigured.length !== 0) fail("ciclo ou módulo sem configuração");
const readiness = graph.nodes.find((node) => node.moduleId === "conversion-core-isolated-readiness");
if (!readiness?.dependencySatisfied || readiness.dependencies[0]?.moduleId !== "conversion-core-capture-governance") fail("dependência do módulo isolado inválida");
if (phase.currentState.graphHash !== graph.graphHash) fail("hash do grafo divergente");
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 199) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-199:assess", "evolution:phase-199:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);
console.log(`[phase-199] PASS — ${graph.summary.nodes} módulos, ${graph.summary.resolvedEdges}/${graph.summary.edges} dependências resolvidas, 0 ciclos e 0 módulos promovidos ao ZIP.`);
