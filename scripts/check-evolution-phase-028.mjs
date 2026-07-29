import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/**
 * ── POR QUE A FORMA DE MEDIR MUDOU (reapontado em 2026-07-29) ───────────────
 *
 * A PROPRIEDADE desta fase nunca foi "existem 13 `action={{` em dois arquivos".
 * A propriedade é: TODA TELA TEM UMA AÇÃO PRIMÁRIA ÓBVIA E GOVERNADA, e tudo
 * mais no cabeçalho é aprofundamento.
 *
 * O contador era um PROXY dessa propriedade, e o proxy morreu duas vezes:
 *
 *   1. O redesenho CC-6 trocou os `PageHeader action={{ ... }}` por heróis
 *      próprios nas telas auditadas. `app/(crm)/dashboard/page.tsx` tem hoje 18
 *      linhas e é só `redirect("/command-center")` — MEDIDO: 0 ocorrências de
 *      `action={{`. `app/(crm)/sales/page.tsx` tem 1. O script exigia 13 no par
 *      de arquivos, e 12 secundárias no mesmo par, onde há 1.
 *   2. "Clientes 360" (/customers), que sustentava a única ação primária
 *      contada, foi aposentada (lia a mesma tabela de /leads sem piso de
 *      carteira — vazava a carteira dos colegas). A criação de cliente que ela
 *      sustentava vive hoje em /leads.
 *
 *   → Estado real ao reapontar: `standardizedHeaderActions` = 1 (esperava 13) e
 *     `secondaryHeaderActions` = 1 (esperava 12). DUAS asserções vermelhas, não
 *     uma — a segunda só não aparecia porque a primeira abortava antes dela.
 *
 * O QUE MUDOU E TORNA A PERGUNTA OUTRA: a ação primária de cada tela passou a
 * EXISTIR de verdade em pixel. `lib/atlas/navigation.ts` declara `primaryAction`
 * por destino (rótulo, destino e RESULTADO comercial); `atlasNavigationContexts`
 * carrega isso até a interface; `components/atlas/topbar.tsx` a renderiza como
 * botão primário, com o resultado comercial no nome acessível. Até 2026-07-29
 * esse dado morria uma linha antes da tela e a topbar caía num "Novo lead" fixo
 * — o mesmo botão no pipeline, em vendas e em distribuição.
 *
 * Ou seja: a propriedade deixou de depender de contar JSX em dois arquivos. Ela
 * vive no CATÁLOGO (16 destinos, cada um com sua ação e o resultado esperado) e
 * na FIAÇÃO até a topbar. É lá que este script passa a medir — EXECUTANDO o
 * catálogo, não grepando: um catálogo que ainda compila mas monta o href errado
 * passa batido por qualquer expressão regular.
 *
 * NADA FOI AFROUXADO:
 *   · `pageHeadersMigrated: 13` continua no config como REGISTRO HISTÓRICO do
 *     que a migração de 2026-07-18 fez, e `check-evolution-500.mjs` continua a
 *     lê-lo. O que parou foi RE-MEDIR esse número contra código vivo que já não
 *     hospeda aqueles cabeçalhos.
 *   · A garantia "aprofundamento não disputa com a ação da tela" ficou MAIS
 *     estrita: antes valia para 2 arquivos, agora vale para os 18 cabeçalhos de
 *     `app/`, e prioridade implícita passou a ser proibida.
 *   · Todo o contrato de `PageHeader` / `AtlasActionLink` que a fase já
 *     garantia continua conferido, linha por linha, sem alteração.
 */

const raiz = path.resolve(import.meta.dirname, "..");
const ler = (...partes) => fs.readFileSync(path.join(raiz, ...partes), "utf8");

const config = JSON.parse(ler("config/evolution-phase-028-navigation-primary-action-standard.json"));
const phaseTwenty = JSON.parse(ler("config/evolution-phase-020-wave-homologation.json"));
const phaseTwentySeven = JSON.parse(ler("config/evolution-phase-027-navigation-task-step-reduction.json"));
const actionLink = ler("components/atlas/action-link.tsx");
const pageHeader = ler("components/atlas/page-header.tsx");
const topbar = ler("components/atlas/topbar.tsx");
const leads = ler("app/(crm)/leads/page.tsx");
const styles = ler("app/globals.css");
const report = ler("docs/EVOLUTION_PHASE_028_NAVIGATION_PRIMARY_ACTION_STANDARD.md");

