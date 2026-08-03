/**
 * CONTRATO: "a campanha não gerou lead" e "não perguntei" são fatos diferentes.
 *
 * ── O defeito medido em 03/08/2026 ────────────────────────────────────────
 *
 * `lib/meta/insights.ts` pedia `spend,impressions,clicks` e NUNCA `actions`.
 * `marketing_spend` acumulou 102 linhas com impressões e cliques em todas, e
 * `leads_count` nulo nas 102. A coluna existia; o extrator não pedia o dado.
 *
 * Sem essa contagem, o CPL divide a verba pelas leads que CHEGARAM: R$ 4.122
 * sobre 4 leads = R$ 1.030. A Meta, perguntada, respondeu 119 leads em 30 dias.
 *
 * A distinção que este contrato trava é a que impede o defeito de voltar
 * disfarçado: se `actions` não veio, o valor é `null`. Preencher com zero
 * afirmaria que a campanha não gerou lead — e é uma afirmação errada que se
 * parece com um dado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadsDoInsight, ACOES_DE_LEAD, CAMPOS_DE_INSIGHT } from "../../lib/meta/resultado-de-lead.ts";

/* ── A DISTINÇÃO QUE CUSTOU 30 VEZES ─────────────────────────────────────── */

test("sem o bloco `actions`, devolve NULL — nunca zero", () => {
  assert.equal(leadsDoInsight(undefined), null, "não perguntei");
  assert.equal(leadsDoInsight(null), null, "a Meta não respondeu");
});

test("com `actions` vazio, devolve ZERO — aí é fato", () => {
  // A campanha rodou, gastou e não gerou lead. Isso é um resultado.
  assert.equal(leadsDoInsight([]), 0);
});

/* ── OS TRÊS NOMES DO MESMO FATO ─────────────────────────────────────────── */

test("o agrupado vence o simples — somar os dois DUPLICARIA", () => {
  const leads = leadsDoInsight([
    { action_type: "lead", value: "24" },
    { action_type: "onsite_conversion.lead_grouped", value: "24" },
    { action_type: "link_click", value: "300" },
  ]);
  assert.equal(leads, 24, "o agrupado inclui o simples; somar daria 48");
});

test("sem o agrupado, `lead` responde", () => {
  assert.equal(leadsDoInsight([{ action_type: "lead", value: "30" }]), 30);
});

test("lead de site pelo pixel entra quando é a única presente", () => {
  assert.equal(leadsDoInsight([{ action_type: "offsite_conversion.fb_pixel_lead", value: "7" }]), 7);
});

test("a ordem de preferência está declarada e não é alfabética", () => {
  assert.deepEqual([...ACOES_DE_LEAD], [
    "onsite_conversion.lead_grouped",
    "lead",
    "offsite_conversion.fb_pixel_lead",
  ]);
});

/* ── AÇÃO PRESENTE COM VALOR ESTRAGADO ───────────────────────────────────── */

test("ação presente com valor não numérico vira 0, não null", () => {
  // Presente e corrompida é dado ruim, não ausência de pergunta. Devolver null
  // aqui faria a linha parecer "não medida" e ela sumiria da conta.
  assert.equal(leadsDoInsight([{ action_type: "lead", value: "abc" }]), 0);
  assert.equal(leadsDoInsight([{ action_type: "lead" }]), 0);
});

test("valor negativo é saneado — a Meta às vezes corrige para trás", () => {
  assert.equal(leadsDoInsight([{ action_type: "lead", value: "-3" }]), 0);
});

test("fracionário arredonda: meia lead não existe", () => {
  assert.equal(leadsDoInsight([{ action_type: "lead", value: "23.6" }]), 24);
});

/* ── O CAMPO PRECISA SER PEDIDO ──────────────────────────────────────────── */

test("a lista de campos INCLUI actions — sem isso nada acima acontece", () => {
  // Este é o teste que teria evitado 102 linhas com leads_count nulo: a regra
  // podia estar perfeita, e a consulta não pedia o campo.
  assert.match(CAMPOS_DE_INSIGHT, /(^|,)actions(,|$)/);
  assert.match(CAMPOS_DE_INSIGHT, /spend/);
  assert.match(CAMPOS_DE_INSIGHT, /campaign_id/);
});
