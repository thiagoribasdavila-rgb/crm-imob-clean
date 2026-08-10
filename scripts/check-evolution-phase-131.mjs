import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-131-lead360-v30-attendance-cockpit.json",
  "docs/EVOLUTION_PHASE_131_LEAD360_V30_ATTENDANCE_COCKPIT.md",
  "app/(crm)/leads/[id]/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(
  fs.readFileSync("config/evolution-program-3000.json", "utf8"),
);
if (program.currentPhase !== 131) {
  errors.push(`currentPhase esperado 131, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-131-lead360-v30-attendance-cockpit.json",
    "utf8",
  ),
);
if (phase.phase !== 131 || phase.status !== "implemented") {
  errors.push("Configuração da fase 131 não está implementada corretamente.");
}

const lead360 = fs.readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
for (const pattern of [
  "Lead360V30Signal",
  "lead360V30Score",
  "lead360V30Signals",
  "data-v30-phase=\"131-lead360-v30-attendance-cockpit\"",
  "atlas-lead360-v30-command-strip",
  "V30 ATTENDANCE COCKPIT",
  "Próxima ação",
  "Perfil comprador",
  "Oferta indicada",
  "Memória comercial",
  "Gerar plano de atendimento",
]) {
  if (!lead360.includes(pattern)) {
    errors.push(`Lead 360 não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 131 — Lead 360 V30 Attendance Cockpit",
  ".atlas-lead360-v30-command-strip",
  ".atlas-lead360-v30-score-card",
  ".atlas-lead360-v30-signal-grid",
  ".atlas-lead360-v30-action",
  ".atlas-lead360-v30-signal-grid article[data-tone=\"danger\"]",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync(
    "docs/EVOLUTION_PHASE_131_LEAD360_V30_ATTENDANCE_COCKPIT.md",
    "utf8",
  )
  .toLowerCase();
for (const pattern of [
  "fase 131",
  "lead 360",
  "próxima melhor ação",
  "copilot",
  "memória comercial",
  "sem novos custos",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-131:check"]) {
  errors.push("Script evolution:phase-131:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 131 validada: Lead 360 V30 com cockpit de atendimento, sinais de decisão e Copilot supervisionado.",
);
