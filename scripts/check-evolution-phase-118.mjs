import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-118-kanban-lens-queue.json",
  "docs/EVOLUTION_PHASE_118_KANBAN_LENS_QUEUE.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "const kanbanLensQueue = useMemo",
  "data-lens-queue=\"phase-118\"",
  "atlas-kanban-lens-queue",
  "atlas-kanban-lens-queue-list",
  "kanbanLensPriorityWeight(lead, effectiveKanbanLens, stageProbability)",
  "kanbanLensRankLabel(lead, effectiveKanbanLens, stageProbability)",
  ".slice(0, 5)",
  "Fila inteligente",
  "próximas 5 ações",
];

const requiredCssPatterns = [
  ".atlas-kanban-lens-queue",
  ".atlas-kanban-lens-queue[data-lens=\"broker\"]",
  ".atlas-kanban-lens-queue[data-lens=\"manager\"]",
  ".atlas-kanban-lens-queue[data-lens=\"director\"]",
  ".atlas-kanban-lens-queue-head",
  ".atlas-kanban-lens-queue-list",
  ".atlas-kanban-lens-queue-item",
  ".atlas-kanban-lens-queue-empty",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 118) {
  errors.push(`currentPhase esperado 118, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-118-kanban-lens-queue.json", "utf8"));
if (phase.phase !== 118 || phase.status !== "implemented") {
  errors.push("Configuração da fase 118 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_118_KANBAN_LENS_QUEUE.md", "utf8");
for (const pattern of ["Fase 118", "Fila única", "Corretor", "Gerente", "Diretor"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-118:check"]) {
  errors.push("Script evolution:phase-118:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 118 validada: fila única por lente comercial ativa no Kanban.");
