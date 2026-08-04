/**
 * CONTRATO: a Página vem do banco, e "não sei" nunca vira "não tem".
 *
 * ── O defeito medido, em números ──────────────────────────────────────────
 *
 * Em 03/08/2026, com 103 leads pagas paradas na Meta, `/api/v1/marketing/
 * held-leads` respondia **200 OK com `totalRepresado: 0`**. A causa era uma
 * linha: `process.env.META_PAGE_ID`, variável que não existe no ambiente do
 * servidor. O ID estava em `meta_lead_sources.page_id` — na mesma tabela que a
 * rota já lia — e ninguém perguntou a ela.
 *
 * O que torna esse defeito pior que uma falha: um zero não pede investigação.
 * Erro vermelho alguém conserta; "0 leads represadas" alguém comemora.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegerPagina } from "../../lib/meta/pagina-da-organizacao.ts";
import { resolverPageId } from "../../lib/meta/identificadores.ts";

const PAGINA_DAVILA = "582258611872380"; // DA'Vila Consultoria, confirmada na Graph

/* ── A PÁGINA SAI DAS FONTES REGISTRADAS ─────────────────────────────────── */

test("com fontes registradas, a Página sai do banco — sem depender de variável", () => {
  const r = elegerPagina([
    { page_id: PAGINA_DAVILA, active: true },
    { page_id: PAGINA_DAVILA, active: true },
    { page_id: PAGINA_DAVILA, active: false },
  ]);
  assert.equal(r.pageId, PAGINA_DAVILA);
  assert.equal(r.ambigua, false, "uma Página só não é escolha — não há do que avisar");
  assert.equal(r.fontesAtivas, 2);
  assert.equal(r.fontesTotais, 3);
});

test("sem nenhuma fonte, devolve null — e null significa NÃO SEI, não 'não tem'", () => {
  const r = elegerPagina([]);
  assert.equal(r.pageId, null);
  assert.equal(r.paginasDistintas, 0);
});

test("linhas com page_id vazio ou nulo não elegem Página fantasma", () => {
  const r = elegerPagina([{ page_id: null, active: true }, { page_id: "   ", active: true }]);
  assert.equal(r.pageId, null);
});

/* ── DUAS PÁGINAS: ELEGE A QUE A OPERAÇÃO ATENDE, E AVISA ────────────────── */

test("entre duas Páginas, vence a de mais fontes ATIVAS — não a de mais linhas", () => {
  const r = elegerPagina([
    { page_id: "111111111111", active: false },
    { page_id: "111111111111", active: false },
    { page_id: "111111111111", active: false },
    { page_id: PAGINA_DAVILA, active: true },
  ]);
  assert.equal(r.pageId, PAGINA_DAVILA, "cadastro inativo é lixo antigo; ativo é o que a operação atende");
  assert.equal(r.ambigua, true, "houve escolha — a tela precisa poder dizer isso");
});

test("empate resolve por id, para a escolha não oscilar entre execuções", () => {
  const linhas = [
    { page_id: "222222222222", active: true },
    { page_id: "111111111111", active: true },
  ];
  const primeira = elegerPagina(linhas).pageId;
  const segunda = elegerPagina([...linhas].reverse()).pageId;
  assert.equal(primeira, segunda, "valor que oscila é pior que valor errado: não dá para reproduzir");
  assert.equal(primeira, "111111111111");
});

/* ── A ORDEM: BANCO PRIMEIRO, AMBIENTE DEPOIS ───────────────────────────── */

test("a fonte salva vence META_PAGE_ID — a config da operação é a verdade", () => {
  const r = resolverPageId({ daFonteSalva: PAGINA_DAVILA, doAmbiente: "999999999999" });
  assert.equal(r.valor, PAGINA_DAVILA);
  assert.equal(r.origem, "fonte");
});

test("sem fonte no banco, META_PAGE_ID ainda funciona — não quebra quem já dependia dela", () => {
  const r = resolverPageId({ daFonteSalva: null, doAmbiente: "999999999999" });
  assert.equal(r.ok, true);
  assert.equal(r.origem, "ambiente");
});

test("sem banco e sem variável, a recusa é NOMEADA — nunca um zero silencioso", () => {
  const r = resolverPageId({ daFonteSalva: null, doAmbiente: undefined });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "META_PAGE_AUSENTE");
  assert.match(r.mensagem, /Escolha a Página/, "a mensagem precisa dizer o que fazer, não só o que faltou");
});

/* ── O CENÁRIO EXATO DE 03/08/2026 ──────────────────────────────────────── */

test("o estado real da produção resolve a Página sem nenhuma variável de ambiente", () => {
  // 29 fontes, 16 ativas, uma única Página — medido no banco vivo.
  const linhas = Array.from({ length: 29 }, (_, i) => ({ page_id: PAGINA_DAVILA, active: i < 16 }));
  const eleita = elegerPagina(linhas);
  const veredito = resolverPageId({ daFonteSalva: eleita.pageId, doAmbiente: undefined });

  assert.equal(veredito.ok, true, "com META_PAGE_ID ausente, a rota ainda tem de saber qual é a Página");
  assert.equal(veredito.valor, PAGINA_DAVILA);
  assert.equal(eleita.fontesAtivas, 16);
});
