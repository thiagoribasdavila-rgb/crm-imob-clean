import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-157-meta-campaign-decision-queue.json",
  "docs/EVOLUTION_PHASE_157_META_CAMPAIGN_DECISION_QUEUE.md",
  "app/(crm)/marketing/campaigns/page.tsx",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 157) {
  errors.push(`currentPhase esperado 157, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync("config/evolution-phase-157-meta-campaign-decision-queue.json", "utf8"),
);
if (phase.phase !== 157 || phase.status !== "implemented") {
  errors.push("Configuração da fase 157 não está implementada corretamente.");
}

const page = fs.readFileSync("app/(crm)/marketing/campaigns/page.tsx", "utf8");
for (const pattern of [
  'data-v30-phase="157-meta-campaign-decision-queue"',
  "campaignDecisionQueue",
  "decisionGuardrails",
  "DecisionQueueCard",
  "Fila operacional pós-aprovação",
  "Do teste real à escala, sem ruído.",
  "Pronta para teste real",
  "Em ajuste",
  "Candidata a escala",
  "Pausar ruído",
  "Decisão rápida do diretor",
]) {
  if (!page.includes(pattern)) errors.push(`Página de campanhas não contém padrão esperado: ${pattern}`);
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_157_META_CAMPAIGN_DECISION_QUEUE.md", "utf8")
  .toLowerCase();
for (const pattern of ["fase 157", "fila operacional", "testar", "ajustar", "escalar", "pausar", "nenhuma migration"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-157:check"]) {
  errors.push("Script evolution:phase-157:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 157 validada: fila operacional de decisão Meta implementada.");
