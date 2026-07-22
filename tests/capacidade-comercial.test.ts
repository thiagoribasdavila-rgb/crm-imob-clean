/**
 * A projeção de capacidade é a única saída da IA que pode terminar em
 * contratação de gente — a decisão de maior valor financeiro que a diretoria
 * toma. Ela nasceu sem teste, e a auditoria mostrou por que isso não podia
 * ficar assim: contra o banco vivo, a versão anterior imprimia "+1 corretor =
 * +99 leads trabalhados por semana" a partir de um mutirão de descarte feito
 * por UM gerente em cinco dias, numa organização sem nenhum corretor ativo.
 *
 * Cada teste abaixo é uma dessas portas. Se alguém afrouxar qualquer uma delas
 * para "a tela mostrar número", o vermelho aparece aqui.
 *
 * Roda com o test runner embutido do Node — zero dependência nova, zero custo:
 *     node --test tests/
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MINIMUM_CAPACITY_ACTORS,
  MINIMUM_CAPACITY_SAMPLE,
  MINIMUM_CAPACITY_WEEKS,
  hasBasis,
  simulateCapacity,
  type CapacityContext,
} from "../lib/ai/decision-simulator.ts";

const CONTRATAR = { kind: "contratar", target: "Equipe comercial", amount: 1 };

/** Contexto que passa em TODAS as portas — cada teste estraga uma de cada vez. */
function contextoMedido(patch: Partial<CapacityContext> = {}): CapacityContext {
  return {
    openLeads: 500,
    activeBrokers: 4,
    observedActors: 4,
    observedLeadsPerBrokerPerWeek: 12,
    observedMoves: 300,
    observedAttributedMoves: 120,
    observedWeeks: 4,
    observedAdvanceRate: 0.4,
    observedWins: 0,
    observedTerminalShare: 0.2,
    sourceCoverage: "apenas movimentações com autor corretor",
    ...patch,
  };
}

const semLastroPor = (ctx: CapacityContext) => {
  const projecao = simulateCapacity(CONTRATAR, ctx);
  assert.equal(hasBasis(projecao), false, "a projeção ganhou lastro que não deveria ter");
  assert.equal(projecao.weeklyLeadsDelta.esperado, 0, "sem lastro, o esperado tem de ser 0");
  assert.equal(typeof projecao.basis?.reason, "string", "sem lastro exige motivo por extenso");
  return String(projecao.basis?.reason);
};

describe("capacidade comercial — as portas que impedem uma contratação sobre ruído", () => {
  test("sem corretor ativo no cadastro não há sujeito para 'leads por corretor'", () => {
    // Caso real da base viva: o único CORRETOR está inativo, e mesmo assim a
    // tela imprimia 99 leads/corretor/semana ao lado de "Corretores ativos: 0".
    const motivo = semLastroPor(contextoMedido({ activeBrokers: 0 }));
    assert.match(motivo, /corretor ativo/i);
  });

  test("amostra é a ATRIBUÍDA a corretor — volume total não abre a porta", () => {
    // 430 movimentações lidas, 19 com autor corretor: o portão tem de olhar 19.
    const motivo = semLastroPor(contextoMedido({ observedMoves: 430, observedAttributedMoves: MINIMUM_CAPACITY_SAMPLE - 1 }));
    assert.match(motivo, /amostra insuficiente/i);
    assert.match(motivo, new RegExp(String(MINIMUM_CAPACITY_SAMPLE)));
  });

  test("média de pouca gente não é throughput de equipe", () => {
    const motivo = semLastroPor(contextoMedido({ observedActors: MINIMUM_CAPACITY_ACTORS - 1 }));
    assert.match(motivo, /mínimo de 3|corretor\(es\) movimentaram/i);
  });

  test("janela real curta não vira semana cheia por normalização", () => {
    // 0,7 semana era elevada ao piso de 1 e passava a valer como credencial.
    const motivo = semLastroPor(contextoMedido({ observedWeeks: 0.71 }));
    assert.match(motivo, /janela observada/i);
    assert.match(motivo, new RegExp(String(MINIMUM_CAPACITY_WEEKS)));
  });

  test("nenhum corretor movimentou leads → sem lastro", () => {
    semLastroPor(contextoMedido({ observedActors: 0, observedLeadsPerBrokerPerWeek: 0 }));
  });

  test("throughput não medido → sem lastro, e o zero é explicado", () => {
    const projecao = simulateCapacity(CONTRATAR, contextoMedido({ observedLeadsPerBrokerPerWeek: null }));
    assert.equal(hasBasis(projecao), false);
    assert.ok(
      projecao.assumptions.some((linha) => /ausência de medição/i.test(linha)),
      "o zero precisa dizer que é falta de medição, não inutilidade do movimento",
    );
  });

  test("'remanejar' não é mais um movimento aceito — não existe quem o emita", () => {
    const remanejar = simulateCapacity({ kind: "remanejar", target: "Equipe", amount: 1 }, contextoMedido());
    assert.equal(hasBasis(remanejar), false);
    assert.match(String(remanejar.basis?.reason), /não é movimento de capacidade/i);
  });
});

