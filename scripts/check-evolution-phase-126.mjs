import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-126-v30-layout-system.json",
  "docs/EVOLUTION_PHASE_126_V30_LAYOUT_SYSTEM.md",
  "components/atlas/app-shell.tsx",
  "components/atlas/sidebar.tsx",
  "components/atlas/topbar.tsx",
  "components/atlas/page-header.tsx",
  "lib/atlas/navigation.ts",
  "app/globals.css",
];

const requiredAppShellPatterns = [
  "data-visual-generation=\"atlas-v30\"",
  "data-navigation-principle=\"outcome-first\"",
  "data-noise-reduction=\"active\"",
];

const requiredSidebarPatterns = [
  "atlas-nav-text",
  "atlas-nav-title",
  "atlas-nav-copy",
  "atlas-sidebar-decision",
  "Uma decisão por tela",
  "data-navigation-style=\"v30-decision-nav\"",
];

const requiredTopbarPatterns = [
  "decisionOutcome",
  "atlas-topbar-outcome",
  "atlas-v30-decision-pill",
  "Decisão limpa",
];

const requiredCssPatterns = [
  "Fase 126 — V30 Layout System",
  ".atlas-app-shell[data-visual-generation=\"atlas-v30\"]",
  ".atlas-app-shell[data-visual-generation=\"atlas-v30\"] .atlas-sidebar-decision",
  ".atlas-app-shell[data-visual-generation=\"atlas-v30\"] .atlas-nav-copy",
  ".atlas-app-shell[data-visual-generation=\"atlas-v30\"] .atlas-topbar-outcome",
  ".atlas-app-shell[data-visual-generation=\"atlas-v30\"] .atlas-page-header[data-v30-layout=\"decision-header\"]",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 126) {
  errors.push(`currentPhase esperado 126, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-126-v30-layout-system.json", "utf8"));
if (phase.phase !== 126 || phase.status !== "implemented") {
  errors.push("Configuração da fase 126 não está implementada corretamente.");
}

const appShell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
for (const pattern of requiredAppShellPatterns) {
  if (!appShell.includes(pattern)) errors.push(`AppShell não contém padrão esperado: ${pattern}`);
}

const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
for (const pattern of requiredSidebarPatterns) {
  if (!sidebar.includes(pattern)) errors.push(`Sidebar não contém padrão esperado: ${pattern}`);
}

const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
for (const pattern of requiredTopbarPatterns) {
  if (!topbar.includes(pattern)) errors.push(`Topbar não contém padrão esperado: ${pattern}`);
}

const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
if (!navigation.includes("businessOutcome: item.businessOutcome")) {
  errors.push("Navegação não expõe businessOutcome para o contexto do topo.");
}

const pageHeader = fs.readFileSync("components/atlas/page-header.tsx", "utf8");
if (!pageHeader.includes("data-v30-layout=\"decision-header\"")) {
  errors.push("PageHeader não recebeu o layout de decisão V30.");
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of requiredCssPatterns) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_126_V30_LAYOUT_SYSTEM.md", "utf8");
const normalizedDocs = docs.toLowerCase();
for (const pattern of ["fase 126", "v30 layout system", "barra lateral", "decisão"]) {
  if (!normalizedDocs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-126:check"]) {
  errors.push("Script evolution:phase-126:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 126 validada: V30 Layout System aplicado ao shell, sidebar, topbar e padrões globais.");
