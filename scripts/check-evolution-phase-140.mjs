import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-140-kanban-v30-action-mode.json",
  "docs/EVOLUTION_PHASE_140_KANBAN_V30_ACTION_MODE.md",
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
if (program.currentPhase !== 140) {
  errors.push(`currentPhase esperado 140, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-140-kanban-v30-action-mode.json",
    "utf8",
  ),
);
if (phase.phase !== 140 || phase.status !== "implemented") {
  errors.push("Configuração da fase 140 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "type KanbanV30StageActionLead",
  "function kanbanV30StageActionLead",
  "stageActionLead",
  "data-v30-phase=\"140-kanban-v30-action-mode\"",
  "Próxima melhor ação",
  "atlas-kanban-v30-stage-action-lead",
]) {
  if (!pipeline.includes(pattern)) {
    errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 140 — Kanban V30 Action Mode",
  ".atlas-kanban-v30-stage-action-lead",
  ".atlas-kanban-v30-stage-action-lead[data-tone=\"danger\"]",
  ".atlas-kanban-v30-stage-action-lead[data-tone=\"success\"]",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_140_KANBAN_V30_ACTION_MODE.md", "utf8")
  .toLowerCase();
for (const pattern of [
  "fase 140",
  "próxima melhor ação",
  "não altera banco",
  "não move leads sozinho",
  "decisão humana",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-140:check"]) {
  errors.push("Script evolution:phase-140:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 140 validada: Kanban V30 em modo ação com próxima melhor ação por etapa.",
);
