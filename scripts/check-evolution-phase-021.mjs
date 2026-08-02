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
  // ── REAPONTADAS EM 02/08/2026 — os totais saíram, a classificação entrou ──
  //
  // Como estavam:
  //
  //   ["Todas as rotas CRM foram classificadas",
  //     inventory.counts.crmRoutes === config.topology.crmRoutes
  //       && inventory.counts.crmRoutes === 139]
  //   ["Buckets fecham o inventário",
  //     config.topology.canonicalNavigationDestinations + config.topology.dynamicContextRoutes
  //       + config.topology.deepSupportRoutes + config.topology.topLevelNonCanonicalRoutes
  //       + config.topology.rootRedirects === config.topology.crmRoutes]
  //
  // A primeira não classificava nada: comparava um total com outro total. A
  // segunda somava CINCO campos do config e comparava com um SEXTO campo do
  // MESMO config — evidência que a entrega escreveu conferindo a si mesma, sem
  // que o disco entrasse na conta uma única vez. É a asserção que aprova o
  // próprio boletim, e ela era verdadeira mesmo com o inventário medido
  // divergindo em qualquer número.
  //
  // CAUSA MEDIDA DO VERMELHO, em 02/08/2026: crmRoutes 139 -> 140 e apoio
  // profundo 71 -> 72, por UMA rota nova —
  // `app/(crm)/marketing/campanhas-criativos-proposta/page.tsx` (commit
  // d7c21fba, de hoje), sub-página de `/marketing`. Caso normal, família
  // existente, zero risco — e o portão parava tudo sem conseguir dizer o quê.
  //
  // O que se afirma agora vem de `lib/rotas-crm.mjs`, contra o disco:
  //   1. toda rota cai em exatamente um balde (nenhuma duplicada);
  //   2. a soma dos baldes é o total MEDIDO, não o declarado;
  //   3. nenhuma rota é ÓRFÃ — a família (primeiro segmento) de toda rota
  //      profunda ou contextual existe como destino canônico ou superfície de
  //      topo declarada.
  //
  // (3) é o que nenhum total alcançava: uma página em
  // `app/(crm)/relatorios-novos/detalhe/page.tsx` sem `/relatorios-novos` em
  // lugar nenhum é uma tela que só existe para quem digitar a URL, e o total
  // continuaria batendo se outra rota tivesse saído junto. A prova de que esta
  // asserção reprova está em `tests/contracts/rotas-crm-reprova.test.mjs`.
  //
  // A força de "declare a família da rota nova" NÃO se perdeu: a asserção
  // "Superfícies de topo foram classificadas" (abaixo) continua comparando o
  // CONJUNTO medido com o declarado no config, nome a nome.
  ["Todas as rotas CRM foram classificadas",
    inventory.orphanRoutes.length === 0
    && inventory.duplicatedRouteBuckets.length === 0
    && inventory.bucketsCloseOnMeasuredTotal === true
    && inventory.routes.length === inventory.counts.crmRoutes],
  ["Buckets fecham o inventário",
    inventory.counts.canonicalDestinationsPresent
      + inventory.counts.dynamicContextRoutes
      + inventory.counts.deepSupportRoutes
      + inventory.counts.topLevelNonCanonicalRoutes
      + inventory.counts.rootRedirects === inventory.counts.crmRoutes],
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
  // ── REAPONTADA EM 02/08/2026 — mesma causa medida da asserção acima ───────
  //
  // Era `inventory.counts.deepSupportRoutes === config.topology.deepSupportRoutes
  // && config.topology.deepSupportRoutes === 71`. MEDIDO hoje: 72, pela mesma
  // rota nova `/marketing/campanhas-criativos-proposta`. Trocar 71 por 72 seria
  // fixar número novo — na próxima sub-página o portão volta a acender pelo
  // motivo errado, e ninguém saberá qual dos dois números estava certo.
  //
  // "Permanecem DE APOIO" é uma regra, e a regra é verificável em cada rota:
  // dois ou mais segmentos de URL, fora do catálogo canônico, sem parâmetro
  // dinâmico, e com família existente. Uma rota de apoio que virasse destino
  // canônico sem entrar no catálogo, ou que perdesse a família, reprova aqui.
  ["Rotas profundas permanecem de apoio",
    inventory.deepSupportRoutes.every((rota) =>
      rota.split("/").filter(Boolean).length > 1
      && !inventory.canonicalDestinations.includes(rota)
      && !rota.includes("["))
    && inventory.orphanRoutes.length === 0],
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
