import { execFileSync } from "node:child_process";
import fs from "node:fs";

const CRM_ROOT = "app/(crm)";

function trackedCrmPages() {
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
const primaryNavigationSource = navigationSource.split("export const atlasNavigation = [")[1]?.split("] as const satisfies readonly AtlasNavigationItem[];")[0] ?? "";
const contextualNavigationSource = navigationSource.split("export const atlasContextCommands = [")[1]?.split("] as const;")[0] ?? "";
const pageFiles = trackedCrmPages();
const routes = pageFiles.map(routeFromPage);
const routeSet = new Set(routes);
const canonicalDestinations = [
  ...new Set(
    [...`${primaryNavigationSource}\n${contextualNavigationSource}`.matchAll(/href:\s*"([^"]+)"/g)]
      .map((match) => match[1]),
  ),
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
  scope: "tracked-app-router-crm-pages",
  sourceOfTruth: {
    routeFiles: "git ls-files app/(crm)",
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
