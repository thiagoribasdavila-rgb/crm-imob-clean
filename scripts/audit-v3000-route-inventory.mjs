import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import vm from "node:vm";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const root = process.cwd();
const outputPath = "docs/evidence/V3000_PHASE_02_ROUTE_INVENTORY.json";
const routeFilePattern = /(^|\/)(page|route)\.(ts|tsx|js|jsx)$/;
const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function trackedFiles(directory) {
  return execFileSync("git", ["ls-files", "-z", directory], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .sort();
}

function isQuarantined(file) {
  return legacyRoutePaths.some(
    (legacyPath) => file === legacyPath || file.startsWith(`${legacyPath}/`),
  );
}

function visibleSegment(segment) {
  if (/^\([^)]*\)$/.test(segment) || segment.startsWith("@")) return null;
  return segment.replace(/^(?:\(\.\.\.\)|\(\.\.\)|\(\.\))+/, "");
}

function routeFromFile(file) {
  const directorySegments = file.replace(/^app\//, "").split("/").slice(0, -1);
  const hasPrivateSegment = directorySegments.some((segment) => segment.startsWith("_"));
  const hasInterceptedSegment = directorySegments.some((segment) => /^\(\.{1,3}\)/.test(segment));
  const visibleSegments = directorySegments.map(visibleSegment).filter(Boolean);
  return {
    url: `/${visibleSegments.join("/")}`.replace(/\/+$/, "") || "/",
    routable: !hasPrivateSegment,
    intercepted: hasInterceptedSegment,
  };
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

function navigationSurfaces() {
  const navigation = compileTypescriptModule("lib/atlas/navigation.ts");
  const surfaces = new Map();
  const add = (href, surface, label) => {
    const pathname = href.split("?")[0].split("#")[0] || "/";
    surfaces.set(pathname, [
      ...(surfaces.get(pathname) || []),
      { surface, label },
    ]);
  };
  for (const item of navigation.atlasNavigation) add(item.href, "canonical", item.label);
  for (const item of navigation.atlasContextCommands) add(item.href, "contextual", item.label);
  for (const item of navigation.atlasTaskActions) {
    add(item.contextHref, "task-context", item.label);
    add(item.href, "task-destination", item.label);
  }
  return surfaces;
}

function navigationAliases() {
  return JSON.parse(
    readFileSync(resolve(root, "config/atlas-route-aliases.json"), "utf8"),
  ).map(({ concept, source, destination }) => ({
    concept,
    alias: source,
    canonical: destination,
  }));
}

function directRedirect(source, aliasesBySource) {
  const literal = source.match(/\b(?:redirect|permanentRedirect)\(\s*["'`]([^"'`$]+)["'`]\s*\)/);
  if (literal) return { target: literal[1], mechanism: "server-literal" };
  const alias = source.match(/resolveAtlasNavigationAlias\(\s*["']([^"']+)["']\s*\)/);
  if (alias && aliasesBySource.has(alias[1])) {
    return { target: aliasesBySource.get(alias[1]).canonical, mechanism: "governed-alias" };
  }
  return null;
}

function exportedHttpMethods(source) {
  const methods = new Set();
  for (const method of httpMethods) {
    const declaration = new RegExp(
      `export\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${method}\\b`,
    );
    if (declaration.test(source)) methods.add(method);
  }
  for (const block of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const method of httpMethods) {
      if (new RegExp(`\\b${method}\\b`).test(block[1])) methods.add(method);
    }
  }
  return [...methods].sort((a, b) => httpMethods.indexOf(a) - httpMethods.indexOf(b));
}

function collisionMap(entries, activeOnly) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!entry.routable || (activeOnly && !entry.active)) continue;
    grouped.set(entry.url, [...(grouped.get(entry.url) || []), entry.file]);
  }
  return [...grouped.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([url, files]) => ({ url, files: files.sort() }))
    .sort((a, b) => a.url.localeCompare(b.url));
}

function countBy(entries, key) {
  return Object.fromEntries(
    [...new Set(entries.map((entry) => entry[key]))]
      .sort()
      .map((value) => [value, entries.filter((entry) => entry[key] === value).length]),
  );
}

const aliases = navigationAliases();
const aliasesBySource = new Map(aliases.map((entry) => [entry.alias, entry]));
const surfaces = navigationSurfaces();
const files = trackedFiles("app").filter((file) => routeFilePattern.test(file));

let entries = files.map((file) => {
  const source = readFileSync(resolve(root, file), "utf8");
  const route = routeFromFile(file);
  const type = /(^|\/)page\.(ts|tsx|js|jsx)$/.test(file) ? "page" : "api";
  const quarantined = isQuarantined(file);
  const redirect = type === "page" ? directRedirect(source, aliasesBySource) : null;
  const navigation = surfaces.get(route.url) || [];
  return {
    file,
    url: route.url,
    type,
    active: !quarantined && route.routable,
    quarantined,
    routable: route.routable,
    intercepted: route.intercepted,
    navigation,
    redirect,
    methods: type === "api" ? exportedHttpMethods(source) : [],
    lines: source.split("\n").length,
  };
});

const allCollisions = collisionMap(entries, false);
const activeCollisions = collisionMap(entries, true);
const activeCollisionUrls = new Set(activeCollisions.map((entry) => entry.url));

entries = entries.map((entry) => {
  let disposition = "keep";
  let reason = "active-route";
  if (!entry.routable) {
    disposition = "hide";
    reason = "next-private-segment";
  } else if (entry.quarantined) {
    disposition = "hide";
    reason = "legacy-quarantine";
  } else if (activeCollisionUrls.has(entry.url)) {
    disposition = "review";
    reason = "active-url-collision";
  } else if (entry.redirect) {
    disposition = "redirect";
    reason = entry.redirect.mechanism;
  }
  return { ...entry, disposition, reason };
});

const activePages = entries.filter((entry) => entry.active && entry.type === "page");
const activeApis = entries.filter((entry) => entry.active && entry.type === "api");
const activePageUrls = new Set(activePages.map((entry) => entry.url));

const navigationInventory = [...surfaces.entries()]
  .map(([url, items]) => {
    const pageEntries = entries.filter((entry) => entry.url === url && entry.type === "page");
    return {
      url,
      surfaces: items,
      active: pageEntries.some((entry) => entry.active),
      pages: pageEntries.map((entry) => ({
        file: entry.file,
        active: entry.active,
        disposition: entry.disposition,
      })),
    };
  })
  .sort((a, b) => a.url.localeCompare(b.url));

const aliasInventory = aliases.map((alias) => {
  const sourceEntries = entries.filter((entry) => entry.url === alias.alias && entry.type === "page");
  const targetEntries = entries.filter((entry) => entry.url === alias.canonical && entry.type === "page");
  return {
    ...alias,
    source: sourceEntries.map((entry) => ({ file: entry.file, active: entry.active })),
    target: targetEntries.map((entry) => ({ file: entry.file, active: entry.active })),
    sourceActive: sourceEntries.some((entry) => entry.active),
    targetActive: targetEntries.some((entry) => entry.active),
  };
});

const proxySource = readFileSync(resolve(root, "proxy.ts"), "utf8");
const nextConfigSource = readFileSync(resolve(root, "next.config.ts"), "utf8");
const clientNavigationFiles = trackedFiles("app")
  .concat(trackedFiles("components"), trackedFiles("lib"))
  .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file))
  .filter((file) => /router\.(?:push|replace)\(/.test(readFileSync(resolve(root, file), "utf8")));

const evidence = {
  schemaVersion: 1,
  scope: "tracked-next16-app-router-surface",
  sourceOfTruth: {
    routes: "git ls-files app",
    navigation: "lib/atlas/navigation.ts",
    aliases: "config/atlas-route-aliases.json",
    quarantine: "scripts/legacy-route-paths.mjs",
    requestBoundary: "proxy.ts",
  },
  summary: {
    routeFiles: entries.length,
    pages: entries.filter((entry) => entry.type === "page").length,
    apiRoutes: entries.filter((entry) => entry.type === "api").length,
    activeRouteFiles: entries.filter((entry) => entry.active).length,
    quarantinedRouteFiles: entries.filter((entry) => entry.quarantined).length,
    nonRoutableFiles: entries.filter((entry) => !entry.routable).length,
    activePages: activePages.length,
    activePageUrls: activePageUrls.size,
    activeApis: activeApis.length,
    activeCollisions: activeCollisions.length,
    allSourceCollisions: allCollisions.length,
    directRedirectPages: entries.filter((entry) => entry.redirect).length,
    activeRedirectPages: entries.filter((entry) => entry.active && entry.redirect).length,
    canonicalNavigationDestinations: new Set(
      [...surfaces.entries()]
        .filter(([, items]) => items.some((item) => item.surface === "canonical"))
        .map(([href]) => href),
    ).size,
    navigationDestinations: navigationInventory.length,
    inactiveNavigationDestinations: navigationInventory.filter((entry) => !entry.active).length,
    aliases: aliasInventory.length,
    aliasesWithActiveSourceAndTarget: aliasInventory.filter(
      (entry) => entry.sourceActive && entry.targetActive,
    ).length,
    aliasesWithInactiveTarget: aliasInventory.filter((entry) => !entry.targetActive).length,
    disposition: countBy(entries, "disposition"),
  },
  requestBoundary: {
    publicPages: [...new Set(
      [...proxySource.matchAll(/["'](\/[^"']*)["']/g)]
        .map((match) => match[1])
        .filter((path) => ["/", "/login", "/forgot-password", "/reset-password", "/setup", "/auth/callback"].includes(path)),
    )].sort(),
    hasProxyRedirect: /NextResponse\.redirect\(/.test(proxySource),
    setupExcludedFromMatcher: proxySource.includes("setup(?:/|$)"),
    nextConfigHasRedirects: /async\s+redirects\s*\(/.test(nextConfigSource),
    nextConfigHasRewrites: /async\s+rewrites\s*\(/.test(nextConfigSource),
    clientNavigationFiles,
  },
  navigation: navigationInventory,
  aliases: aliasInventory,
  collisions: {
    active: activeCollisions,
    allSource: allCollisions,
  },
  routes: entries.sort((a, b) => a.url.localeCompare(b.url) || a.file.localeCompare(b.file)),
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
    `Inventário V3000 gravado: ${outputPath} (${evidence.summary.activeRouteFiles} ativos, ${evidence.summary.quarantinedRouteFiles} isolados).`,
  );
} else {
  process.stdout.write(serialized);
}
