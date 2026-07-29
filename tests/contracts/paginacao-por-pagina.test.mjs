/**
 * Contrato do seletor "por página" da carteira (/leads).
 *
 * Nasceu da revisão adversarial de 2026-07-28 (15 achados confirmados). Cada
 * teste aqui fixa um achado que custou caro descobrir — a maioria invisível
 * para build, lint e para quem testa só o caminho feliz.
 *
 * ── POR QUE ERA "AS DUAS TELAS" E HOJE É UMA ────────────────────────────────
 *
 * A versão original deste contrato cobria /leads E "Clientes 360" (/customers),
 * porque a revisão flagrou que as duas listas paginavam com regras diferentes
 * (Leads deixava escolher 10/20/50/100; Clientes era 25 fixo). Em 2026-07-29 a
 * divergência foi resolvida do jeito mais forte possível: a segunda tela foi
 * APAGADA. Ela lia a MESMA tabela `leads` pela mesma função
 * (`readCompatibleCustomers` era alias de `readCompatibleLeads`), não tinha SLA,
 * filtros, lote nem ordenação, e — o motivo grave — não aplicava o piso de
 * carteira: um corretor abria /customers e via as 469 leads da imobiliária
 * inteira, com telefone, e-mail e botão de copiar.
 *
 * Registrar isto aqui é o ponto: um contrato que some sem substituto é
 * cobertura perdida em silêncio. O que sobrou de obrigação sobre a tela morta
 * está no último teste — a rota precisa continuar RESPONDENDO.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const semComentarios = (texto) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const leads = ler("app", "(crm)", "leads", "page.tsx");
const css = ler("app", "globals.css");

test("a lista oferece as quatro opções de tamanho", () => {
  // A revisão flagrou a divergência: Leads escolhia, Clientes era 25 fixo.
  // Duas telas de lista com regras diferentes é o corretor reaprendendo o app —
  // resolvido apagando a segunda lista, não duplicando a regra nela.
  assert.match(leads, /const OPCOES_POR_PAGINA = \[10, 20, 50, 100\]/);
});

test("o teto da rota cobre a maior opção do seletor", () => {
  // Oferecer 100 na tela com teto 50 no servidor devolveria 50 em silêncio.
  const rotaLeads = ler("app", "api", "v1", "crm", "leads", "route.ts");
  assert.match(rotaLeads, /Math\.min\(100,/);
});

test("trocar o tamanho volta à página 1 no mesmo clique", () => {
  // Página 5 de 10-por-página não existe com 100-por-página; sem o reset, a
  // troca pedia uma página fantasma.
  const aoTrocar = leads.slice(leads.indexOf("setPorPagina(Number(event.target.value))"), 0x7fffffff).slice(0, 120);
  assert.match(aoTrocar, /setPage\(1\)/);
});

test("a escolha sobrevive à navegação (persistida e validada)", () => {
  // Valor salvo fora da lista (garbage, versão antiga) cai no padrão em vez de
  // virar limit arbitrário na URL.
  assert.match(leads, /OPCOES_POR_PAGINA\.includes\(filters\.porPagina/);
});

test("a seleção em lote sobrevive ao recarregamento como interseção", () => {
  // Achado média: marcar 15 leads e ampliar para "Mostrar 50" zerava a
  // seleção em silêncio — no exato fluxo que o seletor convida. Selecionado
  // continua subconjunto do visível; quem saiu da página sai da seleção.
  const codigo = semComentarios(leads);
  assert.ok(!/setItems\(payload\.data\.items\);\s*setSelected\(new Set\(\)\)/.test(codigo),
    "zerar a seleção em todo load é perda silenciosa de trabalho manual");
  assert.match(codigo, /const visiveis = new Set\(payload\.data\.items\.map\(\(lead\) => lead\.id\)\)/);
  assert.match(codigo, /\[\.\.\.atual\]\.filter\(\(id\) => visiveis\.has\(id\)\)/);
});

test("página além do total cai para a última válida", () => {
  // Achado: transferir os últimos leads da página 3 encolhia o total e a tela
  // dizia "nenhum lead corresponde" com 20 leads no filtro — e sem barra para
  // voltar, porque a barra desmontava junto.
  assert.match(leads, /if \(page > totalDePaginas && \(payload\.data\.page\.total \?\? 0\) > 0\)/);
  assert.match(leads, /setPage\(Math\.max\(1, totalDePaginas\)\)/);
});

test("a barra é uma região estável — não desmonta a cada busca", () => {
  // aria-live só anuncia mudanças DENTRO de nó que já existe. A versão
  // anterior desmontava a barra no loading: o span nascia pronto e o leitor de
  // tela nunca ouvia nada; o foco do botão clicado caía para o body.
  assert.match(leads, /\{total > 0 \|\| items\.length \? \(/);
  assert.ok(!/\{!loading && items\.length \? \(\s*<div className="atlas-pagination">/.test(leads),
    "voltar a condicionar a barra ao loading mata o aria-live e rouba o foco");
  // Durante a busca os controles desabilitam em vez de sumir.
  assert.match(leads, /disabled=\{loading \|\| page <= 1\}/);
  assert.match(leads, /disabled=\{loading \|\| page >= pages\}/);
});

test("o nome acessível do seletor é o rótulo visível", () => {
  // aria-label sobrescrevia o <label> "Mostrar … por página" (WCAG 2.5.3:
  // o nome computado deve conter o rótulo visível).
  const selecao = leads.slice(leads.indexOf('className="atlas-pagination-tamanho"'), leads.indexOf("por página"));
  assert.ok(!/aria-label=/.test(selecao), "o label envolvente já dá o nome; aria-label o sobrescreve");
});

test("plural de verdade e no vocabulário da página", () => {
  // "contato(s)" destoava (a página inteira fala "lead") e o parêntese era
  // lido em voz alta pelo leitor de tela dentro da região viva.
  assert.ok(!/contato\(s\)/.test(leads));
  assert.match(leads, /\{total === 1 \? "lead" : "leads"\}/);
});

test("setas decorativas ficam fora do nome acessível", () => {
  assert.match(leads, /<span aria-hidden="true">← <\/span>Anterior/);
  assert.match(leads, /Próxima<span aria-hidden="true"> →<\/span>/);
});

test("o select da barra não tem override de tema claro", () => {
  // Achado ALTA: o painel da tabela é uma ilha escura nos dois temas (gradiente
  // com rgba literais). O override claro punha texto quase preto sobre fundo
  // escuro — o número escolhido sumia. Escurecer só um controle da ilha é o
  // defeito; a ausência da regra é a correção.
  assert.ok(!/data-theme="light"\][^{]*\.atlas-pagination-tamanho/.test(css),
    "o select segue as cores da ilha escura, como os botões vizinhos");
});

test("o texto da barra passa no contraste AA", () => {
  // #607087 a 9px media 3,88:1 sobre o gradiente do painel (mínimo AA: 4,5:1).
  // Sem comentários: o próprio CSS cita a cor reprovada ao explicar a troca.
  const cssLimpo = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const bloco = cssLimpo.slice(cssLimpo.indexOf(".atlas-pagination span"), cssLimpo.indexOf(".atlas-pagination-navegacao"));
  assert.ok(!/#607087/.test(bloco), "cor reprovada no AA voltou para a barra");
  assert.ok(!/font-size: 9px/.test(bloco), "9px é pequeno demais para o texto de onde-estou");
});

test("a lista que foi apagada continua respondendo, não dando 404", () => {
  // /customers morreu como TELA, não como URL. A memória de workspace do
  // usuário guarda "/customers" no localStorage e scripts/test-real-routes.mjs
  // faz probe HTTP nela: 404 seria pior que redirect. Quem tinha a tela aberta
  // cai na carteira — desta vez com o piso de carteira aplicado.
  const porta = ler("app", "(crm)", "customers", "page.tsx");
  assert.match(porta, /redirect\("\/leads"\)/);
  assert.ok(!/"use client"/.test(porta),
    "o redirect é de servidor: um client component pagaria hidratação para não renderizar nada");
  assert.ok(!fs.existsSync(path.join(raiz, "app", "api", "v1", "customers", "route.ts")),
    "a rota que lia 5.000 leads sem ownerId não pode voltar");
});
