import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-107-api-consistency-shield.json",
  "docs/EVOLUTION_PHASE_107_API_CONSISTENCY_SHIELD.md",
  "app/api/v1/search/route.ts",
  "app/api/v1/task-reminders/route.ts",
  "lib/ai/real-estate-context.ts",
  "components/AtlasNotificationCenter.tsx",
];

const forbidden = [
  {
    file: "app/api/v1/search/route.ts",
    patterns: [
      ".from(\"developments\")",
      ".from('developments')",
      "profiles.full_name",
      "select(\"id,full_name\")",
      "score,temperature,development_id,assigned_to,next_action_at,updated_at",
    ],
  },
  {
    file: "app/api/v1/task-reminders/route.ts",
    patterns: [
      "task:tasks(id,title,due_at,status,lead_id)",
      "tasks(id,title,due_at",
    ],
  },
  {
    file: "lib/ai/real-estate-context.ts",
    patterns: [
      ".from(\"developments\")",
      ".from('developments')",
      ".from(\"opportunities\")",
      ".from('opportunities')",
      "status,score,temperature,source,assigned_to,next_action_at,created_at",
    ],
  },
  {
    file: "components/AtlasNotificationCenter.tsx",
    patterns: [
      ".from(\"tasks\")",
      ".from('tasks')",
      ".from(\"ai_insights\")",
      ".from('ai_insights')",
      "select(\"id,title,priority,status,due_at\")",
    ],
  },
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 107) {
  errors.push(`currentPhase esperado 107, recebido ${program.currentPhase}`);
}

for (const item of forbidden) {
  if (!fs.existsSync(item.file)) continue;
  const content = fs.readFileSync(item.file, "utf8");
  for (const pattern of item.patterns) {
    if (content.includes(pattern)) errors.push(`${item.file} ainda contém padrão frágil: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-107:check"]) {
  errors.push("Script evolution:phase-107:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 107 validada: APIs críticas usam blindagem compatível V2/V3.");
