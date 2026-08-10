import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-124-kanban-stage-action-microcopy.json",
  "docs/EVOLUTION_PHASE_124_KANBAN_STAGE_ACTION_MICROCOPY.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "type StageActionMicrocopy",
  "function stageActionMicrocopy(lens: EffectiveKanbanLens",
  "const microcopy = stageActionMicrocopy(effectiveKanbanLens",
  "microcopy",
  "data-stage-action=\"phase-124\"",
  "data-tone={stage.microcopy.tone}",
  "{stage.microcopy.title}",
  "{stage.microcopy.detail}",
  "{stage.microcopy.cta}",
];

const requiredCssPatterns = [
  ".atlas-stage-action-microcopy",
  ".atlas-stage-action-microcopy[data-tone=\"danger\"]",
  ".atlas-stage-action-microcopy[data-tone=\"warning\"]",
  ".atlas-stage-action-microcopy[data-tone=\"success\"]",
  ".atlas-stage-action-microcopy[data-tone=\"info\"]",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 124) {
  errors.push(`currentPhase esperado 124, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-124-kanban-stage-action-microcopy.json", "utf8"));
if (phase.phase !== 124 || phase.status !== "implemented") {
  errors.push("Configuração da fase 124 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_124_KANBAN_STAGE_ACTION_MICROCOPY.md", "utf8");
for (const pattern of ["Fase 124", "corretor", "gerente", "diretor", "Kanban"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-124:check"]) {
  errors.push("Script evolution:phase-124:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 124 validada: microcopy de ação rápida por etapa do Kanban.");
