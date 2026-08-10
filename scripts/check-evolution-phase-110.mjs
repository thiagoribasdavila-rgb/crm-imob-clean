import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-110-kanban-execution-handoff.json",
  "docs/EVOLUTION_PHASE_110_KANBAN_EXECUTION_HANDOFF.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "110-kanban-execution-handoff",
  "type ExecutionIntent",
  "executionIntentUrl",
  "leadId: lead.id",
  "task: \"/tasks\"",
  "calendar: \"/calendar\"",
  "proposal: \"/sales\"",
  "data-execution-rail=\"phase-110\"",
  "Tarefa",
  "Agenda",
  "Proposta",
];

const requiredCssPatterns = [
  ".atlas-kanban-execution-rail",
  ".atlas-kanban-execution-rail a:first-of-type",
  ".atlas-kanban-execution-rail a:hover",
  ".atlas-kanban-board.is-compact .atlas-kanban-execution-rail",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 110) {
  errors.push(`currentPhase esperado 110, recebido ${program.currentPhase}`);
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-110:check"]) {
  errors.push("Script evolution:phase-110:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 110 validada: Kanban entrega contexto para tarefa, agenda, proposta e Copilot sem automação arriscada.");
