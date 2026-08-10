/**
 * Correções de correção (não de peso) no scorer conversacional qualifyRealEstateLead,
 * levantadas por auditoria adversarial e verificadas nos quatro eixos duros
 * (dado capturado, não-morto, aditivo, sem teste vermelho).
 *
 * Três defeitos, cada um uma inversão ou divergência silenciosa:
 *  1. AÇÃO VENCIDA (HOLD 7): a lead com follow-up atrasado pontuava ABAIXO da que
 *     nunca agendou nada — o +5 de engajamento era anulado por um -6 no total,
 *     saldo -1. Agendar e atrasar não pode ser pior que nunca agendar.
 *  2. FRONTEIRA MORNO (HOLD 4): "morno" cravava o literal 40 enquanto scoring.ts e
 *     mais três módulos derivam "morno" de WARM_SCORE_THRESHOLD (35). A mesma
 *     fronteira com dois nomes: score 38 saía "morno" num scorer e "frio" aqui.
 *  3. TETO DA DIMENSÃO (HOLD 6): profile declarava maximum:35 mas somava até 38 —
 *     reportava score acima do próprio teto para leads completas.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { qualifyRealEstateLead } from "../lib/ai/lead-qualification.ts";
import { HOT_SCORE_THRESHOLD, WARM_SCORE_THRESHOLD } from "../lib/atlas/temperatura-do-lead.ts";

const AGORA = 1_700_000_000_000; // relógio fixo: sem isto o score dependeria da hora
const base = { phone: "11999998888", status: "novo" };
const semSinais = { activityCount: 0, opportunityCount: 0, propertyMatchCount: 0, now: AGORA };

describe("scorer conversacional — inversões e divergências corrigidas", () => {
  test("HOLD 7: ação vencida nunca pontua abaixo de não ter ação", () => {
    const futura = new Date(AGORA + 86_400_000).toISOString(); // amanhã
    const vencida = new Date(AGORA - 86_400_000).toISOString(); // ontem
    const comFutura = qualifyRealEstateLead({ lead: { ...base, next_action_at: futura }, ...semSinais });
    const comVencida = qualifyRealEstateLead({ lead: { ...base, next_action_at: vencida }, ...semSinais });
    const semAcao = qualifyRealEstateLead({ lead: { ...base }, ...semSinais });

    // O coração do teste: a inversão perversa não pode existir.
    assert.ok(comVencida.score >= semAcao.score, `vencida (${comVencida.score}) não pode ficar abaixo de sem ação (${semAcao.score})`);
    // E a ordem honesta se mantém: uma ação no futuro ainda vale mais que uma atrasada.
    assert.ok(comFutura.score > comVencida.score, "ação futura deve valer mais que vencida");
    // A urgência não some — só deixa de afundar o score:
    assert.ok(comVencida.risks.includes("Próxima ação atrasada"), "o atraso continua sinalizado como risco");
    assert.ok(!comVencida.dimensions.find((d) => d.key === "engagement")?.reasons.includes("Próxima ação agendada"), "vencida não credita 'agendada'");
  });

  test("HOLD 4: a fronteira 'morno' vem da constante (35), não do literal 40", () => {
    // Lead construído para pontuar 38: cai na faixa morna [35,70). Com o `40`
    // antigo, 38 saía "frio" — a mesma lead, temperatura diferente por scorer.
    const r = qualifyRealEstateLead({
      lead: { phone: "1", email: "a@b.com", budget_max: 500_000, preferred_regions: ["x"], bedrooms: 2, purpose: "moradia", status: "novo" },
      ...semSinais,
    });
    assert.ok(r.score >= WARM_SCORE_THRESHOLD && r.score < HOT_SCORE_THRESHOLD, `score ${r.score} precisa cair na faixa morna [${WARM_SCORE_THRESHOLD},${HOT_SCORE_THRESHOLD})`);
    assert.equal(r.temperature, "morno", "score na faixa morna é 'morno' — com o literal 40 antigo, 38 saía 'frio'");
  });

  test("HOLD 6: nenhuma dimensão reporta score acima do próprio maximum", () => {
    // Lead maximamente completo: enche o teto de cada dimensão de uma vez.
    const r = qualifyRealEstateLead({
      lead: {
        phone: "1", email: "a@b.com", budget_max: 500_000, budget_min: 300_000,
        preferred_regions: ["x"], bedrooms: 2, purpose: "moradia", status: "ganho", source: "Meta",
        next_action_at: new Date(AGORA + 86_400_000).toISOString(),
        last_interaction_at: new Date(AGORA).toISOString(),
      },
      activityCount: 20, opportunityCount: 5, propertyMatchCount: 20,
      answers: { financing: "recursos_proprios", timeline: "ate_3_meses" }, now: AGORA,
    });
    for (const d of r.dimensions) {
      assert.ok(d.score <= d.maximum, `dimensão ${d.key} reporta ${d.score} acima do maximum ${d.maximum}`);
    }
    // E o profile de fato usa o teto real: uma lead completíssima chega a 38.
    const profile = r.dimensions.find((d) => d.key === "profile");
    assert.equal(profile?.maximum, 38, "o teto declarado do profile é o real (38), não o aspiracional 35");
  });
});
