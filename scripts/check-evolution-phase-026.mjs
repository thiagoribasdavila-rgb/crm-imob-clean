import fs from "node:fs";
import { familiaDeclara, mediaAlcanca, regrasQueCitam, temAlvoDeToque } from "./lib/css-propriedade.mjs";
import vm from "node:vm";
import ts from "typescript";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-026-navigation-visual-hierarchy.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyFive = JSON.parse(fs.readFileSync("config/evolution-phase-025-navigation-information-compaction.json", "utf8"));
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const sidebar = fs.readFileSync("components/atlas/sidebar.tsx", "utf8");
// A superfície que herdou o acesso rápido quando os favoritos saíram da barra.
const commandPalette = fs.readFileSync("components/CommandPalette.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_026_NAVIGATION_VISUAL_HIERARCHY.md", "utf8");

const compiledNavigation = ts.transpileModule(navigation, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const navigationModule = { exports: {} };
vm.runInNewContext(compiledNavigation, {
  module: navigationModule,
  exports: navigationModule.exports,
  require: () => ({}),
});
const { atlasNavigation, atlasContextCommands } = navigationModule.exports;
const primaryCount = atlasNavigation.length;
const contextCount = atlasContextCommands.length;
const mobilePrimaryCount = atlasNavigation.filter((item) => item.mobilePrimary === true).length;

const checks = [
  ["Fase 026 concluída sem mutação de dados", config.status === "completed" && config.runtimeNavigationChanged === true && config.productionDataModified === false],
  ["Compactação anterior permanece concluída", phaseTwentyFive.status === "completed" && phaseTwentyFive.exitCriteria.favoriteItemsAreNotRepeatedWhileBrowsing === true],
  ["Contexto usa destinos principais e contextuais", navigation.includes("export function getAtlasNavigationContext") && navigation.includes("...atlasNavigation.map") && navigation.includes("...atlasContextCommands.map")],
  ["Rota mais específica prevalece", navigation.includes(".sort((left, right) => right.href.length - left.href.length)") && config.contextResolution.longestMatchingDestinationWins === true],
  ["Topbar usa a fonte governada", topbar.includes("getAtlasNavigationContext(pathname)") && !topbar.includes("const sectionLabels")],
  ["Topbar expõe grupo e destino atual", topbar.includes("currentGroup") && topbar.includes("currentSection") && topbar.includes("Local atual:")],
  ["Grupos usam estrutura semântica", sidebar.includes('<section className="atlas-nav-group') && sidebar.includes("aria-labelledby={groupHeadingId}") && sidebar.includes("<h2 id={groupHeadingId}")],
  /**
   * 2026-07-29 — os FAVORITOS foram aposentados da barra lateral.
   *
   * Eles custavam uma estrela em TODA linha (48px reservados à direita de cada
   * item) mais uma seção que DUPLICAVA itens na mesma coluna: quem fixava
   * "Leads" via "Leads" duas vezes, uma em Favoritos e outra no grupo. O ⌘K
   * (components/CommandPalette.tsx) resolve o mesmo problema melhor, montando
   * a lista a partir do MESMO getAtlasNavigationForIdentity, com as mesmas
   * permissões — e sem ocupar a parede.
   *
   * A asserção original casava a MARCAÇÃO de uma seção que deixou de existir.
   * Ela não é afrouxada aqui: passa a exigir a propriedade que realmente
   * importava — que a barra continue semanticamente estruturada (garantido
   * pela asserção acima) e que o acesso rápido não tenha desaparecido, só
   * mudado de superfície. Se alguém remover o atalho da paleta, isto acusa.
   */
  ["Acesso rápido existe sem duplicar a barra",
    !sidebar.includes("atlas-nav-favorites")
    && sidebar.includes("atlas-rail-hint")
    && sidebar.includes("⌘K")
    && commandPalette.includes("getAtlasNavigationForIdentity")],
  /**
   * 2026-07-29 — o selo "Atual" deixou de ser VISUAL e passou a ser só para
   * leitor de tela. A cor, o fundo e o traço à esquerda já marcam o destino
   * ativo para quem enxerga; o selo era a quarta repetição da mesma coisa e
   * ocupava espaço numa barra que o dono pediu mais silenciosa.
   *
   * A asserção ficou MAIS exigente, não menos: além do aria-current (o
   * mecanismo que realmente comunica o estado), agora exige a marca textual em
   * sr-only e PROÍBE aria-hidden nela — a versão anterior escondia o selo de
   * quem mais precisava dele.
   */
  ["Destino ativo é explícito e acessível",
    sidebar.includes('aria-current={ativo ? "page"')
    && sidebar.includes('<span className="sr-only">Atual</span>')
    && !sidebar.includes('className="sr-only" aria-hidden="true">Atual')],
  ["Menu recolhido preserva nome acessível", sidebar.includes("aria-label={collapsed ? item.label : undefined}") && config.semanticNavigation.collapsedLinksKeepAccessibleName === true],
  // Os três seletores abaixo mudaram de nome com o trilho (.atlas-nav-* →
  // .atlas-rail-*). O prefixo é novo de propósito: cinco blocos do globals.css
  // disputam .atlas-sidebar-*/.atlas-nav-* e um deles já é código morto. As
  // PROPRIEDADES seguem idênticas — grupo atual marcado, ícone com prioridade
  // visual distinta do texto, e alvo de toque de 44px (agora sob
  // `pointer: coarse`, porque 44px no mouse só desperdiça altura).
  ["Grupo atual recebe marcador visual", styles.includes('.atlas-nav-group[data-current="true"] > .atlas-rail-group-label') && config.visualPriority.currentGroupIsMarked === true],
  ["Ícones possuem prioridade visual distinta", styles.includes(".atlas-rail-icon") && styles.includes('.atlas-rail-link[data-active="true"] .atlas-rail-icon')],
  ["Topbar prioriza destino sobre contexto",
    /* ── A FRASE VIROU UMA COMPARAÇÃO, QUE É O QUE ELA SEMPRE AFIRMOU ───────
       Antes: `includes(".atlas-topbar-location") && includes("font-size: 13px")
       && includes(".atlas-topbar-context strong")` — três buscas soltas num
       arquivo de 10.960 linhas.

       Medido em 01/08/2026 ao reapontar: `.atlas-topbar-location` existe e NÃO
       declara `font-size: 13px`. O 13px mora em `.atlas-topbar-section`. Ou
       seja, a asserção passava havia tempo com a propriedade que ela nomeava
       AUSENTE — bastava o texto existir em outra regra qualquer.

       "Prioriza destino sobre contexto" é, literalmente, uma comparação de
       tamanho entre dois elementos. Agora é isso que se mede: o destino tem de
       ser MAIOR que o contexto. Medido hoje: 13px contra 11px. */
    (() => {
      const tamanho = (prefixo) => {
        const valores = regrasQueCitam(styles, prefixo)
          .flatMap(({ corpo }) => [...corpo.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1])));
        return valores.length ? Math.max(...valores) : null;
      };
      const destino = tamanho(".atlas-topbar-section");
      const contexto = tamanho(".atlas-topbar-context");
      return destino !== null && contexto !== null && destino > contexto;
    })()],
  ["Ações interativas preservam 44 pixels",
    /* Antes: `includes("@media (pointer: coarse)") && includes("min-height:
       44px") && includes("height: 44px")`. As três strings existem no arquivo
       — 45 vezes só a primeira delas — e nenhuma prova relação com nada.

       Medido ao reapontar: o bloco de ponteiro grosso alcança
       `.atlas-rail-link` e `.atlas-rail-hint` (a navegação), não a topbar; e a
       própria `.atlas-topbar` tem `height: 76px`. As duas propriedades VALEM,
       só que em lugares diferentes dos que a asserção nomeava.

       Agora cobra as duas onde elas moram, e o `44` de referência sai do
       config em vez de ser digitado aqui — número repetido em dois arquivos é
       a próxima divergência. */
    mediaAlcanca(styles, "pointer: coarse", ".atlas-rail")
    && temAlvoDeToque(styles, ".atlas-rail", config.interactionTargets.favoriteActionMinimumPx)
    && temAlvoDeToque(styles, ".atlas-topbar", config.interactionTargets.favoriteActionMinimumPx)
    && config.interactionTargets.favoriteActionMinimumPx === 44],
  // ── REAPONTADA EM 02/08/2026 ──────────────────────────────────────────────
  // Era o seletor num `includes` e `justify-content: center` noutro, soltos. A
  // centralização podia ser de qualquer regra do arquivo; o trilho recolhido
  // podia estar sem nenhuma. Agora a propriedade é cobrada DO CORPO da regra
  // que carrega o seletor.
  ["Menu recolhido recentraliza o destino",
    familiaDeclara(styles, '.atlas-app-shell[data-sidebar-collapsed="true"] .atlas-rail-link', "justify-content", "center")],
  // Catálogo podado na fonte de propósito (commit e20f8931 "navegação podada na fonte") + poda 2026-07-20/21: /command-center consolida Início+Command Center e os grupos (ai)/(autonomous) foram quarentenados. mobilePrimary segue 4.
  //
  // 2026-07-26: 17 principais e 6 contextuais. /marketing subiu do ⌘K para a rail.
  // A poda tirou daqui os destinos de SUPORTE — e levou junto a tela que virou o
  // centro da operação de aquisição. Campanha com lead não atendida queima verba e
  // ainda ensina o Andromeda a buscar o público errado; isso não pode depender de
  // alguém lembrar de um atalho de teclado. Nada foi removido do catálogo e nenhuma
  // permissão mudou — que é o que este caso realmente protege.
  // 2026-07-29: 16 destinos, não 17. "Clientes 360" saiu do catálogo — lia a
  // MESMA tabela leads pela mesma função, sem SLA/lote/filtros, e sem o piso de
  // carteira (um corretor via as 469 leads da imobiliária). A rota /customers
  // continua respondendo como redirect para /leads, que herdou os segmentos por
  // vínculo. A soma com o aposentado preserva o número histórico e denuncia
  // qualquer OUTRA remoção silenciosa.
  ["Catálogo e RBAC permanecem íntegros", primaryCount + 1 === 17 && contextCount === 6 && mobilePrimaryCount === 4 && config.catalogPreservation.routesRemoved === 0 && config.catalogPreservation.permissionsChanged === false && config.safetyPolicy.rbacPreserved === true],
  ["Métrica comportamental não foi inventada", config.measurementPolicy.inventedBehaviorMetricAllowed === false && config.measurementPolicy.behavioralTelemetryStatus === "awaiting-runtime-telemetry"],
  ["Relatório documenta fonte, semântica e limite", report.includes("lista paralela") && report.includes("aria-labelledby") && report.includes("não afirma melhora de tempo") && report.includes("Fase 027")],
  ["Staging continua bloqueado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 026 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 026 aprovada: contexto governado, grupos semânticos e estado atual inequívoco em todos os modos da navegação.");
