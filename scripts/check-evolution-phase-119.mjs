import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-119-kanban-queue-actions.json",
  "docs/EVOLUTION_PHASE_119_KANBAN_QUEUE_ACTIONS.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "data-queue-actions=\"phase-119\"",
  "className=\"atlas-kanban-lens-queue-title\"",
  "className=\"atlas-kanban-lens-queue-actions\"",
  "const contact = phoneLinks(item.lead.phone)",
  "href={contact.call}",
  "href={contact.whatsapp}",
  "copilotIntentUrl(item.lead, \"follow_up\")",
  "executionIntentUrl(item.lead, \"task\")",
  "Lead 360",
  "Sem telefone",
];

const requiredCssPatterns = [
  ".atlas-kanban-lens-queue-title",
  ".atlas-kanban-lens-queue-title:hover",
  ".atlas-kanban-lens-queue-actions",
  ".atlas-kanban-lens-queue-actions a",
  ".atlas-kanban-lens-queue-actions span",
  ".atlas-kanban-lens-queue-actions a:hover",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 119) {
  errors.push(`currentPhase esperado 119, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-119-kanban-queue-actions.json", "utf8"));
if (phase.phase !== 119 || phase.status !== "implemented") {
  errors.push("Configuração da fase 119 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_119_KANBAN_QUEUE_ACTIONS.md", "utf8");
for (const pattern of ["Fase 119", "ações rápidas", "Lead 360", "Ligar", "WhatsApp", "IA", "Tarefa"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-119:check"]) {
  errors.push("Script evolution:phase-119:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 119 validada: ações rápidas contextuais na fila inteligente do Kanban.");
