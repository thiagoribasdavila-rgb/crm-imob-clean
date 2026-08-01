/**
 * Contrato de DESCREVER FALHA — o que foi lançado, em palavras.
 *
 * Nasceu de uma medição na fila de produção: das 8 entregas mortas, SETE
 * tinham `last_error = "Falha desconhecida"`. O código fazia
 * `erro instanceof Error ? erro.message : "Falha desconhecida"` — um caso
 * coberto, todos os outros apagados.
 *
 * A asserção que sustenta o arquivo: NENHUMA entrada produz a frase genérica
 * sozinha. Sempre sobra alguma informação — nem que seja o tipo.
 *
 * Rodar: node --test tests/contracts/descrever-falha.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { descreverFalha } from "../../lib/integrations/descrever-falha.ts";

test("Error devolve a mensagem", () => {
  assert.equal(descreverFalha(new Error("Meta Graph HTTP 400")), "Meta Graph HTTP 400");
});

test("a causa aninhada do Error sobrevive — é onde mora o erro de rede", () => {
  const raiz = new Error("ECONNRESET");
  const topo = new Error("falha ao buscar lead", { cause: raiz });
  assert.match(descreverFalha(topo), /falha ao buscar lead/);
  assert.match(descreverFalha(topo), /ECONNRESET/);
});

test("string lançada vira ela mesma", () => {
  assert.equal(descreverFalha("token expirado"), "token expirado");
});

test("objeto no formato da Graph API entrega mensagem e código", () => {
  const r = descreverFalha({ error: { message: "Object does not exist", code: 100 } });
  assert.match(r, /Object does not exist/);
  assert.match(r, /code 100/);
});

test("objeto qualquer vira JSON — nada se perde", () => {
  assert.match(descreverFalha({ status: 500, url: "/x" }), /"status":500/);
});

test("objeto VAZIO entrega o tipo, que é a única informação que existe", () => {
  // `{}` serializa para "{}" e não diz nada. Saber que foi um objeto sem
  // propriedades já é mais do que "falha desconhecida".
  assert.match(descreverFalha({}), /sem propriedades enumeráveis/);
});

test("null e undefined são DITOS, não escondidos", () => {
  assert.match(descreverFalha(null), /null/);
  assert.match(descreverFalha(undefined), /undefined/);
});

test("número e booleano lançados dizem o tipo e o valor", () => {
  assert.match(descreverFalha(404), /number.*404/);
  assert.match(descreverFalha(false), /boolean.*false/);
});

test("referência circular não derruba a descrição", () => {
  // Um `JSON.stringify` sem guarda lançaria aqui — e o erro do log viraria
  // um segundo erro, dentro do tratamento do primeiro.
  const a = { nome: "x" };
  a.self = a;
  assert.match(descreverFalha(a), /circular|não pôde ser serializado/);
});

test("mensagem gigante é cortada — last_error tem limite no banco", () => {
  const r = descreverFalha(new Error("x".repeat(5000)));
  assert.ok(r.length <= 901, `veio com ${r.length} caracteres`);
  assert.match(r, /…$/);
});

test("NENHUMA entrada produz a frase genérica sozinha", () => {
  // A asserção que sustenta o arquivo. Se um caminho voltar a devolver só
  // "Falha desconhecida", o diagnóstico morre de novo.
  const entradas = [new Error(""), "", 0, false, null, undefined, {}, [], new Date(0), Symbol("s")];
  for (const e of entradas) {
    const r = descreverFalha(e);
    assert.ok(r && r.trim().length > 0, `entrada ${String(e?.toString?.() ?? e)} devolveu vazio`);
    assert.notEqual(r, "Falha desconhecida", "voltou a frase que apagava o diagnóstico");
  }
});

test("Error SEM mensagem entrega o nome — foi este caso que o contrato pegou", () => {
  // `new Error("")` é legal, e a primeira versão devolvia string VAZIA: o mesmo
  // silêncio que o módulo existe para acabar, por outra porta.
  assert.match(descreverFalha(new Error("")), /Error sem mensagem/);
  assert.match(descreverFalha(new TypeError("")), /TypeError sem mensagem/);
});

test("string vazia não vira silêncio", () => {
  assert.match(descreverFalha(""), /vazia/);
});
