import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-158-meta-real-lead-test-lane.json",
  "docs/EVOLUTION_PHASE_158_META_REAL_LEAD_TEST_LANE.md",
  "app/(crm)/marketing/campaigns/page.tsx",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 158) {
  errors.push(`currentPhase esperado 158, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync("config/evolution-phase-158-meta-real-lead-test-lane.json", "utf8"),
);
if (phase.phase !== 158 || phase.status !== "implemented") {
  errors.push("Configuração da fase 158 não está implementada corretamente.");
}

const page = fs.readFileSync("app/(crm)/marketing/campaigns/page.tsx", "utf8");
for (const pattern of [
  'data-v30-phase="158-meta-real-lead-test-lane"',
  "realLeadTestSteps",
  "realLeadReadiness",
  "realLeadDirectorChecks",
  "RealLeadTestStepCard",
  "Teste real de lead Meta",
  "Da campanha publicada ao sinal comprador.",
  "Entrada real Meta",
  "Qualificação do cliente",
  "Handoff comercial",
  "Feedback de conversão",
  "Andromeda não é botão mágico",
]) {
  if (!page.includes(pattern)) errors.push(`Página de campanhas não contém padrão esperado: ${pattern}`);
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_158_META_REAL_LEAD_TEST_LANE.md", "utf8")
  .toLowerCase();
for (const pattern of ["fase 158", "teste real", "qualificação", "handoff", "feedback", "andromeda", "nenhuma migration"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-158:check"]) {
  errors.push("Script evolution:phase-158:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 158 validada: esteira de teste real de lead Meta implementada.");
