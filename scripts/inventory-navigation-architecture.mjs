import { execFileSync } from "node:child_process";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { classificarRotasCrm } from "./lib/rotas-crm.mjs";

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

/* `segmentCount` saiu daqui em 02/08/2026: a contagem de segmentos era a regra
   de classificação, e a regra passou inteira para `lib/rotas-crm.mjs`, onde o
   portão da fase 021 também a lê. Duas cópias da mesma regra é como este
   repositório já produziu guardas que se contradizem. */

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
const missingCanonicalDestinations = canonicalDestinations.filter((route) => !routeSet.has(route));

/* A classificação mora em `lib/rotas-crm.mjs` e é a MESMA que o portão da fase
   021 usa para julgar. Duas cópias da regra viram duas verdades — este
   repositório já pagou por isso em mais de um lugar. O que este arquivo
   acrescenta é só o que o portão não teria como medir sozinho: as listas
   brutas e as rotas ÓRFÃS (família inexistente), que antes nem eram
   publicadas. Nenhum campo saiu — `measure-navigation-baseline.mjs` continua
   lendo os mesmos nomes. */
const classificacao = classificarRotasCrm(routes, canonicalDestinations);
const dynamicContextRoutes = classificacao.baldes.dinamicas.slice().sort();
const deepSupportRoutes = classificacao.baldes.apoio.slice().sort();
const topLevelNonCanonicalRoutes = classificacao.baldes.topo.slice().sort();
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
  // ── Acrescentados em 02/08/2026 ──────────────────────────────────────────
  // `routes` é a lista bruta que o inventário sempre teve na memória e nunca
  // publicou — sem ela, quem lê este JSON só consegue comparar TOTAIS, que foi
  // exatamente o que a fase 021 fazia. `orphanRoutes` é a propriedade que
  // nenhum total alcança: rota profunda cuja família não existe.
  routes,
  orphanRoutes: classificacao.orfas,
  duplicatedRouteBuckets: classificacao.duplicadas,
  bucketsCloseOnMeasuredTotal: classificacao.fecha,
  privacy: {
    readsApplicationData: false,
    readsEnvironmentSecrets: false,
    capturesPersonalData: false,
  },
};

process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
