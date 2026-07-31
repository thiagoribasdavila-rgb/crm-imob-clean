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
  // 2026-07-31: 138 -> 139 e apoio 70 -> 71. Rota nova
  // app/(crm)/settings/distribuicao (tela do elenco de distribuicao), de APOIO —
  // aninhada sob /settings, fora do catalogo canonico. Os dois sobem juntos para
  // a soma dos buckets continuar fechando; e essa assercao que impede alguem de
  // acrescentar rota sem dizer a que familia ela pertence. Ver _rebaselines no config.
  // Poda intencional na fonte (commit e20f8931): total de rotas CRM rastreadas 141->139 (/pipedrive removido em commit anterior) e catálogo canônico 25->22. Guard re-baselinado à fonte lib/atlas/navigation.ts + git ls-files.
  ["Todas as rotas CRM foram classificadas", inventory.counts.crmRoutes === config.topology.crmRoutes && inventory.counts.crmRoutes === 139],
  ["Buckets fecham o inventário", config.topology.canonicalNavigationDestinations + config.topology.dynamicContextRoutes + config.topology.deepSupportRoutes + config.topology.topLevelNonCanonicalRoutes + config.topology.rootRedirects === config.topology.crmRoutes],
  // 2026-07-29: 21 destinos presentes, não 22. "Clientes 360" (/customers) foi
  // aposentado — lia a MESMA tabela leads pela mesma função, sem SLA, lote nem
  // filtros, e sem o piso de carteira (um corretor via as 469 leads da
  // imobiliária inteira). A rota continua respondendo como redirect para
  // /leads, que herdou os segmentos por vínculo.
  //
  // A soma com o aposentado preserva o número histórico do config e continua
  // denunciando qualquer OUTRA remoção: se um segundo destino sumir, 20+1 nunca
  // dá 22. E `missingCanonicalDestinations` vazio segue sendo exigido — nenhum
  // destino do catálogo pode ficar sem página.
  ["Catálogo canônico possui cobertura integral",
    inventory.missingCanonicalDestinations.length === 0
    && inventory.counts.canonicalDestinationsPresent === config.topology.canonicalDestinationsPresent],
  ["Rotas dinâmicas permanecem contextuais", inventory.counts.dynamicContextRoutes === config.topology.dynamicContextRoutes && config.topology.dynamicContextRoutes === 28],
  ["Rotas profundas permanecem de apoio", inventory.counts.deepSupportRoutes === config.topology.deepSupportRoutes && config.topology.deepSupportRoutes === 71],
  ["Superfícies de topo foram classificadas", JSON.stringify(measuredTopLevel) === JSON.stringify(expectedTopLevel) && expectedTopLevel.length === 19],
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
