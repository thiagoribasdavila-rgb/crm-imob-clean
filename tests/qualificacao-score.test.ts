/**
 * Score de lead — os sinais categóricos de comprador que passaram a pontuar.
 *
 * O formulário do anúncio captura faixa de investimento e forma de pagamento, e o
 * produto os EXIBIA sem deixá-los influenciar o score — então um comprador à vista
 * empatava, na fila do corretor, com um curioso que só deixou telefone.
 *
 * Estes testes travam duas coisas ao mesmo tempo:
 *  1. os novos sinais elevam o score na medida certa (à vista > financiamento);
 *  2. a mudança é ESTRITAMENTE ADITIVA e não fabrica número — um lead sem esses
 *     campos pontua exatamente como antes, e a faixa livre nunca conta em dobro
 *     com um orçamento numérico.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateLeadScore } from "../lib/atlas/scoring.ts";

const base = { email: "a@b.com", phone: "11999998888" }; // 10 + 15 = 25

describe("score — sinais categóricos de comprador", () => {
  test("compatibilidade: sem os campos novos, o score é o de antes", () => {
    // Se este número mudar, a alteração deixou de ser aditiva.
    assert.equal(calculateLeadScore(base).score, 25);
  });

  test("à vista é o comprador mais forte e pontua mais que financiamento", () => {
    const aVista = calculateLeadScore({ ...base, paymentMethod: "a_vista" });
    const financ = calculateLeadScore({ ...base, paymentMethod: "financiamento" });
    assert.equal(aVista.score, 40); // 25 + 15
    assert.equal(financ.score, 33); // 25 + 8
    assert.ok(aVista.score > financ.score, "à vista deveria valer mais que financiamento");
    assert.ok(aVista.reasons.includes("Compra à vista"));
  });

  test("as demais formas de pagamento também contam como intenção real", () => {
    for (const forma of ["financiamento", "fgts", "consorcio"]) {
      const r = calculateLeadScore({ ...base, paymentMethod: forma });
      assert.equal(r.score, 33, `forma ${forma} deveria somar 8`);
      assert.ok(r.reasons.includes("Forma de pagamento declarada"));
    }
  });

  test("faixa declarada pontua sem virar número", () => {
    const r = calculateLeadScore({ ...base, declaredBudgetRange: "R$ 400 a 600 mil" });
    assert.equal(r.score, 35); // 25 + 10
    assert.ok(r.reasons.includes("Faixa de investimento declarada"));
  });

  test("faixa vazia não pontua", () => {
    assert.equal(calculateLeadScore({ ...base, declaredBudgetRange: "   " }).score, 25);
    assert.equal(calculateLeadScore({ ...base, declaredBudgetRange: null }).score, 25);
  });

  test("orçamento numérico e faixa NÃO contam em dobro — o número vence", () => {
    const soNumero = calculateLeadScore({ ...base, budgetMax: 500000 });
    const numeroEFaixa = calculateLeadScore({ ...base, budgetMax: 500000, declaredBudgetRange: "R$ 400 a 600 mil" });
    assert.equal(soNumero.score, 45); // 25 + 20
    assert.equal(numeroEFaixa.score, 45); // faixa ignorada quando há número
    assert.ok(!numeroEFaixa.reasons.includes("Faixa de investimento declarada"));
  });

  test("os sinais são estritamente aditivos — nunca derrubam o score", () => {
    const semTudo = calculateLeadScore(base).score;
    const comTudo = calculateLeadScore({ ...base, paymentMethod: "a_vista", declaredBudgetRange: "R$ 400 a 600 mil" }).score;
    assert.ok(comTudo >= semTudo, "adicionar sinal jamais pode reduzir o score");
    assert.equal(comTudo, 50); // 25 + 15 (à vista) + 10 (faixa, pois não há budgetMax)
  });

  test("o comprador à vista com faixa sai à frente do curioso só com telefone", () => {
    const comprador = calculateLeadScore({ ...base, paymentMethod: "a_vista", declaredBudgetRange: "R$ 800 mil a 1 mi", purpose: "moradia" }).score;
    const curioso = calculateLeadScore({ phone: "11988887777" }).score;
    assert.ok(comprador > curioso, "o comprador qualificado tem de ranquear acima do curioso");
  });
});
