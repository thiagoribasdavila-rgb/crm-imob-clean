/**
 * Prazo de compra da Ficha (purchase_timeline) passa a pontuar no scorer de
 * cadastro — e sobrevive ao recompute do PATCH.
 *
 * O sinal era CAPTURADO pela Ficha (vocabulário imediato/curto/medio/longo/
 * pesquisando) mas NENHUM scorer lia a coluna: o prazo declarado ficava gravado
 * sem nunca contar. Medido antes de ligar: 5 de 661 leads com prazo preenchido,
 * 0 mudariam de faixa — impacto zero hoje, e o sinal passa a valer conforme a
 * Ficha for preenchida.
 *
 * Graduado (5/4/3/2/0), aditivo, e consolidado no PATCH como a forma de pagamento.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateLeadScore } from "../lib/atlas/scoring.ts";
import { liveLeadUpdatePayload } from "../lib/compat/payload-de-lead.ts";

const base = { email: "a@b.com", phone: "11999998888" }; // 25
const contato = { email: "a@b.com", phone: "11999998888" };

describe("score — prazo de compra da Ficha é graduado e aditivo", () => {
  test("a régua gradua: imediato > curto > medio > longo > pesquisando", () => {
    const s = (t) => calculateLeadScore({ ...base, purchaseTimeline: t }).score;
    assert.ok(s("imediato") > s("curto"), "imediato acima de curto");
    assert.ok(s("curto") > s("medio"), "curto acima de medio");
    assert.ok(s("medio") > s("longo"), "medio acima de longo");
    assert.ok(s("longo") > s("pesquisando"), "longo (declarado) acima de só pesquisando");
  });

  test("os pesos exatos: 5 / 4 / 3 / 2 / 0 sobre a base de 25", () => {
    assert.equal(calculateLeadScore({ ...base, purchaseTimeline: "imediato" }).score, 30);
    assert.equal(calculateLeadScore({ ...base, purchaseTimeline: "curto" }).score, 29);
    assert.equal(calculateLeadScore({ ...base, purchaseTimeline: "medio" }).score, 28);
    assert.equal(calculateLeadScore({ ...base, purchaseTimeline: "longo" }).score, 27);
    assert.equal(calculateLeadScore({ ...base, purchaseTimeline: "pesquisando" }).score, 25);
  });

  test("aditivo: sem prazo (ou 'pesquisando'), o score é o de antes", () => {
    assert.equal(calculateLeadScore(base).score, 25);
    assert.equal(calculateLeadScore({ ...base, purchaseTimeline: "pesquisando" }).score, 25);
    assert.equal(calculateLeadScore({ ...base, purchaseTimeline: "valor_desconhecido" }).score, 25);
  });

  test("PATCH da Ficha: prazo gravado sobrevive quando o corpo não o reenvia", () => {
    const comPrazo = liveLeadUpdatePayload({ preferred_regions: ["Centro"] }, "novo", { ...contato, purchase_timeline: "imediato" });
    const semPrazo = liveLeadUpdatePayload({ preferred_regions: ["Centro"] }, "novo", { ...contato });
    assert.ok(comPrazo.score_ia > semPrazo.score_ia, "prazo gravado continua contando no recompute");
    assert.equal(comPrazo.purchase_timeline, "imediato", "e a coluna preserva o valor");
  });

  test("PATCH: enviado vazio limpa o prazo e o score reflete", () => {
    const limpou = liveLeadUpdatePayload({ purchase_timeline: "" }, "novo", { ...contato, purchase_timeline: "imediato" });
    assert.equal(limpou.purchase_timeline, null);
    assert.equal(limpou.score_ia, 25, "sem prazo, cai para a base");
  });
});
