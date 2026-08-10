import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-130-customers-lead360-v30-relationship-cockpit.json",
  "docs/EVOLUTION_PHASE_130_CUSTOMERS_LEAD360_V30_RELATIONSHIP_COCKPIT.md",
  "app/(crm)/customers/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 130) {
  errors.push(`currentPhase esperado 130, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-130-customers-lead360-v30-relationship-cockpit.json", "utf8"));
if (phase.phase !== 130 || phase.status !== "implemented") {
  errors.push("Configuração da fase 130 não está implementada corretamente.");
}

const customers = fs.readFileSync("app/(crm)/customers/page.tsx", "utf8");
for (const pattern of [
  "CustomerV30Signal",
  "customersV30Signals",
  "data-v30-phase=\"130-customers-lead360-v30-relationship-cockpit\"",
  "atlas-customers-v30-command-strip",
  "V30 RELATIONSHIP COCKPIT",
  "Clareza da carteira",
  "Próxima conversa",
  "Memória IA",
]) {
  if (!customers.includes(pattern)) errors.push(`Clientes 360 não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 130 — Clientes 360 / Lead 360 V30 Relationship Cockpit",
  ".atlas-customers-v30-command-strip",
  ".atlas-customers-v30-score-card",
  ".atlas-customers-v30-signal-grid",
  ".atlas-customers-v30-signal-grid article[data-tone=\"danger\"]",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_130_CUSTOMERS_LEAD360_V30_RELATIONSHIP_COCKPIT.md", "utf8").toLowerCase();
for (const pattern of ["fase 130", "clientes 360", "lead 360", "copilot", "memória", "próxima conversa"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-130:check"]) {
  errors.push("Script evolution:phase-130:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 130 validada: Clientes 360/Lead 360 V30 com cockpit de relacionamento, clareza de carteira e Copilot supervisionado.");
