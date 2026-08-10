import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-129-leads-customers-v30-decision-layer.json",
  "docs/EVOLUTION_PHASE_129_LEADS_CUSTOMERS_V30_DECISION_LAYER.md",
  "app/(crm)/leads/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 129) {
  errors.push(`currentPhase esperado 129, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-129-leads-customers-v30-decision-layer.json", "utf8"));
if (phase.phase !== 129 || phase.status !== "implemented") {
  errors.push("Configuração da fase 129 não está implementada corretamente.");
}

const leads = fs.readFileSync("app/(crm)/leads/page.tsx", "utf8");
for (const pattern of [
  "LeadsV30Signal",
  "leadsV30Signals",
  "data-v30-phase=\"129-leads-customers-v30-decision-layer\"",
  "atlas-leads-v30-command-strip",
  "V30 DECISION LAYER",
  "Clareza da carteira",
  "Memória IA",
]) {
  if (!leads.includes(pattern)) errors.push(`Leads não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 129 — Leads/Clientes V30 Decision Layer",
  ".atlas-leads-v30-command-strip",
  ".atlas-leads-v30-score-card",
  ".atlas-leads-v30-signal-grid",
  ".atlas-leads-v30-signal-grid article[data-tone=\"danger\"]",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_129_LEADS_CUSTOMERS_V30_DECISION_LAYER.md", "utf8").toLowerCase();
for (const pattern of ["fase 129", "leads", "clientes", "decisão", "copilot", "memória"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-129:check"]) {
  errors.push("Script evolution:phase-129:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 129 validada: Leads/Clientes V30 com clareza de carteira, sinais decisivos e Copilot proativo.");
