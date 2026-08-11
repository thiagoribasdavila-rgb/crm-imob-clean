import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { legacyRoutePaths } from "./legacy-route-paths.mjs";

const root = process.cwd();
const outputPath = "docs/evidence/V3000_PHASE_379_ACTIVE_ROUTE_VALIDATION.json";
const routePattern = /(^|\/)(page|route)\.(ts|tsx|js|jsx)$/;
const pagePattern = /(^|\/)page\.(ts|tsx|js|jsx)$/;
const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const internalNextRoutes = ["/_global-error/page", "/_not-found/page"];
const requireBuild = process.argv.includes("--require-build");

function trackedFiles(directory) {
  return execFileSync("git", ["ls-files", "-z", directory], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .filter((file) => existsSync(resolve(root, file)))
    .sort();
}

function isQuarantined(file) {
  return legacyRoutePaths.some(
    (legacyPath) => file === legacyPath || file.startsWith(`${legacyPath}/`),
  );
}

function routeUrl(file) {
  const segments = file.replace(/^app\//, "").split("/").slice(0, -1);
  const visible = segments
    .filter((segment) => !/^\([^)]*\)$/.test(segment) && !segment.startsWith("@"))
    .map((segment) => segment.replace(/^(?:\(\.\.\.\)|\(\.\.\)|\(\.\))+/, ""));
  return `/${visible.filter(Boolean).join("/")}`.replace(/\/+$/, "") || "/";
}

function manifestKey(file) {
  return `/${file
    .replace(/^app\//, "")
    .replace(/\.(?:ts|tsx|js|jsx)$/, "")}`;
}

function sourceFile(file, source) {
  const isJsx = file.endsWith("x");
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function hasDefaultExport(ast) {
  return ast.statements.some((statement) => {
    if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
      return true;
    }
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) return false;
    if (!ts.isNamedExports(statement.exportClause)) return false;
    return statement.exportClause.elements.some((element) => element.name.text === "default");
  });
}

function exportedMethods(ast) {
  const names = new Set();
  for (const statement of ast.statements) {
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (exported && ts.isFunctionDeclaration(statement) && statement.name) {
      names.add(statement.name.text);
    }
    if (exported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) names.add(element.name.text);
    }
  }
  return httpMethods.filter((method) => names.has(method));
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const allRouteFiles = trackedFiles("app").filter((file) => routePattern.test(file));
const activeFiles = allRouteFiles.filter((file) => !isQuarantined(file));
const quarantinedFiles = allRouteFiles.filter(isQuarantined);

const activeRoutes = activeFiles.map((file) => {
  const source = readFileSync(resolve(root, file), "utf8");
  const ast = sourceFile(file, source);
  const type = pagePattern.test(file) ? "page" : "api";
  const methods = type === "api" ? exportedMethods(ast) : [];
  return {
    file,
    url: routeUrl(file),
    manifestKey: manifestKey(file),
    type,
    nonEmpty: source.trim().length > 0,
    hasDefaultExport: type === "page" ? hasDefaultExport(ast) : null,
    methods,
  };
});

const groupedUrls = new Map();
for (const route of activeRoutes) {
  groupedUrls.set(route.url, [...(groupedUrls.get(route.url) || []), route.file]);
}
const collisions = [...groupedUrls.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([url, files]) => ({ url, files }))
  .sort((a, b) => a.url.localeCompare(b.url));
const emptyRoutes = activeRoutes.filter((route) => !route.nonEmpty).map((route) => route.file);
const pagesWithoutDefaultExport = activeRoutes
  .filter((route) => route.type === "page" && !route.hasDefaultExport)
  .map((route) => route.file);
const apisWithoutMethod = activeRoutes
  .filter((route) => route.type === "api" && route.methods.length === 0)
  .map((route) => route.file);

const aliases = JSON.parse(
  readFileSync(resolve(root, "config/atlas-route-aliases.json"), "utf8"),
);
const activePageUrls = new Set(
  activeRoutes.filter((route) => route.type === "page").map((route) => route.url),
);
const invalidAliases = aliases.filter(
  ({ source, destination, permanent }) =>
    !source.startsWith("/") ||
    !destination.startsWith("/") ||
    source === destination ||
    activePageUrls.has(source) ||
    !activePageUrls.has(destination) ||
    permanent !== true,
);
const aliasTargets = new Map(aliases.map(({ source, destination }) => [source, destination]));
const aliasChains = aliases
  .filter(({ destination }) => aliasTargets.has(destination))
  .map(({ source, destination }) => ({
    source,
    via: destination,
    destination: aliasTargets.get(destination),
  }));

const sourceOk =
  activeRoutes.length > 0 &&
  emptyRoutes.length === 0 &&
  pagesWithoutDefaultExport.length === 0 &&
  apisWithoutMethod.length === 0 &&
  collisions.length === 0 &&
  invalidAliases.length === 0 &&
  aliasChains.length === 0;

const manifestFiles = {
  appPaths: resolve(root, ".next/server/app-paths-manifest.json"),
  appRoutes: resolve(root, ".next/app-path-routes-manifest.json"),
  routes: resolve(root, ".next/routes-manifest.json"),
};
const buildAvailable = Object.values(manifestFiles).every(existsSync);

