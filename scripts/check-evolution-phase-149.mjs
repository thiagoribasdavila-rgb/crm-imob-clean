import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-149-kanban-v30-qualification-signal-matrix.json",
  "docs/EVOLUTION_PHASE_149_KANBAN_V30_QUALIFICATION_SIGNAL_MATRIX.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 149) {
  errors.push(`currentPhase esperado 149, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-149-kanban-v30-qualification-signal-matrix.json", "utf8"));
if (phase.phase !== 149 || phase.status !== "implemented") {
  errors.push("Configuração da fase 149 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "KANBAN_V30_QUALIFICATION_SIGNAL",
  "const kanbanV30QualificationMatrix = useMemo",
  "missingLeadData(item.lead)",
  "atlas-kanban-v30-qualification-matrix",
  'data-v30-phase="149-kanban-v30-qualification-signal-matrix"',
  "Memória comercial",
  "Abrir qualidade",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 149 — Kanban V30 Qualification Signal Matrix",
  ".atlas-kanban-v30-qualification-matrix",
  ".atlas-kanban-v30-qualification-head",
  ".atlas-kanban-v30-qualification-grid",
  ".atlas-kanban-v30-qualification-ready",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_149_KANBAN_V30_QUALIFICATION_SIGNAL_MATRIX.md", "utf8").toLowerCase();
for (const pattern of ["fase 149", "kanban", "qualificação", "score", "meta/andromeda", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-149:check"]) {
  errors.push("Script evolution:phase-149:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 149 validada: Kanban V30 ganhou matriz de qualificação para memória comercial.");
