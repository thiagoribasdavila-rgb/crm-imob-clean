import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-143-kanban-v30-recovery-states.json",
  "docs/EVOLUTION_PHASE_143_KANBAN_V30_RECOVERY_STATES.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 143) {
  errors.push(`currentPhase esperado 143, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-143-kanban-v30-recovery-states.json", "utf8"));
if (phase.phase !== 143 || phase.status !== "implemented") {
  errors.push("Configuração da fase 143 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "type KanbanV30RecoveryMode",
  "type KanbanV30RecoveryState",
  "const stageTotalCounts = useMemo",
  "const kanbanRecoveryState = useMemo<KanbanV30RecoveryState | null>",
  "function resetKanbanFilters()",
  'data-v30-phase="143-kanban-v30-recovery-states"',
  "atlas-kanban-v30-recovery-panel",
  "atlas-kanban-v30-board-empty-shell",
  'data-empty-state={isFilteredEmptyStage ? "filtered" : "ready"}',
  "Math.max(1, boardStages.length)",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 143 — Kanban V30 Recovery States",
  ".atlas-kanban-v30-recovery-panel",
  ".atlas-kanban-v30-recovery-steps",
  ".atlas-kanban-v30-recovery-actions",
  ".atlas-kanban-v30-board-empty-shell",
  '.atlas-kanban-v30-empty-stage[data-empty-state="filtered"]',
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_143_KANBAN_V30_RECOVERY_STATES.md", "utf8").toLowerCase();
for (const pattern of ["fase 143", "erro", "filtro", "etapa vazia", "próxima ação", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-143:check"]) {
  errors.push("Script evolution:phase-143:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 143 validada: Kanban V30 recupera erro, vazio e filtros sem perder orientação operacional.");
