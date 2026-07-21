import fs from "node:fs";
import path from "node:path";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-029-navigation-progressive-loading.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyEight = JSON.parse(fs.readFileSync("config/evolution-phase-028-navigation-primary-action-standard.json", "utf8"));
const progressiveLoading = fs.readFileSync("components/atlas/progressive-page-loading.tsx", "utf8");
const routeLoading = fs.readFileSync("app/(crm)/loading.tsx", "utf8");
const localLoading = fs.readFileSync("components/atlas/loading-state.tsx", "utf8");
const atlasUi = fs.readFileSync("components/ui/AtlasUI.tsx", "utf8");
const crmLayout = fs.readFileSync("app/(crm)/layout.tsx", "utf8");
const appShell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const navigationPerformance = fs.readFileSync("components/atlas/navigation-performance.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_029_NAVIGATION_PROGRESSIVE_LOADING.md", "utf8");

function listPages(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listPages(target);
    return entry.name === "page.tsx" ? [target] : [];
  });
}

const crmPages = listPages("app/(crm)");
const pagesWithClientLoadSignals = crmPages.filter((file) => /useEffect\(|void load\(\)/.test(fs.readFileSync(file, "utf8"))).length;
const pagesWithLocalFeedbackSignals = crmPages.filter((file) => /AtlasSkeleton|LoadingState|loading \?/.test(fs.readFileSync(file, "utf8"))).length;
// Reconciliação CC-6: o componente de carregamento local compartilhado migrou de <LoadingState>
// para <AtlasSkeleton> (73 páginas). A cobertura de feedback local foi preservada e ampliada;
// contamos ambos os componentes compartilhados para refletir a nova realidade sem enfraquecer
// a linha de base (>= 4). Ver docs/EVOLUTION_PHASE_029_NAVIGATION_PROGRESSIVE_LOADING.md.
const sharedLocalLoadingConsumers = crmPages.filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return source.includes("<LoadingState") || source.includes("<AtlasSkeleton");
}).length;

const priorities = [...progressiveLoading.matchAll(/data-loading-priority="([^"]+)"/g)].map((match) => match[1]);

const checks = [
  ["Fase 029 concluída sem mutação de dados", config.status === "completed" && config.runtimePresentationChanged === true && config.productionDataModified === false && config.dataFetchingChanged === false],
  ["Fase anterior permanece concluída", phaseTwentyEight.status === "completed" && phaseTwentyEight.exitCriteria.parallelWorkflowCreated === false],
  ["Fallback de rota usa o componente compartilhado", routeLoading.includes("<ProgressivePageLoading") && routeLoading.includes("@/components/atlas/progressive-page-loading")],
  ["Ordem progressiva possui três prioridades", priorities.join(",") === "essential,summary,detail" && config.progressiveContract.priorities.join(",") === "essential,summary,detail"],
  ["Contexto essencial antecede resumo e detalhe", progressiveLoading.indexOf('data-loading-priority="essential"') < progressiveLoading.indexOf('data-loading-priority="summary"') && progressiveLoading.indexOf('data-loading-priority="summary"') < progressiveLoading.indexOf('data-loading-priority="detail"')],
  ["Status de rota é único e acessível", progressiveLoading.includes('role="status"') && progressiveLoading.includes('aria-live="polite"') && progressiveLoading.includes('aria-busy="true"') && config.accessibility.singleRouteLiveStatus === true],
  ["Skeletons permanecem silenciosos", atlasUi.includes('aria-hidden="true"') && progressiveLoading.includes('aria-hidden="true"') && config.accessibility.skeletonsHiddenFromAssistiveTechnology === true],
  ["Carregamento local informa ocupação sem criar região viva repetida", localLoading.includes('role="group"') && localLoading.includes('aria-busy="true"') && localLoading.includes('data-loading-priority="detail"') && !localLoading.includes('role="status"') && config.accessibility.repeatedLocalLiveRegionsRemoved === true],
  ["Geometria mínima protege o layout", styles.includes(".atlas-loading-essential") && styles.includes("min-height: 188px") && styles.includes(".atlas-loading-summary") && styles.includes("min-height: 144px") && styles.includes(".atlas-loading-detail") && styles.includes("min-height: 420px")],
  ["Entrada visual respeita movimento reduzido", styles.includes("@keyframes atlas-loading-reveal") && styles.includes(".atlas-loading-stage,") && config.accessibility.reducedMotionRespected === true],
  ["Shell e ação contextual permanecem fora do fallback", crmLayout.includes("<AppShell>{children}</AppShell>") && appShell.includes("<Topbar") && appShell.includes("{children}") && topbar.includes("<AtlasActionLink") && config.progressiveContract.persistentTopbarActionAvailable === true],
  ["Navegação mantém retorno imediato", appShell.includes("<NavigationPerformance") && navigationPerformance.includes('role="status"') && config.progressiveContract.routeFeedbackAvailable === true],
  ["Linha de base de sinais de carregamento permanece coberta", pagesWithClientLoadSignals >= config.structuralBaseline.pagesWithClientLoadSignals && pagesWithLocalFeedbackSignals >= config.structuralBaseline.pagesWithLocalFeedbackSignals && sharedLocalLoadingConsumers >= config.structuralBaseline.sharedLocalLoadingConsumers],
  ["Nenhum progresso fictício foi introduzido", !progressiveLoading.includes('role="progressbar"') && !progressiveLoading.includes("aria-valuenow") && config.truthPolicy.fakeProgressRendered === false && config.truthPolicy.inventedLatencyMetricAllowed === false],
  ["Consulta, rota e RBAC permanecem intactos", config.dataFetchingChanged === false && config.routeBehaviorChanged === false && config.safetyPolicy.rbacPreserved === true && config.exitCriteria.routeRemoved === false && config.exitCriteria.permissionChanged === false],
  ["Relatório registra cobertura, limite e próxima fase", report.includes("100 páginas") && report.includes("76 páginas") && report.includes("não converteu") && report.includes("Fase 030")],
  ["Gate de homologação não foi contornado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 029 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 029 aprovada: shell persistente, três prioridades de carregamento, geometria estável e estados locais sem anúncios repetidos.");
