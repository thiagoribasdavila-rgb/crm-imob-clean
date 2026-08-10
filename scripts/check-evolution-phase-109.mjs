import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-109-kanban-copilot-bridge.json",
  "docs/EVOLUTION_PHASE_109_KANBAN_COPILOT_BRIDGE.md",
  "app/(crm)/pipeline/page.tsx",
  "app/(crm)/leads/[id]/messages/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "109-kanban-copilot-bridge",
  "type CopilotIntent",
  "copilotIntentUrl",
  "data-copilot-bridge=\"pipeline-card\"",
  "atlas-kanban-copilot-bridge",
  "Mensagem IA",
  "Resumo IA",
  "Objeções",
];

const requiredMessagePatterns = [
  "useSearchParams",
  "objectiveFromIntent",
  "toneFromIntent",
  "data-copilot-context=\"pipeline\"",
  "Contexto recebido do Kanban",
];

const requiredCssPatterns = [
  ".atlas-kanban-copilot-bridge",
  ".atlas-kanban-copilot-bridge a:hover",
  ".atlas-copilot-context-banner",
  ".atlas-kanban-board.is-compact .atlas-kanban-copilot-bridge",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 109) {
  errors.push(`currentPhase esperado 109, recebido ${program.currentPhase}`);
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const messages = fs.readFileSync("app/(crm)/leads/[id]/messages/page.tsx", "utf8");
for (const pattern of requiredMessagePatterns) {
  if (!messages.includes(pattern)) errors.push(`Mensagens não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-109:check"]) {
  errors.push("Script evolution:phase-109:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 109 validada: Kanban conectado ao Copilot com intenções contextuais e UX compacta.");
