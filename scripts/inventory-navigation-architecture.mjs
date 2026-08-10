import { execFileSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const CRM_ROOT = "app/(crm)";

function isGitWorkspace() {
  try {
    return execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() === "true";
  } catch {
    return false;
  }
}

function snapshotCrmPages(directory = CRM_ROOT) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return snapshotCrmPages(path);
      return entry.isFile() && entry.name === "page.tsx" ? [path] : [];
    })
    .sort();
}

function crmPages() {
  if (!isGitWorkspace()) return snapshotCrmPages();
  return execFileSync("git", ["ls-files", "-z", CRM_ROOT], { encoding: "utf8" })
    .split("\0")
    .filter((file) => file === `${CRM_ROOT}/page.tsx` || file.endsWith("/page.tsx"))
    .sort();
}

function routeFromPage(file) {
  const relative = file.slice(CRM_ROOT.length).replace(/\/page\.tsx$/, "");
  return relative || "/";
}

function segmentCount(route) {
  return route.split("/").filter(Boolean).length;
}

const navigationSource = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const compiledNavigation = ts.transpileModule(navigationSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const navigationModule = { exports: {} };
const navigationContext = vm.createContext({
  module: navigationModule,
  exports: navigationModule.exports,
});
vm.runInContext(compiledNavigation, navigationContext, {
  filename: "navigation.compiled.cjs",
});
const { atlasNavigation, atlasContextCommands } = navigationModule.exports;
const gitWorkspace = isGitWorkspace();
const pageFiles = crmPages();
const routes = pageFiles.map(routeFromPage);
const routeSet = new Set(routes);
const canonicalDestinations = [
  ...new Set([...atlasNavigation, ...atlasContextCommands].map((item) => item.href)),
].sort();
const canonicalSet = new Set(canonicalDestinations);
const missingCanonicalDestinations = canonicalDestinations.filter((route) => !routeSet.has(route));
const dynamicContextRoutes = routes.filter((route) => route.includes("[")).sort();
const deepSupportRoutes = routes
  .filter((route) => route !== "/" && !canonicalSet.has(route) && !route.includes("[") && segmentCount(route) > 1)
  .sort();
const topLevelNonCanonicalRoutes = routes
  .filter((route) => route !== "/" && !canonicalSet.has(route) && !route.includes("[") && segmentCount(route) === 1)
  .sort();
const rootSource = fs.readFileSync(`${CRM_ROOT}/page.tsx`, "utf8");

const inventory = {
  generatedAt: new Date().toISOString(),
  scope: gitWorkspace ? "tracked-app-router-crm-pages" : "snapshot-app-router-crm-pages",
  sourceOfTruth: {
    routeFiles: gitWorkspace ? "git ls-files app/(crm)" : "filesystem snapshot app/(crm)",
    navigationCatalog: "lib/atlas/navigation.ts",
  },
  counts: {
    crmRoutes: routes.length,
    rootRedirects: routes.filter((route) => route === "/").length,
    canonicalDestinations: canonicalDestinations.length,
    canonicalDestinationsPresent: canonicalDestinations.length - missingCanonicalDestinations.length,
    dynamicContextRoutes: dynamicContextRoutes.length,
    deepSupportRoutes: deepSupportRoutes.length,
    topLevelNonCanonicalRoutes: topLevelNonCanonicalRoutes.length,
  },
  entryRoute: {
    route: "/",
    redirectsToDashboard: rootSource.includes('redirect("/dashboard")'),
  },
  canonicalDestinations,
  missingCanonicalDestinations,
  dynamicContextRoutes,
  deepSupportRoutes,
  topLevelNonCanonicalRoutes,
  privacy: {
    readsApplicationData: false,
    readsEnvironmentSecrets: false,
    capturesPersonalData: false,
  },
};

process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
