/**
 * O reconhecimento do contato duplicado — o que decide se a ingestão da Meta
 * trata o P0001 como idempotência (ack) ou como falha (retry → dead_letter).
 *
 * Contexto: 41 eventos meta.lead.fetch morreram em dead_letter (medido 03-04/08),
 * TODOS com "Este contato já pertence a uma lead única no CRM". Duplicata é
 * condição PERMANENTE (a mesma pessoa preencheu outro formulário) — retentar 5×
 * e enterrar é errado; a lead original já existe, nada se perde.
 *
 * O teste trava o discernimento: a frase do telefone único é reconhecida, e
 * NENHUMA das outras ~30 exceptions que compartilham o code P0001 é confundida
 * com ela.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ehContatoJaEhLeadUnica } from "../lib/integrations/contato-duplicado.ts";

describe("reconhecimento do contato já-é-lead-única", () => {
  test("reconhece a frase do trigger de telefone único", () => {
    assert.equal(ehContatoJaEhLeadUnica({ code: "P0001", message: "Este contato já pertence a uma lead única no CRM." }), true);
  });

  test("reconhece mesmo sem o code (o sinal é a frase, não o P0001)", () => {
    // O erro cru do Supabase às vezes chega sem code populado; a frase basta.
    assert.equal(ehContatoJaEhLeadUnica({ message: "Este contato já pertence a uma lead única no CRM." }), true);
  });

  test("O GUARDA: NÃO confunde outras exceptions que também são P0001", () => {
    // Todas estas compartilham o code P0001 no banco. Casar por código pegaria
    // todas; casar pela frase única pega só a certa.
    for (const message of [
      "Perfil sem permissão para distribuir leads.",
      "Copiloto não corresponde ao corretor atual da lead.",
      "Gerentes podem transferir apenas para corretores do próprio time.",
      "Um ou mais leads estão fora do seu escopo ou não existem.",
      "O destino deve ser um gerente ou corretor ativo.",
    ]) {
      assert.equal(ehContatoJaEhLeadUnica({ code: "P0001", message }), false, `não pode reconhecer: ${message}`);
    }
  });

  test("erro nulo, sem mensagem ou vazio nunca reconhece", () => {
    assert.equal(ehContatoJaEhLeadUnica(null), false);
    assert.equal(ehContatoJaEhLeadUnica(undefined), false);
    assert.equal(ehContatoJaEhLeadUnica({}), false);
    assert.equal(ehContatoJaEhLeadUnica({ code: "P0001", message: null }), false);
    assert.equal(ehContatoJaEhLeadUnica({ message: "" }), false);
  });
});
