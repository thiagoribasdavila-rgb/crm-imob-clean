import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-155-meta-campaign-homologation-workbench.json",
  "docs/EVOLUTION_PHASE_155_META_CAMPAIGN_HOMOLOGATION_WORKBENCH.md",
  "app/(crm)/marketing/campaigns/page.tsx",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 155) {
  errors.push(`currentPhase esperado 155, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync("config/evolution-phase-155-meta-campaign-homologation-workbench.json", "utf8"),
);
if (phase.phase !== 155 || phase.status !== "implemented") {
  errors.push("Configuração da fase 155 não está implementada corretamente.");
}

const page = fs.readFileSync("app/(crm)/marketing/campaigns/page.tsx", "utf8");
for (const pattern of [
  'data-v30-phase="155-meta-campaign-homologation-workbench"',
  "Campanhas que já subiram",
  "Esteira de homologação Meta",
  "Lead real recebido",
  "Cliente qualificado",
  "Conversão devolvida",
  "Qualificação de clientes",
  "Perguntas que alimentam o público comprador",
  "HomologationStepCard",
  "QualificationSignalCard",
]) {
  if (!page.includes(pattern)) errors.push(`Página de campanhas não contém padrão esperado: ${pattern}`);
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_155_META_CAMPAIGN_HOMOLOGATION_WORKBENCH.md", "utf8")
  .toLowerCase();
for (const pattern of ["fase 155", "homologação meta", "lead real", "cliente qualificado", "andromeda", "nenhuma migration"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-155:check"]) {
  errors.push("Script evolution:phase-155:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 155 validada: campanhas Meta ganharam esteira de homologação e qualificação de clientes.");
