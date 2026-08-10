import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-138-kanban-v30-compact-empty-stage.json",
  "docs/EVOLUTION_PHASE_138_KANBAN_V30_COMPACT_EMPTY_STAGE.md",
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
if (program.currentPhase !== 138) {
  errors.push(`currentPhase esperado 138, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-138-kanban-v30-compact-empty-stage.json",
    "utf8",
  ),
);
if (phase.phase !== 138 || phase.status !== "implemented") {
  errors.push("Configuração da fase 138 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "data-v30-phase=\"138-kanban-v30-compact-empty-stage\"",
  "atlas-kanban-v30-empty-stage",
  "Etapa livre",
  "Monitorar etapa",
  "setHideEmpty(false)",
]) {
  if (!pipeline.includes(pattern)) {
    errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 138 — Kanban V30 Compact Empty Stage",
  ".atlas-kanban-v30-empty-stage",
  ".atlas-kanban-v30-empty-stage span",
  ".atlas-kanban-v30-empty-stage button",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync(
    "docs/EVOLUTION_PHASE_138_KANBAN_V30_COMPACT_EMPTY_STAGE.md",
    "utf8",
  )
  .toLowerCase();
for (const pattern of [
  "fase 138",
  "kanban v30",
  "empty state compacto",
  "monitorar etapa",
  "não movimenta leads",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-138:check"]) {
  errors.push("Script evolution:phase-138:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 138 validada: Kanban V30 com etapa vazia compacta e acionável.",
);
