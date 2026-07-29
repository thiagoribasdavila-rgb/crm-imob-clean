import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

// O catálogo de navegação é EXECUTADO, não lido por regex: um catálogo que
// compila e devolve o objeto errado passa batido por qualquer grep.
function executarModulo(arquivo) {
  const compilado = ts.transpileModule(read(arquivo), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} };
  new Function("exports", "module", compilado)(modulo.exports, modulo);
  return modulo.exports;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const previous = json("config/evolution-phase-092-atlas-core-v2-visual-primitives.json");
const phase = json("config/evolution-phase-093-canonical-surface-navigation.json");
const program = json("config/evolution-program-3000.json");
const surfaces = json("config/atlas-core-v2-route-surfaces.json");
const contracts = json("config/atlas-core-v2-contracts.json");
const navigation = read("lib/atlas/navigation.ts");
const registry = read("lib/atlas/core-v2/page-registry.ts");
const sidebar = read("components/atlas/sidebar.tsx");
const mobileDock = read("components/atlas/mobile-dock.tsx");
const commandPalette = read("components/CommandPalette.tsx");
const report = read("docs/EVOLUTION_PHASE_093_CANONICAL_SURFACE_NAVIGATION.md");
const catalogo = executarModulo("lib/atlas/navigation.ts");

const pageFiles = walk("app")
  .filter((file) => file.endsWith(`${path.sep}page.tsx`) || file === "app/page.tsx")
  .map((file) => file.split(path.sep).join("/"))
  .sort();

const startsWithAny = (file, prefixes) => prefixes.some((prefix) => file.startsWith(prefix));

function classify(file) {
  if (surfaces.retiredExactFiles.includes(file) || startsWithAny(file, surfaces.retiredPrefixes)) return "retired";
  if (surfaces.canonicalExactFiles.includes(file)) return "canonical";
  if ((surfaces.publicExactFiles ?? []).includes(file)) return "public";
  if ((surfaces.internalExactFiles ?? []).includes(file) || startsWithAny(file, surfaces.internalPrefixes)) return "internal";
  if (startsWithAny(file, surfaces.experimentalPrefixes)) return "experimental";
  if (startsWithAny(file, surfaces.contextualPrefixes)) return "contextual";
  return "unclassified";
}

const contar = (arquivos) => arquivos.reduce((contagem, arquivo) => {
  const superficie = classify(arquivo);
  contagem[superficie] = (contagem[superficie] ?? 0) + 1;
  return contagem;
}, {});

const classification = contar(pageFiles);

// ── REAPONTADA EM 2026-07-29 — o número 243 saiu, a propriedade ficou ────────
//
// A asserção original era `pageFiles.length === 243`. MEDIDO hoje: 199. Fixar
// 199 no lugar de 243 seria trocar um número cego por outro: na próxima
// limpeza ele volta a divergir e ninguém saberá o porquê. Foi assim que este
// repo já produziu guardas contraditórias sobre o mesmo array.
//
// O que se afirma agora é a PROPRIEDADE, em três partes:
//   1. todo page.tsx vivo tem superfície (zero 'unclassified');
//   2. o delta contra o inventário de 2026-07-21 é EXATAMENTE o conjunto de
//      arquivos declarado em routeInventoryDelta — conferido no disco: os
//      removidos têm de estar AUSENTES, os acrescentados PRESENTES;
//   3. cada contagem por superfície é DERIVADA de routeInventory ± o delta,
//      classificando os arquivos declarados com a MESMA classify().
//
// Assim ninguém reconcilia esta guarda mexendo num número: é preciso declarar
// os arquivos, e o disco é quem confirma. Causa medida do delta 243 -> 199:
// 48 páginas-casca removidas em 033cd9b3 (26/07, todas 'experimental'), 2
// rotas legadas em 0ad1a374 (29/07, 'contextual') e 6 páginas novas — 2 de
// produto sob (crm), 3 públicas de LGPD/Meta e a comparação de marca.
const delta = phase.routeInventoryDelta;
const removidas = delta.removedFiles;
const acrescentadas = delta.addedFiles;
const removidasPorSuperficie = contar(removidas);
const acrescentadasPorSuperficie = contar(acrescentadas);
const superficies = ["canonical", "contextual", "internal", "experimental", "retired", "public"];
const esperadoPorSuperficie = Object.fromEntries(superficies.map((superficie) => [
  superficie,
  (phase.routeInventory[superficie] ?? 0)
    - (removidasPorSuperficie[superficie] ?? 0)
    + (acrescentadasPorSuperficie[superficie] ?? 0),
]));
const totalEsperado = phase.routeInventory.pageFiles - removidas.length + acrescentadas.length;

