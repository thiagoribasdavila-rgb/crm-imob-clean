/**
 * Etapa avançada do funil no scorer de cadastro (calculateLeadScore).
 *
 * O crédito de "lead avançado no funil" (+20) valia para visita/proposta/contrato,
 * mas NÃO para 'ganho' — a etapa terminal. Consequência: um lead GANHO pontuava
 * ABAIXO de um em 'contrato', uma inversão perversa. Afeta a importação de planilha
 * com negócio fechado e o recompute do PATCH de um lead já ganho.
 *
 * Agora 'ganho' entra nas quatro etapas comerciais canônicas
 * (CAMPAIGN_QUALITY_COMMERCIAL_STAGES). Aditivo: só sobe quem está em 'ganho'.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateLeadScore } from "../lib/atlas/scoring.ts";

const base = { email: "a@b.com", phone: "11999998888" }; // 25

describe("score — a etapa terminal 'ganho' não pontua abaixo de 'contrato'", () => {
  test("O DEFEITO CORRIGIDO: 'ganho' credita o funil como 'contrato'", () => {
    const ganho = calculateLeadScore({ ...base, status: "ganho" }).score;
    const contrato = calculateLeadScore({ ...base, status: "contrato" }).score;
    assert.equal(ganho, contrato, "a etapa terminal não pode valer menos que a anterior");
    assert.ok(ganho > calculateLeadScore({ ...base, status: "novo" }).score, "e ambas acima de 'novo'");
  });

  test("as quatro etapas comerciais canônicas creditam o funil", () => {
    for (const etapa of ["visita", "proposta", "contrato", "ganho"]) {
      const r = calculateLeadScore({ ...base, status: etapa });
      assert.equal(r.score, 45, `${etapa} deveria somar +20 de funil (25 + 20)`);
      assert.ok(r.reasons.includes("Lead avançado no funil"), `${etapa} deveria marcar avanço`);
    }
  });

  test("aditivo: etapas não-avançadas seguem sem o crédito", () => {
    for (const etapa of ["novo", "contato", "qualificacao", "perdido"]) {
      assert.equal(calculateLeadScore({ ...base, status: etapa }).score, 25, `${etapa} não credita funil`);
    }
  });
});
