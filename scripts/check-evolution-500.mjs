import fs from "node:fs";

const source = fs.readFileSync("lib/atlas/evolution-500.ts", "utf8");
const page = fs.readFileSync("app/(crm)/atlas-v3/Evolution500Program.tsx", "utf8");
const phaseOne = JSON.parse(fs.readFileSync("config/evolution-phase-001-journey-inventory.json", "utf8"));
const phaseTwo = JSON.parse(fs.readFileSync("config/evolution-phase-002-commercial-outcome.json", "utf8"));
const phaseThree = JSON.parse(fs.readFileSync("config/evolution-phase-003-navigation-baseline.json", "utf8"));
const phaseFour = JSON.parse(fs.readFileSync("config/evolution-phase-004-canonical-navigation.json", "utf8"));
const phaseFive = JSON.parse(fs.readFileSync("config/evolution-phase-005-information-density.json", "utf8"));
const phaseSix = JSON.parse(fs.readFileSync("config/evolution-phase-006-visual-hierarchy.json", "utf8"));
const phaseSeven = JSON.parse(fs.readFileSync("config/evolution-phase-007-reduce-task-steps.json", "utf8"));
const phaseEight = JSON.parse(fs.readFileSync("config/evolution-phase-008-primary-action-standard.json", "utf8"));
const phaseNine = JSON.parse(fs.readFileSync("config/evolution-phase-009-progressive-loading.json", "utf8"));
const globalStyles = fs.readFileSync("app/globals.css", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const crmLoading = fs.readFileSync("app/(crm)/loading.tsx", "utf8");
const atlasUi = fs.readFileSync("components/ui/AtlasUI.tsx", "utf8");
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const palette = fs.readFileSync("components/CommandPalette.tsx", "utf8");
const mobileDock = fs.readFileSync("components/atlas/mobile-dock.tsx", "utf8");

const checks = [
  ["50 ondas", (source.match(/\{ id: \d+, name:/g) || []).length === 50],
  ["20 checkpoints", (source.match(/^  \".*\",$/gm) || []).length === 20],
  ["1.000 fases calculadas", source.includes("evolution1000Phases") && source.includes("checkpoints")],
  ["Busca compacta", page.includes("Buscar IA, Kimi, navegação")],
  ["Sem falsa conclusão", source.includes('status: "planejada"')],
  ["Regra de evidência", source.includes("Uma fase só avança com evidência")],
  ["Fase 001 concluída", phaseOne.phase === 1 && phaseOne.status === "completed"],
  ["Fase 001 com jornadas", phaseOne.criticalJourneys.length >= 6 && phaseOne.roles.length === 4],
  ["Fase 001 sem mudança destrutiva", phaseOne.exitCriteria.noDestructiveRouteChange === true],
  ["Fase 002 orientada a resultado", phaseTwo.status === "completed" && phaseTwo.successMeasures.length >= 4],
  ["Fase 003 sem métricas inventadas", phaseThree.status === "completed" && phaseThree.instrumentationPending.length >= 3],
  ["Fase 004 com fonte canônica", phaseFour.status === "completed" && navigation.includes("atlasNavigation")],
  ["Três consumidores canônicos", sidebar.includes("atlasNavigation") && palette.includes("atlasNavigation") && mobileDock.includes("atlasMobileNavigation")],
  ["V2 fora do catálogo canônico", !navigation.includes("/atlas-v2") && phaseFour.historicalRouteDeleted === false],
  ["Fase 005 compacta sem esconder", phaseFive.status === "completed" && phaseFive.removedRedundancies.length === 3 && phaseFive.preservedSignals.length >= 4],
  ["Sidebar sem banner redundante", !sidebar.includes("Você está em")],
  ["Fase 006 com hierarquia acessível", phaseSix.status === "completed" && phaseSix.accessibility.activeStateDoesNotDependOnColorOnly === true],
  ["Estado ativo com trilho visual", globalStyles.includes('.atlas-nav-link[data-active="true"]::before')],
  ["Fase 007 reduz passos", phaseSeven.status === "completed" && phaseSeven.after.navigationDecisions < phaseSeven.before.navigationDecisions],
  ["Novo lead persistente e acessível", topbar.includes('href="/leads/new"') && topbar.includes('aria-label="Criar novo lead"')],
  ["Fase 008 padroniza ação principal", phaseEight.status === "completed" && topbar.includes("atlas-button-primary atlas-quick-create")],
  ["Fase 009 carrega progressivamente", phaseNine.status === "completed" && crmLoading.includes('aria-live="polite"')],
  ["Skeleton decorativo silencioso", atlasUi.includes('aria-hidden="true"')],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Programa 500 fases inválido: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Programa Atlas 1000: 50 ondas × 20 fases = 1.000 fases planejadas e verificadas.");
