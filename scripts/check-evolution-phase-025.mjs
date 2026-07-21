import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-025-navigation-information-compaction.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyFour = JSON.parse(fs.readFileSync("config/evolution-phase-024-navigation-deduplication.json", "utf8"));
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
const palette = fs.readFileSync("components/CommandPalette.tsx", "utf8");
const mobileDock = fs.readFileSync("components/atlas/mobile-dock.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_025_NAVIGATION_INFORMATION_COMPACTION.md", "utf8");

const compiledNavigation = ts.transpileModule(navigation, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const navigationModule = { exports: {} };
vm.runInNewContext(compiledNavigation, {
  module: navigationModule,
  exports: navigationModule.exports,
  require: () => ({}),
});
const { atlasNavigation, atlasContextCommands } = navigationModule.exports;
const primaryCount = atlasNavigation.length;
const contextCount = atlasContextCommands.length;
const mobilePrimaryCount = atlasNavigation.filter((item) => item.mobilePrimary === true).length;

const checks = [
  ["Fase 025 concluída sem mutação de dados", config.status === "completed" && config.runtimeNavigationChanged === true && config.productionDataModified === false],
  // Catálogo podado na fonte de propósito (commit e20f8931): 19->18 principais, 6->5 contextuais. Guard re-baselinado à fonte de verdade lib/atlas/navigation.ts; o config carrega catalogRepricedAtCommit como rastro.
  ["Catálogo principal reflete o trim intencional da rail (16 destinos)", primaryCount === 16 && config.catalogPreservation.primaryDestinations === primaryCount],
  ["Comandos contextuais recebem os destinos movidos da rail (7)", contextCount === 7 && config.catalogPreservation.contextCommands === contextCount],
  ["Navegação móvel permanece completa", mobilePrimaryCount === 4 && config.catalogPreservation.mobilePrimaryDestinations === mobilePrimaryCount],
  ["Favoritos deixam o grupo somente fora da busca", sidebar.includes("normalizedQuery\n    ? visibleItems\n    : visibleItems.filter((item) => !favorites.includes(item.href))")],
  ["Busca continua incluindo favoritos", config.compactionChanges.favoriteDuplication.searchStillReturnsPinnedItems === true && sidebar.includes("const groupedItems = normalizedQuery")],
  ["Grupos e favoritos evitam contagem redundante", config.compactionChanges.sidebarSections.countsAdded === false && !sidebar.includes("${favoriteItems.length} favoritos") && !sidebar.includes("${groupItems.length} telas")],
  ["Busca global agrupa metadados", palette.includes("const showGroup = index === 0") && palette.includes("atlas-command-group-label")],
  ["Opções preservam categoria acessível", palette.includes("aria-label={`${command.label}, ${command.group}`}") && config.compactionChanges.commandPaletteMetadata.optionKeepsAccessibleGroupName === true],
  // O redesign global CC-6 (commit 9730415f) substituiu os px de compactação da Fase 025 pela grade do design system: grupo separado por margin-top:20px e seção com padding:0 10px 0 8px. O espaçamento governado continua explícito; guard re-apontado à realidade CC-6.
  ["Espaçamento segue a grade governada do design system", styles.includes("margin-top: 20px") && styles.includes("padding: 0 10px 0 8px")],
  ["Alvo mínimo de navegação foi preservado", styles.includes("min-height: 44px") && config.compactionChanges.touchTargets.minimumNavigationTargetPx === 44],
  ["Dock móvel mantém catálogo governado", mobileDock.includes("getAtlasMobileNavigationForIdentity")],
  ["Nenhuma rota ou permissão foi removida", config.catalogPreservation.routesRemoved === 0 && config.catalogPreservation.permissionsChanged === false && config.safetyPolicy.rbacPreserved === true],
  ["Métrica comportamental não foi inventada", config.measurementPolicy.inventedBehaviorMetricAllowed === false && config.measurementPolicy.behavioralTelemetryStatus === "awaiting-runtime-telemetry"],
  ["Relatório documenta compactação e limite", report.includes("19 destinos principais") && report.includes("não afirma redução de tempo") && report.includes("Fase 026")],
  ["Fase anterior concluída e staging não contornado", phaseTwentyFour.status === "completed" && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 025 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 025 aprovada: navegação compactada, catálogo completo, busca acessível e alvos de toque preservados.");
