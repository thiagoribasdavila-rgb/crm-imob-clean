import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const snapshot = JSON.parse(
  readFileSync(path.join(root, "config/v3000-progress.json"), "utf8"),
);

function walk(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(relative) : [relative];
    },
  );
}

const phasePatterns = [
  /(?:EVOLUTION|V3000)[_-]PHASE[_-]?0*(\d{1,4})/giu,
  /v3000-phase-0*(\d{1,4})/giu,
  /(?:^|[_-])PHASE[_-]?0*(\d{1,4})(?:[_-]|\.)/giu,
];

function collectPhaseIds(directory) {
  const ids = new Set();

  for (const file of walk(directory)) {
    const basename = path.basename(file);
    for (const pattern of phasePatterns) {
      for (const match of basename.matchAll(pattern)) ids.add(Number(match[1]));
    }
  }

  return [...ids].sort((left, right) => left - right);
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const docs = collectPhaseIds("docs");
const scripts = collectPhaseIds("scripts");
const tests = collectPhaseIds("tests");
const phases = snapshot.consolidation.phases;
const completed = phases.filter((phase) => phase.status === "complete");
const current = phases.find(
  (phase) => phase.id === snapshot.consolidation.currentPhase,
);
const next = phases.filter((phase) => phase.status === "next");
const completedThrough =
  current?.status === "complete"
    ? snapshot.consolidation.currentPhase
    : snapshot.consolidation.currentPhase - 1;
const failures = [];

assert(
  docs.length === snapshot.program.verifiedHistoricalPhases,
  `Documentação encontrada (${docs.length}) difere do snapshot (${snapshot.program.verifiedHistoricalPhases}).`,
  failures,
);
assert(
  docs.at(-1) === snapshot.program.lastVerifiedPhase,
  `Última fase documentada (${docs.at(-1)}) difere do snapshot (${snapshot.program.lastVerifiedPhase}).`,
  failures,
);
assert(
  docs.every((phase, index) => phase === index + 1),
  "A sequência documental possui lacunas.",
  failures,
);
assert(
  tests.length === snapshot.program.phaseContractsFound,
  `Contratos rastreáveis (${tests.length}) diferem do snapshot (${snapshot.program.phaseContractsFound}).`,
  failures,
);
assert(
  phases.length === snapshot.consolidation.totalPhases,
  "O plano de consolidação não possui a quantidade declarada de fases.",
  failures,
);
assert(
  phases.every((phase, index) => phase.id === index + 1),
  "A sequência dos gates de consolidação possui lacunas.",
  failures,
);
assert(
  completed.length === completedThrough &&
    completed.every((phase, index) => phase.id === index + 1),
  "Os gates concluídos não correspondem às fases comprovadas.",
  failures,
);
assert(
  current && ["complete", "in_progress"].includes(current.status),
  "O gate atual não está identificado como concluído ou em progresso.",
  failures,
);
assert(
  next.length <= 1 &&
    (next.length === 0 || next[0].id === snapshot.consolidation.currentPhase + 1),
  "A próxima fase explícita da consolidação não é única ou sequencial.",
  failures,
);
assert(
  phases
    .filter((phase) => phase.id > snapshot.consolidation.currentPhase)
    .every((phase) => ["pending", "next"].includes(phase.status)),
  "Um gate futuro foi promovido antes do gate atual.",
  failures,
);
assert(snapshot.program.targetPhases === 3000, "A meta V3000 foi alterada.", failures);
assert(
  snapshot.program.legacyPhasesRequested === 380,
  "A referência histórica solicitada foi alterada.",
  failures,
);

const result = {
  ok: failures.length === 0,
  verifiedHistoricalPhases: docs.length,
  lastVerifiedPhase: docs.at(-1) ?? 0,
  phaseContractsFound: tests.length,
  phaseScriptsFound: scripts.length,
  consolidation: {
    completed: completed.length,
    total: phases.length,
    current: current?.id ?? null,
    currentStatus: current?.status ?? null,
    next: next[0]?.id ?? Math.min(snapshot.consolidation.currentPhase + 1, phases.length),
  },
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
