/**
 * CONTRATO: quem calcula o CPL precisa RECEBER o denominador.
 *
 * ── O defeito, medido em 03/08/2026 ────────────────────────────────────────
 *
 * `lib/marketing/cost-report.ts` já sabia dividir pelo que a campanha GEROU —
 * `cpl-conta-as-leads-que-a-campanha-gerou.test.mjs` prova a conta com 19
 * asserções verdes. E o número na tela continuava errado, porque
 * `app/api/v1/marketing/cost-report/route.ts` nunca passava `leadsNaOrigem`: o
 * select de `marketing_spend` pedia `campaign_id,spend_date,amount` e parava
 * ali, deixando `leads_count` — que é o denominador — no banco.
 *
 * Números do banco vivo naquele dia: sete campanhas "[Cia360] Inside Smart",
 * R$ 4.355,83 de verba, 119 leads geradas segundo a Meta, 4 ligadas a elas no
 * CRM. A divisão caía sobre as 4: R$ 1.089 por lead, contra os ~R$ 37 reais.
 * Erro de 30 vezes, em verde, na tela que decide onde colocar verba.
 *
 * É a mesma classe do `escopo` que nenhum chamador da cascata de distribuição
 * passava: os dois lados prontos, o fio no chão, e nada vermelho. Por isso este
 * contrato olha o CHAMADOR — a regra pura já tem o dela.
 *
 * Não confere aridade nem nome de variável: confere que a coluna é PEDIDA ao
 * banco e que ela alimenta o campo que a conta usa. Um select sem `leads_count`
 * passaria em qualquer portão que só procurasse a palavra `leadsNaOrigem`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { aggregate } from "../../lib/marketing/cost-report.ts";

const rota = readFileSync(new URL("../../app/api/v1/marketing/cost-report/route.ts", import.meta.url), "utf8");

test("a rota PEDE leads_count ao banco", () => {
  assert.match(rota, /from\("marketing_spend"\)[\s\S]{0,120}?\.select\([^)]*leads_count/,
    "sem a coluna no select, o denominador nunca sai do banco — e a conta certa fica sem número para usar");
});

test("e o entrega como leadsNaOrigem, não como zero", () => {
  assert.match(rota, /leadsNaOrigem:[^,\n]*leads_count/,
    "o campo que `aggregate` usa precisa vir da coluna, não de um literal");
  assert.ok(!/leadsNaOrigem:\s*0\b/.test(rota),
    "zero aqui afirmaria que a campanha não gerou lead nenhuma; a ausência tem que ser `null`");
  assert.match(rota, /leads_count == null \? null :/,
    "'não perguntei' e 'gerou zero' precisam continuar distinguíveis");
});

test("o número que a rota produziria com os dados reais daquele dia", () => {
  // Reproduz o formato exato que a rota monta: uma linha de GASTO por dia com
  // `leadsNaOrigem`, e uma linha por lead que CHEGOU ao CRM.
  const doGasto = (spend, leadsNaOrigem) => ({
    campaignId: "cia360", campaignName: "[Cia360] Inside Smart", date: "2026-08-02",
    spend, leads: 0, sales: 0, leadsNaOrigem,
  });
  const daLead = () => ({ campaignId: "cia360", spend: 0, leads: 1, sales: 0 });

  const [b] = aggregate([doGasto(4355.83, 119), ...Array.from({ length: 4 }, daLead)], "campaign");
  assert.equal(b.cpl, 36.60, "4355.83 / 119 — o custo real");
  assert.equal(b.cplSobreEntradas, 1088.96, "o número antigo, que a tela mostrava como verdade");
  assert.equal(b.leadsNaoEntraram, 115, "e a diferença tem nome");
  assert.equal(b.cplConfiavel, false, "com 115 leads fora, nenhum CPL desta campanha é apresentável como fato");
});

test("sem a coluna preenchida, o CPL não inventa confiança", () => {
  // `leads_count` nulo é o estado de 16 das 106 linhas daquela base.
  const [b] = aggregate([
    { campaignId: "x", spend: 400, leads: 0, sales: 0, leadsNaOrigem: null },
    { campaignId: "x", spend: 0, leads: 4, sales: 0 },
  ], "campaign");
  assert.equal(b.cpl, 100, "divide pelo que chegou, que é tudo o que se sabe");
  assert.equal(b.cplConfiavel, false, "e diz que não pode ser apresentado como fato");
  assert.equal(b.leadsNaoEntraram, null, "sem origem conhecida, a diferença é desconhecida — não zero");
});
