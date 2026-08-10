import { readFileSync } from "node:fs";

const files = [
  "lib/atlas/core-v2/live-repositories.ts",
  "app/api/v1/tasks/route.ts",
  "app/api/ai/daily-queue/route.ts",
  "app/api/v3/decisions/generate/route.ts",
  "app/(crm)/automations/page.tsx",
];

const failures = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("due_date")) {
    failures.push(`${file}: não consulta a coluna de prazo disponível na base homologada`);
  }
}

const decisions = readFileSync("app/api/v3/decisions/generate/route.ts", "utf8");
if (/from\("tasks"\)[\s\S]{0,240}(?:select|not)\([^)]*due_at/.test(decisions)) {
  failures.push("app/api/v3/decisions/generate/route.ts: consulta direta a tasks.due_at");
}
if (!decisions.includes("mapLegacyTask")) {
  failures.push("app/api/v3/decisions/generate/route.ts: resposta de tarefas não passa pelo adapter");
}

const repositories = readFileSync("lib/atlas/core-v2/live-repositories.ts", "utf8");
if (!repositories.includes(".map(mapLegacyTask)")) {
  failures.push("lib/atlas/core-v2/live-repositories.ts: leitura compatível não normaliza due_date para due_at");
}

if (failures.length) {
  console.error("Task schema compatibility: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Task schema compatibility: PASS (${files.length} caminhos críticos verificados)`);
