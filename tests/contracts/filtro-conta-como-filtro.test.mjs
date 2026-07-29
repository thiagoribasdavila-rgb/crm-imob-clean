/**
 * Contrato: TODO FILTRO QUE RECORTA A LISTA CONTA COMO FILTRO.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * `app/(crm)/leads/page.tsx` enumerava os filtros DUAS VEZES: uma em
 * `hasFilters` (decide o texto do estado vazio) e outra em `activeFilterCount`
 * (a pastilha "N filtros"). O filtro `vinculo`, que entrou em 2026-07-29 quando a
 * tela de Clientes 360 foi aposentada e seus segmentos migraram para cá, ficou
 * fora das DUAS.
 *
 * Ele existe como estado, é lido da URL e viaja para a rota — só não contava
 * como filtro. Consequência medida: filtrar por vínculo e receber zero resultados
 * mostrava "Nenhum lead cadastrado" em vez de "resultado dos filtros atuais",
 * dizendo "você não tem leads" a um corretor com 272.
 *
 * Estado vazio que MENTE é pior que erro. O erro manda tentar de novo; a mentira
 * manda desistir — e ninguém abre um chamado dizendo "a tela me convenceu".
 *
 * ── POR QUE A ASSERÇÃO OLHA O `params.set` ──────────────────────────────────
 *
 * A definição operacional de "é filtro" não é o nome da variável nem estar numa
 * lista: é RECORTAR A CONSULTA. Quem condiciona um `params.set(...)` no fetch da
 * lista muda o que a rota devolve, e portanto muda o que o estado vazio significa.
 *
 * Ancorar aqui pega o filtro NOVO de amanhã, que é o modo real desta falha:
 * ninguém remove um filtro da contagem, mas todo mundo esquece de somar o décimo.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const pagina = fs.readFileSync(path.join(raiz, "app", "(crm)", "leads", "page.tsx"), "utf8");

/**
 * A busca textual fica fora da CONTAGEM de propósito — ela não é pastilha de
 * filtro — mas entra em `hasFilters`, porque para o estado vazio ela recorta
 * igual. Idem paginação e ordenação, que não recortam: reordenam.
 */
const FORA_DA_CONTAGEM = new Set(["debouncedSearch", "search", "page", "sort", "direction", "pageSize"]);

/**
 * Estados que recortam a consulta — a definição operacional.
 *
 * Ancorado na REGIÃO de montagem dos parâmetros, não na linha do `if`. A primeira
 * versão exigia `if (x) ... params.set(` na MESMA linha e perdeu o `broker`, cujo
 * `params.set` mora dentro de um if/else aninhado (ele escolhe entre `team_owner`
 * e `assigned_to` conforme o papel do selecionado). Asserção presa a formatação
 * quebra no primeiro reflow do arquivo; presa à região, não.
 */
function filtrosQueRecortam() {
  const inicio = pagina.indexOf('params.set("q"');
  assert.ok(inicio > 0, "não achei a montagem dos parâmetros da lista — a varredura perdeu a âncora");
  // Até o fim do bloco de montagem: a última chamada a params.set da função.
  const fim = pagina.lastIndexOf("params.set(");
  const regiao = pagina.slice(inicio, fim + 200);

  const nomes = new Set();
  for (const m of regiao.matchAll(/if\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:\)|===|&&)/g)) {
    if (!FORA_DA_CONTAGEM.has(m[1])) nomes.add(m[1]);
  }
  return nomes;
}

/** O conteúdo da ÚNICA lista de filtros ativos da página. */
function listaDeFiltrosAtivos() {
  const i = pagina.indexOf("const filtrosAtivos = [");
  assert.ok(i > 0, "a página precisa ter UMA lista `filtrosAtivos` — era a ausência dela que permitia duas enumerações divergentes");
  const corpo = pagina.slice(i, pagina.indexOf("]", i));
  return new Set([...corpo.matchAll(/^\s*([A-Za-z_$][\w$]*),/gm)].map((m) => m[1]));
}

test("a página tem filtros que recortam a consulta — senão não há o que conferir", () => {
  const recortam = filtrosQueRecortam();
  assert.ok(
    recortam.size >= 8,
    `achei ${recortam.size} filtros condicionando params.set; eram 9 em 2026-07-29 ` +
      `(${[...recortam].join(", ")}). Se caiu, ou a tela perdeu filtros ou a varredura quebrou — ` +
      "e uma varredura que não acha nada passa por vacuidade, que é o pior modo de falha.",
  );
});

test("todo filtro que recorta a consulta está na lista de filtros ativos", () => {
  const naLista = listaDeFiltrosAtivos();
  for (const filtro of filtrosQueRecortam()) {
    assert.ok(
      naLista.has(filtro),
      `"${filtro}" recorta a consulta e NÃO conta como filtro. Foi exatamente o caso do ` +
        "`vinculo`: com ele ativo e zero resultados, a tela diz \"Nenhum lead cadastrado\" a quem " +
        "tem carteira cheia. Acrescente-o a `filtrosAtivos`.",
    );
  }
});

test("e a lista não contém o que não recorta", () => {
  // O outro lado. Sem isto, jogar TODAS as variáveis da página em `filtrosAtivos`
  // satisfaria o teste acima — e a pastilha passaria a contar paginação como filtro.
  const recortam = filtrosQueRecortam();
  for (const naLista of listaDeFiltrosAtivos()) {
    assert.ok(
      recortam.has(naLista),
      `"${naLista}" está contado como filtro e não condiciona nenhum params.set — ` +
        "a pastilha diria \"N filtros\" para algo que não recorta nada",
    );
  }
});

test("os dois consumidores derivam da MESMA lista — não existe segunda enumeração", () => {
  /**
   * A raiz do defeito não foi um esquecimento: foi a lista existir duas vezes.
   * Enquanto `hasFilters` e `activeFilterCount` enumerarem por conta própria, o
   * décimo filtro vai faltar em uma das duas — é a classe de defeito dominante
   * deste repositório, e ela reaparece por cópia, não por descuido.
   */
  assert.match(pagina, /const hasFilters = Boolean\(search \|\| filtrosAtivos\.length\)/,
    "hasFilters precisa derivar de filtrosAtivos, não enumerar de novo");
  assert.match(pagina, /const activeFilterCount = filtrosAtivos\.length/,
    "activeFilterCount precisa derivar de filtrosAtivos, não enumerar de novo");
  // E que não sobre uma segunda lista literal: duas enumerações é o defeito.
  assert.equal(
    [...pagina.matchAll(/const filtrosAtivos = \[/g)].length,
    1,
    "existe mais de uma lista `filtrosAtivos` — a duplicação voltou",
  );
});
