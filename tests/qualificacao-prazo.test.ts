/**
 * Prazo de compra — o sinal conversacional mais rápido de intenção real.
 *
 * `qualifyRealEstateLead` já pontuava prazo, mas de forma binária: `ate_3_meses`
 * e `3_a_6_meses` ganhavam +4; `6_a_12_meses` ganhava ZERO — o mesmo que quem
 * não respondeu. Um prazo declarado de 6-12 meses é sinal de comprador, não
 * ausência de sinal, e empatava com o silêncio.
 *
 * Estes testes travam três coisas ao mesmo tempo:
 *  1. a régua é GRADUADA — quanto mais próximo o prazo, maior a intenção;
 *  2. um prazo declarado distante ainda pontua mais que silêncio (o gap corrigido);
 *  3. a mudança é ADITIVA — nenhum prazo que já pontuava perde valor, e
 *     `sem_prazo` ("só pesquisando") continua em zero, como a resposta honesta.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { qualifyRealEstateLead } from "../lib/ai/lead-qualification.ts";

// Um lead idêntico em tudo, variando só o prazo — isola o efeito do sinal.
function intentDe(timeline?: string) {
  const q = qualifyRealEstateLead({
    lead: { phone: "11999998888", status: "novo" },
    activityCount: 0,
    opportunityCount: 0,
    propertyMatchCount: 0,
    answers: timeline ? { timeline } : {},
    now: 1_700_000_000_000, // fixo: sem isto o score dependeria do relógio
  });
  const dim = q.dimensions.find((d) => d.key === "intent");
  assert.ok(dim, "a dimensão de intenção precisa existir");
  return { intent: dim.score, score: q.score, reasons: dim.reasons };
}

describe("score — prazo de compra é graduado e aditivo", () => {
  test("a régua é graduada: mais próximo, mais intenção", () => {
    const ate3 = intentDe("ate_3_meses").intent;
    const meio = intentDe("3_a_6_meses").intent;
    const longe = intentDe("6_a_12_meses").intent;
    assert.ok(ate3 > meio, "até 3 meses deve valer mais que 3-6 meses");
    assert.ok(meio > longe, "3-6 meses deve valer mais que 6-12 meses");
  });

  test("O GAP CORRIGIDO: 6-12 meses declarado pontua acima do silêncio", () => {
    // Este é o coração do teste. Antes, 6-12 meses valia o mesmo que não
    // responder — um prazo declarado empatava com a ausência de prazo.
    const longe = intentDe("6_a_12_meses").intent;
    const semResposta = intentDe(undefined).intent;
    const soPesquisando = intentDe("sem_prazo").intent;
    assert.ok(longe > semResposta, "6-12 meses declarado tem de superar o silêncio");
    assert.equal(semResposta, soPesquisando, "'só pesquisando' e não responder são o mesmo: zero prazo");
  });

  test("os pesos exatos: 5 / 4 / 2 sobre a base de intenção", () => {
    // Base de intenção para status "novo" é 3 (sem oportunidade, sem match).
    // Trava o número para que uma futura mexida seja decisão consciente.
    assert.equal(intentDe(undefined).intent, 3, "base de 'novo' sem prazo");
    assert.equal(intentDe("ate_3_meses").intent, 8);  // 3 + 5
    assert.equal(intentDe("3_a_6_meses").intent, 7);   // 3 + 4
    assert.equal(intentDe("6_a_12_meses").intent, 5);  // 3 + 2
    assert.equal(intentDe("sem_prazo").intent, 3);     // 3 + 0
  });

  test("aditivo: nenhum prazo que já pontuava perde valor", () => {
    // ate_3_meses e 3_a_6_meses ganhavam +4 antes; não podem regredir.
    assert.ok(intentDe("ate_3_meses").intent >= 3 + 4, "até 3 meses não pode valer menos que antes");
    assert.ok(intentDe("3_a_6_meses").intent >= 3 + 4, "3-6 meses não pode valer menos que antes");
  });

  test("o prazo próximo se anuncia como próximo; o distante, como declarado", () => {
    assert.ok(intentDe("ate_3_meses").reasons.includes("Prazo de compra próximo"));
    assert.ok(intentDe("6_a_12_meses").reasons.includes("Prazo de compra declarado"));
    assert.ok(!intentDe("sem_prazo").reasons.some((r) => r.startsWith("Prazo de compra")));
  });
});
