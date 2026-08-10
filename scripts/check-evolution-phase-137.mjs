import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-137-kanban-v30-stage-command-header.json",
  "docs/EVOLUTION_PHASE_137_KANBAN_V30_STAGE_COMMAND_HEADER.md",
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
if (program.currentPhase !== 137) {
  errors.push(`currentPhase esperado 137, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-137-kanban-v30-stage-command-header.json",
    "utf8",
  ),
);
if (phase.phase !== 137 || phase.status !== "implemented") {
  errors.push("Configuração da fase 137 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "type KanbanV30StageCommand",
  "function kanbanV30StageCommand",
  "data-v30-phase=\"137-kanban-v30-stage-command\"",
  "atlas-kanban-v30-stage-command",
  "Comando da etapa",
  "Recuperar agora",
  "Agendar próximo passo",
  "Acelerar conversão",
]) {
  if (!pipeline.includes(pattern)) {
    errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 137 — Kanban V30 Stage Command Header",
  ".atlas-kanban-v30-stage-command",
  ".atlas-kanban-v30-stage-command[data-tone=\"danger\"]",
  ".atlas-kanban-v30-stage-command[data-tone=\"warning\"]",
  ".atlas-kanban-v30-stage-command[data-tone=\"success\"]",
  ".atlas-kanban-v30-stage-command button",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync(
    "docs/EVOLUTION_PHASE_137_KANBAN_V30_STAGE_COMMAND_HEADER.md",
    "utf8",
  )
  .toLowerCase();
for (const pattern of [
  "fase 137",
  "kanban v30",
  "recuperar agora",
  "agendar próximo passo",
  "não movimenta lead automaticamente",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-137:check"]) {
  errors.push("Script evolution:phase-137:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 137 validada: Kanban V30 com comando prático por etapa.",
);