// ── O CATÁLOGO É EXECUTADO, NÃO GREPADO ─────────────────────────────────────
// `lib/atlas/navigation.ts` não importa nada, então basta transpilar para
// CommonJS e rodar. Comparar OBJETOS reais é o ponto: foi por grep que o
// `?focus=priority` sumiu de um dos três catálogos sem ninguém perceber.
function carregarCatalogo() {
  const saida = ts.transpileModule(ler("lib/atlas/navigation.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} };
  new Function("exports", "module", "require", saida)(modulo.exports, modulo, () => ({}));
  return modulo.exports;
}

const navegacao = carregarCatalogo();
const destinos = navegacao.atlasNavigation;

const destinosComAcaoGovernada = destinos.filter((item) =>
  typeof item.primaryAction?.label === "string" && item.primaryAction.label.trim().length > 0
  && typeof item.primaryAction?.href === "string" && item.primaryAction.href.startsWith("/")
  && typeof item.primaryAction?.outcome === "string" && item.primaryAction.outcome.trim().length > 0);

// A fiação ponta a ponta: o resolvedor que a topbar chama tem de devolver a ação
// do destino — inclusive em subrota, que é onde a herança costuma sumir.
const destinosQueChegamNaTela = destinos.filter((item) => {
  const resolvida = navegacao.getAtlasNavigationContext(item.href)?.primaryAction;
  return resolvida
    && resolvida.label === item.primaryAction.label
    && resolvida.href === item.primaryAction.href
    && resolvida.outcome === item.primaryAction.outcome;
});

// ── OS CABEÇALHOS DE PÁGINA ─────────────────────────────────────────────────
// JSX não dá para executar: aqui a expressão regular é a ferramenta certa, e
// só aqui.
function* arquivosTsx(diretorio) {
  for (const entrada of fs.readdirSync(diretorio, { withFileTypes: true })) {
    const alvo = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) yield* arquivosTsx(alvo);
    else if (entrada.name.endsWith(".tsx")) yield alvo;
  }
}

const cabecalhos = { total: 0, secundarios: 0, primarios: [], implicitos: [] };
let montagemManualDeAcoes = 0;

for (const arquivo of arquivosTsx(path.join(raiz, "app"))) {
  const fonte = fs.readFileSync(arquivo, "utf8");
  if (!fonte.includes("<PageHeader")) continue;
  const relativo = path.relative(raiz, arquivo);
  // `actions={...}` era a montagem livre de ReactNode que esta fase eliminou.
  montagemManualDeAcoes += (fonte.match(/actions=\{/g) || []).length;
  for (const trecho of fonte.split("action={{").slice(1)) {
    const corpo = trecho.slice(0, trecho.indexOf("}}"));
    cabecalhos.total += 1;
    if (corpo.includes('priority: "secondary"')) cabecalhos.secundarios += 1;
    else if (corpo.includes('priority: "primary"')) cabecalhos.primarios.push(relativo);
    else cabecalhos.implicitos.push(relativo);
  }
}

const primariosDeclarados = [...cabecalhos.primarios].sort();
const primariosEsperados = [...config.currentSurface.pageHeaderActionsPrimary].sort();

// A ordem dentro da topbar: o catálogo do DESTINO vem primeiro, a transição
// (`atlasTaskActions`) é o último recurso. Essa ordem é a correção de
// 2026-07-29 e precisa continuar visível.
const posicaoDaAcaoDoDestino = topbar.indexOf("navigationContext?.primaryAction");
const posicaoDaTransicao = topbar.indexOf("getAtlasTaskActionForPathname(pathname, identity)");

const leadsCreationIsPrimary = leads.includes('<Link href="/leads/new" className="atlas-button-primary">') ? 1 : 0;

const checks = [
  ["Fase 028 concluída sem mutação de dados", config.status === "completed" && config.runtimePresentationChanged === true && config.productionDataModified === false],
  ["Fase anterior permanece concluída", phaseTwentySeven.status === "completed" && phaseTwentySeven.exitCriteria.parallelWorkflowCreated === false],
  ["Contrato aceita somente prioridades explícitas", actionLink.includes('export type AtlasActionPriority = "primary" | "secondary"') && actionLink.includes('priority = "primary"')],
  ["A prioridade fica inspecionável", actionLink.includes("data-atlas-action-priority={priority}") && config.sharedContract.priorityValues.length === 2],
  ["PageHeader limita a declaração a uma ação", pageHeader.includes("action?: PageHeaderAction") && !pageHeader.includes("actions?: ReactNode") && config.sharedContract.maximumActionsPerPageHeader === 1],
  ["PageHeader usa o componente compartilhado", pageHeader.includes("<AtlasActionLink") && pageHeader.includes('aria-label="Ação principal do contexto"')],

  // ── A PROPRIEDADE, ONDE ELA VIVE HOJE ────────────────────────────────────
  // Substitui o contador de `action={{` em dashboard+sales (ver o cabeçalho).
  ["Todo destino do catálogo declara ação primária com resultado comercial",
    destinos.length === config.currentSurface.catalogDestinations
    && destinosComAcaoGovernada.length === destinos.length],
  ["A ação primária do destino chega à interface, inclusive em subrota",
    destinosQueChegamNaTela.length === destinos.length
    && navegacao.getAtlasNavigationContext("/pipeline/discards")?.primaryAction?.href === "/pipeline?focus=priority"],
  ["Topbar renderiza a ação do destino antes da transição",
    posicaoDaAcaoDoDestino !== -1 && posicaoDaTransicao !== -1
    && posicaoDaAcaoDoDestino < posicaoDaTransicao
    && config.currentSurface.topbarRendersCatalogPrimaryAction === true],
  ["O resultado comercial declarado chega ao nome acessível",
    topbar.includes('"outcome" in taskAction') && topbar.includes("aria-label=") && topbar.includes("title=")],

  ["Nenhum cabeçalho aceita montagem manual",
    montagemManualDeAcoes === 0 && config.auditedConsumers.manualActionsPropRemaining === 0],
  // Substitui `secondaryHeaderActions === 12` medido em dois arquivos: a mesma
  // garantia, agora sobre TODOS os cabeçalhos de `app/`.
  ["Nenhum cabeçalho tem prioridade acidental",
    cabecalhos.implicitos.length === 0
    && cabecalhos.total === config.currentSurface.pageHeaderActions],
  ["Aprofundamento não disputa com a ação da tela",
    cabecalhos.secundarios === config.currentSurface.pageHeaderActionsSecondary
    && cabecalhos.secundarios + primariosDeclarados.length === cabecalhos.total
    && primariosDeclarados.join("|") === primariosEsperados.join("|")],
  // A propriedade não sumiu, mudou de tela: cadastrar continua sendo a ação
  // primária da superfície de clientes — que hoje é /leads, no catálogo e no JSX.
  ["Criação de cliente permanece primária",
    leadsCreationIsPrimary === 1
    && destinos.find((item) => item.id === "leads")?.primaryAction?.href === "/leads/new"
    && config.auditedConsumers.customerCreationRemainsPrimary === true],

  ["Topbar usa o mesmo componente como ação primária", topbar.includes("<AtlasActionLink") && topbar.includes('priority="primary"') && topbar.includes("getAtlasTaskActionForPathname")],
  ["Nome acessível e decoração estão separados", actionLink.includes('aria-label={props["aria-label"] ?? label}') && actionLink.includes('aria-hidden="true"') && config.accessibility.optionalArrowIsDecorative === true],
  ["Ação preserva densidade sem cortar o nome acessível", styles.includes(".atlas-action-label") && styles.includes("text-overflow: ellipsis") && styles.includes(".atlas-page-action")],
  ["Alvo de página e adaptação móvel estão definidos", styles.includes("min-height: 44px") && styles.includes(".atlas-page-actions > * { flex: 1 1 auto; }") && config.visualBehavior.pageActionMinimumTargetPx === 44],
  ["Destinos, rotas e RBAC permanecem intactos", config.navigationDestinationsChanged === false && config.safetyPolicy.rbacPreserved === true && config.exitCriteria.routeRemoved === false && config.exitCriteria.permissionChanged === false],
  ["Métrica comportamental não foi inventada", config.measurementPolicy.inventedBehaviorMetricAllowed === false && config.measurementPolicy.structuralConsistencyIsRuntimeProof === false],
  ["Registro histórico da migração preservado", config.auditedConsumers.pageHeadersMigrated === 13 && report.includes("13 cabeçalhos")],
  ["Relatório documenta contrato, limite e próxima fase", report.includes("no máximo uma ação") && report.includes("não comprova aumento de conversão") && report.includes("Fase 029")],
  ["Relatório documenta por que a medição foi reapontada", report.includes("Reapontamento da medição") && report.includes("2026-07-29")],
  ["Gate de homologação não foi contornado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 028 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 028 aprovada: ação primária governada pelo catálogo e renderizada na topbar, uma ação declarativa por cabeçalho e prioridade explícita em todos eles.");
