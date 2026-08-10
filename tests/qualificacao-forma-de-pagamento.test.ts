/**
 * Forma de pagamento no scorer conversacional — recursos próprios (à vista) é o
 * comprador mais forte, e o scorer precisa distingui-lo do financiado.
 *
 * qualifyRealEstateLead dava +3 CHAPADO para qualquer forma de pagamento
 * declarada, enquanto o outro scorer (calculateLeadScore) já separa à vista (15)
 * de financiamento (8). O comprador à vista empatava com o financiado na mesma
 * dimensão de perfil — uma divergência entre as duas réguas da MESMA lead.
 *
 * Agora recursos próprios vale +5 e as demais formas seguem em +3 (piso
 * preservado, aditivo). Estes testes travam a diferenciação e a aditividade.
 *
 *     node --test "tests/*.test.ts"
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { qualifyRealEstateLead } from "../lib/ai/lead-qualification.ts";

const AGORA = 1_700_000_000_000;
const semSinais = { activityCount: 0, opportunityCount: 0, propertyMatchCount: 0, now: AGORA };
const lead = { phone: "11999998888", status: "novo" };

function perfilDe(financing?: string) {
  const q = qualifyRealEstateLead({ lead, ...semSinais, answers: financing ? { financing } : {} });
  return q.dimensions.find((d) => d.key === "profile")?.score ?? 0;
}

describe("scorer conversacional — recursos próprios vale mais que financiamento", () => {
  test("recursos próprios pontua acima de financiamento no perfil", () => {
    assert.ok(perfilDe("recursos_proprios") > perfilDe("financiamento"), "à vista é o comprador mais forte");
  });

  test("os pesos: recursos próprios +5, demais formas +3", () => {
    const base = perfilDe(undefined); // telefone (7), sem forma
    assert.equal(perfilDe("recursos_proprios") - base, 5);
    for (const forma of ["financiamento", "permuta", "nao_definido"]) {
      assert.equal(perfilDe(forma) - base, 3, `${forma} soma +3`);
    }
  });

  test("aditivo: qualquer forma declarada continua valendo pelo menos o piso de antes (+3)", () => {
    const base = perfilDe(undefined);
    for (const forma of ["recursos_proprios", "financiamento", "permuta", "nao_definido"]) {
      assert.ok(perfilDe(forma) - base >= 3, `${forma} não pode valer menos que o piso`);
    }
  });

  test("a razão nomeia o comprador à vista como tal", () => {
    const q = qualifyRealEstateLead({ lead, ...semSinais, answers: { financing: "recursos_proprios" } });
    const profile = q.dimensions.find((d) => d.key === "profile");
    assert.ok(profile?.reasons.includes("Compra com recursos próprios"));
  });
});
