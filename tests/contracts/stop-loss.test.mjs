/**
 * Contrato do STOP LOSS DE MARKETING.
 *
 * Duas promessas que estes testes tornam executáveis:
 *
 *   1. Ele NUNCA executa. Devolve decisão para virar proposta — movimentar verba
 *      sem aprovação humana é a linha que não se cruza, nem para proteger.
 *   2. Ele nunca finge que avaliou o que não deu para avaliar. Sem gasto não há
 *      CPL, e "sem gatilho acionado" com regra cega é falso conforto.
 *
 * Rodar: node --test tests/contracts/stop-loss.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "marketing", "stop-loss.ts"), "utf8");
const { avaliarStopLoss, resumoDoStopLoss } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

const orcamentoSaudavel = { teto: 10000, gasto: 3000, fracaoDecorrida: 0.4, cplAlvo: 50 };
const operacaoSaudavel = {
  leadsRecebidas: 60, leadsContatadas: 55, leadsComSlaVencido: 0,
  leadsSemDono: 0, leadsRepresadas: 0, corretoresAtivos: 3,
};

test("operação saudável não aciona nada", () => {
  const v = avaliarStopLoss(orcamentoSaudavel, operacaoSaudavel);
  assert.equal(v.acao, "seguir");
  assert.deepEqual(v.decisoes, []);
  assert.match(resumoDoStopLoss(v), /Nenhum gatilho/);
});

test("NUNCA executa sozinho — a bandeira é parte do contrato", () => {
  const v = avaliarStopLoss({ teto: 100, gasto: 500, fracaoDecorrida: 0.1, cplAlvo: 10 }, operacaoSaudavel);
  assert.equal(v.executaSozinho, false);
  for (const d of v.decisoes) {
    assert.ok(d.proposta.length > 10, `decisão ${d.regra} sem proposta para aprovação`);
  }
});

test("verba estourada manda pausar", () => {
  const v = avaliarStopLoss({ ...orcamentoSaudavel, gasto: 10500 }, operacaoSaudavel);
  assert.equal(v.acao, "pausar");
  assert.ok(v.decisoes.some((d) => d.regra === "teto-de-verba"));
});

test("gastar adiantado reduz, não pausa", () => {
  const v = avaliarStopLoss({ teto: 10000, gasto: 7000, fracaoDecorrida: 0.3, cplAlvo: null }, operacaoSaudavel);
  const ritmo = v.decisoes.find((d) => d.regra === "ritmo-de-verba");
  assert.ok(ritmo, "gatilho de ritmo não disparou");
  assert.equal(ritmo.acao, "reduzir");
});

test("sem gasto conhecido, as regras de custo saem como NÃO AVALIADAS", () => {
  const v = avaliarStopLoss({ teto: 10000, gasto: null, fracaoDecorrida: 0.5, cplAlvo: 50 }, operacaoSaudavel);
  assert.ok(v.naoAvaliado.some((m) => /conta de anúncios não respondeu/.test(m)));
  assert.ok(v.naoAvaliado.some((m) => /Desconhecido não é zero/.test(m)));
  // E o resumo não pode soar como "está tudo bem".
  assert.match(resumoDoStopLoss(v), /não pôde ser avaliada/);
});

test("sem CPL alvo acordado, não se cobra a meta", () => {
  const v = avaliarStopLoss({ ...orcamentoSaudavel, cplAlvo: null }, operacaoSaudavel);
  assert.ok(v.naoAvaliado.some((m) => /não foi combinada/.test(m)));
  assert.ok(!v.decisoes.some((d) => d.regra === "cpl-acima-do-alvo"));
});

test("amostra pequena não vira decisão de verba", () => {
  const v = avaliarStopLoss(orcamentoSaudavel, { ...operacaoSaudavel, leadsRecebidas: 4, leadsContatadas: 0 });
  assert.ok(!v.decisoes.some((d) => d.regra === "operacao-nao-absorve"),
    "4 leads não sustentam uma decisão de pausar mídia");
  assert.ok(v.naoAvaliado.some((m) => /amostra pequena/.test(m)));
});

test("a regra de absorção funciona SEM dado da conta de anúncios", () => {
  // Este é o caso real de 2026-07-26: ads_read bloqueado, gasto desconhecido.
  const v = avaliarStopLoss(
    { teto: 10000, gasto: null, fracaoDecorrida: 0.5, cplAlvo: null },
    { ...operacaoSaudavel, leadsRecebidas: 24, leadsContatadas: 0 },
  );
  assert.equal(v.acao, "pausar");
  const regra = v.decisoes.find((d) => d.regra === "operacao-nao-absorve");
  assert.ok(regra, "sem gasto, a proteção precisa vir da absorção");
  assert.match(regra.motivo, /0% das leads pagas/);
  assert.match(regra.proposta, /gargalo é atendimento/);
});

test("gasto sem nenhuma lead é tratado como defeito, não como desempenho", () => {
  const v = avaliarStopLoss({ teto: 10000, gasto: 800, fracaoDecorrida: 0.5, cplAlvo: 50 },
    { ...operacaoSaudavel, leadsRecebidas: 0, leadsContatadas: 0 });
  const regra = v.decisoes.find((d) => d.regra === "gasto-sem-lead");
  assert.equal(regra.acao, "pausar");
  assert.match(regra.proposta, /defeito/);
});

test("fila acima da capacidade da equipe manda parar de comprar", () => {
  const v = avaliarStopLoss(orcamentoSaudavel, {
    ...operacaoSaudavel, leadsComSlaVencido: 24, leadsRepresadas: 116, corretoresAtivos: 3,
  });
  const regra = v.decisoes.find((d) => d.regra === "fila-acima-da-capacidade");
  assert.ok(regra, "140 leads para 3 corretores precisa acionar");
  assert.equal(regra.acao, "pausar");
  assert.match(regra.motivo, /47 por pessoa/);
});

test("lead sem dono escala de reduzir para pausar conforme o volume", () => {
  const poucas = avaliarStopLoss(orcamentoSaudavel, { ...operacaoSaudavel, leadsSemDono: 3 });
  const muitas = avaliarStopLoss(orcamentoSaudavel, { ...operacaoSaudavel, leadsSemDono: 25 });
  assert.equal(poucas.decisoes.find((d) => d.regra === "lead-paga-sem-dono").acao, "reduzir");
  assert.equal(muitas.decisoes.find((d) => d.regra === "lead-paga-sem-dono").acao, "pausar");
});

test("a ação final é sempre a mais grave entre as decisões", () => {
  const v = avaliarStopLoss({ teto: 10000, gasto: 7000, fracaoDecorrida: 0.3, cplAlvo: 50 },
    { ...operacaoSaudavel, leadsRecebidas: 24, leadsContatadas: 0, leadsSemDono: 25 });
  assert.equal(v.acao, "pausar", "havendo qualquer pausar, o veredito é pausar");
  const gravidades = v.decisoes.map((d) => d.gravidade);
  assert.deepEqual([...gravidades].sort((a, b) => b - a), gravidades, "decisões saem da mais grave para a menos");
});

test("o motor não depende de IA nem de rede", () => {
  assert.ok(!/fetch\(|axios|openai|anthropic/i.test(fonte),
    "stop loss que depende de provedor externo falha quando o provedor cai");
});
