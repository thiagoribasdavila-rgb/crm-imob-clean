import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-152-kanban-v30-broker-focus-mode.json",
  "docs/EVOLUTION_PHASE_152_KANBAN_V30_BROKER_FOCUS_MODE.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 152) {
  errors.push(`currentPhase esperado 152, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-152-kanban-v30-broker-focus-mode.json", "utf8"));
if (phase.phase !== 152 || phase.status !== "implemented") {
  errors.push("Configuração da fase 152 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "const kanbanV30BrokerFocus = useMemo",
  "atlas-kanban-v30-broker-focus",
  'data-v30-phase="152-kanban-v30-broker-focus-mode"',
  "Modo foco do corretor",
  "Ativar foco",
  "setPreviewLeadId(item.lead.id)",
  "setHideEmpty(true)",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 152 — Kanban V30 Broker Focus Mode",
  ".atlas-kanban-v30-broker-focus",
  ".atlas-kanban-v30-broker-focus-main",
  ".atlas-kanban-v30-broker-focus-actions",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_152_KANBAN_V30_BROKER_FOCUS_MODE.md", "utf8").toLowerCase();
for (const pattern of ["fase 152", "modo foco", "corretor", "kanban", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-152:check"]) {
  errors.push("Script evolution:phase-152:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 152 validada: Kanban V30 ganhou modo foco do corretor.");
