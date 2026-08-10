import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-153-kanban-v30-stage-compression-radar.json",
  "docs/EVOLUTION_PHASE_153_KANBAN_V30_STAGE_COMPRESSION_RADAR.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 153) {
  errors.push(`currentPhase esperado 153, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-153-kanban-v30-stage-compression-radar.json", "utf8"));
if (phase.phase !== 153 || phase.status !== "implemented") {
  errors.push("Configuração da fase 153 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  'data-v30-phase="153-kanban-v30-stage-compression-radar"',
  "Radar de gargalos V30",
  "Foco agora:",
  "atlas-kanban-bottleneck-radar-signals",
  "setFocus(item.focus)",
  "setFocusMode(true)",
  "setCompact(true)",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  ".atlas-kanban-bottleneck-radar-signals",
  ".atlas-kanban-bottleneck-radar-signals small",
  ".atlas-kanban-bottleneck-radar-signals b",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_153_KANBAN_V30_STAGE_COMPRESSION_RADAR.md", "utf8").toLowerCase();
for (const pattern of ["fase 153", "gargalos", "kanban", "visão compacta", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-153:check"]) {
  errors.push("Script evolution:phase-153:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 153 validada: Kanban V30 ganhou radar comprimido de decisão por etapa.");
