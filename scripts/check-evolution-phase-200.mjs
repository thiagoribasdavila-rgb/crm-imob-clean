import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";

const fail = (message) => { throw new Error(`[phase-200] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-200-release-composition-eligibility.json",
  "config/release-composition-plan.json",
  "docs/EVOLUTION_PHASE_200_RELEASE_COMPOSITION_ELIGIBILITY.md",
  "lib/release/release-composition-eligibility.mjs",
  "scripts/run-release-composition-eligibility-phase-200.mjs",
  "tests/contracts/release-composition-eligibility.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);
const phase = readJson(required[0]);
const graph = buildModuleDependencyGraph({
  completionMemory: readJson("config/release-module-completion-memory.json"),
  configuration: readJson("config/release-module-dependency-graph.json"),
});
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson(required[1]) });
if (phase.phase !== 200 || phase.status !== "implemented") fail("fase ou status inválido");
for (const [key, value] of Object.entries(phase.safety)) if (value !== false) fail(`${key} deveria permanecer falso`);
if (decision.summary.modulesInClosure !== 2 || decision.summary.structuralBlockers !== 0) fail("clausura estrutural inválida");
if (decision.summary.releaseBlockers !== 8 || decision.summary.eligible !== false) fail("gates reais não bloquearam a composição");
if (decision.summary.packageGenerated !== false || decision.decision !== "blocked_before_packaging") fail("pacote ou decisão indevida");
if (phase.currentState.decisionHash !== decision.decisionHash) fail("hash da decisão divergente");
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 200) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-200:assess", "evolution:phase-200:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);
console.log(`[phase-200] PASS — ${decision.summary.modulesInClosure} módulos na clausura, 0 falhas estruturais, ${decision.summary.releaseBlockers} gates pendentes e nenhum pacote gerado.`);
