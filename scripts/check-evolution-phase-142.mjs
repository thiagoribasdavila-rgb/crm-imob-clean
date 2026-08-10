import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-142-kanban-v30-clean-card-reading.json",
  "docs/EVOLUTION_PHASE_142_KANBAN_V30_CLEAN_CARD_READING.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    errors.push(`Arquivo obrigatório ausente: ${file}`);
  }
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 142) {
  errors.push(`currentPhase esperado 142, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync("config/evolution-phase-142-kanban-v30-clean-card-reading.json", "utf8"),
);
if (phase.phase !== 142 || phase.status !== "implemented") {
  errors.push("Configuração da fase 142 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "type KanbanV30QuickSignal",
  "quickSignals: KanbanV30QuickSignal[]",
  "const quickSignals: KanbanV30QuickSignal[]",
  'data-v30-phase="142-kanban-v30-clean-card-reading"',
  "atlas-kanban-v30-card-quickstrip",
  "v30Card.quickSignals.map",
  "isNextActionOverdue(lead)",
  "stageStallSignal(lead)",
]) {
  if (!pipeline.includes(pattern)) {
    errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 142 — Kanban V30 Clean Card Reading",
  ".atlas-kanban-v30-card-quickstrip",
  '.atlas-kanban-v30-card-quickstrip span[data-tone="danger"]',
  '.atlas-kanban-board[data-v30-kanban="decision-board"].is-compact .atlas-kanban-v30-card-facts',
  '.atlas-kanban-board[data-v30-kanban="decision-board"].is-compact .atlas-kanban-v30-card-actions',
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_142_KANBAN_V30_CLEAN_CARD_READING.md", "utf8")
  .toLowerCase();
for (const pattern of ["fase 142", "leitura rápida", "reduzir ruído", "nenhuma alteração em banco", "modo compacto"]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-142:check"]) {
  errors.push("Script evolution:phase-142:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 142 validada: Kanban V30 com leitura limpa de card e modo compacto mais decisivo.");
