/**
 * Contrato da PONTUAÇÃO DA LEAD.
 *
 * O banco tinha `score` e `score_ia` como se fossem a mesma coisa — e
 * discordavam: leads com `score_ia` 35 e 50 tinham `score` ZERO.
 *
 * `score_ia` é a canônica: é o que `lib/compat/live-writes.ts` grava na
 * criação, o que 27 arquivos leem, e o que `isQualifiedLead` consulta para
 * decidir se a conversão vai para a Meta. `score` era gravada só pela rota de
 * qualificação, e ninguém a lia para decidir nada.
 *
 * Enquanto a coluna antiga existir, ela precisa carregar o MESMO valor. O
 * risco não é a coluna existir — é ela mentir na tela que ainda a lê.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const qualify = ler("app", "api", "v1", "leads", "[id]", "qualify", "route.ts");
const ingestao = ler("app", "api", "v1", "leads", "route.ts");

test("a rota de qualificação grava as DUAS colunas", () => {
  // Gravava só `score` — a coluna que ninguém consulta para decidir.
  assert.match(qualify, /score: qualification\.score,\s*\n\s*score_ia: qualification\.score,/);
});

test("a ingestão também grava as duas", () => {
  assert.match(ingestao, /score_ia: score\.score,[\s\S]{0,400}?score: score\.score,/);
});

test("classificacao_ia acompanha temperature nos dois caminhos", () => {
  // Era o par congelado: `temperature` avançava e `classificacao_ia` ficava no
  // valor do nascimento da lead.
  assert.match(qualify, /classificacao_ia: qualification\.temperature/);
  assert.match(ingestao, /classificacao_ia: score\.temperature/);
});

test("escrever as duas juntas é o que impede de divergirem", () => {
  // A razão precisa estar escrita junto do código, não só no commit.
  assert.match(qualify, /UMA PONTUAÇÃO, NÃO DUAS/);
  assert.match(qualify, /score_ia` é a canônica/);
});

test("o CAPI decide pela coluna canônica", () => {
  // Se ele lesse `score`, uma lead qualificada com score zero deixaria de
  // virar conversão — e ninguém saberia por quê.
  const capi = ler("lib", "integrations", "meta", "capi-feedback.ts");
  assert.match(capi, /score_ia: lead\.score_ia/);
});
