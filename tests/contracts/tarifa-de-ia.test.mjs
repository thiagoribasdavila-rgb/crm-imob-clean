/**
 * Contrato da TARIFA DE IA — o custo não fica zerado por configuração ausente.
 *
 * ── O que motivou ──────────────────────────────────────────────────────────
 *
 * Em 01/08/2026, o job `validate` do PR #9 ficou vermelho com:
 *
 *     ATLAS_AI_PRICE_TABLE ausente. Todo consumo de IA será gravado com custo NULO.
 *
 * Vermelho legítimo — mas causado por ausência de configuração NO CI, não por
 * defeito do código. A tentação era silenciar o portão. O conserto certo foi
 * dar ao CI uma tarifa válida (`config/ai-price-table.referencia.json`,
 * derivada de `.env.production.example`) e provar, aqui, que a fiscalização
 * continua inteira.
 *
 * ── A asserção que sustenta o arquivo ──────────────────────────────────────
 *
 * Sem tarifa, o custo é NULO — e nulo não é zero. Zero significa "custou
 * nada" e faz o painel de FinOps parecer saudável; nulo significa "não sei", e
 * é a única resposta honesta quando a tarifa não foi declarada.
 *
 * Rodar: node --experimental-strip-types --test tests/contracts/tarifa-de-ia.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const REFERENCIA = JSON.parse(readFileSync("config/ai-price-table.referencia.json", "utf8"));

/* O módulo cacheia a tabela pela string crua, então trocar a variável entre
   asserções realmente troca a tabela. Import dinâmico depois de cada troca
   não é necessário — mas o `usageCost` precisa ser lido do módulo real, e não
   reimplementado aqui: um teste que reimplementa a regra concorda consigo
   mesmo. */
const { usageCost } = await import("../../lib/ai/tarifa-de-ia.ts");
const { modelosEmUso } = await import("../../lib/ai/model-profiles.ts");

const USO = { inputTokens: 1_000_000, outputTokens: 1_000_000 };

function comTabela(valor, fn) {
  const antes = process.env.ATLAS_AI_PRICE_TABLE;
  if (valor === null) delete process.env.ATLAS_AI_PRICE_TABLE;
  else process.env.ATLAS_AI_PRICE_TABLE = valor;
  try { return fn(); } finally {
    if (antes === undefined) delete process.env.ATLAS_AI_PRICE_TABLE;
    else process.env.ATLAS_AI_PRICE_TABLE = antes;
  }
}

const tabelaDeReferencia = JSON.stringify(REFERENCIA.tarifas);

test("a referência cobre TODOS os modelos em uso — senão o CI mede meia verdade", () => {
  const chaves = new Set(Object.keys(REFERENCIA.tarifas).map((k) => k.toLowerCase()));
  const emUso = modelosEmUso();
  assert.ok(emUso.length > 0, "modelosEmUso() devolveu vazio — o instrumento quebrou, não o produto");
  for (const par of emUso) {
    const coberto = chaves.has(par.toLowerCase()) || chaves.has(`${par.split("/")[0]}/*`);
    assert.ok(coberto, `${par} está em uso e NÃO tem tarifa na referência do CI`);
  }
});

test("SEM tarifa o custo é NULO, não zero — a asserção que sustenta o arquivo", () => {
  // Zero diz "não custou nada" e o painel de FinOps parece saudável.
  // Nulo diz "não sei", que é a verdade quando ninguém declarou a tarifa.
  const r = comTabela(null, () => usageCost("openai", "gpt-5.6-luna", USO));
  assert.equal(r.pricingConfigured, false, "sem tabela, pricingConfigured tinha de ser false");
  assert.equal(r.estimatedUsd, null, "custo estimado virou número sem tarifa cadastrada");
  assert.notEqual(r.estimatedUsd, 0, "custo zerado por ausência de configuração — é este o defeito");
});

test("tabela INVÁLIDA não vira tarifa nem derruba o processo", () => {
  for (const lixo of ["{", "não é json", "[]", '{"openai/gpt-5.6-luna":{"input":"grátis"}}', '{"openai/gpt-5.6-luna":{"input":0,"output":0}}']) {
    const r = comTabela(lixo, () => usageCost("openai", "gpt-5.6-luna", USO));
    assert.equal(r.pricingConfigured, false, `"${lixo.slice(0, 24)}" foi aceito como tarifa`);
    assert.equal(r.estimatedUsd, null, `"${lixo.slice(0, 24)}" produziu um preço inventado`);
  }
});

test("COM a tarifa de referência o custo é medido e positivo", () => {
  const r = comTabela(tabelaDeReferencia, () => usageCost("openai", "gpt-5.6-luna", USO));
  assert.equal(r.pricingConfigured, true, "a referência do CI não foi aceita como tarifa");
  assert.ok(typeof r.estimatedUsd === "number" && r.estimatedUsd > 0, `custo não positivo: ${r.estimatedUsd}`);
});

test("a referência NÃO é lida em tempo de execução — só a variável de ambiente vale", () => {
  // Se um dia alguém fizer o runtime ler o arquivo, produção passa a ter preço
  // sem ninguém declarar, e a ausência deixa de ser visível. É exatamente o
  // buraco que este contrato existe para manter fechado.
  const fonte = readFileSync("lib/ai/tarifa-de-ia.ts", "utf8");
  assert.ok(!fonte.includes("ai-price-table.referencia"), "o runtime passou a ler o arquivo de referência");
  assert.match(fonte, /process\.env\.ATLAS_AI_PRICE_TABLE/, "o runtime deixou de ler a variável de ambiente");
});

test("os valores da referência batem com o exemplo versionado — nada foi inventado", () => {
  // A referência é DERIVADA de .env.production.example, que registra a data da
  // conferência e as fontes. Se alguém editar um preço só num dos dois lugares,
  // o CI passa a medir com uma tarifa que a documentação não sustenta.
  const exemplo = readFileSync(".env.production.example", "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("# ATLAS_AI_PRICE_TABLE="));
  assert.ok(exemplo, "o exemplo comentado sumiu de .env.production.example");
  const doExemplo = JSON.parse(exemplo.slice("# ATLAS_AI_PRICE_TABLE=".length));
  assert.deepEqual(REFERENCIA.tarifas, doExemplo, "a referência do CI divergiu do exemplo versionado");
});
