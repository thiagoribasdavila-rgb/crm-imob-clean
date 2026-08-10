import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-121-kanban-stage-stall.json",
  "docs/EVOLUTION_PHASE_121_KANBAN_STAGE_STALL.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "function hoursSince(value: string | null)",
  "function stageStallSignal(lead: Lead): { label: string; tone: LeadSignalTone }",
  "const stageStall = stageStallSignal(item.lead)",
  "data-stage-stall=\"phase-121\"",
  "className=\"atlas-kanban-lens-queue-signals\"",
  "className=\"atlas-kanban-lens-queue-stall\"",
  "data-tone={stageStall.tone}",
  "{stageStall.label}",
];

const requiredCssPatterns = [
  ".atlas-kanban-lens-queue-signals",
  ".atlas-kanban-lens-queue-stall",
  ".atlas-kanban-lens-queue-stall[data-tone=\"success\"]",
  ".atlas-kanban-lens-queue-stall[data-tone=\"warning\"]",
  ".atlas-kanban-lens-queue-stall[data-tone=\"danger\"]",
  ".atlas-kanban-lens-queue-stall[data-tone=\"info\"]",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 121) {
  errors.push(`currentPhase esperado 121, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-121-kanban-stage-stall.json", "utf8"));
if (phase.phase !== 121 || phase.status !== "implemented") {
  errors.push("Configuração da fase 121 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_121_KANBAN_STAGE_STALL.md", "utf8");
for (const pattern of ["Fase 121", "tempo parado", "gargalos", "updated_at", "stage_entered_at"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-121:check"]) {
  errors.push("Script evolution:phase-121:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 121 validada: sinal de tempo parado na etapa da fila inteligente do Kanban.");
