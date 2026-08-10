import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-128-pipeline-v30-kanban-decision-board.json",
  "docs/EVOLUTION_PHASE_128_PIPELINE_V30_KANBAN_DECISION_BOARD.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase < 128) {
  errors.push(`currentPhase não pode regredir abaixo de 128; recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-128-pipeline-v30-kanban-decision-board.json", "utf8"));
if (phase.phase !== 128 || phase.status !== "implemented") {
  errors.push("Configuração da fase 128 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "pipelineV30Decision",
  "atlas-pipeline-v30-decision-layer",
  "data-phase=\"128-pipeline-v30-kanban-decision-board\"",
  "data-v30-kanban=\"decision-board\"",
  "atlas-pipeline-lead-v30",
  "IA: preparar abordagem",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 128 — Pipeline V30 Kanban Decision Board",
  ".atlas-pipeline-v30-decision-layer",
  ".atlas-pipeline-v30-now",
  ".atlas-pipeline-v30-lead",
  ".atlas-pipeline-v30-actions",
  ".atlas-kanban-board[data-v30-kanban=\"decision-board\"]",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_128_PIPELINE_V30_KANBAN_DECISION_BOARD.md", "utf8").toLowerCase();
for (const pattern of ["fase 128", "pipeline", "kanban", "decisão", "ruído", "ia"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-128:check"]) {
  errors.push("Script evolution:phase-128:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 128 validada: Pipeline V30 com Kanban decisivo, próxima melhor ação e redução de ruído visual.");
