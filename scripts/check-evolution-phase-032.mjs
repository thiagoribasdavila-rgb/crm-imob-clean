import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-032-navigation-desktop-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseThirtyOne = JSON.parse(fs.readFileSync("config/evolution-phase-031-navigation-failure-recovery.json", "utf8"));
const phaseTwelve = JSON.parse(fs.readFileSync("config/evolution-phase-012-desktop-canvas.json", "utf8"));
const appShell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const shellTypes = fs.readFileSync("components/atlas/shell-types.ts", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_032_NAVIGATION_DESKTOP_WORKSPACE.md", "utf8");

const compactSelectors = [
  ".atlas-app-main",
  ".atlas-page-header",
  ".atlas-card-header",
  ".atlas-metric",
  "th,",
  ".atlas-state",
];

const checks = [
  ["Fase 032 concluída sem mutação comercial", config.status === "completed" && config.productionDataModified === false && config.dataFetchingChanged === false],
  ["Fase anterior encaminha para desktop", phaseThirtyOne.status === "completed" && phaseThirtyOne.nextPhase.phase === 32],
  ["Canvas amplo da Fase 012 foi preservado", phaseTwelve.status === "completed" && config.desktopContract.contentMaxPx === 1728 && config.desktopContract.comfortableModePreservesPhaseTwelveBaseline === true],
  ["Densidade usa tipo fechado", shellTypes.includes('export type DesktopDensity = "compact" | "comfortable"')],
  ["Modo compacto é padrão e preferência é validada", appShell.includes('useState<DesktopDensity>("compact")') && appShell.includes('const DESKTOP_DENSITY_KEY = "atlas:desktop-density"') && appShell.includes('savedDensity === "compact" || savedDensity === "comfortable"')],
  ["Escolha persiste sem efeito colateral no atualizador", appShell.includes('const next = desktopDensity === "compact" ? "comfortable" : "compact"') && appShell.includes("setDesktopDensity(next)") && appShell.includes("window.localStorage.setItem(DESKTOP_DENSITY_KEY, next)")],
  ["Shell expõe densidade e workspace adaptativo", appShell.includes("data-desktop-density={desktopDensity}") && appShell.includes('data-desktop-layout="adaptive-wide-workspace"')],
  ["Topbar oferece botão semântico e estado acessível", topbar.includes('className="atlas-desktop-density-toggle"') && topbar.includes('aria-pressed={desktopDensity === "compact"}') && topbar.includes("onToggleDesktopDensity")],
  ["Controle existe somente no desktop amplo", styles.includes("@media (min-width: 1180px)") && styles.includes(".atlas-desktop-density-toggle") && config.desktopContract.minimumViewportPx === 1180],
  ["Seis superfícies compartilhadas são compactadas", compactSelectors.every((selector) => styles.includes(selector)) && config.structuralBaseline.compactSharedSurfaces === 6],
  ["Workspace usa container e gutter estável", styles.includes("container-name: atlas-workspace") && styles.includes("scrollbar-gutter: stable") && config.structuralBaseline.wideWorkspaceContainerEnabled === true],
  ["Tablet e celular permanecem isolados", config.desktopContract.tabletAndMobileUnaffected === true && config.exitCriteria.tabletRulesChanged === false && config.exitCriteria.mobileRulesChanged === false],
  ["Compactação não vira produtividade inventada", config.structuralBaseline.runtimeScrollReductionMeasured === false && config.truthPolicy.structuralCompactionPresentedAsRuntimeOutcome === false && config.truthPolicy.fakeBehaviorMetricPublished === false],
  ["Relatório registra escolha, limite e próxima fase", report.includes("dois níveis de densidade") && report.includes("1.180 pixels") && report.includes("Fase 033")],
  ["Rotas, RBAC e gate de homologação permanecem intactos", config.routeBehaviorChanged === false && config.safetyPolicy.rbacPreserved === true && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 032 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 032 aprovada: desktop amplo com densidade compacta ou confortável, preferência local e seis superfícies compartilhadas.");
