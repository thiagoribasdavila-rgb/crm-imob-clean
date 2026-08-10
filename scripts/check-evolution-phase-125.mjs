import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-125-pipeline-decision-os-redesign.json",
  "docs/EVOLUTION_PHASE_125_PIPELINE_DECISION_OS_REDESIGN.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "const pipelineExperience = useMemo",
  "data-redesign=\"phase-125\"",
  "data-pipeline-redesign=\"phase-125\"",
  "atlas-pipeline-os-cockpit",
  "Pipeline inteligente",
  "Modo corretor",
  "atlas-kanban-board-v30",
  "data-noise-reduction=\"phase-125\"",
];

const requiredCssPatterns = [
  ".atlas-pipeline-os-cockpit",
  ".atlas-pipeline-os-primary",
  ".atlas-pipeline-os-grid",
  ".atlas-kanban-board-v30",
  ".atlas-kanban-board-v30 .atlas-pipeline-lead[data-noise-reduction=\"phase-125\"]",
  ".atlas-decision-page[data-redesign=\"phase-125\"]",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 125) {
  errors.push(`currentPhase esperado 125, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-125-pipeline-decision-os-redesign.json", "utf8"));
if (phase.phase !== 125 || phase.status !== "implemented") {
  errors.push("Configuração da fase 125 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_125_PIPELINE_DECISION_OS_REDESIGN.md", "utf8");
const normalizedDocs = docs.toLowerCase();
for (const pattern of ["fase 125", "pipeline decision os", "corretor", "gerente", "diretor"]) {
  if (!normalizedDocs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-125:check"]) {
  errors.push("Script evolution:phase-125:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 125 validada: Pipeline Decision OS redesenhado para decisão, foco e menor ruído.");
