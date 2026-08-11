import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import vm from "node:vm";
import {
  legacyComponentPaths,
  legacyRoutePaths,
} from "./legacy-route-paths.mjs";

const root = process.cwd();
const outputPath = "docs/evidence/V3000_PHASE_03_NAVIGATION_CONTRACT.json";
const removedAliases = [
  {
    concept: "agentes-especializados",
    source: "/agents",
    formerDestination: "/atlas-v3/agents",
    reason: "source-and-destination-quarantined",
  },
  {
    concept: "inteligencia-operacional",
    source: "/ai-insights",
    formerDestination: "/intelligence",
    reason: "source-and-destination-quarantined",
  },
  {
    concept: "automacoes",
    source: "/automation",
    formerDestination: "/automations",
    reason: "source-and-destination-quarantined",
  },
];

function trackedFiles(directory) {
  return execFileSync("git", ["ls-files", "-z", directory], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .sort();
}

function matchesQuarantine(file, paths) {
  return paths.some((path) => file === path || file.startsWith(`${path}/`));
}

function isQuarantined(file) {
  return matchesQuarantine(file, legacyRoutePaths) ||
    matchesQuarantine(file, legacyComponentPaths);
}

function visibleSegment(segment) {
  if (/^\([^)]*\)$/.test(segment) || segment.startsWith("@")) return null;
  return segment.replace(/^(?:\(\.\.\.\)|\(\.\.\)|\(\.\))+/, "");
}

function routeFromPage(file) {
  const segments = file.replace(/^app\//, "").split("/").slice(0, -1);
  if (segments.some((segment) => segment.startsWith("_"))) return null;
  return `/${segments.map(visibleSegment).filter(Boolean).join("/")}`
    .replace(/\/+$/, "") || "/";
}

function compileTypescriptModule(path) {
  const source = readFileSync(resolve(root, path), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} };
  const context = vm.createContext({
    module: compiledModule,
    exports: compiledModule.exports,
  });
  vm.runInContext(compiled, context, { filename: `${path}.compiled.cjs` });
  return compiledModule.exports;
}

function normalizeHref(href) {
  return href.split("?")[0].split("#")[0] || "/";
}

function governedNavigation() {
  const navigation = compileTypescriptModule("lib/atlas/navigation.ts");
  const destinations = new Map();
  const add = (href, surface, label) => {
    if (!href || href === "*") return;
    const path = normalizeHref(href);
    destinations.set(path, [
      ...(destinations.get(path) || []),
      { surface, label },
    ]);
  };
  for (const item of navigation.atlasNavigation) add(item.href, "canonical", item.label);
  for (const item of navigation.atlasContextCommands) add(item.href, "contextual", item.label);
  for (const item of navigation.atlasTaskActions) {
    add(item.contextHref, "task-context", item.label);
    add(item.href, "task-destination", item.label);
  }
  return destinations;
}

function readAliases() {
  return JSON.parse(
    readFileSync(resolve(root, "config/atlas-route-aliases.json"), "utf8"),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function literalReferences(file, paths) {
  const source = readFileSync(resolve(root, file), "utf8");
  return paths.filter((path) =>
    new RegExp(`["'\`]${escapeRegExp(path)}(?:[?#][^"'\`]*)?["'\`]`).test(source),
  );
}

function findChainsAndCycles(aliases) {
  const destinationBySource = new Map(
    aliases.map(({ source, destination }) => [source, destination]),
  );
  const chains = aliases
    .filter(({ destination }) => destinationBySource.has(destination))
    .map(({ source, destination }) => ({
      source,
      via: destination,
      destination: destinationBySource.get(destination),
    }));
  const cycles = [];
  for (const { source } of aliases) {
    const seen = new Set();
    let current = source;
    while (destinationBySource.has(current)) {
      if (seen.has(current)) {
        cycles.push([...seen, current]);
        break;
      }
      seen.add(current);
      current = destinationBySource.get(current);
    }
  }
  return { chains, cycles };
}

const pageFiles = trackedFiles("app")
  .filter((file) => /(^|\/)page\.(ts|tsx|js|jsx)$/.test(file));
const activePageEntries = pageFiles
  .filter((file) => !isQuarantined(file))
  .map((file) => ({ file, route: routeFromPage(file) }))
  .filter((entry) => entry.route);
const activePageRoutes = new Set(activePageEntries.map((entry) => entry.route));
const navigation = governedNavigation();
const aliases = readAliases();
const sources = aliases.map(({ source }) => source);
const destinations = aliases.map(({ destination }) => destination);
const duplicateSources = sources.filter((source, index) => sources.indexOf(source) !== index);
const duplicateDestinations = destinations.filter(
  (destination, index) => destinations.indexOf(destination) !== index,
);
const invalidAliases = aliases.filter(({ source, destination, permanent }) =>
  source === destination ||
  activePageRoutes.has(source) ||
  !activePageRoutes.has(destination) ||
  permanent !== true,
);
const { chains, cycles } = findChainsAndCycles(aliases);

const sourceFiles = ["app", "components", "lib"]
  .flatMap(trackedFiles)
  .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file))
  .filter((file) => !isQuarantined(file));
