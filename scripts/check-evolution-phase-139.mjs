import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-139-kanban-v30-progressive-rendering.json",
  "docs/EVOLUTION_PHASE_139_KANBAN_V30_PROGRESSIVE_RENDERING.md",
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
if (program.currentPhase !== 139) {
  errors.push(`currentPhase esperado 139, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-139-kanban-v30-progressive-rendering.json",
    "utf8",
  ),
);
if (phase.phase !== 139 || phase.status !== "implemented") {
  errors.push("Configuração da fase 139 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "KANBAN_PROGRESSIVE_VISIBLE_LIMIT",
  "expandedStages",
  "visibleStageItems",
  "hiddenStageItems",
  "data-v30-phase=\"139-kanban-v30-progressive-rendering\"",
  "atlas-kanban-v30-progressive-more",
  "Compactar etapa",
]) {
  if (!pipeline.includes(pattern)) {
    errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 139 — Kanban V30 Progressive Column Rendering",
  ".atlas-kanban-v30-progressive-more",
  ".atlas-kanban-v30-progressive-more.is-collapse",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync(
    "docs/EVOLUTION_PHASE_139_KANBAN_V30_PROGRESSIVE_RENDERING.md",
    "utf8",
  )
  .toLowerCase();
for (const pattern of [
  "fase 139",
  "renderização progressiva",
  "mostrar restantes",
  "compactar etapa",
  "não altera banco",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-139:check"]) {
  errors.push("Script evolution:phase-139:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 139 validada: Kanban V30 com renderização progressiva por coluna.",
);
