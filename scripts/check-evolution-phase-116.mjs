import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-116-kanban-role-lenses.json",
  "docs/EVOLUTION_PHASE_116_KANBAN_ROLE_LENSES.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "type KanbanLensKey",
  "readAtlasAuthContext",
  "resolveKanbanLens",
  "kanbanLensIntent",
  "applyKanbanLens",
  "effectiveKanbanLens",
  "data-kanban-lens=\"phase-116\"",
  "data-effective-lens={effectiveKanbanLens}",
  "KANBAN_LENS_LABEL",
  "kanbanLens?: KanbanLensKey",
];

const requiredCssPatterns = [
  ".atlas-kanban-lens-shell",
  ".atlas-kanban-lens-summary",
  ".atlas-kanban-lens-switcher",
  ".atlas-kanban-lens-shell[data-effective-lens=\"broker\"]",
  ".atlas-kanban-lens-shell[data-effective-lens=\"manager\"]",
  ".atlas-kanban-lens-shell[data-effective-lens=\"director\"]",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 116) {
  errors.push(`currentPhase esperado 116, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-116-kanban-role-lenses.json", "utf8"));
if (phase.phase !== 116 || phase.status !== "implemented") {
  errors.push("Configuração da fase 116 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_116_KANBAN_ROLE_LENSES.md", "utf8");
for (const pattern of ["Fase 116", "Kanban Role Lenses", "Corretor", "Gerente", "Diretor"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-116:check"]) {
  errors.push("Script evolution:phase-116:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 116 validada: lentes inteligentes do Kanban por perfil comercial ativas.");
