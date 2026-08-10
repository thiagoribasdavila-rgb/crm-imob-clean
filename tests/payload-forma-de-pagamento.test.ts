/**
 * Forma de pagamento sobrevive ao recompute do PATCH da Ficha.
 *
 * A ingestão da Meta pontua a forma de pagamento (a_vista +15, demais +8) e a
 * grava na coluna payment_method. Mas o construtor do PATCH (liveLeadUpdatePayload)
 * recomputava o score SEM passar esse sinal: no primeiro salvamento da Ficha que
 * não reenviava o campo, o comprador à vista PERDIA os +15 — queda silenciosa,
 * HTTP 200, ficha desenhando normal. É a régua compartilhada que grava score_ia.
 *
 * Estes testes travam:
 *  1. um PATCH parcial que NÃO reenvia payment_method preserva o crédito já gravado;
 *  2. à vista continua valendo mais que financiamento no recompute;
 *  3. a mudança é aditiva — lead sem forma de pagamento pontua como antes;
 *  4. a coluna e o score saem do MESMO valor consolidado.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { liveLeadUpdatePayload } from "../lib/compat/payload-de-lead.ts";

const contato = { email: "a@b.com", phone: "11999998888" };

describe("PATCH da Ficha — forma de pagamento não é derrubada no recompute", () => {
  test("O DEFEITO CORRIGIDO: PATCH parcial preserva o crédito de forma de pagamento gravada", () => {
    // Lead à vista já no banco; PATCH que só mexe no bairro, sem reenviar o campo.
    const comAVista = liveLeadUpdatePayload({ preferred_regions: ["Centro"] }, "novo", { ...contato, payment_method: "a_vista" });
    // Mesma lead, sem forma de pagamento nenhuma:
    const semPagamento = liveLeadUpdatePayload({ preferred_regions: ["Centro"] }, "novo", { ...contato });
    assert.ok(comAVista.score_ia > semPagamento.score_ia, "à vista gravada tem de continuar valendo no recompute");
    assert.equal(comAVista.payment_method, "a_vista", "e a coluna preserva o valor (ausente no corpo não apaga)");
  });

  test("à vista pontua mais que financiamento também por este caminho", () => {
    const aVista = liveLeadUpdatePayload({}, "novo", { ...contato, payment_method: "a_vista" });
    const financ = liveLeadUpdatePayload({}, "novo", { ...contato, payment_method: "financiamento" });
    assert.ok(aVista.score_ia > financ.score_ia, "à vista é o comprador mais forte");
  });

  test("aditivo: sem forma de pagamento, o score é o de antes", () => {
    const semCampo = liveLeadUpdatePayload({}, "novo", { ...contato });
    // e-mail (10) + telefone (15) = 25, sem crédito de pagamento.
    assert.equal(semCampo.score_ia, 25);
  });

  test("enviado VAZIO limpa de propósito — e o score reflete a limpeza", () => {
    const limpou = liveLeadUpdatePayload({ payment_method: "" }, "novo", { ...contato, payment_method: "a_vista" });
    assert.equal(limpou.payment_method, null, "vazio no corpo limpa a coluna");
    assert.equal(limpou.score_ia, 25, "e o score cai para o de quem não tem forma de pagamento");
  });
});
