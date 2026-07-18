import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-026-navigation-visual-hierarchy.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyFive = JSON.parse(fs.readFileSync("config/evolution-phase-025-navigation-information-compaction.json", "utf8"));
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_026_NAVIGATION_VISUAL_HIERARCHY.md", "utf8");

const navigationBlock = navigation.split("export const atlasNavigation = [")[1]?.split("] as const satisfies")[0] ?? "";
const contextBlock = navigation.split("export const atlasContextCommands = [")[1]?.split("] as const;")[0] ?? "";
const primaryCount = (navigationBlock.match(/href:/g) || []).length;
const contextCount = (contextBlock.match(/href:/g) || []).length;
const mobilePrimaryCount = (navigationBlock.match(/mobilePrimary: true/g) || []).length;

const checks = [
  ["Fase 026 concluída sem mutação de dados", config.status === "completed" && config.runtimeNavigationChanged === true && config.productionDataModified === false],
  ["Compactação anterior permanece concluída", phaseTwentyFive.status === "completed" && phaseTwentyFive.exitCriteria.favoriteItemsAreNotRepeatedWhileBrowsing === true],
  ["Contexto usa destinos principais e contextuais", navigation.includes("export function getAtlasNavigationContext") && navigation.includes("...atlasNavigation.map") && navigation.includes("...atlasContextCommands.map")],
  ["Rota mais específica prevalece", navigation.includes(".sort((left, right) => right.href.length - left.href.length)") && config.contextResolution.longestMatchingDestinationWins === true],
  ["Topbar usa a fonte governada", topbar.includes("getAtlasNavigationContext(pathname)") && !topbar.includes("const sectionLabels")],
  ["Topbar expõe grupo e destino atual", topbar.includes("currentGroup") && topbar.includes("currentSection") && topbar.includes("Local atual:")],
  ["Grupos usam estrutura semântica", sidebar.includes('<section className="atlas-nav-group') && sidebar.includes("aria-labelledby={groupHeadingId}") && sidebar.includes("<h2 id={groupHeadingId}")],
  ["Favoritos usam estrutura semântica", sidebar.includes('aria-labelledby="atlas-nav-favorites-heading"') && sidebar.includes('<h2 id="atlas-nav-favorites-heading"')],
  ["Destino ativo é explícito e acessível", sidebar.includes('aria-current={active ? "page"') && sidebar.includes('aria-hidden="true">Atual</span>')],
  ["Menu recolhido preserva nome acessível", sidebar.includes("aria-label={collapsed ? item.label : undefined}") && config.semanticNavigation.collapsedLinksKeepAccessibleName === true],
  ["Grupo atual recebe marcador visual", styles.includes('.atlas-nav-group[data-current="true"] > .atlas-sidebar-section') && config.visualPriority.currentGroupIsMarked === true],
  ["Ícones possuem prioridade visual distinta", styles.includes("color: #64748b") && styles.includes('.atlas-nav-link[data-active="true"] .atlas-nav-icon')],
  ["Topbar prioriza destino sobre contexto", styles.includes(".atlas-topbar-location") && styles.includes("font-size: 13px") && styles.includes(".atlas-topbar-context strong")],
  ["Ações interativas preservam 44 pixels", styles.includes("width: 44px") && styles.includes("height: 44px") && styles.includes("min-height: 44px") && config.interactionTargets.favoriteActionMinimumPx === 44],
  ["Menu recolhido recentraliza o destino", styles.includes('.atlas-app-shell[data-sidebar-collapsed="true"] .atlas-nav-item .atlas-nav-link') && styles.includes("padding-inline: 10px")],
  ["Catálogo e RBAC permanecem íntegros", primaryCount === 20 && contextCount === 6 && mobilePrimaryCount === 4 && config.catalogPreservation.routesRemoved === 0 && config.catalogPreservation.permissionsChanged === false && config.safetyPolicy.rbacPreserved === true],
  ["Métrica comportamental não foi inventada", config.measurementPolicy.inventedBehaviorMetricAllowed === false && config.measurementPolicy.behavioralTelemetryStatus === "awaiting-runtime-telemetry"],
  ["Relatório documenta fonte, semântica e limite", report.includes("lista paralela") && report.includes("aria-labelledby") && report.includes("não afirma melhora de tempo") && report.includes("Fase 027")],
  ["Staging continua bloqueado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 026 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 026 aprovada: contexto governado, grupos semânticos e estado atual inequívoco em todos os modos da navegação.");
