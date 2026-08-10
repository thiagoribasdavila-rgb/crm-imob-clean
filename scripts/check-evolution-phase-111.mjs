import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-111-kanban-context-intake.json",
  "docs/EVOLUTION_PHASE_111_KANBAN_CONTEXT_INTAKE.md",
  "components/atlas/kanban-handoff-banner.tsx",
  "app/(crm)/tasks/page.tsx",
  "app/(crm)/calendar/page.tsx",
  "app/(crm)/sales/page.tsx",
  "app/globals.css",
];

const requiredComponentPatterns = [
  "111-kanban-context-intake",
  "useSearchParams",
  "MODULE_COPY",
  "module: \"tasks\" | \"calendar\" | \"sales\"",
  "Lead 360",
  "Copilot IA",
  "Voltar ao Kanban",
];

const requiredTaskPatterns = [
  "KanbanHandoffBanner",
  "useSearchParams",
  "kanbanTaskContext",
  "setShowCreate(true)",
  "toDatetimeLocal",
  "module=\"tasks\"",
  "111-kanban-context-intake",
];

const requiredCalendarPatterns = [
  "KanbanHandoffBanner",
  "module=\"calendar\"",
  "111-kanban-context-intake",
];

const requiredSalesPatterns = [
  "KanbanHandoffBanner",
  "module=\"sales\"",
  "data-kanban-context=\"111-kanban-context-intake\"",
];

const requiredCssPatterns = [
  ".atlas-kanban-handoff-banner",
  ".atlas-kanban-handoff-facts",
  ".atlas-kanban-handoff-actions",
  ".atlas-kanban-handoff-actions a:first-child",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(
  fs.readFileSync("config/evolution-program-3000.json", "utf8"),
);
if (program.currentPhase !== 111) {
  errors.push(`currentPhase esperado 111, recebido ${program.currentPhase}`);
}

const component = fs.readFileSync(
  "components/atlas/kanban-handoff-banner.tsx",
  "utf8",
);
for (const pattern of requiredComponentPatterns) {
  if (!component.includes(pattern)) {
    errors.push(`Componente não contém padrão esperado: ${pattern}`);
  }
}

const tasks = fs.readFileSync("app/(crm)/tasks/page.tsx", "utf8");
for (const pattern of requiredTaskPatterns) {
  if (!tasks.includes(pattern)) {
    errors.push(`Tarefas não contém padrão esperado: ${pattern}`);
  }
}

const calendar = fs.readFileSync("app/(crm)/calendar/page.tsx", "utf8");
for (const pattern of requiredCalendarPatterns) {
  if (!calendar.includes(pattern)) {
    errors.push(`Agenda não contém padrão esperado: ${pattern}`);
  }
}

const sales = fs.readFileSync("app/(crm)/sales/page.tsx", "utf8");
for (const pattern of requiredSalesPatterns) {
  if (!sales.includes(pattern)) {
    errors.push(`Vendas não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-111:check"]) {
  errors.push("Script evolution:phase-111:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 111 validada: Kanban entrega contexto e as telas operacionais recebem a próxima ação sem retrabalho.");
