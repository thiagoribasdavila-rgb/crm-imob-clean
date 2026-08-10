import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-123-kanban-role-guidance.json",
  "docs/EVOLUTION_PHASE_123_KANBAN_ROLE_GUIDANCE.md",
  "app/(crm)/pipeline/page.tsx",
];

const requiredPipelinePatterns = [
  "type StageBottleneckGuideInput",
  "function bottleneckRoleIntro(lens: EffectiveKanbanLens)",
  "function bottleneckRoleGuide(lens: EffectiveKanbanLens, item: StageBottleneckGuideInput)",
  "bottleneckRoleGuide(effectiveKanbanLens",
  "guideDetail: guide.detail",
  "guideLabel: guide.label",
  "bottleneckRoleIntro(effectiveKanbanLens)",
  "data-role-guide=\"phase-123\"",
  "{item.guideLabel}",
  "{item.guideDetail}",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 123) {
  errors.push(`currentPhase esperado 123, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-123-kanban-role-guidance.json", "utf8"));
if (phase.phase !== 123 || phase.status !== "implemented") {
  errors.push("Configuração da fase 123 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_123_KANBAN_ROLE_GUIDANCE.md", "utf8");
for (const pattern of ["Fase 123", "corretor", "gerente", "diretor", "Kanban"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-123:check"]) {
  errors.push("Script evolution:phase-123:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 123 validada: orientação de gargalo por perfil comercial no Kanban.");
