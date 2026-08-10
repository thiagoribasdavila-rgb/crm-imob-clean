import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-117-kanban-lens-ranking.json",
  "docs/EVOLUTION_PHASE_117_KANBAN_LENS_RANKING.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "function kanbanLensPriorityWeight",
  "function kanbanLensRankLabel",
  "data-lens-ranking=\"phase-117\"",
  "atlas-stage-lens-priority",
  "atlas-kanban-card-ranking",
  "kanbanLensPriorityWeight(b, effectiveKanbanLens, stage.probability)",
  "priorityWeight(b) - priorityWeight(a)",
  "kanbanLensRankLabel(lead, effectiveKanbanLens, stage.probability)",
];

const requiredCssPatterns = [
  ".atlas-stage-lens-priority",
  ".atlas-stage-lens-priority[data-lens=\"broker\"]",
  ".atlas-stage-lens-priority[data-lens=\"manager\"]",
  ".atlas-stage-lens-priority[data-lens=\"director\"]",
  ".atlas-kanban-card-ranking",
  ".atlas-kanban-card-ranking[data-lens=\"broker\"]",
  ".atlas-kanban-card-ranking[data-lens=\"manager\"]",
  ".atlas-kanban-card-ranking[data-lens=\"director\"]",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 117) {
  errors.push(`currentPhase esperado 117, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-117-kanban-lens-ranking.json", "utf8"));
if (phase.phase !== 117 || phase.status !== "implemented") {
  errors.push("Configuração da fase 117 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_117_KANBAN_LENS_RANKING.md", "utf8");
for (const pattern of ["Fase 117", "Kanban Lens Ranking", "Corretor", "Gerente", "Diretor"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-117:check"]) {
  errors.push("Script evolution:phase-117:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 117 validada: ranking do Kanban por lente comercial ativo.");
