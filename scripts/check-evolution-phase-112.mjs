import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-112-kanban-action-playbook.json",
  "docs/EVOLUTION_PHASE_112_KANBAN_ACTION_PLAYBOOK.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "112-kanban-action-playbook",
  "type KanbanPlaybookStep",
  "missingLeadData",
  "kanbanActionPlaybook",
  "Roteiro rápido",
  "Contato imediato",
  "Registrar próxima ação",
  "Completar qualificação",
  "data-playbook=\"phase-112\"",
  "playbook.map",
];

const requiredCssPatterns = [
  ".atlas-kanban-playbook",
  ".atlas-kanban-playbook-head",
  ".atlas-kanban-playbook li[data-tone=\"danger\"]",
  ".atlas-kanban-playbook li[data-tone=\"warning\"]",
  ".atlas-kanban-playbook li[data-tone=\"success\"]",
  ".atlas-kanban-board.is-compact .atlas-kanban-playbook",
  ".atlas-kanban-board.is-compact .atlas-kanban-playbook li:nth-child(n+3)",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 112) {
  errors.push(`currentPhase esperado 112, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-112-kanban-action-playbook.json", "utf8"));
if (phase.phase !== 112 || phase.status !== "implemented") {
  errors.push("Configuração da fase 112 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_112_KANBAN_ACTION_PLAYBOOK.md", "utf8");
for (const pattern of ["Kanban com roteiro de ação", "Roteiro rápido", "Nenhuma mensagem é disparada"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-112:check"]) {
  errors.push("Script evolution:phase-112:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 112 validada: Kanban ganhou roteiro de ação compacto, decisivo e seguro para execução comercial.");
