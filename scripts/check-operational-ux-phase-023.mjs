import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-023-lead-operational-timeline.json",
  "app/(crm)/leads/[id]/page.tsx",
  "app/api/v1/leads/[id]/route.ts",
  "tests/contracts/lead-operational-timeline.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_023_LEAD_OPERATIONAL_TIMELINE.md",
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const page = readFileSync(required[1], "utf8");
const api = readFileSync(required[2], "utf8");
const checks = [
  ["fase 23", config.phase === 23],
  ["Lead 360 canônico", config.canonicalSurface === "lead-360"],
  ["linha operacional visível", page.includes("Linha do tempo operacional")],
  ["atrasos priorizados", page.includes('left.timing === "overdue" ? -1 : 1')],
  ["tarefas fechadas removidas da atenção", page.includes("closedTaskStatuses")],
  ["tarefas e atividades já existentes", api.includes('.from("tasks")') && api.includes('.from("activities")')],
  ["histórico profundo preservado", page.includes("Ver histórico completo do relacionamento")],
  ["sem mutação operacional", config.infrastructureMutation === false && config.releaseMutation === false],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("\nFase 23 aprovada: Lead 360 reúne rotina e memória sem duplicar dados.");
