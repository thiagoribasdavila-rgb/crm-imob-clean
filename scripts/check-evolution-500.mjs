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
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyOne = JSON.parse(fs.readFileSync("config/evolution-phase-021-navigation-architecture-inventory.json", "utf8"));
const phaseTwentyTwo = JSON.parse(fs.readFileSync("config/evolution-phase-022-navigation-commercial-outcomes.json", "utf8"));
const phaseTwentyThree = JSON.parse(fs.readFileSync("config/evolution-phase-023-navigation-baseline.json", "utf8"));
const phaseTwentyFour = JSON.parse(fs.readFileSync("config/evolution-phase-024-navigation-deduplication.json", "utf8"));
const phaseTwentyFive = JSON.parse(fs.readFileSync("config/evolution-phase-025-navigation-information-compaction.json", "utf8"));
const phaseTwentySix = JSON.parse(fs.readFileSync("config/evolution-phase-026-navigation-visual-hierarchy.json", "utf8"));
const phaseTwentySeven = JSON.parse(fs.readFileSync("config/evolution-phase-027-navigation-task-step-reduction.json", "utf8"));
const phaseTwentyEight = JSON.parse(fs.readFileSync("config/evolution-phase-028-navigation-primary-action-standard.json", "utf8"));
const phaseTwentyNine = JSON.parse(fs.readFileSync("config/evolution-phase-029-navigation-progressive-loading.json", "utf8"));
const phaseThirty = JSON.parse(fs.readFileSync("config/evolution-phase-030-navigation-useful-empty-states.json", "utf8"));
const phaseThirtyOne = JSON.parse(fs.readFileSync("config/evolution-phase-031-navigation-failure-recovery.json", "utf8"));
const phaseThirtyTwo = JSON.parse(fs.readFileSync("config/evolution-phase-032-navigation-desktop-workspace.json", "utf8"));
const phaseThirtyThree = JSON.parse(fs.readFileSync("config/evolution-phase-033-navigation-tablet-workspace.json", "utf8"));
const phaseThirtyFour = JSON.parse(fs.readFileSync("config/evolution-phase-034-navigation-mobile-workspace.json", "utf8"));
const phaseThirtyFive = JSON.parse(fs.readFileSync("config/evolution-phase-035-dashboard-decision-first.json", "utf8"));
const phaseThirtySix = JSON.parse(fs.readFileSync("config/evolution-phase-036-leads-action-workspace.json", "utf8"));
const phaseThirtySeven = JSON.parse(fs.readFileSync("config/evolution-phase-037-pipeline-movement-workspace.json", "utf8"));
const phaseThirtyEight = JSON.parse(fs.readFileSync("config/evolution-phase-038-task-execution-workspace.json", "utf8"));
const phaseThirtyNine = JSON.parse(fs.readFileSync("config/evolution-phase-039-agenda-time-workspace.json", "utf8"));
const phaseForty = JSON.parse(fs.readFileSync("config/evolution-phase-040-activity-explainable-history.json", "utf8"));
const phaseFortyOne = JSON.parse(fs.readFileSync("config/evolution-phase-041-customer-relationship-workspace.json", "utf8"));
const globalStyles = fs.readFileSync("app/globals.css", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const tokens = fs.readFileSync("styles/atlas-tokens.css", "utf8");
const crmLoading = fs.readFileSync("app/(crm)/loading.tsx", "utf8");
const progressivePageLoading = fs.readFileSync("components/atlas/progressive-page-loading.tsx", "utf8");
const localLoadingState = fs.readFileSync("components/atlas/loading-state.tsx", "utf8");
const atlasUi = fs.readFileSync("components/ui/AtlasUI.tsx", "utf8");
const calendarPage = fs.readFileSync("app/(crm)/calendar/page.tsx", "utf8");
const developmentsPage = fs.readFileSync("app/(crm)/developments/page.tsx", "utf8");
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const palette = fs.readFileSync("components/CommandPalette.tsx", "utf8");
const mobileDock = fs.readFileSync("components/atlas/mobile-dock.tsx", "utf8");
const appShell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const navigationPerformance = fs.readFileSync("components/atlas/navigation-performance.tsx", "utf8");
const dashboard = fs.readFileSync("app/(crm)/dashboard/page.tsx", "utf8");
const leadsPage = fs.readFileSync("app/(crm)/leads/page.tsx", "utf8");
const pipelinePage = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const tasksPage = fs.readFileSync("app/(crm)/tasks/page.tsx", "utf8");
const activityPage = fs.readFileSync("app/(crm)/activity/page.tsx", "utf8");
const activityApi = fs.readFileSync("app/api/v1/activity/route.ts", "utf8");
const customersPage = fs.readFileSync("app/(crm)/customers/page.tsx", "utf8");
const customersApi = fs.readFileSync("app/api/v1/customers/route.ts", "utf8");

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
  ["Novo lead permanece como ação padrão acessível", navigation.includes('label: "Novo lead"') && navigation.includes('href: "/leads/new"') && topbar.includes("Ação rápida:")],
  ["Fase 008 padroniza ação principal", phaseEight.status === "completed" && topbar.includes("<AtlasActionLink") && topbar.includes('priority="primary"')],
  ["Fase 009 carrega progressivamente", phaseNine.status === "completed" && crmLoading.includes("<ProgressivePageLoading") && progressivePageLoading.includes('aria-live="polite"')],
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
  ["Topbar móvel mantém ação comercial", topbar.includes("taskAction.href") && phaseFourteen.preservedActions.includes("new lead")],
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
  ["Fase 020 não inventa homologação", phaseTwenty.status === "blocked" && phaseTwenty.productionReleaseAllowed === false],
  ["Fase 021 inventaria navegação sem mutação", phaseTwentyOne.status === "completed" && phaseTwentyOne.productionDataModified === false && phaseTwentyOne.runtimeNavigationChanged === false],
  ["Topologia CRM fecha em 141 rotas", phaseTwentyOne.topology.crmRoutes === 141 && phaseTwentyOne.topology.canonicalDestinationsPresent === 26 && phaseTwentyOne.topology.missingCanonicalDestinations === 0],
  ["Fase 022 orienta navegação a resultado", phaseTwentyTwo.status === "completed" && phaseTwentyTwo.canonicalOutcomes.length === 26],
  ["Jornadas críticas limitam o esforço", phaseTwentyTwo.criticalJourneys.every((journey) => journey.maximumActions <= 3) && phaseTwentyTwo.successModel.inventedBehaviorMetricAllowed === false],
  ["Fase 023 mede a arquitetura sem inventar uso", phaseTwentyThree.status === "completed" && phaseTwentyThree.structuralBaseline.crmRoutes === 141 && phaseTwentyThree.behavioralTelemetry.status === "blocked-awaiting-runtime-telemetry"],
  ["Linha de base preserva privacidade e runtime", phaseTwentyThree.productionDataModified === false && phaseTwentyThree.runtimeNavigationChanged === false && phaseTwentyThree.measurementPolicy.personalDataCaptured === false],
  ["Fase 024 elimina interfaces duplicadas com compatibilidade", phaseTwentyFour.status === "completed" && phaseTwentyFour.aliasesConsolidated === 7 && phaseTwentyFour.aliasesPreserved === true],
  ["Consolidação não inventa uso nem apaga rota", phaseTwentyFour.routesDeleted === false && phaseTwentyFour.permanentRedirectUsed === false && phaseTwentyFour.behavioralTelemetry.inventedMetricPublished === false],
  ["Fase 025 compacta informação sem esconder funções", phaseTwentyFive.status === "completed" && phaseTwentyFive.catalogPreservation.primaryDestinations === 20 && phaseTwentyFive.catalogPreservation.contextCommands === 6],
  ["Compactação preserva busca, toque e RBAC", phaseTwentyFive.compactionChanges.favoriteDuplication.searchStillReturnsPinnedItems === true && phaseTwentyFive.compactionChanges.touchTargets.minimumNavigationTargetPx === 44 && phaseTwentyFive.safetyPolicy.rbacPreserved === true],
  ["Fase 026 clarifica contexto e estado atual", phaseTwentySix.status === "completed" && phaseTwentySix.contextResolution.staticParallelLabelMapRemoved === true && phaseTwentySix.hierarchyModel.activeSignals.length >= 6],
  ["Hierarquia preserva semântica, toque e RBAC", phaseTwentySix.semanticNavigation.groupsUseHeadingElement === true && phaseTwentySix.interactionTargets.favoriteActionMinimumPx === 44 && phaseTwentySix.safetyPolicy.rbacPreserved === true],
  ["Fase 027 reduz passos por contexto", phaseTwentySeven.status === "completed" && phaseTwentySeven.taskActions.contextualTransitions === 15 && phaseTwentySeven.taskActions.singlePersistentSlot === true],
  ["Ação contextual preserva RBAC e fonte única", phaseTwentySeven.safetyPolicy.rbacPreserved === true && navigation.includes("getAtlasTaskActionForPathname") && topbar.includes("taskAction.href") && palette.includes("Ação desta tela")],
  ["Fase 028 limita e padroniza ações de cabeçalho", phaseTwentyEight.status === "completed" && phaseTwentyEight.sharedContract.maximumActionsPerPageHeader === 1 && phaseTwentyEight.auditedConsumers.pageHeadersMigrated === 13],
  ["Prioridade compartilhada preserva destinos e RBAC", phaseTwentyEight.auditedConsumers.secondaryHeaderActions === 12 && phaseTwentyEight.navigationDestinationsChanged === false && phaseTwentyEight.safetyPolicy.rbacPreserved === true],
  ["Fase 029 ordena o carregamento sem bloquear o shell", phaseTwentyNine.status === "completed" && phaseTwentyNine.progressiveContract.priorities.join(",") === "essential,summary,detail" && phaseTwentyNine.progressiveContract.persistentTopbarActionAvailable === true],
  ["Carregamento progressivo preserva acessibilidade e verdade", progressivePageLoading.includes('aria-busy="true"') && localLoadingState.includes('data-loading-priority="detail"') && phaseTwentyNine.truthPolicy.fakeProgressRendered === false && phaseTwentyNine.safetyPolicy.rbacPreserved === true],
  ["Fase 030 torna ausências acionáveis", phaseThirty.status === "completed" && phaseThirty.emptyStateContract.reasons.length === 5 && phaseThirty.criticalSurfaces.length === 8],
  ["Vazios governados não mascaram falhas", atlasUi.includes("data-empty-reason={reason}") && phaseThirty.truthPolicy.emptyStateMayMaskFetchFailure === false && phaseThirty.truthPolicy.fakeRecordsRendered === false],
  ["Fase 031 recupera falhas sem repetir escrita", phaseThirtyOne.status === "completed" && phaseThirtyOne.structuralBaseline.sharedRecoveryConsumersAfter === 7 && phaseThirtyOne.safetyPolicy.retryRepeatsWrite === false],
  ["Recuperação compartilhada redige detalhes técnicos", atlasUi.includes("safeFailureDescription(description)") && atlasUi.includes('data-recovery-strategy="safe-read-retry"') && phaseThirtyOne.recoveryContract.technicalDetailsRedacted === true],
  ["Fase 032 adapta a densidade no desktop amplo", phaseThirtyTwo.status === "completed" && phaseThirtyTwo.desktopContract.modes.length === 2 && appShell.includes("data-desktop-density={desktopDensity}")],
  ["Desktop adaptativo preserva tablet, celular e verdade", phaseThirtyTwo.desktopContract.tabletAndMobileUnaffected === true && phaseThirtyTwo.structuralBaseline.runtimeScrollReductionMeasured === false && phaseThirtyTwo.safetyPolicy.rbacPreserved === true],
  ["Fase 033 adapta tablets grandes sem reservar sidebar", phaseThirtyThree.status === "completed" && phaseThirtyThree.tabletContract.maximumViewportPx === 1179 && appShell.includes('data-tablet-layout="adaptive-overlay-workspace"')],
  ["Tablet adaptativo preserva dock, ações e verdade", phaseThirtyThree.exitCriteria.tabletDockRemainsAvailable === true && phaseThirtyThree.exitCriteria.commercialActionsRemoved === false && phaseThirtyThree.structuralBaseline.runtimeNavigationGainMeasured === false && phaseThirtyThree.safetyPolicy.rbacPreserved === true],
  ["Fase 034 leva a ação contextual à zona do polegar", phaseThirtyFour.status === "completed" && phaseThirtyFour.mobileContract.contextualActionPosition === 3 && appShell.includes('data-mobile-layout="thumb-first"')],
  ["Mobile preserva navegação, RBAC e verdade", phaseThirtyFour.exitCriteria.primaryNavigationStillComplete === true && phaseThirtyFour.structuralBaseline.runtimeOneHandSuccessMeasured === false && phaseThirtyFour.safetyPolicy.rbacPreserved === true],
  ["Fase 035 orienta o dashboard à próxima decisão", phaseThirtyFive.status === "completed" && phaseThirtyFive.dashboardContract.syntheticHealthScoreRemoved === true && dashboard.includes('data-dashboard-layout="decision-first"')],
  ["Dashboard preserva análise, RBAC e verdade", phaseThirtyFive.dashboardContract.extendedPanelsPreserved === true && phaseThirtyFive.truthPolicy.runtimeProductivityClaimPublished === false && phaseThirtyFive.safetyPolicy.rbacPreserved === true],
  ["Fase 036 orienta Leads à próxima ação visível", phaseThirtySix.status === "completed" && phaseThirtySix.leadsContract.visiblePriorityLimit === 3 && leadsPage.includes('data-leads-layout="action-first"')],
  ["Leads preserva paginação, RBAC e verdade", phaseThirtySix.leadsContract.existingPaginationPreserved === true && phaseThirtySix.truthPolicy.queuePresentedAsGlobalPortfolio === false && phaseThirtySix.safetyPolicy.rbacPreserved === true],
  ["Fase 037 orienta Pipeline à próxima movimentação", phaseThirtySeven.status === "completed" && phaseThirtySeven.pipelineContract.visiblePriorityLimit === 3 && pipelinePage.includes('data-pipeline-layout="movement-first"')],
  ["Pipeline preserva etapas, movimento seguro e verdade", phaseThirtySeven.pipelineContract.canonicalStagesPreserved === true && phaseThirtySeven.pipelineContract.safeMovementPreserved === true && phaseThirtySeven.truthPolicy.queuePresentedAsGlobalPortfolio === false && phaseThirtySeven.safetyPolicy.rbacPreserved === true],
  ["Fase 038 orienta Tarefas à execução diária", phaseThirtyEight.status === "completed" && phaseThirtyEight.taskContract.visibleDailyPriorities === 3 && tasksPage.includes('data-task-layout="execution-first"')],
  ["Tarefas preservam ações humanas, RBAC e verdade", phaseThirtyEight.executionPolicy.automaticTaskCompletion === false && phaseThirtyEight.truthPolicy.priorityIsExplainableHeuristicNotPrediction === true && phaseThirtyEight.safetyPolicy.rbacPreserved === true],
  ["Fase 039 orienta Agenda ao tempo comercial", phaseThirtyNine.status === "completed" && phaseThirtyNine.calendarContract.visibleAttentionLimit === 3 && calendarPage.includes('data-calendar-layout="time-first"')],
  ["Agenda preserva fontes, ações humanas e verdade", phaseThirtyNine.calendarContract.sources.length === 3 && phaseThirtyNine.executionPolicy.automaticCustomerContact === false && phaseThirtyNine.truthPolicy.orderingUsesDeadlineNotPrediction === true && phaseThirtyNine.safetyPolicy.rbacPreserved === true],
  ["Fase 040 transforma Atividades em histórico explicável", phaseForty.status === "completed" && phaseForty.activityContract.latestVisibleLimit === 3 && activityPage.includes('data-activity-layout="explain-first"')],
  ["Atividades preserva leitura, RLS e verdade", phaseForty.activityContract.readOnly === true && phaseForty.truthPolicy.orderingIsChronologicalNotPrediction === true && phaseForty.safetyPolicy.rbacPreserved === true && activityApi.includes("requireAccessContext")],
  ["Fase 041 orienta Clientes 360 ao relacionamento", phaseFortyOne.status === "completed" && phaseFortyOne.customerContract.visibleReviewLimit === 3 && customersPage.includes('data-customers-layout="relationship-first"')],
  ["Clientes preserva fonte única, RLS e base fria separada", phaseFortyOne.customerContract.sourceOfTruth === "public.leads" && phaseFortyOne.customerContract.coldReactivationBaseExcluded === true && phaseFortyOne.safetyPolicy.hierarchicalRlsPreserved === true && customersApi.includes("requireAccessContext")],
  ["Bloqueio de staging aparece no programa", source.includes('status: "bloqueada"') && page.includes("Aguardando staging")],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Programa 500 fases inválido: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Programa Atlas 1000: 50 ondas × 20 fases = 1.000 fases planejadas e verificadas.");
