import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-034-navigation-mobile-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseThirtyThree = JSON.parse(fs.readFileSync("config/evolution-phase-033-navigation-tablet-workspace.json", "utf8"));
const phaseFourteen = JSON.parse(fs.readFileSync("config/evolution-phase-014-mobile-touch.json", "utf8"));
const appShell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const mobileDock = fs.readFileSync("components/atlas/mobile-dock.tsx", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const tokens = fs.readFileSync("styles/atlas-tokens.css", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_034_NAVIGATION_MOBILE_WORKSPACE.md", "utf8");

const checks = [
  ["Fase 034 concluída sem mutação comercial", config.status === "completed" && config.productionDataModified === false && config.dataFetchingChanged === false],
  ["Fase anterior encaminha para mobile", phaseThirtyThree.status === "completed" && phaseThirtyThree.nextPhase.phase === 34],
  ["Base touch-first da Fase 014 permanece", phaseFourteen.status === "completed" && config.phaseFourteenBaseline.preserved === true && config.phaseFourteenBaseline.formFontSizePx === 16],
  ["Shell publica o contrato thumb-first", appShell.includes('data-mobile-layout="thumb-first"') && config.mobileContract.maximumViewportPx === 767],
  ["Tokens móveis governam margem e alvos", tokens.includes("--atlas-mobile-edge: clamp(10px, 3.2vw, 14px)") && tokens.includes("--atlas-mobile-dock-action: 50px") && tokens.includes("--atlas-mobile-primary-action: 58px")],
  ["Ação contextual reutiliza fonte governada", mobileDock.includes("getAtlasTaskActionForPathname") && mobileDock.includes("contextualAction") && navigation.includes("getAtlasTaskActionForPathname")],
  ["Fallback evita duplicidade e mantém Novo lead", mobileDock.includes("!items.some((item) => item.href === contextualAction.href)") && mobileDock.includes('label: "Novo lead"') && mobileDock.includes('href: "/leads/new"')],
  ["Dock distribui dois destinos, ação e dois destinos", mobileDock.includes("items.slice(0, 2)") && mobileDock.includes("items.slice(2)") && mobileDock.includes('data-primary="true"') && config.mobileContract.contextualActionPosition === 3],
  ["Ação central possui nome acessível completo", mobileDock.includes('aria-label={`Ação rápida: ${primaryAction.label}`}') && mobileDock.includes("title={primaryAction.label}")],
  ["Destinos continuam semânticos e identificam o atual", mobileDock.includes("<nav") && mobileDock.includes("<Link") && mobileDock.includes("aria-current={active ? \"page\" : undefined}")],
  ["Topbar remove somente a ação duplicada", styles.includes('[data-mobile-layout="thumb-first"] .atlas-quick-create') && styles.includes("display: none") && topbar.includes('className="atlas-mobile-search"') && topbar.includes('aria-label="Abrir meu perfil"')],
  ["Dock e área segura protegem a zona de toque", styles.includes("padding-bottom: calc(104px + env(safe-area-inset-bottom))") && styles.includes("min-height: var(--atlas-mobile-dock-action)") && styles.includes("min-height: var(--atlas-mobile-primary-action)")],
  ["Ações frequentes evitam atraso de toque", styles.includes("touch-action: manipulation") && styles.includes("-webkit-tap-highlight-color: transparent")],
  ["Celulares estreitos mantêm rótulos", styles.includes("@media (max-width: 374px)") && styles.includes(".atlas-mobile-dock-action small") && config.mobileContract.primaryActionMaximumLabelPx === 64],
  ["Implementação React não cria estado ou efeito", !mobileDock.includes("useState") && !mobileDock.includes("useEffect") && config.structuralBaseline.newStateOrEffectAdded === false],
  ["Melhoria estrutural não vira conversão inventada", config.structuralBaseline.runtimeOneHandSuccessMeasured === false && config.truthPolicy.structuralReachabilityPresentedAsMeasuredConversion === false && config.truthPolicy.fakeBehaviorMetricPublished === false],
  ["Relatório registra alcance, limite e próxima fase", report.includes("ao alcance do polegar") && report.includes("58 pixels") && report.includes("Fase 035")],
  ["Tablet, desktop, RBAC e gate permanecem intactos", config.exitCriteria.tabletRulesChanged === false && config.exitCriteria.desktopRulesChanged === false && config.safetyPolicy.rbacPreserved === true && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 034 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 034 aprovada: dock móvel com quatro destinos governados, ação contextual central e topbar sem ação duplicada.");
