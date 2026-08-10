import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-154-meta-director-campaign-conversion-center.json",
  "docs/EVOLUTION_PHASE_154_META_DIRECTOR_CAMPAIGN_CONVERSION_CENTER.md",
  "app/(crm)/marketing/campaigns/page.tsx",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 154) {
  errors.push(`currentPhase esperado 154, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync("config/evolution-phase-154-meta-director-campaign-conversion-center.json", "utf8"),
);
if (phase.phase !== 154 || phase.status !== "implemented") {
  errors.push("Configuração da fase 154 não está implementada corretamente.");
}

const page = fs.readFileSync("app/(crm)/marketing/campaigns/page.tsx", "utf8");
for (const pattern of [
  'data-phase="154-meta-director-campaign-conversion-center"',
  "/api/v1/campaign-intelligence",
  "Campanhas que aprendem com vendas reais.",
  "Ferramenta de criação",
  "Brief de campanha para subir no Meta",
  "Qualificação de campanha",
  "Ranking Meta por conversão",
  "sem automação de verba",
  "Gates antes de escalar verba",
]) {
  if (!page.includes(pattern)) errors.push(`Página de campanhas não contém padrão esperado: ${pattern}`);
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_154_META_DIRECTOR_CAMPAIGN_CONVERSION_CENTER.md", "utf8")
  .toLowerCase();
for (const pattern of ["fase 154", "meta", "andromeda", "conversão real", "nenhuma migration", "diretor"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-154:check"]) {
  errors.push("Script evolution:phase-154:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 154 validada: campanhas Meta ganharam central executiva de criação, qualificação e conversão.");
