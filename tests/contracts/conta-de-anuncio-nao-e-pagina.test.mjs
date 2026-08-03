/**
 * CONTRATO: conta de anúncios nunca vira Página, e o pedido vence a variável.
 *
 * ── Os dois defeitos que estes casos tornam impossíveis ────────────────────
 *
 * 1. `2169318190556460` é a conta de anúncios "Inside – Senna". Tratada como
 *    Página, a Graph responde erro de PERMISSÃO — e quem lê conclui que falta
 *    autorização, quando o que está errado é o identificador. O diagnóstico
 *    erra de camada e a caçada dura semanas.
 *
 * 2. A tela mandava só `{ aplicar }` e a rota caía em `META_PAGE_ID`. Com o
 *    seletor de Página funcionando, deixar a variável global vencer o pedido
 *    tornaria o seletor decorativo: a pessoa escolhe uma Página, o servidor
 *    consulta outra, e nada na tela denuncia.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarPageId,
  validarFormId,
  resolverPageId,
  CONTAS_DE_ANUNCIO_CONHECIDAS,
} from "../../lib/meta/identificadores.ts";

const CONTA_INSIDE_SENNA = "2169318190556460";
const PAGINA_PLAUSIVEL = "102938475610293";

/* ── CONTA DE ANÚNCIOS NÃO É PÁGINA ──────────────────────────────────────── */

test("o ID da conta de anúncios é RECUSADO como Página, e a mensagem diz o que ele é", () => {
  const v = validarPageId(CONTA_INSIDE_SENNA);
  assert.equal(v.ok, false);
  assert.equal(v.codigo, "META_PAGE_E_CONTA_DE_ANUNCIO");
  assert.match(v.mensagem, /CONTA DE ANÚNCIOS/);
  assert.match(v.mensagem, /Inside/, "a mensagem precisa nomear a conta — 'id inválido' não ensina nada");
});

test("o prefixo act_ é recusado ANTES do formato — a pessoa ouve a causa certa", () => {
  const v = validarPageId(`act_${CONTA_INSIDE_SENNA}`);
  assert.equal(v.ok, false);
  assert.equal(
    v.codigo,
    "META_PAGE_E_CONTA_DE_ANUNCIO",
    "com act_ a causa é 'isso é conta', não 'o formato tem letras'",
  );
});

test("a conta conhecida está declarada com nome — a lista não é de números soltos", () => {
  assert.equal(CONTAS_DE_ANUNCIO_CONHECIDAS[CONTA_INSIDE_SENNA], "Inside – Senna");
});

test("uma Página plausível é aceita", () => {
  const v = validarPageId(PAGINA_PLAUSIVEL);
  assert.equal(v.ok, true);
  assert.equal(v.valor, PAGINA_PLAUSIVEL);
});

test("vazio, texto e URL são recusados com códigos distintos", () => {
  assert.equal(validarPageId("").codigo, "META_PAGE_AUSENTE");
  assert.equal(validarPageId("D'Avila Consultoria").codigo, "META_PAGE_FORMATO");
  assert.equal(validarPageId("https://facebook.com/1029384756").codigo, "META_PAGE_FORMATO");
});

/* ── A ORDEM DE RESOLUÇÃO ────────────────────────────────────────────────── */

test("o pedido VENCE a origem salva e o ambiente — senão o seletor é decorativo", () => {
  const r = resolverPageId({
    doPedido: PAGINA_PLAUSIVEL,
    daFonteSalva: "555555555555",
    doAmbiente: "777777777777",
  });
  assert.equal(r.ok, true);
  assert.equal(r.valor, PAGINA_PLAUSIVEL);
  assert.equal(r.origem, "pedido");
});

test("sem pedido, a origem salva vence o ambiente — a config por fonte é a principal", () => {
  const r = resolverPageId({ daFonteSalva: "555555555555", doAmbiente: "777777777777" });
  assert.equal(r.ok, true);
  assert.equal(r.valor, "555555555555");
  assert.equal(r.origem, "fonte");
});

test("META_PAGE_ID só entra quando é a única — é compatibilidade, não regra", () => {
  const r = resolverPageId({ doAmbiente: "777777777777" });
  assert.equal(r.ok, true);
  assert.equal(r.origem, "ambiente");
});

test("pedido INVÁLIDO não cai em silêncio para o ambiente", () => {
  // Este é o caso que mais engana: a pessoa cola a conta de anúncios, o sistema
  // ignora e consulta a Página do ambiente. A tela mostraria formulários — de
  // outra Página — e ninguém saberia.
  const r = resolverPageId({ doPedido: CONTA_INSIDE_SENNA, doAmbiente: "777777777777" });
  assert.equal(r.ok, false, "colar a conta de anúncios tem de FALAR, não ser contornado");
  assert.equal(r.codigo, "META_PAGE_E_CONTA_DE_ANUNCIO");
});

test("nenhuma das três fontes: recusa nomeada, não erro genérico", () => {
  const r = resolverPageId({});
  assert.equal(r.ok, false);
  assert.equal(r.codigo, "META_PAGE_AUSENTE");
});

/* ── FORMULÁRIO: ausente é legítimo com "todos" ──────────────────────────── */

test("com allForms, o formulário fica VAZIO — e isso é o valor honesto", () => {
  const v = validarFormId("", true);
  assert.equal(v.ok, true);
  assert.equal(v.valor, "", "com 'todos', prender a um formulário seria contradição");
});

test("sem allForms e sem formulário, a recusa explica a consequência", () => {
  const v = validarFormId("", false);
  assert.equal(v.ok, false);
  assert.equal(v.codigo, "META_FORM_AUSENTE");
  assert.match(v.mensagem, /não encontra origem/, "quem lê precisa saber que a lead fica esperando");
});

test("formulário específico é aceito quando allForms é falso", () => {
  const v = validarFormId("889900112233", false);
  assert.equal(v.ok, true);
  assert.equal(v.valor, "889900112233");
});
