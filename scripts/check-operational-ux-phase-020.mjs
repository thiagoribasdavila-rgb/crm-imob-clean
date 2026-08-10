import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-020-kanban-decision-density.json",
  "components/atlas/information-primitives.tsx",
  "app/(crm)/pipeline/page.tsx",
  "tests/contracts/kanban-decision-density.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_020_KANBAN_DECISION_DENSITY.md",
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const pipeline = readFileSync(required[2], "utf8");
const checks = [
  ["fase 20", config.phase === 20],
  ["superfície canônica", config.canonicalSurface === "pipeline-kanban"],
  ["quadro permanece visível", pipeline.includes("atlas-kanban-scroll")],
  ["movimentação preservada", pipeline.includes("moveLead")],
  ["seis divulgações progressivas", (pipeline.match(/<AtlasDetailDisclosure/g) || []).length >= 6],
  ["gargalos preservados", pipeline.includes("stageBottleneckRanking")],
  [
    "ações em lote preservadas",
    pipeline.includes("kanbanV30BatchSelection"),
  ],
  [
    "sem mutação operacional",
    config.infrastructureMutation === false && config.releaseMutation === false,
  ],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log(
  "\nFase 20 aprovada: Kanban orientado à decisão com análises preservadas sob demanda.",
);
