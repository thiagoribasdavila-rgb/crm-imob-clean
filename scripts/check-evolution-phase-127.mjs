import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-127-command-center-v30-cockpit.json",
  "docs/EVOLUTION_PHASE_127_COMMAND_CENTER_V30_COCKPIT.md",
  "app/(crm)/dashboard/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 127) {
  errors.push(`currentPhase esperado 127, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-127-command-center-v30-cockpit.json", "utf8"));
if (phase.phase !== 127 || phase.status !== "implemented") {
  errors.push("Configuração da fase 127 não está implementada corretamente.");
}

const dashboard = fs.readFileSync("app/(crm)/dashboard/page.tsx", "utf8");
for (const pattern of [
  "v30Cockpit",
  "atlas-command-v30-cockpit",
  "data-phase=\"127-command-center-v30-cockpit\"",
  "IA: próximos 3 passos",
  "Saúde V30",
  "Ruído operacional",
]) {
  if (!dashboard.includes(pattern)) errors.push(`Dashboard não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 127 — Command Center V30 Decision Cockpit",
  ".atlas-command-v30-cockpit",
  ".atlas-command-v30-cockpit-main",
  ".atlas-command-v30-cockpit-card",
  ".atlas-command-v30-cockpit-health",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_127_COMMAND_CENTER_V30_COCKPIT.md", "utf8").toLowerCase();
for (const pattern of ["fase 127", "command center", "cockpit", "decisão", "ruído"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-127:check"]) {
  errors.push("Script evolution:phase-127:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 127 validada: Command Center V30 com cockpit decisivo, cards de ação e leitura de ruído operacional.");
