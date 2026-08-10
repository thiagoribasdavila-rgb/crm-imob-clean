import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-144-kanban-v30-accessible-motion.json",
  "docs/EVOLUTION_PHASE_144_KANBAN_V30_ACCESSIBLE_MOTION.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 144) {
  errors.push(`currentPhase esperado 144, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-144-kanban-v30-accessible-motion.json", "utf8"));
if (phase.phase !== 144 || phase.status !== "implemented") {
  errors.push("Configuração da fase 144 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "KANBAN_V30_INTERACTION_GUIDE",
  "const kanbanA11yStatus = useMemo",
  "atlas-kanban-v30-board-instructions",
  "atlas-kanban-v30-interaction-guide",
  'data-v30-phase="144-kanban-v30-accessible-motion"',
  "aria-describedby={`lead-${lead.id}-kanban-hint`}",
  "role=\"status\" aria-live=\"polite\"",
  "Use Alt mais seta para mover etapa",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 144 — Kanban V30 Accessible Motion",
  ".atlas-kanban-v30-interaction-guide",
  ".atlas-kanban-board-v30 .atlas-pipeline-lead-v30:focus-within",
  ".atlas-kanban-board-v30 a:focus-visible",
  ".atlas-kanban-v30-card-context summary:focus-visible",
  ".atlas-kanban-scroll:focus-visible",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_144_KANBAN_V30_ACCESSIBLE_MOTION.md", "utf8").toLowerCase();
for (const pattern of ["fase 144", "foco visível", "atalhos", "leitores de tela", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-144:check"]) {
  errors.push("Script evolution:phase-144:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 144 validada: Kanban V30 ganhou microinterações, foco visível e orientação acessível.");
