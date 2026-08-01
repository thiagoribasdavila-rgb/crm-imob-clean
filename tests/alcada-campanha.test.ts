/**
 * Alçada de campanha da Meta — onde a doutrina encosta no dinheiro do dono.
 *
 * Esta suíte nasce de um defeito real e caro, encontrado na auditoria da camada Meta:
 * a rota /api/v1/marketing/campaign-intake criava campanha, conjunto, criativo e anúncios
 * na Meta com dryRun:false e NÃO consultava aprovação em ponto nenhum — a palavra
 * "approval" não aparecia uma única vez no arquivo. Era o caminho que funcionava
 * contornando o caminho governado, e aceitava um gerente.
 *
 * O portão agora exige aprovação registrada e alçada de diretor. Estes testes travam o
 * núcleo dessa decisão, que é função pura: quem pode decidir, e o que conta como
 * aprovação de campanha. Se alguém alargar a alçada, o teste fica vermelho.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  canDecideMetaCampaign,
  isMetaCampaignApproval,
  META_CAMPAIGN_ENTITY_TYPE,
} from "../lib/meta/marketing/approval-authority.ts";

describe("alçada de campanha — quem pode gastar a verba do dono", () => {
  test("diretor, superintendente e admin decidem", () => {
    assert.equal(canDecideMetaCampaign({ commercialRole: "director" }), true);
    assert.equal(canDecideMetaCampaign({ commercialRole: "superintendent" }), true);
    assert.equal(canDecideMetaCampaign({ role: "admin" }), true);
  });

  test("gerente NÃO decide — foi exatamente o buraco que a rota de intake tinha", () => {
    assert.equal(canDecideMetaCampaign({ commercialRole: "manager" }), false);
    assert.equal(canDecideMetaCampaign({ role: "manager" }), false);
  });

  test("corretor e papéis desconhecidos nunca decidem", () => {
    for (const papel of ["broker", "assistant", "", "qualquer-coisa"]) {
      assert.equal(
        canDecideMetaCampaign({ commercialRole: papel, role: papel }),
        false,
        `papel "${papel}" ganhou alçada de campanha`,
      );
    }
  });

  test("ausência de papel nega — o padrão é negar, não permitir", () => {
    // Um perfil sem papel definido não pode escorregar para dentro da alçada.
    assert.equal(canDecideMetaCampaign({}), false);
    assert.equal(canDecideMetaCampaign({ role: null, commercialRole: null }), false);
    assert.equal(canDecideMetaCampaign({ role: undefined, commercialRole: undefined }), false);
  });

  test("a comparação de papel ignora caixa e espaço, sem afrouxar", () => {
    assert.equal(canDecideMetaCampaign({ commercialRole: "  DIRECTOR  " }), true);
    assert.equal(canDecideMetaCampaign({ role: " Admin " }), true);
    // mas não aceita algo que apenas CONTÉM o papel
    assert.equal(canDecideMetaCampaign({ commercialRole: "ex-director" }), false);
    assert.equal(canDecideMetaCampaign({ commercialRole: "director-assistant" }), false);
  });

  test("só aprovação de campanha da Meta vale para criar campanha", () => {
    assert.equal(isMetaCampaignApproval({ entityType: META_CAMPAIGN_ENTITY_TYPE }), true);
    assert.equal(isMetaCampaignApproval({ requestType: META_CAMPAIGN_ENTITY_TYPE }), true);
  });

  test("aprovação de OUTRO assunto não autoriza gastar em campanha", () => {
    // O risco concreto: reaproveitar uma aprovação de transferência de lead para
    // liberar uma criação na Meta. São decisões de peso diferente.
    for (const outro of ["lead_transfer", "action_proposal", "budget_change", "", "meta_campaign_draft"]) {
      assert.equal(
        isMetaCampaignApproval({ entityType: outro, requestType: outro }),
        false,
        `aprovação de tipo "${outro}" foi aceita como decisão de campanha`,
      );
    }
  });

  test("aprovação sem tipo nenhum não autoriza nada", () => {
    assert.equal(isMetaCampaignApproval({}), false);
    assert.equal(isMetaCampaignApproval({ entityType: null, requestType: null }), false);
  });
});
