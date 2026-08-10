import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-150-kanban-v30-proactive-conversion-brief.json",
  "docs/EVOLUTION_PHASE_150_KANBAN_V30_PROACTIVE_CONVERSION_BRIEF.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 150) {
  errors.push(`currentPhase esperado 150, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-150-kanban-v30-proactive-conversion-brief.json", "utf8"));
if (phase.phase !== 150 || phase.status !== "implemented") {
  errors.push("Configuração da fase 150 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "const kanbanV30ConversionBrief = useMemo",
  "primaryContactLabel(primary.lead)",
  "atlas-kanban-v30-conversion-brief",
  'data-v30-phase="150-kanban-v30-proactive-conversion-brief"',
  "Brief proativo",
  "Abrir Copilot",
  "Saída esperada",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 150 — Kanban V30 Proactive Conversion Brief",
  ".atlas-kanban-v30-conversion-brief",
  ".atlas-kanban-v30-conversion-brief-head",
  ".atlas-kanban-v30-conversion-brief-steps",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_150_KANBAN_V30_PROACTIVE_CONVERSION_BRIEF.md", "utf8").toLowerCase();
for (const pattern of ["fase 150", "brief", "conversão", "copilot", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-150:check"]) {
  errors.push("Script evolution:phase-150:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 150 validada: Kanban V30 ganhou brief proativo de conversão para o lote prioritário.");
