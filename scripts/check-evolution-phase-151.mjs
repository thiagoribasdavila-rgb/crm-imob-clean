import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-151-kanban-v30-assisted-execution-runway.json",
  "docs/EVOLUTION_PHASE_151_KANBAN_V30_ASSISTED_EXECUTION_RUNWAY.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 151) {
  errors.push(`currentPhase esperado 151, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-151-kanban-v30-assisted-execution-runway.json", "utf8"));
if (phase.phase !== 151 || phase.status !== "implemented") {
  errors.push("Configuração da fase 151 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "const kanbanV30AssistedExecutionRunway = useMemo",
  "atlas-kanban-v30-execution-runway",
  'data-v30-phase="151-kanban-v30-assisted-execution-runway"',
  "Execução assistida",
  "4 passos para converter sem perder histórico",
  "Registrar saída",
  "execution_result",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 151 — Kanban V30 Assisted Execution Runway",
  ".atlas-kanban-v30-execution-runway",
  ".atlas-kanban-v30-execution-runway-head",
  ".atlas-kanban-v30-execution-runway-steps",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_151_KANBAN_V30_ASSISTED_EXECUTION_RUNWAY.md", "utf8").toLowerCase();
for (const pattern of ["fase 151", "esteira", "kanban", "copilot", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-151:check"]) {
  errors.push("Script evolution:phase-151:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 151 validada: Kanban V30 ganhou esteira de execução assistida.");
