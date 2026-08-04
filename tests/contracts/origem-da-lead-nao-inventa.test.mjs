/**
 * CONTRATO: a ficha mostra de onde a lead veio, e não inventa o que não sabe.
 *
 * ── O defeito medido em 03/08/2026 ────────────────────────────────────────
 *
 * `app/api/v1/leads/[id]/route.ts:365` respondia `campaign: null` — CRAVADO.
 * A lead carregava `campaign_id`, a campanha tinha nome e R$ 991 de gasto
 * registrado, e a ficha mostrava campanha vazia. O corretor abria a lead sem
 * saber de qual anúncio ela veio.
 *
 * Sete das oito campanhas cadastradas são "[Cia360] Inside Smart", somando
 * R$ 4.122 de verba. Não mostrar isso na lead é perder a única ponte entre a
 * pessoa que ligou e o dinheiro que a trouxe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { montarOrigemDaLead, humanizarPergunta } from "../../lib/crm/origem-da-lead.ts";

const CAMPANHA_INSIDE = {
  id: "f1250a63-056b-4c5f-baec-925548e47e72",
  name: "[Cia360] Inside Smart| Lead | Imob | Jul.26",
  external_campaign_id: "120251064213360700",
  platform: "META",
  status: "ACTIVE",
};

const EVENTO_DA_INSIDE = {
  ad_id: "120251064213370700",
  adset_id: "120251064213350700",
  form_id: "3372949812871909",
  page_id: "1115087091694606",
  campaign_external_id: "120251064213360700",
  payload: {
    platform: "ig",
    is_organic: false,
    field_data: [
      { name: "full_name", values: ["Pattrícia Moino"] },
      { name: "phone_number", values: ["+5511999999999"] },
      { name: "qual_é_o_seu_objetivo_com_o_imóvel?", values: ["Investimento"] },
    ],
  },
};

/* ── A CAMPANHA CHEGA INTEIRA ────────────────────────────────────────────── */

test("a campanha cadastrada vem com nome, id externo e gasto", () => {
  const o = montarOrigemDaLead({
    fonteDaLead: "Meta Lead Ads",
    campanha: CAMPANHA_INSIDE,
    gastoDaCampanha: 378.06,
    evento: EVENTO_DA_INSIDE,
    nomeDoFormulario: "[CIA360] Inside Smart | Form - Mai26",
    medido: true,
  });
  assert.equal(o.campanha.nome, "[Cia360] Inside Smart| Lead | Imob | Jul.26");
  assert.equal(o.campanha.idExterno, "120251064213360700", "o id da Meta é o que se procura no Gerenciador");
  assert.equal(o.campanha.gasto, 378.06);
  assert.equal(o.resumo, CAMPANHA_INSIDE.name, "o resumo da lista é o nome de negócio, não o número");
});

test("anúncio, conjunto, formulário e Página vêm juntos — são camadas diferentes", () => {
  const o = montarOrigemDaLead({
    fonteDaLead: "Meta Lead Ads", campanha: CAMPANHA_INSIDE, gastoDaCampanha: null,
    evento: EVENTO_DA_INSIDE, nomeDoFormulario: "Form Mai26", medido: true,
  });
  assert.equal(o.anuncioId, "120251064213370700");
  assert.equal(o.conjuntoId, "120251064213350700");
  assert.equal(o.formularioId, "3372949812871909");
  assert.equal(o.paginaId, "1115087091694606");
  assert.equal(o.plataformaDeOrigem, "ig", "Instagram e Facebook não são a mesma origem");
  assert.equal(o.organica, false);
});

/* ── A RESPOSTA QUE A PESSOA DEU ─────────────────────────────────────────── */

test("a resposta de qualificação aparece — é o dado mais valioso da lead", () => {
  const o = montarOrigemDaLead({
    fonteDaLead: null, campanha: null, gastoDaCampanha: null,
    evento: EVENTO_DA_INSIDE, nomeDoFormulario: null, medido: true,
  });
  assert.deepEqual(o.respostasDoFormulario, [
    { pergunta: "Qual é o seu objetivo com o imóvel?", resposta: "Investimento" },
  ]);
});

test("nome, telefone e e-mail NÃO se repetem — já são colunas da ficha", () => {
  const o = montarOrigemDaLead({
    fonteDaLead: null, campanha: null, gastoDaCampanha: null,
    evento: EVENTO_DA_INSIDE, nomeDoFormulario: null, medido: true,
  });
  const perguntas = o.respostasDoFormulario.map((r) => r.pergunta.toLowerCase()).join(" ");
  assert.doesNotMatch(perguntas, /full name|phone/, "repetir o telefone embaixo do telefone é ruído");
});

/* ── O QUE NÃO SE INVENTA ────────────────────────────────────────────────── */

test("campanha na Meta e NÃO cadastrada mostra o número, e nome fica NULO", () => {
  // Dizer "Campanha 120251064213360700" no campo `nome` batizaria um dado que
  // não temos, e a partir daí ninguém saberia que falta cadastrar.
  const o = montarOrigemDaLead({
    fonteDaLead: "Meta Lead Ads", campanha: null, gastoDaCampanha: null,
    evento: EVENTO_DA_INSIDE, nomeDoFormulario: null, medido: true,
  });
  assert.equal(o.campanha.nome, null);
  assert.equal(o.campanha.idExterno, "120251064213360700");
  assert.equal(o.campanha.gasto, null, "sem cadastro não há gasto conhecido — zero seria mentira");
  assert.match(o.resumo, /^Campanha 120251064213360700$/);
});

test("sem campanha e sem evento, o resumo cai na fonte — e nunca fica vazio", () => {
  const o = montarOrigemDaLead({
    fonteDaLead: "Indicação", campanha: null, gastoDaCampanha: null,
    evento: null, nomeDoFormulario: null, medido: true,
  });
  assert.equal(o.campanha, null);
  assert.equal(o.resumo, "Indicação");
  assert.deepEqual(o.respostasDoFormulario, []);
});

test("sem nada, o resumo diz que não foi informada — nunca traço vazio", () => {
  const o = montarOrigemDaLead({
    fonteDaLead: null, campanha: null, gastoDaCampanha: null,
    evento: null, nomeDoFormulario: null, medido: true,
  });
  assert.equal(o.resumo, "Origem não informada", "'—' faz o corretor achar que a lead não tem origem");
});

test("`medido: false` atravessa — vazio por falha não pode virar vazio por ausência", () => {
  const o = montarOrigemDaLead({
    fonteDaLead: null, campanha: null, gastoDaCampanha: null,
    evento: null, nomeDoFormulario: null, medido: false,
  });
  assert.equal(o.medido, false);
});

test("humanizarPergunta não deixa a chave crua aparecer para o corretor", () => {
  assert.equal(humanizarPergunta("qual_é_o_seu_objetivo_com_o_imóvel?"), "Qual é o seu objetivo com o imóvel?");
  assert.equal(humanizarPergunta(""), "Pergunta sem nome");
});
