import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-147-kanban-v30-predictive-heatline.json",
  "docs/EVOLUTION_PHASE_147_KANBAN_V30_PREDICTIVE_HEATLINE.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 147) {
  errors.push(`currentPhase esperado 147, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-147-kanban-v30-predictive-heatline.json", "utf8"));
if (phase.phase !== 147 || phase.status !== "implemented") {
  errors.push("Configuração da fase 147 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "type KanbanV30PrioritySignal",
  "type KanbanV30HeatlineItem",
  "KANBAN_V30_PRIORITY_TONE",
  "const kanbanV30Heatline = useMemo<KanbanV30HeatlineItem[]>",
  "const kanbanV30PriorityIndex = useMemo",
  "atlas-kanban-v30-heatline",
  'data-v30-phase="147-kanban-v30-predictive-heatline"',
  "atlas-kanban-v30-card-priority-mark",
  "Abrir prioridade",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 147 — Kanban V30 Predictive Heatline",
  ".atlas-kanban-v30-heatline",
  ".atlas-kanban-v30-heatline-list",
  ".atlas-kanban-v30-heatline-empty",
  ".atlas-kanban-v30-card-priority-mark",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_147_KANBAN_V30_PREDICTIVE_HEATLINE.md", "utf8").toLowerCase();
for (const pattern of ["fase 147", "heatline", "kanban", "prioridade", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-147:check"]) {
  errors.push("Script evolution:phase-147:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 147 validada: Kanban V30 ganhou heatline preditivo de prioridade comercial.");