// ── REAPONTADA EM 2026-07-29 — a busca mudou de casa, não de contrato ────────
//
// A asserção lia components/atlas/sidebar.tsx procurando `item.keywords` e
// `item.businessOutcome`. A barra foi reescrita em 5e18d032/b9e83259: a busca
// PRÓPRIA dela saiu (duas buscas na mesma tela obrigam a pessoa a escolher qual
// usar, e a da barra só filtrava o que já estava visível) e o ⌘K herdou o
// papel. O ⌘K monta a lista do MESMO getAtlasNavigationForIdentity, com as
// mesmas permissões — então a propriedade não morreu, mudou de arquivo.
//
// Os campos que a busca precisa considerar não estão mais escritos à mão aqui:
// vêm de phase.navigation.searchUses. E a prova de que 'business-outcome'
// importa é medida, não afirmada — abaixo se conta quantas palavras vivem
// SÓ no businessOutcome de algum módulo (invisíveis a label+grupo+keywords).
const identidadeDiretor = { role: "director", accessRole: "admin" };
const itensDoCatalogo = catalogo.getAtlasNavigationForIdentity(identidadeDiretor);
const normalizar = (valor) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const palavras = (valor) => normalizar(valor).split(/[^\p{L}\p{N}]+/u).filter((palavra) => palavra.length > 4);
const palavrasSoNoResultado = itensDoCatalogo.flatMap((item) => {
  const semResultado = new Set(palavras(`${item.label} ${item.group} ${item.keywords}`));
  return palavras(item.businessOutcome).filter((palavra) => !semResultado.has(palavra));
});
const campoDoContrato = { label: "command.label", group: "command.group", keywords: "command.keywords", "business-outcome": "command.outcome" };
const filtroDaPaleta = commandPalette.match(/normalize\(`([^`]*)`\)\.includes\(normalizedQuery\)/)?.[1] ?? "";

const primaryNavigationSource = navigation
  .split("export const atlasNavigation = [")[1]
  ?.split("export const atlasInternalNavigation")[0] ?? "";
const internalNavigationSource = navigation
  .split("export const atlasInternalNavigation = [")[1]
  ?.split("export const atlasContextCommands")[0] ?? "";
const canonicalNavigationItems = primaryNavigationSource.match(/surface: "canonical"/g)?.length ?? 0;
const internalNavigationItems = internalNavigationSource.match(/surface: "internal"/g)?.length ?? 0;
const primaryBusinessOutcomes = primaryNavigationSource.match(/businessOutcome:/g)?.length ?? 0;
const primaryActions = primaryNavigationSource.match(/primaryAction:/g)?.length ?? 0;
const primaryDataDomains = primaryNavigationSource.match(/dataDomains:/g)?.length ?? 0;
const requiredModules = contracts.pageRules.requiredModules;
const compatibilitySources = surfaces.compatibilityMap.map((entry) => entry.source);

const checks = [
  ["Fase 92 foi preservada", previous.phase === 92 && previous.status === "completed"],
  ["Fase 93 conclui navegação sem banco ou autenticação", phase.phase === 93 && phase.status === "completed" && phase.databaseSchemaChanged === false && phase.authenticationChanged === false && phase.productionDataModified === false],
  ["Programa contínuo avançou para 93", program.currentPhase >= 93],
  ["Todo page.tsx vivo tem superfície declarada", classification.unclassified === undefined && pageFiles.length === totalEsperado && totalEsperado === delta.expectedPageFiles],
  ["O delta contra o inventário de 2026-07-21 é exatamente o conjunto declarado", removidas.every((file) => !fs.existsSync(file)) && acrescentadas.every((file) => fs.existsSync(file)) && removidas.every((file) => !pageFiles.includes(file)) && acrescentadas.every((file) => pageFiles.includes(file))],
  ["Contagens de superfície derivam da evidência mais o delta declarado", superficies.every((surface) => (classification[surface] ?? 0) === esperadoPorSuperficie[surface])],
  ["Arquivos canônicos existem", surfaces.canonicalExactFiles.every((file) => pageFiles.includes(file))],
  ["Navegação produtiva possui 16 contratos canônicos", canonicalNavigationItems === 16 && phase.navigation.productiveItems === 16],
  ["Evolução V3 permanece interna e fora do menu diário", internalNavigationItems === 0 && !primaryNavigationSource.includes('href: "/atlas-v3"') && navigation.includes("atlasInternalNavigation")],
  ["Cada item visível declara resultado, ação e dados", canonicalNavigationItems === primaryBusinessOutcomes && canonicalNavigationItems === primaryActions && canonicalNavigationItems === primaryDataDomains],
  ["Contratos profundos cobrem os 19 módulos produtivos", requiredModules.length === 19 && requiredModules.every((id) => registry.includes(`id: "${id}"`))],
  ["Existe uma única busca, e ela é o ⌘K sobre o catálogo permissionado", !sidebar.includes("item.keywords") && sidebar.includes("getAtlasNavigationForIdentity") && commandPalette.includes("getAtlasNavigationForIdentity") && commandPalette.includes("getAtlasContextCommandsForIdentity")],
  ["Busca global entende intenção comercial", palavrasSoNoResultado.length > 0 && phase.navigation.searchUses.every((campo) => filtroDaPaleta.includes(`\${${campoDoContrato[campo]}}`)) && commandPalette.includes("outcome: item.businessOutcome")],
  ["Catálogos legados e contadores por grupo saíram do shell", !sidebar.includes("legacy catalog removed") && !mobileDock.includes("legacy catalog removed") && !sidebar.includes("groupItems.length} telas")],
  ["Compatibilidade explícita cobre aliases críticos", ["/kanban", "/pipedrive", "/atlas-v2", "/crm", "/analytics"].every((route) => compatibilitySources.includes(route))],
  ["Nenhuma rota foi removida ou forçada a redirecionar", phase.compatibility.routesDeleted === 0 && phase.compatibility.redirectsForced === 0 && surfaces.productionNavigationPolicy.internalRoutesRemainAddressable === true],
  ["Relatório cobre problema, mudanças, impacto e riscos", report.includes("Problema resolvido") && report.includes("Alterações realizadas") && report.includes("Impacto operacional") && report.includes("Riscos identificados")],
  ["Build e ZIP continuam reservados à fase 100", phase.release.buildExecuted === false && phase.release.zipCreated === false && phase.release.checkpointPhase === 100],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`Fase 093 verificada: ${pageFiles.length} páginas classificadas, ${canonicalNavigationItems} módulos produtivos e zero rota sem superfície.`);
