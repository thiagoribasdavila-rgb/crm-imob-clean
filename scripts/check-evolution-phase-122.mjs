import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-122-kanban-bottleneck-radar.json",
  "docs/EVOLUTION_PHASE_122_KANBAN_BOTTLENECK_RADAR.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const requiredPipelinePatterns = [
  "function stageStallHours(lead: Lead)",
  "function stageStallLabelFromHours(hours: number)",
  "const stageBottleneckRanking = useMemo(() =>",
  "stage.health.urgent * 5 + stage.health.stalled * 3 + stage.health.noAction * 2",
  "data-stage-bottlenecks=\"phase-122\"",
  "className=\"atlas-kanban-bottleneck-radar\"",
  "className=\"atlas-kanban-bottleneck-radar-list\"",
  "setMobileStage(item.key)",
  "setHideEmpty(false)",
];

const requiredCssPatterns = [
  ".atlas-kanban-bottleneck-radar",
  ".atlas-kanban-bottleneck-radar-head",
  ".atlas-kanban-bottleneck-radar-list",
  ".atlas-kanban-bottleneck-radar-list button",
  ".atlas-kanban-bottleneck-radar-list button[data-tone=\"danger\"]",
  ".atlas-kanban-bottleneck-empty",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 122) {
  errors.push(`currentPhase esperado 122, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-122-kanban-bottleneck-radar.json", "utf8"));
if (phase.phase !== 122 || phase.status !== "implemented") {
  errors.push("Configuração da fase 122 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of requiredPipelinePatterns) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const styles = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!styles.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_122_KANBAN_BOTTLENECK_RADAR.md", "utf8");
for (const pattern of ["Fase 122", "Radar", "urgência", "leads parados", "Kanban"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-122:check"]) {
  errors.push("Script evolution:phase-122:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 122 validada: radar compacto de gargalos por etapa no Kanban.");
