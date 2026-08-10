import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-134-kanban-v30-next-move-queue.json",
  "docs/EVOLUTION_PHASE_134_KANBAN_V30_NEXT_MOVE_QUEUE.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(
  fs.readFileSync("config/evolution-program-3000.json", "utf8"),
);
if (program.currentPhase !== 134) {
  errors.push(`currentPhase esperado 134, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-134-kanban-v30-next-move-queue.json",
    "utf8",
  ),
);
if (phase.phase !== 134 || phase.status !== "implemented") {
  errors.push("Configuração da fase 134 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "KanbanV30NextMoveItem",
  "kanbanV30NextMoveQueue",
  "data-v30-phase=\"134-kanban-v30-next-move-queue\"",
  "atlas-kanban-v30-next-move-strip",
  "V30 NEXT MOVE · KANBAN",
  "Próximo movimento do Kanban",
  "SLA vencido",
  "Follow-up vencido",
  "Lead quente sem agenda",
  "kanbanLensPriorityWeight",
]) {
  if (!pipeline.includes(pattern)) {
    errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 134 — Kanban V30 Next Move Queue",
  ".atlas-kanban-v30-next-move-strip",
  ".atlas-kanban-v30-next-move-head",
  ".atlas-kanban-v30-next-move-grid",
  ".atlas-kanban-v30-next-move-actions",
  ".atlas-kanban-v30-next-move-copilot",
  ".atlas-kanban-v30-next-move-grid article[data-priority=\"critical\"]",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync(
    "docs/EVOLUTION_PHASE_134_KANBAN_V30_NEXT_MOVE_QUEUE.md",
    "utf8",
  )
  .toLowerCase();
for (const pattern of [
  "fase 134",
  "kanban",
  "pipeline",
  "próximo movimento",
  "corretor",
  "copilot",
  "não executa nenhuma automação",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-134:check"]) {
  errors.push("Script evolution:phase-134:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 134 validada: Kanban V30 com fila de próximo movimento para decisão rápida.",
);
