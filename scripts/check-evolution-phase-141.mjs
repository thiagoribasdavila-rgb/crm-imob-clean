import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-141-kanban-v30-decision-strip.json",
  "docs/EVOLUTION_PHASE_141_KANBAN_V30_DECISION_STRIP.md",
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
if (program.currentPhase !== 141) {
  errors.push(`currentPhase esperado 141, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-141-kanban-v30-decision-strip.json",
    "utf8",
  ),
);
if (phase.phase !== 141 || phase.status !== "implemented") {
  errors.push("Configuração da fase 141 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "data-v30-phase=\"141-kanban-v30-decision-strip\"",
  "atlas-kanban-v30-decision-strip",
  "kanbanV30NextMoveQueue.slice(0, 3)",
  "Decisões do dia",
  "3 ações para mover o funil agora",
  "executionIntentUrl(item.lead, item.executionIntent)",
  "copilotIntentUrl(item.lead, item.copilotIntent)",
  "Focar no quadro",
]) {
  if (!pipeline.includes(pattern)) {
    errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 141 — Kanban V30 Decision Strip",
  ".atlas-kanban-v30-decision-strip",
  ".atlas-kanban-v30-decision-card",
  ".atlas-kanban-v30-decision-card[data-priority=\"critical\"]",
  ".atlas-kanban-v30-decision-empty",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_141_KANBAN_V30_DECISION_STRIP.md", "utf8")
  .toLowerCase();
for (const pattern of [
  "fase 141",
  "decisão",
  "três ações",
  "kanban",
  "nenhuma alteração em banco",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-141:check"]) {
  errors.push("Script evolution:phase-141:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 141 validada: Kanban V30 com faixa de decisão rápida para as três ações prioritárias.",
);
