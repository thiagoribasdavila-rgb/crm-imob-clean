import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-132-lead360-v30-material-delivery-router.json",
  "docs/EVOLUTION_PHASE_132_LEAD360_V30_MATERIAL_DELIVERY_ROUTER.md",
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
if (program.currentPhase !== 132) {
  errors.push(`currentPhase esperado 132, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync(
    "config/evolution-phase-132-lead360-v30-material-delivery-router.json",
    "utf8",
  ),
);
if (phase.phase !== 132 || phase.status !== "implemented") {
  errors.push("Configuração da fase 132 não está implementada corretamente.");
}

const lead360 = fs.readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
for (const pattern of [
  "Lead360V30MaterialAction",
  "lead360V30MaterialActions",
  "data-v30-phase=\"132-lead360-v30-material-delivery-router\"",
  "atlas-lead360-v30-material-strip",
  "V30 MATERIAL ROUTER",
  "Material certo para avançar esta lead",
  "Book certo",
  "Tabela e fluxo",
  "Estoque indicado",
  "Argumento de região",
  "lead_360_v30_material_delivery",
]) {
  if (!lead360.includes(pattern)) {
    errors.push(`Lead 360 não contém padrão esperado: ${pattern}`);
  }
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 132 — Lead 360 V30 Material Delivery Router",
  ".atlas-lead360-v30-material-strip",
  ".atlas-lead360-v30-material-head",
  ".atlas-lead360-v30-material-grid",
  ".atlas-lead360-v30-material-actions",
  ".atlas-lead360-v30-material-copilot",
  ".atlas-lead360-v30-material-grid article[data-tone=\"warning\"]",
]) {
  if (!css.includes(pattern)) {
    errors.push(`CSS não contém padrão esperado: ${pattern}`);
  }
}

const docs = fs
  .readFileSync(
    "docs/EVOLUTION_PHASE_132_LEAD360_V30_MATERIAL_DELIVERY_ROUTER.md",
    "utf8",
  )
  .toLowerCase();
for (const pattern of [
  "fase 132",
  "lead 360",
  "material",
  "book",
  "tabela",
  "estoque",
  "copilot",
  "sem ruído",
]) {
  if (!docs.includes(pattern)) {
    errors.push(`Documento não contém padrão esperado: ${pattern}`);
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-132:check"]) {
  errors.push("Script evolution:phase-132:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(
  "Fase 132 validada: Lead 360 V30 com roteador de material, simulação, estoque e Copilot supervisionado.",
);