let build = {
  required: requireBuild,
  available: buildAvailable,
  ok: !requireBuild,
  manifestRouteCount: 0,
  activeRoutesPresent: 0,
  activeRoutesMissing: [],
  publicPathMismatches: [],
  quarantinedRoutesPresent: [],
  unexpectedManifestRoutes: [],
  configuredRedirects: 0,
  redirectsPresent: 0,
  redirectsMissing: [],
  manifestDigest: null,
};

if (buildAvailable) {
  const appPaths = JSON.parse(readFileSync(manifestFiles.appPaths, "utf8"));
  const appRoutes = JSON.parse(readFileSync(manifestFiles.appRoutes, "utf8"));
  const routesManifest = JSON.parse(readFileSync(manifestFiles.routes, "utf8"));
  const activeKeys = new Set(activeRoutes.map((route) => route.manifestKey));
  const activeRoutesMissing = activeRoutes
    .filter((route) => !(route.manifestKey in appPaths))
    .map((route) => route.manifestKey);
  const publicPathMismatches = activeRoutes
    .filter(
      (route) =>
        route.manifestKey in appRoutes && appRoutes[route.manifestKey] !== route.url,
    )
    .map((route) => ({
      manifestKey: route.manifestKey,
      expected: route.url,
      actual: appRoutes[route.manifestKey],
    }));
  const quarantinedRoutesPresent = quarantinedFiles
    .map(manifestKey)
    .filter((key) => key in appPaths);
  const unexpectedManifestRoutes = Object.keys(appPaths)
    .filter((key) => !activeKeys.has(key) && !internalNextRoutes.includes(key))
    .sort();
  const redirectsMissing = aliases
    .filter(
      (alias) =>
        !routesManifest.redirects.some(
          (redirect) =>
            redirect.source === alias.source &&
            redirect.destination === alias.destination &&
            redirect.statusCode === 308,
        ),
    )
    .map(({ source, destination }) => ({ source, destination }));
  const redirectsPresent = aliases.length - redirectsMissing.length;
  const buildOk =
    activeRoutesMissing.length === 0 &&
    publicPathMismatches.length === 0 &&
    quarantinedRoutesPresent.length === 0 &&
    unexpectedManifestRoutes.length === 0 &&
    redirectsMissing.length === 0;

  build = {
    required: requireBuild,
    available: true,
    ok: buildOk,
    manifestRouteCount: Object.keys(appPaths).length,
    activeRoutesPresent: activeRoutes.length - activeRoutesMissing.length,
    activeRoutesMissing,
    publicPathMismatches,
    quarantinedRoutesPresent,
    unexpectedManifestRoutes,
    internalNextRoutes,
    configuredRedirects: aliases.length,
    redirectsPresent,
    redirectsMissing,
    manifestDigest: digest({ appPaths, appRoutes, redirects: routesManifest.redirects }),
  };
}

const evidence = {
  schemaVersion: 1,
  phase: 379,
  consolidationGate: 6,
  scope: "active-next16-pages-apis-and-canonical-redirects",
  sourceOfTruth: {
    routeFiles: "git ls-files app",
    quarantine: "scripts/legacy-route-paths.mjs",
    redirects: "config/atlas-route-aliases.json",
    buildManifests: Object.fromEntries(
      Object.entries(manifestFiles).map(([key, value]) => [key, value.replace(`${root}/`, "")]),
    ),
  },
  summary: {
    activeRouteFiles: activeRoutes.length,
    activePages: activeRoutes.filter((route) => route.type === "page").length,
    activeApis: activeRoutes.filter((route) => route.type === "api").length,
    quarantinedRouteFiles: quarantinedFiles.length,
    sourceIssues:
      emptyRoutes.length +
      pagesWithoutDefaultExport.length +
      apisWithoutMethod.length +
      collisions.length +
      invalidAliases.length +
      aliasChains.length,
    canonicalRedirects: aliases.length,
    sourceOk,
    buildOk: build.ok,
    ok: sourceOk && build.ok,
  },
  findings: {
    emptyRoutes,
    pagesWithoutDefaultExport,
    apisWithoutMethod,
    collisions,
    invalidAliases,
    aliasChains,
  },
  redirects: aliases,
  build,
  routes: activeRoutes,
  sourceDigest: digest(
    activeRoutes.map(({ file, url, manifestKey, type, methods }) => ({
      file,
      url,
      manifestKey,
      type,
      methods,
    })),
  ),
  privacy: {
    readsApplicationData: false,
    readsEnvironmentSecrets: false,
    capturesPersonalData: false,
  },
};

if (requireBuild && !buildAvailable) {
  console.error("Build Next.js ausente. Execute `npm run build` antes desta prova.");
  process.exitCode = 1;
}
if (!evidence.summary.ok) process.exitCode = 1;

const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (process.argv.includes("--write")) {
  const absoluteOutput = resolve(root, outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, serialized);
  console.log(
    `Validação de rotas V3000 gravada: ${outputPath} (${activeRoutes.length} rotas ativas, ${evidence.summary.sourceIssues} inconsistências).`,
  );
} else {
  process.stdout.write(serialized);
}
