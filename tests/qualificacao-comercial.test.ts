/**
 * Qualificação COMERCIAL — o sinal que o CAPI devolve à Meta.
 *
 * Este é o guarda do ganho mais importante da integração: o que o Atlas ensina à Meta
 * como "lead qualificado" precisa ser ETAPA COMERCIAL REAL (visita, proposta, contrato,
 * ganho), NUNCA completude de cadastro. Quando era "cadastro completo = qualificado", a
 * Meta aprendia a trazer quem preenche formulário bonito, não quem compra — e cada lote de
 * CAPI piorava o próximo.
 *
 * capi-feedback.ts:208 chama isCommerciallyQualifiedLead({status}) para decidir o evento.
 * Se alguém um dia reabrir essa porta para pontuação/cadastro, este teste fica vermelho.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isCommerciallyQualifiedLead, CAMPAIGN_QUALITY_COMMERCIAL_STAGES } from "../lib/atlas/campaign-quality.ts";

describe("qualificação comercial — etapa real, não cadastro", () => {
  test("as quatro etapas comerciais contam como qualificado", () => {
    for (const stage of ["visita", "proposta", "contrato", "ganho"]) {
      assert.equal(isCommerciallyQualifiedLead({ status: stage }), true, `${stage} deveria ser comercial`);
    }
  });

  test("a lista de etapas comerciais é exatamente essas quatro", () => {
    // Se a lista crescer/mudar, é decisão consciente — e o teste obriga a revisitar o que
    // o CAPI passa a ensinar à Meta.
    assert.deepEqual([...CAMPAIGN_QUALITY_COMMERCIAL_STAGES], ["visita", "proposta", "contrato", "ganho"]);
  });

  test("O GUARDA CENTRAL: lead recém-chegado NÃO é comercialmente qualificado", () => {
    // Este é o coração do teste. Um lead pode ter e-mail, telefone, orçamento e finalidade
    // — cadastro impecável — e ainda estar em "novo". Cadastro completo NÃO é qualificação
    // comercial. Era exatamente essa confusão que envenenava o aprendizado da Meta.
    assert.equal(isCommerciallyQualifiedLead({ status: "novo" }), false);
  });

  test("status ausente, vazio ou desconhecido nunca qualifica", () => {
    assert.equal(isCommerciallyQualifiedLead({ status: null }), false);
    assert.equal(isCommerciallyQualifiedLead({ status: "" }), false);
    assert.equal(isCommerciallyQualifiedLead({ status: "   " }), false);
    assert.equal(isCommerciallyQualifiedLead({ status: "coisa_inventada" }), false);
  });

  test("caixa e espaço não abrem brecha", () => {
    assert.equal(isCommerciallyQualifiedLead({ status: "  VISITA  " }), true);
    assert.equal(isCommerciallyQualifiedLead({ status: "Ganho" }), true);
    // mas algo que apenas CONTÉM a palavra não vale
    assert.equal(isCommerciallyQualifiedLead({ status: "pos-visita-cancelada" }), false);
  });
});
