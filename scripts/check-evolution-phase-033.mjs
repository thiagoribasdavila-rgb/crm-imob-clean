import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-033-navigation-tablet-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseThirtyTwo = JSON.parse(fs.readFileSync("config/evolution-phase-032-navigation-desktop-workspace.json", "utf8"));
const phaseThirteen = JSON.parse(fs.readFileSync("config/evolution-phase-013-tablet-workspace.json", "utf8"));
const appShell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const mobileDock = fs.readFileSync("components/atlas/mobile-dock.tsx", "utf8");
const tokens = fs.readFileSync("styles/atlas-tokens.css", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_033_NAVIGATION_TABLET_WORKSPACE.md", "utf8");

const checks = [
  ["Fase 033 concluída sem mutação comercial", config.status === "completed" && config.productionDataModified === false && config.dataFetchingChanged === false],
  ["Fase anterior encaminha para tablet", phaseThirtyTwo.status === "completed" && phaseThirtyTwo.nextPhase.phase === 33],
  ["Base da Fase 013 foi preservada", phaseThirteen.status === "completed" && config.phaseThirteenBaseline.preserved === true && config.phaseThirteenBaseline.sidebarMaxWidthPx === 320],
  ["Contrato de tablet alcança o início do desktop amplo", config.tabletContract.minimumViewportPx === 768 && config.tabletContract.maximumViewportPx === 1179 && config.tabletContract.desktopStartsAtPx === 1180],
  ["Shell publica o workspace intermediário", appShell.includes('data-tablet-layout="adaptive-overlay-workspace"')],
  ["Tokens fluidos governam gutter e dock", tokens.includes("--atlas-tablet-gutter: clamp(18px, 3vw, 28px)") && tokens.includes("--atlas-tablet-dock-max: 680px")],
  ["Regra exclusiva cobre 768 a 1179", styles.includes("@media (min-width: 768px) and (max-width: 1179px)") && styles.includes('data-tablet-layout="adaptive-overlay-workspace"')],
  ["Sidebar vira painel sobreposto em tablet grande", styles.includes("transform: translateX(-100%)") && styles.includes('.atlas-sidebar[data-mobile-open="true"]') && styles.includes("transform: translateX(0)") && config.structuralBaseline.largeTabletDesktopSidebarReservationRemoved === true],
  ["Menu aparece e controle de desktop some", styles.includes(".atlas-sidebar-close,") && styles.includes(".atlas-mobile-menu") && styles.includes(".atlas-sidebar-toggle") && config.tabletContract.desktopDensityControlVisible === false],
  ["Workspace deixa de reservar a sidebar", styles.includes("margin-left: 0") && styles.includes("left: 0") && styles.includes("container-name: atlas-tablet-workspace")],
  ["Dock permanece central e governado", styles.includes("var(--atlas-tablet-dock-max)") && styles.includes("transform: translateX(-50%)") && mobileDock.includes('aria-label="Ações rápidas"') && mobileDock.includes("aria-current={active ? \"page\" : undefined}")],
  ["Topbar preserva ações críticas", topbar.includes("taskAction.href") && topbar.includes('aria-label="Buscar em toda a plataforma"') && topbar.includes('aria-label="Notificações"') && topbar.includes('aria-label="Abrir meu perfil"') && topbar.includes("signOut")],
  ["Tablet estreito compacta apenas pistas visuais", styles.includes("@media (min-width: 768px) and (max-width: 899px)") && styles.includes(".atlas-command-trigger kbd") && config.topbarContract.narrowKeyboardHintHidden === true && config.exitCriteria.commercialActionsRemoved === false],
  ["Drawer preserva foco, Escape e fundo bloqueado", sidebar.includes('event.key === "Escape"') && sidebar.includes('event.key !== "Tab"') && sidebar.includes('document.body.style.overflow = "hidden"') && sidebar.includes("previousFocus?.focus()")],
  ["Tablet não inventa ganho de uso", config.structuralBaseline.runtimeNavigationGainMeasured === false && config.truthPolicy.responsiveCoveragePresentedAsMeasuredUsage === false && config.truthPolicy.fakeBehaviorMetricPublished === false],
  ["Relatório registra faixa, limite e próxima fase", report.includes("1.179 pixels") && report.includes("sidebar deixa de reservar espaço") && report.includes("Fase 034")],
  ["Celular, desktop amplo, RBAC e gate permanecem intactos", config.exitCriteria.mobileRulesChanged === false && config.exitCriteria.desktopWideRulesChanged === false && config.safetyPolicy.rbacPreserved === true && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 033 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 033 aprovada: tablets de 768 a 1179 pixels usam navegação sobreposta, dock governado e workspace intermediário sem reservar a sidebar.");