const activeLegacyReferences = sourceFiles
  .map((file) => ({ file, paths: literalReferences(file, sources) }))
  .filter(({ paths }) => paths.length > 0);

const proxySource = readFileSync(resolve(root, "proxy.ts"), "utf8");
const proxyAliasReferences = sources.filter((path) => proxySource.includes(path));
const nextConfigSource = readFileSync(resolve(root, "next.config.ts"), "utf8");
const activeTsconfig = JSON.parse(
  readFileSync(resolve(root, "tsconfig.active.json"), "utf8"),
);
const activeTypecheckIncludes = activeTsconfig.include || [];
const generatedRouteTypeIncludes = activeTypecheckIncludes.filter((entry) =>
  entry.startsWith(".next/"),
);
const inactiveNavigation = [...navigation.entries()]
  .filter(([path]) => !activePageRoutes.has(path))
  .map(([path, surfaces]) => ({ path, surfaces }));
const canonicalDestinations = [...navigation.entries()]
  .filter(([, surfaces]) => surfaces.some(({ surface }) => surface === "canonical"));
const removedAliasSourcesStillGoverned = removedAliases
  .filter(({ source }) => sources.includes(source))
  .map(({ source }) => source);

const evidence = {
  schemaVersion: 1,
  scope: "v3000-canonical-navigation-and-static-compatibility-redirects",
  sourceOfTruth: {
    navigation: "lib/atlas/navigation.ts",
    redirects: "config/atlas-route-aliases.json",
    nextConfig: "next.config.ts",
    sessionBoundary: "proxy.ts",
    activeTypecheck: "tsconfig.active.json",
    quarantine: "scripts/legacy-route-paths.mjs",
  },
  summary: {
    activePageRoutes: activePageRoutes.size,
    canonicalMenuDestinations: canonicalDestinations.length,
    governedDestinations: navigation.size,
    inactiveGovernedDestinations: inactiveNavigation.length,
    compatibilityRedirects: aliases.length,
    invalidRedirects: invalidAliases.length,
    duplicateSources: duplicateSources.length,
    duplicateDestinations: duplicateDestinations.length,
    redirectChains: chains.length,
    redirectCycles: cycles.length,
    activeLegacyReferences: activeLegacyReferences.length,
    proxyAliasReferences: proxyAliasReferences.length,
    removedInactiveAliases: removedAliases.length,
    removedAliasesStillGoverned: removedAliasSourcesStillGoverned.length,
  },
  contract: {
    nextConfigImportsRedirectContract:
      nextConfigSource.includes('from "./config/atlas-route-aliases.json"'),
    nextConfigExposesRedirects: /async\s+redirects\s*\(/.test(nextConfigSource),
    proxyReservedForConditionalAccess: proxyAliasReferences.length === 0,
    activeTypecheckExcludesGeneratedQuarantineRegistry:
      generatedRouteTypeIncludes.length === 0,
  },
  navigation: [...navigation.entries()]
    .map(([path, surfaces]) => ({
      path,
      active: activePageRoutes.has(path),
      surfaces,
    }))
    .sort((a, b) => a.path.localeCompare(b.path)),
  redirects: aliases.map((alias) => ({
    ...alias,
    sourceIsActivePage: activePageRoutes.has(alias.source),
    destinationIsActivePage: activePageRoutes.has(alias.destination),
  })),
  removedAliases,
  findings: {
    inactiveNavigation,
    invalidAliases,
    duplicateSources: [...new Set(duplicateSources)],
    duplicateDestinations: [...new Set(duplicateDestinations)],
    chains,
    cycles,
    activeLegacyReferences,
    proxyAliasReferences,
    generatedRouteTypeIncludes,
    removedAliasSourcesStillGoverned,
  },
  privacy: {
    readsApplicationData: false,
    readsEnvironmentSecrets: false,
    capturesPersonalData: false,
  },
};

const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (process.argv.includes("--write")) {
  const absoluteOutput = resolve(root, outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, serialized);
  console.log(
    `Contrato de navegação V3000 gravado: ${outputPath} (${aliases.length} redirects, ${navigation.size} destinos governados).`,
  );
} else {
  process.stdout.write(serialized);
}
