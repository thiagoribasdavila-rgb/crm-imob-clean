import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-113-kanban-focus-strip.json",
  "docs/EVOLUTION_PHASE_113_KANBAN_FOCUS_STRIP.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "113-kanban-focus-strip",
  "type KanbanFocusItem",
  "kanbanFocusStrip",
  "Resolver agora",
  "Quentes sem ação",
  "Fechar propostas",
  "Gargalo do funil",
  "data-focus-strip=\"phase-113\"",
  "setMobileStage(item.stage)",
];

const requiredCssPatterns = [
  ".atlas-kanban-focus-strip",
  ".atlas-kanban-focus-card",
  ".atlas-kanban-focus-card[data-tone=\"success\"]",
  ".atlas-kanban-focus-card[data-tone=\"warning\"]",
  ".atlas-kanban-focus-card[data-tone=\"danger\"]",
  ".atlas-kanban-focus-card[data-tone=\"info\"]",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 113) {
  errors.push(`currentPhase esperado 113, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-113-kanban-focus-strip.json", "utf8"));
if (phase.phase !== 113 || phase.status !== "implemented") {
  errors.push("Configuração da fase 113 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_113_KANBAN_FOCUS_STRIP.md", "utf8");
for (const pattern of ["Fase 113", "Kanban Focus Strip", "resolver urgências", "abrir a etapa com maior gargalo"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-113:check"]) {
  errors.push("Script evolution:phase-113:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 113 validada: Kanban ganhou faixa de foco operacional para atacar urgência, leads quentes, propostas e gargalos.");