describe("capacidade comercial — o que a projeção medida promete", () => {
  test("com todas as portas abertas há lastro, e a amostra publicada é a atribuída", () => {
    const ctx = contextoMedido();
    const projecao = simulateCapacity(CONTRATAR, ctx);
    assert.equal(hasBasis(projecao), true);
    assert.equal(projecao.basis?.sample, ctx.observedAttributedMoves);
    assert.equal(projecao.weeklyLeadsDelta.esperado, 12);
    assert.ok(projecao.weeklyLeadsDelta.pessimista < projecao.weeklyLeadsDelta.esperado);
    assert.ok(projecao.weeklyLeadsDelta.otimista > projecao.weeklyLeadsDelta.esperado);
  });

  test("o ganho semanal nunca passa do estoque de leads abertos", () => {
    const projecao = simulateCapacity(
      { kind: "contratar", target: "Equipe comercial", amount: 3 },
      contextoMedido({ openLeads: 10, observedLeadsPerBrokerPerWeek: 20 }),
    );
    assert.equal(hasBasis(projecao), true);
    assert.equal(projecao.weeklyLeadsDelta.esperado, 10, "60 leads/semana projetados sobre 10 leads abertos é impossível");
  });

  test("sem ganho registrado, receita fica declarada SEM LASTRO", () => {
    const projecao = simulateCapacity(CONTRATAR, contextoMedido({ observedWins: 0 }));
    assert.ok(
      projecao.assumptions.some((linha) => /SEM LASTRO/.test(linha) && /capacidade, não de faturamento/i.test(linha)),
      "a projeção de capacidade não pode ser lida como projeção de receita",
    );
  });

  test("descarte em massa é declarado e segura a confiança em baixa", () => {
    const projecao = simulateCapacity(CONTRATAR, contextoMedido({ observedTerminalShare: 0.85, observedAttributedMoves: 400, observedWeeks: 8 }));
    assert.equal(hasBasis(projecao), true);
    assert.equal(projecao.confidence, "baixa", "ritmo de encerramento não sustenta confiança média");
    assert.ok(projecao.assumptions.some((linha) => /etapa terminal/i.test(linha)));
  });

  test("a cobertura da fonte viaja com a projeção — o leitor sabe o que ela não vê", () => {
    const projecao = simulateCapacity(CONTRATAR, contextoMedido({ sourceCoverage: "só Kanban" }));
    assert.ok(projecao.assumptions.some((linha) => /Cobertura da fonte/i.test(linha)));
  });

  test("contratar nunca projeta gasto: o Atlas não conhece folha", () => {
    const projecao = simulateCapacity(CONTRATAR, contextoMedido());
    assert.equal(projecao.weeklySpendDelta, 0);
    assert.ok(projecao.assumptions.some((linha) => /folha/i.test(linha) && /falta de dado/i.test(linha)));
  });
});
