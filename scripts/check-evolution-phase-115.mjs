import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-115-kanban-movement-microinteractions.json",
  "docs/EVOLUTION_PHASE_115_KANBAN_MOVEMENT_MICROINTERACTIONS.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "pipelineStageLabel",
  "data-movement-feedback=\"phase-115\"",
  "data-drag-preview=\"phase-115\"",
  "data-drop-hint=\"phase-115\"",
  "data-drop-intent",
  "atlas-kanban-move-feedback",
  "atlas-kanban-drag-preview",
  "atlas-kanban-drop-hint",
  "window.confirm",
  "setMobileStage(stage)",
];

const requiredCssPatterns = [
  ".atlas-kanban-feedback-stack",
  ".atlas-kanban-move-feedback",
  ".atlas-kanban-drag-preview",
  ".atlas-kanban-drop-hint",
  ".atlas-pipeline-column[data-drop-intent=\"ready\"]",
  ".atlas-pipeline-column[data-drop-intent=\"available\"]",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 115) {
  errors.push(`currentPhase esperado 115, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-115-kanban-movement-microinteractions.json", "utf8"));
if (phase.phase !== 115 || phase.status !== "implemented") {
  errors.push("Configuração da fase 115 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_115_KANBAN_MOVEMENT_MICROINTERACTIONS.md", "utf8");
for (const pattern of ["Fase 115", "Kanban Movement Microinteractions", "desfazer", "soltar", "venda ganha"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-115:check"]) {
  errors.push("Script evolution:phase-115:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 115 validada: microinterações de movimento do Kanban, proteção de etapas críticas e feedback premium ativos.");
