/**
 * Contrato do RECUO da tela de Vendas.
 *
 * `opportunities` existe nesta base e tem ZERO linhas. A consulta devolvia
 * sucesso com lista vazia, `isMissingRelation` era falso, o recuo para `leads`
 * nunca disparava — e a tela de Vendas ficava em branco enquanto havia leads
 * com status `ganho` no banco.
 *
 * Tabela vazia e tabela ausente contam a MESMA história para quem olha: "o dado
 * canônico ainda não chegou aqui".
 *
 * Rodar: node --test tests/contracts/vendas-recuo-tabela-vazia.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const tela = fs.readFileSync(path.join(raiz, "app", "(crm)", "sales", "page.tsx"), "utf8");

test("o recuo cobre tabela ausente E tabela vazia", () => {
  assert.match(
    tela,
    /if \(\(loadError && isMissingRelation\(loadError\)\) \|\| \(!loadError && \(data \?\? \[\]\)\.length === 0\)\)/,
    "só `isMissingRelation` deixa a tela em branco quando a tabela existe e está vazia",
  );
});

test("o recuo só acontece quando NÃO houve erro de verdade", () => {
  // Um erro real (permissão, rede) não pode virar recuo silencioso: aí a tela
  // mostraria dados legados como se a leitura canônica tivesse funcionado.
  assert.match(tela, /!loadError && \(data \?\? \[\]\)\.length === 0/,
    "a segunda condição exige ausência de erro");
  assert.match(tela, /setError\("Não foi possível carregar as oportunidades\."\)/,
    "erro real continua virando erro visível");
});

test("a razão do recuo está escrita onde alguém vai ler", () => {
  const bloco = tela.slice(
    Math.max(0, tela.indexOf("isMissingRelation(loadError)") - 1200),
    tela.indexOf("isMissingRelation(loadError)"),
  );
  assert.match(bloco, /tem zero linhas|tabela vazia/i,
    "sem o porquê, a próxima pessoa 'simplifica' a condição de volta");
});
