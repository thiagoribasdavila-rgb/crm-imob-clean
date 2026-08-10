import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-159-meta-conversion-feedback-panel.json",
  "docs/EVOLUTION_PHASE_159_META_CONVERSION_FEEDBACK_PANEL.md",
  "app/(crm)/marketing/campaigns/page.tsx",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 159) {
  errors.push(`currentPhase esperado 159, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync("config/evolution-phase-159-meta-conversion-feedback-panel.json", "utf8"),
);
if (phase.phase !== 159 || phase.status !== "implemented") {
  errors.push("Configuração da fase 159 não está implementada corretamente.");
}

const page = fs.readFileSync("app/(crm)/marketing/campaigns/page.tsx", "utf8");
for (const pattern of [
  'data-v30-phase="159-meta-conversion-feedback-panel"',
  "ConversionEventSignal",
  "conversionFeedbackRules",
  "conversionEventSignals",
  "conversionFeedbackReadiness",
  "ConversionEventCard",
  "Feedback Meta · Andromeda",
  "Eventos que ensinam público comprador.",
  "Lead recebido",
  "Lead qualificado",
  "Visita marcada",
  "Proposta enviada",
  "Venda ganha",
]) {
  if (!page.includes(pattern)) errors.push(`Página de campanhas não contém padrão esperado: ${pattern}`);
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_159_META_CONVERSION_FEEDBACK_PANEL.md", "utf8")
  .toLowerCase();
for (const pattern of ["fase 159", "eventos", "sinal fraco", "sinal forte", "andromeda", "nenhuma migration"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-159:check"]) {
  errors.push("Script evolution:phase-159:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 159 validada: painel de feedback de conversão Meta implementado.");
