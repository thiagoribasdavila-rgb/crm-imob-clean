import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-136-kanban-v30-command-bar.json",
  "docs/EVOLUTION_PHASE_136_KANBAN_V30_COMMAND_BAR.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(
  fs.readFileSync("config/evolution-program-3000.json", "utf8"),
);
if (program.currentPhase !== 136) {
  errors.push(`currentPhase esperado 136, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-136-kanban-v30-command-bar.json",
    "utf8",
  ),
);
if (phase.phase !== 136 || phase.status !== "implemented") {
  errors.push("Configuração da fase 136 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "KANBAN_FOCUS_LABEL",
  "KANBAN_SORT_LABEL",
  "data-v30-phase=\"136-kanban-v30-command-bar\"",
  "atlas-kanban-v30-command-bar",
  "Vender agora",
  "Salvar SLA",
  "Definir ação",
  "Ver receita",
  "Mapa completo",
]) {
  if (!pipeline.includes(pattern)) {
    errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 136 — Kanban V30 Command Bar",
  ".atlas-kanban-v30-command-bar",
  ".atlas-kanban-v30-command-bar-head",
  ".atlas-kanban-v30-command-bar-actions",
  ".atlas-kanban-v30-command-bar-state",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync(
    "docs/EVOLUTION_PHASE_136_KANBAN_V30_COMMAND_BAR.md",
    "utf8",
  )
  .toLowerCase();
for (const pattern of [
  "fase 136",
  "kanban v30",
  "barra de comando",
  "vender agora",
  "salvar sla",
  "não movimenta etapa automaticamente",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-136:check"]) {
  errors.push("Script evolution:phase-136:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 136 validada: Kanban V30 com barra de comando para modos de decisão.",
);
