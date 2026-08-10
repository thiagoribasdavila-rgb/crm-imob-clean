import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-135-kanban-v30-decision-card.json",
  "docs/EVOLUTION_PHASE_135_KANBAN_V30_DECISION_CARD.md",
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
if (program.currentPhase !== 135) {
  errors.push(`currentPhase esperado 135, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-135-kanban-v30-decision-card.json",
    "utf8",
  ),
);
if (phase.phase !== 135 || phase.status !== "implemented") {
  errors.push("Configuração da fase 135 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "KanbanV30CardSnapshot",
  "kanbanV30CardSnapshot",
  "data-v30-card=\"phase-135-decision-card\"",
  "atlas-kanban-v30-card-head",
  "atlas-kanban-v30-card-command",
  "atlas-kanban-v30-card-facts",
  "atlas-kanban-v30-card-actions",
  "atlas-kanban-v30-card-context",
  "IA preparar contato",
  "Avançar:",
]) {
  if (!pipeline.includes(pattern)) {
    errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 135 — Kanban V30 Decision Card",
  ".atlas-kanban-v30-card-head",
  ".atlas-kanban-v30-card-person",
  ".atlas-kanban-v30-card-score",
  ".atlas-kanban-v30-card-command",
  ".atlas-kanban-v30-card-actions",
  ".atlas-kanban-v30-card-context",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync(
    "docs/EVOLUTION_PHASE_135_KANBAN_V30_DECISION_CARD.md",
    "utf8",
  )
  .toLowerCase();
for (const pattern of [
  "fase 135",
  "kanban",
  "menos ruído",
  "ação primária",
  "contexto progressivo",
  "não dispara whatsapp automaticamente",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-135:check"]) {
  errors.push("Script evolution:phase-135:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 135 validada: Kanban V30 com card de decisão, ação primária e contexto progressivo.",
);
