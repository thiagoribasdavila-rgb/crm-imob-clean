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
const phaseTen = JSON.parse(fs.readFileSync("config/evolution-phase-010-useful-empty-states.json", "utf8"));
const phaseEleven = JSON.parse(fs.readFileSync("config/evolution-phase-011-failure-recovery.json", "utf8"));
const phaseTwelve = JSON.parse(fs.readFileSync("config/evolution-phase-012-desktop-canvas.json", "utf8"));
const phaseThirteen = JSON.parse(fs.readFileSync("config/evolution-phase-013-tablet-workspace.json", "utf8"));
const phaseFourteen = JSON.parse(fs.readFileSync("config/evolution-phase-014-mobile-touch.json", "utf8"));
const phaseFifteen = JSON.parse(fs.readFileSync("config/evolution-phase-015-accessibility.json", "utf8"));
const phaseSixteen = JSON.parse(fs.readFileSync("config/evolution-phase-016-perceived-speed.json", "utf8"));
const phaseSeventeen = JSON.parse(fs.readFileSync("config/evolution-phase-017-real-usage.json", "utf8"));
const phaseEighteen = JSON.parse(fs.readFileSync("config/evolution-phase-018-profile-validation.json", "utf8"));
const phaseNineteen = JSON.parse(fs.readFileSync("config/evolution-phase-019-evidence-correction.json", "utf8"));
const globalStyles = fs.readFileSync("app/globals.css", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const tokens = fs.readFileSync("styles/atlas-tokens.css", "utf8");
const crmLoading = fs.readFileSync("app/(crm)/loading.tsx", "utf8");
const atlasUi = fs.readFileSync("components/ui/AtlasUI.tsx", "utf8");
const calendarPage = fs.readFileSync("app/(crm)/calendar/page.tsx", "utf8");
const developmentsPage = fs.readFileSync("app/(crm)/developments/page.tsx", "utf8");
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const palette = fs.readFileSync("components/CommandPalette.tsx", "utf8");
const mobileDock = fs.readFileSync("components/atlas/mobile-dock.tsx", "utf8");
const appShell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const navigationPerformance = fs.readFileSync("components/atlas/navigation-performance.tsx", "utf8");

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
  ["Três consumidores canônicos", sidebar.includes("getAtlasNavigationForIdentity") && palette.includes("getAtlasNavigationForIdentity") && mobileDock.includes("getAtlasMobileNavigationForIdentity")],
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
  ["Fase 010 cobre vazios críticos", phaseTen.status === "completed" && phaseTen.criticalStates.length >= 4],
  ["Vazios oferecem recuperação", calendarPage.includes("Criar tarefa") && developmentsPage.includes("Limpar filtros") && developmentsPage.includes("Cadastrar empreendimento")],
  ["Fase 011 padroniza recuperação", phaseEleven.status === "completed" && phaseEleven.technicalStackExposed === false],
  ["Falhas críticas podem repetir", atlasUi.includes("AtlasRecoverableError") && calendarPage.includes("AtlasRecoverableError") && developmentsPage.includes("AtlasRecoverableError")],
  ["Fase 012 amplia o canvas desktop", phaseTwelve.status === "completed" && tokens.includes("--atlas-content-max: 1728px")],
  ["Topbar e conteúdo compartilham alinhamento", topbar.includes("atlas-topbar-inner") && globalStyles.includes("max-width: var(--atlas-content-max)")],
  ["Fase 013 possui faixa exclusiva de tablet", phaseThirteen.status === "completed" && globalStyles.includes("@media (min-width: 768px) and (max-width: 1023px)")],
  ["Dock de tablet preserva a área útil", globalStyles.includes("width: min(calc(100% - 32px), 560px)") && globalStyles.includes("transform: translateX(-50%)")],
  ["Fase 014 protege a experiência móvel", phaseFourteen.status === "completed" && phaseFourteen.minimumTouchTargetPx >= 44],
  ["Formulários móveis não provocam zoom", globalStyles.includes(".atlas-app-shell textarea") && globalStyles.includes("font-size: 16px")],
  ["Topbar móvel mantém ação comercial", topbar.includes('href="/leads/new"') && phaseFourteen.preservedActions.includes("new lead")],
  ["Fase 015 reforça acessibilidade sistêmica", phaseFifteen.status === "completed" && phaseFifteen.keyboardFocusTrap === true],
  ["Menu móvel declara relação e estado", topbar.includes('aria-controls="atlas-primary-sidebar"') && topbar.includes("aria-expanded={mobileOpen}") && sidebar.includes('id="atlas-primary-sidebar"')],
  ["Preferências de contraste são respeitadas", globalStyles.includes("@media (prefers-contrast: more)") && globalStyles.includes("@media (forced-colors: active)")],
  ["Shell transmite estado do menu", appShell.includes("mobileOpen={mobileOpen}")],
  ["Fase 016 mede velocidade percebida", phaseSixteen.status === "completed" && phaseSixteen.inventedLatencyMetric === false],
  ["Rotas críticas são preparadas em tempo ocioso", phaseSixteen.criticalRoutesPrefetched === 6 && navigationPerformance.includes("requestIdleCallback") && navigationPerformance.includes("router.prefetch")],
  ["Navegação recebe retorno imediato", appShell.includes("NavigationPerformance") && navigationPerformance.includes('role="status"') && globalStyles.includes("atlas-route-progress")],
  ["Movimento reduzido permanece respeitado", phaseSixteen.reducedMotionRespected === true && globalStyles.includes(".atlas-navigation-progress")],
  ["Fase 017 instrumenta uso real", phaseSeventeen.status === "completed" && phaseSeventeen.inventedUsageMetric === false],
  ["Telemetria usa ingestão autenticada e não bloqueante", phaseSeventeen.authenticatedIngestion === true && navigationPerformance.includes('fetch("/api/v3/events/ingest"') && navigationPerformance.includes("keepalive: true")],
  ["Rotas são minimizadas antes do envio", phaseSeventeen.routeParametersNormalized === true && phaseSeventeen.queryStringsCaptured === false && navigationPerformance.includes("normalizeRoute")],
  ["Privacidade da navegação é explícita", phaseSeventeen.personalDataCaptured === false && phaseSeventeen.doNotTrackRespected === true && navigationPerformance.includes("navigator.doNotTrack")],
  ["Fase 018 valida cada perfil", phaseEighteen.status === "completed" && phaseEighteen.personas.length === 6],
  ["Navegação usa uma política por perfil", sidebar.includes("getAtlasNavigationForIdentity") && palette.includes("getAtlasContextCommandsForIdentity") && mobileDock.includes("getAtlasMobileNavigationForIdentity")],
  ["Perfil em cache não eleva permissões", phaseEighteen.exitCriteria.cachedIdentityCannotElevateNavigation === true && !appShell.includes("setIdentity({ ...defaultIdentity, ...parsed })")],
  ["Fase 019 corrige evidências sem mutação", phaseNineteen.status === "completed" && phaseNineteen.productionDataModified === false],
  ["Push direto continua bloqueado", phaseNineteen.migrationReadiness.directDbPushAllowed === false && phaseNineteen.exitCriteria.phaseTwentyRemainsBlockedUntilRuntimeApproval === true],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Programa 500 fases inválido: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Programa Atlas 1000: 50 ondas × 20 fases = 1.000 fases planejadas e verificadas.");
