import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-025-navigation-information-compaction.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyFour = JSON.parse(fs.readFileSync("config/evolution-phase-024-navigation-deduplication.json", "utf8"));
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const palette = fs.readFileSync("components/CommandPalette.tsx", "utf8");
const mobileDock = fs.readFileSync("components/atlas/mobile-dock.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_025_NAVIGATION_INFORMATION_COMPACTION.md", "utf8");

const navigationBlock = navigation.split("export const atlasNavigation = [")[1]?.split("] as const satisfies")[0] ?? "";
const contextBlock = navigation.split("export const atlasContextCommands = [")[1]?.split("] as const;")[0] ?? "";
const primaryCount = (navigationBlock.match(/href:/g) || []).length;
const contextCount = (contextBlock.match(/href:/g) || []).length;
const mobilePrimaryCount = (navigationBlock.match(/mobilePrimary: true/g) || []).length;

const checks = [
  ["Fase 025 concluída sem mutação de dados", config.status === "completed" && config.runtimeNavigationChanged === true && config.productionDataModified === false],
  ["Catálogo principal permanece completo", primaryCount === 20 && config.catalogPreservation.primaryDestinations === primaryCount],
  ["Comandos contextuais permanecem completos", contextCount === 6 && config.catalogPreservation.contextCommands === contextCount],
  ["Navegação móvel permanece completa", mobilePrimaryCount === 4 && config.catalogPreservation.mobilePrimaryDestinations === mobilePrimaryCount],
  ["Favoritos deixam o grupo somente fora da busca", sidebar.includes("normalizedQuery\n    ? visibleItems\n    : visibleItems.filter((item) => !favorites.includes(item.href))")],
  ["Busca continua incluindo favoritos", config.compactionChanges.favoriteDuplication.searchStillReturnsPinnedItems === true && sidebar.includes("const groupedItems = normalizedQuery")],
  ["Grupos e favoritos exibem contagem", sidebar.includes("${favoriteItems.length} favoritos") && sidebar.includes("${groupItems.length} telas")],
  ["Busca global agrupa metadados", palette.includes("const showGroup = index === 0") && palette.includes("atlas-command-group-label")],
  ["Opções preservam categoria acessível", palette.includes("aria-label={`${command.label}, ${command.group}`}") && config.compactionChanges.commandPaletteMetadata.optionKeepsAccessibleGroupName === true],
  ["Espaçamento foi compactado conforme contrato", styles.includes("margin-top: 13px") && styles.includes("padding-top: 10px")],
  ["Alvo mínimo de navegação foi preservado", styles.includes("min-height: 44px") && config.compactionChanges.touchTargets.minimumNavigationTargetPx === 44],
  ["Dock móvel mantém catálogo governado", mobileDock.includes("getAtlasMobileNavigationForIdentity")],
  ["Nenhuma rota ou permissão foi removida", config.catalogPreservation.routesRemoved === 0 && config.catalogPreservation.permissionsChanged === false && config.safetyPolicy.rbacPreserved === true],
  ["Métrica comportamental não foi inventada", config.measurementPolicy.inventedBehaviorMetricAllowed === false && config.measurementPolicy.behavioralTelemetryStatus === "awaiting-runtime-telemetry"],
  ["Relatório documenta compactação e limite", report.includes("20 destinos principais") && report.includes("não afirma redução de tempo") && report.includes("Fase 026")],
  ["Fase anterior concluída e staging não contornado", phaseTwentyFour.status === "completed" && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 025 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 025 aprovada: navegação compactada, catálogo completo, busca acessível e alvos de toque preservados.");
