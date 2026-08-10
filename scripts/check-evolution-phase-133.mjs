import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-133-lead360-v30-next-best-work.json",
  "docs/EVOLUTION_PHASE_133_LEAD360_V30_NEXT_BEST_WORK.md",
  "app/(crm)/leads/[id]/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(
  fs.readFileSync("config/evolution-program-3000.json", "utf8"),
);
if (program.currentPhase !== 133) {
  errors.push(`currentPhase esperado 133, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-133-lead360-v30-next-best-work.json",
    "utf8",
  ),
);
if (phase.phase !== 133 || phase.status !== "implemented") {
  errors.push("Configuração da fase 133 não está implementada corretamente.");
}

const lead360 = fs.readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
for (const pattern of [
  "Lead360V30WorkItem",
  "lead360V30WorkItems",
  "data-v30-phase=\"133-lead360-v30-next-best-work\"",
  "atlas-lead360-v30-work-strip",
  "V30 NEXT BEST WORK",
  "O próximo trabalho do corretor em ordem de impacto",
  "Responder agora",
  "Organizar follow-up",
  "Completar perfil",
  "Avançar negócio",
  "lead_360_v30_next_best_work",
]) {
  if (!lead360.includes(pattern)) {
    errors.push(`Lead 360 não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 133 — Lead 360 V30 Next Best Work",
  ".atlas-lead360-v30-work-strip",
  ".atlas-lead360-v30-work-head",
  ".atlas-lead360-v30-work-grid",
  ".atlas-lead360-v30-work-actions",
  ".atlas-lead360-v30-work-copilot",
  ".atlas-lead360-v30-work-grid article[data-urgency=\"now\"]",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync(
    "docs/EVOLUTION_PHASE_133_LEAD360_V30_NEXT_BEST_WORK.md",
    "utf8",
  )
  .toLowerCase();
for (const pattern of [
  "fase 133",
  "lead 360",
  "próximo trabalho",
  "corretor",
  "tarefas",
  "follow-up",
  "copilot",
  "não executa nenhuma automação",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-133:check"]) {
  errors.push("Script evolution:phase-133:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 133 validada: Lead 360 V30 com fila de próximo melhor trabalho para o corretor.",
);
