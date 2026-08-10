import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-114-kanban-card-command.json",
  "docs/EVOLUTION_PHASE_114_KANBAN_CARD_COMMAND.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "type KanbanCardEssentials",
  "kanbanCardEssentials",
  "114-kanban-card-command",
  "data-card-shell=\"phase-114\"",
  "atlas-kanban-card-command",
  "atlas-kanban-card-essentials",
  "atlas-kanban-card-actions-compact",
  "atlas-kanban-playbook-shell",
  "Criar abordagem",
];

const requiredCssPatterns = [
  ".atlas-kanban-card-command",
  ".atlas-kanban-card-command[data-tone=\"danger\"]",
  ".atlas-kanban-card-command[data-tone=\"warning\"]",
  ".atlas-kanban-card-command[data-tone=\"success\"]",
  ".atlas-kanban-card-command[data-tone=\"info\"]",
  ".atlas-kanban-card-essentials",
  ".atlas-kanban-card-actions-compact",
  ".atlas-kanban-playbook-shell",
  ".atlas-kanban-board.is-compact .atlas-kanban-card-command",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 114) {
  errors.push(`currentPhase esperado 114, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-114-kanban-card-command.json", "utf8"));
if (phase.phase !== 114 || phase.status !== "implemented") {
  errors.push("Configuração da fase 114 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_114_KANBAN_CARD_COMMAND.md", "utf8");
for (const pattern of ["Fase 114", "Kanban Card Command", "central de decisão", "roteiro rápido da IA"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-114:check"]) {
  errors.push("Script evolution:phase-114:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 114 validada: cards do Kanban ganharam comando decisivo, dados essenciais e roteiro de IA sob demanda.");
