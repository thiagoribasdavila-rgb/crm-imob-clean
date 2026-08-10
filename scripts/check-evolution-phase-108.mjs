import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-108-decision-kanban.json",
  "docs/EVOLUTION_PHASE_108_DECISION_KANBAN.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPagePatterns = [
  "108-decision-kanban",
  "pipelineQuality",
  "atlas-kanban-pulse",
  "data-kanban-pulse=\"action-coverage\"",
  "stageDecision",
  "atlas-stage-decision-row",
  "data-card-decision",
  "atlas-kanban-card-decision",
  "Ação agora",
];

const requiredCssPatterns = [
  ".atlas-kanban-pulse",
  ".atlas-stage-decision-row",
  ".atlas-kanban-card-decision",
  ".atlas-kanban-card-decision[data-tone=\"danger\"]",
  ".atlas-kanban-board.is-compact .atlas-kanban-card-decision small",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 108) {
  errors.push(`currentPhase esperado 108, recebido ${program.currentPhase}`);
}

const page = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPagePatterns) {
  if (!page.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-108:check"]) {
  errors.push("Script evolution:phase-108:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 108 validada: Kanban decisivo com pulso operacional, decisão por etapa e ação clara por card.");
