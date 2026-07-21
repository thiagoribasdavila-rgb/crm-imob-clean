import { execFileSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

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
const pageFiles = trackedCrmPages();
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
// A raiz "/" deixou de ser um redirect do grupo (crm) para virar a landing
// pública real (app/page.tsx, verificada ao vivo em produção) — o antigo
// (crm)/page.tsx (redirect("/dashboard")) colidia de rota com ela (Next.js
// não aceita duas page.tsx resolvendo o mesmo path) e foi removido. A entrada
// autenticada agora passa por /login -> safeAuthDestination (que resolve para
// /command-center, o "dashboard clássico" fundido — ver app/(auth)/login).
const rootSource = fs.readFileSync("app/page.tsx", "utf8");
const loginSource = fs.readFileSync("app/(auth)/login/page.tsx", "utf8");

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
    // Raiz pública oferece o caminho de entrada (login), e o login resolve o
    // destino autenticado para /command-center — a mesma garantia de antes
    // ("entrada autenticada continua no dashboard"), só que em 2 etapas
    // explícitas em vez de um redirect cego na raiz.
    linksToLogin: rootSource.includes('href="/login"'),
    redirectsToDashboard: loginSource.includes('"/command-center"'),
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
