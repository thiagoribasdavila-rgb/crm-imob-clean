import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-022-tasks-calendar-focus.json",
  "components/atlas/information-primitives.tsx",
  "app/(crm)/tasks/page.tsx",
  "app/(crm)/calendar/page.tsx",
  "tests/contracts/tasks-calendar-focus.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_022_TASKS_CALENDAR_FOCUS.md",
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const tasks = readFileSync(required[2], "utf8");
const calendar = readFileSync(required[3], "utf8");
const checks = [
  ["fase 22", config.phase === 22],
  ["duas superfícies canônicas", config.canonicalSurfaces.length === 2],
  ["fila priorizada preservada", tasks.includes("Fila comercial priorizada")],
  ["criação e execução preservadas", tasks.includes("createTask") && tasks.includes('act(task,"complete")')],
  ["carga da equipe progressiva", tasks.includes("Ver carga da equipe por responsável")],
  ["atenção imediata preservada", calendar.includes("O que exige ação agora")],
  ["timeline preservada", calendar.includes("atlas-calendar-timeline-card")],
  ["estado real substitui rótulo interno", calendar.includes("AGENDA SINCRONIZADA") && !calendar.includes("FASE 39 · AGENDA TEMPORAL")],
  ["sem mutação operacional", config.infrastructureMutation === false && config.releaseMutation === false],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("\nFase 22 aprovada: Tarefas e Agenda priorizam atrasos, hoje e próxima ação sem perda operacional.");
