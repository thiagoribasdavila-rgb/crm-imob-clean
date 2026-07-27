/**
 * Contrato do MAPEADOR DE QUALIFICAÇÃO.
 *
 * A ingestão preserva `[{chave, resposta}]` do formulário. Isso é fiel mas
 * cru: o pipeline não filtra por `você_procura_um_imóvel_para?` e a IA não
 * cruza duas leads cujas perguntas foram escritas diferente.
 *
 * Os 26 formulários da conta escrevem a mesma pergunta de várias formas —
 * "Qual faixa de investimento?" e "Faixa de investimento:" são a mesma coisa.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "crm", "lead-qualification-fields.ts"), "utf8");
const q = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`);

const r = (chave, resposta) => ({ chave, resposta });

test("as 3 perguntas reais dos formulários viram os 3 campos", () => {
  const c = q.mapearQualificacao([
    r("você_procura_um_imóvel_para?", "morar"),
    r("qual_faixa_de_investimento?", "R$ 400 mil a R$ 600 mil"),
    r("como_pretende_adquirir_o_imóvel?", "financiamento"),
  ]);
  assert.equal(c.intencao, "morar");
  assert.equal(c.faixaInvestimento, "R$ 400 mil a R$ 600 mil");
  assert.equal(c.formaPagamento, "financiamento");
  assert.equal(q.daParaPriorizar(c), true);
});

test("a mesma pergunta escrita diferente casa igual", () => {
  // Casar por texto exato quebraria no dia seguinte a qualquer edição do
  // marketing, que reescreve título de campo sem avisar ninguém.
  const c = q.mapearQualificacao([
    r("Faixa de investimento:", "Até R$ 300 mil"),
    r("Qual a intenção da compra?", "Investimento para alugar"),
  ]);
  assert.equal(c.faixaInvestimento, "Até R$ 300 mil");
  assert.equal(c.intencao, "investir");
});

test("'investir para depois morar' é INVESTIMENTO", () => {
  assert.equal(q.mapearQualificacao([r("intenção da compra", "investir para depois morar")]).intencao, "investir");
});

test("pergunta desconhecida é preservada, nunca descartada", () => {
  // Descartar o que não se reconhece é como a informação se perdeu da primeira
  // vez. A pergunta que o marketing inventar mês que vem cai aqui.
  const c = q.mapearQualificacao([r("quantos_dormitórios?", "3 quartos")]);
  assert.equal(c.naoMapeadas.length, 1);
  assert.equal(c.naoMapeadas[0].resposta, "3 quartos");
});

test("resposta que o padrão não entende também é preservada", () => {
  const c = q.mapearQualificacao([r("como_pretende_adquirir_o_imóvel?", "ainda não sei")]);
  assert.equal(c.formaPagamento, null);
  assert.equal(c.naoMapeadas[0].resposta, "ainda não sei");
});

test("formulário de RECRUTAMENTO não vira qualificação de venda", () => {
  // Vários formulários da conta são de contratação de corretores.
  const c = q.mapearQualificacao([r("você_possui_alguma_experiência_no_mercado_imobiliário?", "sim")]);
  assert.equal(c.intencao, null);
  assert.equal(c.faixaInvestimento, null);
  assert.equal(q.daParaPriorizar(c), false);
});

test("'não perguntou' é distinguido de 'não respondeu'", () => {
  // Os três formulários ativos hoje caem aqui. Cobrar do cliente uma resposta
  // que ninguém pediu é o erro que esta distinção evita.
  const c = q.mapearQualificacao([]);
  assert.equal(c.formularioPerguntou, false);
  assert.equal(q.resumirQualificacao(c), null, "silêncio, não 'sem informação'");
});

test("a faixa fica como o cliente escolheu, sem virar número", () => {
  // "R$ 400 a 600 mil" não é um valor — converter inventaria precisão.
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/parseFloat|parseInt|Number\(resposta/.test(codigo));
});

test("prioridade exige intenção E faixa", () => {
  assert.equal(q.daParaPriorizar(q.mapearQualificacao([r("intenção da compra", "morar")])), false,
    "sem faixa, 'ligar primeiro para quem compra mais rápido' é chute");
});

test("o mapeador é puro — nenhum acesso a banco", () => {
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/supabase|fetch\(|\.from\(/.test(codigo),
    "a régua precisa ser revisável por quem entende do negócio, não do código");
});
