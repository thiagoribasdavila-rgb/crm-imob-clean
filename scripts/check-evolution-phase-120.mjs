import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-120-kanban-queue-advance.json",
  "docs/EVOLUTION_PHASE_120_KANBAN_QUEUE_ADVANCE.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "data-queue-advance=\"phase-120\"",
  "className=\"atlas-kanban-lens-queue-next\"",
  "const currentStageIndex = stages.findIndex((stage) => stage.key === (item.lead.status || \"novo\"))",
  "const nextStage = currentStageIndex >= 0 ? stages[currentStageIndex + 1] : undefined",
  "const isSavingLead = savingId === item.lead.id",
  "if (nextStage) void moveLead(item.lead.id, nextStage.key)",
  "Salvando movimento...",
  "Avançar: ${nextStage.label}",
  "Revisar etapa",
];

const requiredCssPatterns = [
  ".atlas-kanban-lens-queue-next",
  ".atlas-kanban-lens-queue-next:hover:not(:disabled)",
  ".atlas-kanban-lens-queue-next:disabled",
  "cursor: not-allowed",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 120) {
  errors.push(`currentPhase esperado 120, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-120-kanban-queue-advance.json", "utf8"));
if (phase.phase !== 120 || phase.status !== "implemented") {
  errors.push("Configuração da fase 120 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_120_KANBAN_QUEUE_ADVANCE.md", "utf8");
for (const pattern of ["Fase 120", "Avançar", "moveLead", "desfazer", "próxima etapa"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-120:check"]) {
  errors.push("Script evolution:phase-120:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 120 validada: avanço seguro de etapa na fila inteligente do Kanban.");
