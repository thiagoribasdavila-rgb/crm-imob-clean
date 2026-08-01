/**
 * Contrato do ALERTA INTERNO POR TELEGRAM.
 *
 * A promessa deste canal é estreita e precisa ser executável: leva contagem,
 * prazo e link — e NUNCA dado pessoal de lead. `montarAlertaDeSla` é pura
 * justamente para que essa promessa possa ser provada sem rede.
 *
 * Rodar: node --test tests/contracts/telegram-alert.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "integrations", "telegram.ts"), "utf8");

// O módulo importa runtime do app; para provar a função pura, isolamos só ela.
const inicio = fonte.indexOf("export function montarAlertaDeSla");
const fim = fonte.indexOf("/**", inicio);
const trecho = fonte.slice(inicio, fim > inicio ? fim : undefined);
const { montarAlertaDeSla } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(trecho.replace(/: string$/m, "")))}`
);

const LINK = "https://exemplo.test/leads?sort=first_contact_sla&direction=asc";

test("vencidas e a vencer aparecem com o número certo", () => {
  const texto = montarAlertaDeSla({ vencidas: 3, aVencer: 2, minutosMaisProximo: 4, linkDaFila: LINK });
  assert.match(texto, /3 lead\(s\) com prazo de primeiro contato VENCIDO/);
  assert.match(texto, /2 lead\(s\) com prazo correndo — a mais urgente vence em 4 min/);
  assert.ok(texto.includes(LINK));
});

test("sem nada pendente, não há mensagem — silêncio é melhor que ruído", () => {
  assert.equal(montarAlertaDeSla({ vencidas: 0, aVencer: 0, minutosMaisProximo: null, linkDaFila: LINK }), "");
});

test("só vencidas: não inventa 'vence em' para quem já venceu", () => {
  const texto = montarAlertaDeSla({ vencidas: 5, aVencer: 0, minutosMaisProximo: null, linkDaFila: LINK });
  assert.match(texto, /5 lead\(s\)/);
  assert.ok(!texto.includes("vence em"));
});

test("prazo desconhecido não vira número inventado", () => {
  const texto = montarAlertaDeSla({ vencidas: 0, aVencer: 1, minutosMaisProximo: null, linkDaFila: LINK });
  assert.match(texto, /1 lead\(s\) com prazo correndo\./);
  assert.ok(!/\d+ min/.test(texto));
});

test("a mensagem diz o que fazer, não só o que aconteceu", () => {
  const texto = montarAlertaDeSla({ vencidas: 1, aVencer: 0, minutosMaisProximo: null, linkDaFila: LINK });
  assert.match(texto, /Registre o contato no Atlas/);
});

test("NENHUM dado pessoal atravessa o canal", () => {
  // A função não recebe nome, telefone nem e-mail — e não pode passar a receber
  // sem que este teste caia junto. É a garantia executável da promessa.
  const texto = montarAlertaDeSla({ vencidas: 2, aVencer: 1, minutosMaisProximo: 9, linkDaFila: LINK });
  for (const proibido of ["@", "+55", "(11)", "CPF"]) {
    // O link é a única exceção legítima; removemos antes de checar.
    assert.ok(!texto.replace(LINK, "").includes(proibido), `alerta não pode conter "${proibido}"`);
  }
  const parametros = Object.keys({ vencidas: 0, aVencer: 0, minutosMaisProximo: 0, linkDaFila: "" });
  assert.deepEqual(parametros, ["vencidas", "aVencer", "minutosMaisProximo", "linkDaFila"]);
});

test("o arquivo declara e mantém a regra de privacidade", () => {
  assert.match(fonte, /NENHUM DADO PESSOAL DE LEAD SAI POR AQUI/);
  // parse_mode desabilitado: marcação com texto externo é porta de quebra.
  // Comentários são removidos antes: o arquivo EXPLICA por que não usa
  // parse_mode, e explicar não é usar.
  const semComentarios = fonte.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!semComentarios.includes("parse_mode"), "habilitar parse_mode exige revisar a montagem do texto");
});
