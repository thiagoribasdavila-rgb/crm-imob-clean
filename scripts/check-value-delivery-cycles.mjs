import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const programPath = path.join(root, "config/evolution-program-3000.json");
const cyclesPath = path.join(root, "config/evolution-value-cycles-350-374.json");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const program = readJson(programPath);
const roadmap = readJson(cyclesPath);
const expectedPhases = Array.from({ length: 50 }, (_, index) => 350 + index);
const configuredPhases = roadmap.cycles.flatMap((cycle) => cycle.phases);

assert(
  Number.isInteger(program.currentPhase) &&
    program.currentPhase >= roadmap.phaseRange.start - 1 &&
    program.currentPhase <= roadmap.phaseRange.end,
  "A fase atual deve permanecer dentro do roadmap ativo, incluindo seu ponto inicial."
);
assert(
  program.strategicRoadmap.active === "ATLAS_VALUE_DELIVERY_CYCLES_350_399",
  "O roadmap ativo não aponta para os ciclos de valor."
);
assert(program.valueCyclePolicy?.phasesPerCycle === 5, "Cada ciclo deve conter cinco fases.");
assert(roadmap.cycles.length === 10, "O roadmap deve conter exatamente dez ciclos.");
assert(
  JSON.stringify(configuredPhases) === JSON.stringify(expectedPhases),
  "As fases devem ser únicas, contínuas e cobrir exatamente 350–399."
);

for (const cycle of roadmap.cycles) {
  assert(cycle.phases.length === 5, `O ciclo ${cycle.cycle} não possui cinco fases.`);
  assert(cycle.primaryUser, `O ciclo ${cycle.cycle} não define usuário principal.`);
  assert(cycle.problem, `O ciclo ${cycle.cycle} não define problema real.`);
  assert(cycle.deliverable, `O ciclo ${cycle.cycle} não define entrega operacional.`);
  assert(cycle.businessMetric?.primary, `O ciclo ${cycle.cycle} não define métrica principal.`);
  assert(cycle.businessMetric?.target, `O ciclo ${cycle.cycle} não define alvo.`);
  assert(
    Object.keys(cycle.phasePlan).length === 5,
    `O ciclo ${cycle.cycle} não possui plano para todas as fases.`
  );
  for (const phase of cycle.phases) {
    assert(cycle.phasePlan[String(phase)], `A fase ${phase} não possui objetivo.`);
  }
}

console.log(
  `OK: ${roadmap.cycles.length} ciclos, ${configuredPhases.length} fases e cobertura contínua 350–399.`
);
