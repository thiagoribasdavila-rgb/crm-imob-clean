import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-145-kanban-v30-mobile-decision-mode.json",
  "docs/EVOLUTION_PHASE_145_KANBAN_V30_MOBILE_DECISION_MODE.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 145) {
  errors.push(`currentPhase esperado 145, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-145-kanban-v30-mobile-decision-mode.json", "utf8"));
if (phase.phase !== 145 || phase.status !== "implemented") {
  errors.push("Configuração da fase 145 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "type KanbanV30MobileDecision",
  "const activeMobileStageData = useMemo",
  "const kanbanV30MobileDecision = useMemo<KanbanV30MobileDecision>",
  "atlas-kanban-v30-mobile-decision",
  "atlas-kanban-v30-mobile-decision-actions",
  'data-v30-phase="145-kanban-v30-mobile-decision-mode"',
  "Decisão mobile ·",
  "stage.health.urgent > 0",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 145 — Kanban V30 Mobile Decision Mode",
  ".atlas-kanban-v30-mobile-decision",
  ".atlas-kanban-v30-mobile-decision-actions",
  ".atlas-kanban-mobile-nav small",
  "@media (max-width: 820px)",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_145_KANBAN_V30_MOBILE_DECISION_MODE.md", "utf8").toLowerCase();
for (const pattern of ["fase 145", "decisão mobile", "corretor", "copilot", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-145:check"]) {
  errors.push("Script evolution:phase-145:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 145 validada: Kanban V30 ganhou modo de decisão mobile com ação rápida e menos ruído.");
