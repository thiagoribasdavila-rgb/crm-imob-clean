import { execFileSync } from "node:child_process";
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-021-navigation-architecture-inventory.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const inventory = JSON.parse(execFileSync(process.execPath, ["scripts/inventory-navigation-architecture.mjs"], { encoding: "utf8" }));
const layout = fs.readFileSync("app/(crm)/layout.tsx", "utf8");
const appShell = fs.readFileSync("components/atlas/app-shell.tsx", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_021_NAVIGATION_ARCHITECTURE_INVENTORY.md", "utf8");

const expectedTopLevel = config.topLevelNonCanonical.map((entry) => entry.route).sort();
const measuredTopLevel = inventory.topLevelNonCanonicalRoutes.slice().sort();
const checks = [
  ["Fase 021 concluída sem mutação de runtime", config.status === "completed" && config.productionDataModified === false && config.runtimeNavigationChanged === false],
  // Poda intencional na fonte (commit e20f8931): total de rotas CRM rastreadas 141->139 (/pipedrive removido em commit anterior) e catálogo canônico 25->22. Guard re-baselinado à fonte lib/atlas/navigation.ts + git ls-files.
  ["Todas as rotas CRM foram classificadas", inventory.counts.crmRoutes === config.topology.crmRoutes && inventory.counts.crmRoutes === 139],
  ["Buckets fecham o inventário", config.topology.canonicalNavigationDestinations + config.topology.dynamicContextRoutes + config.topology.deepSupportRoutes + config.topology.topLevelNonCanonicalRoutes + config.topology.rootRedirects === config.topology.crmRoutes],
  ["Catálogo canônico possui cobertura integral", inventory.missingCanonicalDestinations.length === 0 && inventory.counts.canonicalDestinationsPresent === config.topology.canonicalDestinationsPresent],
  ["Rotas dinâmicas permanecem contextuais", inventory.counts.dynamicContextRoutes === config.topology.dynamicContextRoutes && config.topology.dynamicContextRoutes === 29],
  ["Rotas profundas permanecem de apoio", inventory.counts.deepSupportRoutes === config.topology.deepSupportRoutes && config.topology.deepSupportRoutes === 69],
  ["Superfícies de topo foram classificadas", JSON.stringify(measuredTopLevel) === JSON.stringify(expectedTopLevel) && expectedTopLevel.length === 18],
  ["Ambiguidades críticas estão explícitas", expectedTopLevel.includes("/automation") && expectedTopLevel.includes("/automations") && expectedTopLevel.includes("/kanban") && expectedTopLevel.includes("/creatives")],
  ["Entrada autenticada continua no dashboard", inventory.entryRoute.redirectsToDashboard === true],
  ["Shell persistente continua governado pelo layout", layout.includes("<AppShell>") && layout.includes("<AtlasCopilotDock") && layout.includes("<AtlasNotificationCenter")],
  ["Conteúdo de página reinicia por caminho", appShell.includes("key={pathname}")],
  ["Relatório preserva rotas e dados", report.includes("Nenhuma rota foi excluída") && report.includes("Nenhum dado de produção foi lido ou alterado")],
  ["Gate anterior não foi contornado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 021 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 021 aprovada: arquitetura de navegação inventariada sem alterar rotas ou dados.");
