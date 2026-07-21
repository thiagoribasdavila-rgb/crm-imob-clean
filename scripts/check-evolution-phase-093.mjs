import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const previous = json("config/evolution-phase-092-atlas-core-v2-visual-primitives.json");
const phase = json("config/evolution-phase-093-canonical-surface-navigation.json");
const program = json("config/evolution-program-3000.json");
const surfaces = json("config/atlas-core-v2-route-surfaces.json");
const contracts = json("config/atlas-core-v2-contracts.json");
const navigation = read("lib/atlas/navigation.ts");
const registry = read("lib/atlas/core-v2/page-registry.ts");
const sidebar = read("components/atlas/sidebar.tsx");
const mobileDock = read("components/atlas/mobile-dock.tsx");
const report = read("docs/EVOLUTION_PHASE_093_CANONICAL_SURFACE_NAVIGATION.md");

const pageFiles = walk("app")
  .filter((file) => file.endsWith(`${path.sep}page.tsx`) || file === "app/page.tsx")
  .map((file) => file.split(path.sep).join("/"))
  .sort();

const startsWithAny = (file, prefixes) => prefixes.some((prefix) => file.startsWith(prefix));

function classify(file) {
  if (surfaces.retiredExactFiles.includes(file) || startsWithAny(file, surfaces.retiredPrefixes)) return "retired";
  if (surfaces.canonicalExactFiles.includes(file)) return "canonical";
  if (startsWithAny(file, surfaces.internalPrefixes)) return "internal";
  if (startsWithAny(file, surfaces.experimentalPrefixes)) return "experimental";
  if (startsWithAny(file, surfaces.contextualPrefixes)) return "contextual";
  return "unclassified";
}

const classification = pageFiles.reduce((counts, file) => {
  const surface = classify(file);
  counts[surface] = (counts[surface] ?? 0) + 1;
  return counts;
}, {});

const primaryNavigationSource = navigation
  .split("export const atlasNavigation = [")[1]
  ?.split("export const atlasInternalNavigation")[0] ?? "";
const internalNavigationSource = navigation
  .split("export const atlasInternalNavigation = [")[1]
  ?.split("export const atlasContextCommands")[0] ?? "";
const canonicalNavigationItems = primaryNavigationSource.match(/surface: "canonical"/g)?.length ?? 0;
const internalNavigationItems = internalNavigationSource.match(/surface: "internal"/g)?.length ?? 0;
const primaryBusinessOutcomes = primaryNavigationSource.match(/businessOutcome:/g)?.length ?? 0;
const primaryActions = primaryNavigationSource.match(/primaryAction:/g)?.length ?? 0;
const primaryDataDomains = primaryNavigationSource.match(/dataDomains:/g)?.length ?? 0;
const requiredModules = contracts.pageRules.requiredModules;
const compatibilitySources = surfaces.compatibilityMap.map((entry) => entry.source);

const checks = [
  ["Fase 92 foi preservada", previous.phase === 92 && previous.status === "completed"],
  ["Fase 93 conclui navegação sem banco ou autenticação", phase.phase === 93 && phase.status === "completed" && phase.databaseSchemaChanged === false && phase.authenticationChanged === false && phase.productionDataModified === false],
  ["Programa contínuo avançou para 93", program.currentPhase >= 93],
  ["Inventário cobre todas as 243 páginas", pageFiles.length === 243 && classification.unclassified === undefined],
  ["Contagens de superfície correspondem à evidência", ["canonical", "contextual", "internal", "experimental", "retired"].every((surface) => classification[surface] === phase.routeInventory[surface])],
  ["Arquivos canônicos existem", surfaces.canonicalExactFiles.every((file) => pageFiles.includes(file))],
  ["Navegação produtiva possui 18 contratos canônicos", canonicalNavigationItems === 18 && phase.navigation.productiveItems === 18],
  ["Evolução V3 permanece interna e fora do menu diário", internalNavigationItems === 0 && !primaryNavigationSource.includes('href: "/atlas-v3"') && navigation.includes("atlasInternalNavigation")],
  ["Cada item visível declara resultado, ação e dados", canonicalNavigationItems === primaryBusinessOutcomes && canonicalNavigationItems === primaryActions && canonicalNavigationItems === primaryDataDomains],
  ["Contratos profundos cobrem os 19 módulos produtivos", requiredModules.length === 19 && requiredModules.every((id) => registry.includes(`id: "${id}"`))],
  ["Busca lateral entende intenção comercial", sidebar.includes("item.keywords") && sidebar.includes("item.businessOutcome")],
  ["Catálogos legados e contadores por grupo saíram do shell", !sidebar.includes("legacy catalog removed") && !mobileDock.includes("legacy catalog removed") && !sidebar.includes("groupItems.length} telas")],
  ["Compatibilidade explícita cobre aliases críticos", ["/kanban", "/pipedrive", "/atlas-v2", "/crm", "/analytics"].every((route) => compatibilitySources.includes(route))],
  ["Nenhuma rota foi removida ou forçada a redirecionar", phase.compatibility.routesDeleted === 0 && phase.compatibility.redirectsForced === 0 && surfaces.productionNavigationPolicy.internalRoutesRemainAddressable === true],
  ["Relatório cobre problema, mudanças, impacto e riscos", report.includes("Problema resolvido") && report.includes("Alterações realizadas") && report.includes("Impacto operacional") && report.includes("Riscos identificados")],
  ["Build e ZIP continuam reservados à fase 100", phase.release.buildExecuted === false && phase.release.zipCreated === false && phase.release.checkpointPhase === 100],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Fase 093 verificada: ${pageFiles.length} páginas classificadas, ${canonicalNavigationItems} módulos produtivos e zero rota sem superfície.`);
