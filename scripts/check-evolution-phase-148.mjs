import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-148-kanban-v30-safe-batch-actions.json",
  "docs/EVOLUTION_PHASE_148_KANBAN_V30_SAFE_BATCH_ACTIONS.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 148) {
  errors.push(`currentPhase esperado 148, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-148-kanban-v30-safe-batch-actions.json", "utf8"));
if (phase.phase !== 148 || phase.status !== "implemented") {
  errors.push("Configuração da fase 148 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "kanbanV30BatchSelection",
  "setKanbanV30BatchSelection",
  "const kanbanV30BatchItems = useMemo",
  "const kanbanV30BatchSummary = useMemo",
  "function toggleKanbanV30BatchLead",
  "atlas-kanban-v30-batch-dock",
  'data-v30-phase="148-kanban-v30-safe-batch-actions"',
  "Criar tarefas",
  "Mensagem IA",
  "Distribuir com segurança",
  "Revisão humana",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 148 — Kanban V30 Safe Batch Actions",
  ".atlas-kanban-v30-batch-dock",
  ".atlas-kanban-v30-batch-selectors",
  ".atlas-kanban-v30-batch-plan",
  ".atlas-kanban-v30-batch-actions",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_148_KANBAN_V30_SAFE_BATCH_ACTIONS.md", "utf8").toLowerCase();
for (const pattern of ["fase 148", "kanban", "lote", "revisão humana", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-148:check"]) {
  errors.push("Script evolution:phase-148:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 148 validada: Kanban V30 ganhou lote seguro de ações com revisão humana.");
