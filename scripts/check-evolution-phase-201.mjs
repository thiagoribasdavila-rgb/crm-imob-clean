import { existsSync, readFileSync } from "node:fs";
import { buildModuleDependencyGraph } from "../lib/release/module-dependency-graph.mjs";
import { evaluateReleaseCompositionEligibility } from "../lib/release/release-composition-eligibility.mjs";
import { evaluateReleaseGateEvidenceMatrix, inspectReleaseGateEvidencePlan } from "../lib/release/release-gate-evidence-matrix.mjs";

const fail = (message) => { throw new Error(`[phase-201] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-201-release-gate-evidence-matrix.json",
  "config/release-gate-evidence-plan.json",
  "docs/EVOLUTION_PHASE_201_RELEASE_GATE_EVIDENCE_MATRIX.md",
  "lib/release/release-gate-evidence-matrix.mjs",
  "scripts/run-release-gate-evidence-matrix-phase-201.mjs",
  "tests/contracts/release-gate-evidence-matrix.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);
const phase = readJson(required[0]);
const plan = readJson(required[1]);
const graph = buildModuleDependencyGraph({
  completionMemory: readJson("config/release-module-completion-memory.json"),
  configuration: readJson("config/release-module-dependency-graph.json"),
});
const decision = evaluateReleaseCompositionEligibility({ graph, plan: readJson("config/release-composition-plan.json") });
const matrix = evaluateReleaseGateEvidenceMatrix({ decision, plan, records: [], evaluatedAt: "2026-08-08T12:00:00.000Z" });
if (phase.phase !== 201 || phase.status !== "implemented") fail("fase ou status inválido");
for (const [key, value] of Object.entries(phase.safety)) if (value !== false) fail(`${key} deveria permanecer falso`);
if (!inspectReleaseGateEvidencePlan(plan).ok) fail("plano canônico inválido");
if (matrix.summary.modules !== 2 || matrix.summary.gates !== 8) fail("escopo de módulos ou gates divergente");
if (matrix.summary.requiredEvidenceItems !== 14 || matrix.summary.missingEvidenceItems !== 14) fail("matriz não bloqueou as 14 provas ausentes");
if (matrix.summary.satisfiedGates !== 0 || matrix.summary.allEvidenceSatisfied !== false) fail("gate liberado sem evidência");
if (matrix.summary.releaseMemoryUpdated !== false || matrix.summary.packageGenerated !== false) fail("efeito colateral de release detectado");
if (phase.currentState.planHash !== plan.planHash || phase.currentState.matrixHash !== matrix.matrixHash) fail("hash registrado divergente");
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 201) fail("programa principal não avançou");
const scripts = readJson("package.json").scripts ?? {};
for (const name of ["evolution:phase-201:assess", "evolution:phase-201:check"]) if (!scripts[name]) fail(`script ausente: ${name}`);
console.log(`[phase-201] PASS — ${matrix.summary.modules} módulos, ${matrix.summary.gates} gates, ${matrix.summary.requiredEvidenceItems} provas exigidas, 0 liberações indevidas e nenhum pacote gerado.`);
