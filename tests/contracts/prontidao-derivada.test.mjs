/**
 * Contrato COMPORTAMENTAL da derivação de prontidão.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────
 *
 * A primeira versão da proteção desta feature era só grep: o contrato casava
 * `codigo: "pagina_desconhecida", gravidade: "critical"` no arquivo fonte. O
 * mutation testing (M27) derrubou isso na primeira execução — trocar o `if` que
 * detecta página desconhecida por `if (false)` deixava a suíte VERDE, porque a
 * string continuava lá, inalcançável. Confiança falsa exatamente no ponto mais
 * caro: verba liberada com os anúncios publicando numa Página que o CRM não
 * conhece compra leads que caem em `meta_leads_sem_destino`, e a tela fica
 * verde enquanto o dinheiro sai.
 *
 * Por isso a derivação foi extraída para um módulo sem `server-only` e é
 * EXECUTADA aqui, com respostas da Graph montadas à mão. Nenhuma rede.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { derivarProntidao } from "../../lib/meta/marketing/prontidao-derivada.ts";

const LIDO_EM = "2026-07-28T21:00:00.000Z";

/** Um anúncio no formato Advantage+, com o formulário aninhado fundo. */
const anuncioCom = (pageId, formId) => ({
  creative: {
    asset_feed_spec: {
      call_to_actions: [{ value: { lead_gen_form_id: formId } }],
      link_urls: [{ page_id: pageId }],
    },
  },
});

const derivar = (over = {}) =>
  derivarProntidao({
    contaId: "act_123",
    lidoEm: LIDO_EM,
    conta: { name: "Conta", account_status: 1, spend_cap: 1_000_00, amount_spent: 100_00 },
    campanhas: [{ effective_status: "ACTIVE" }],
    anuncios: [anuncioCom("111", "222")],
    fontes: [{ form_id: "222", page_id: "111", active: true, development_id: "dev-1", name: "Spin" }],
    ...over,
  });

test("tudo em ordem não inventa bloqueio", () => {
  const p = derivar();
  assert.equal(p.bloqueios.length, 0, "alerta sem causa ensina a ignorar a lista inteira");
  assert.equal(p.medido, true);
  assert.deepEqual(p.paginasEmUso, ["111"]);
  assert.deepEqual(p.formulariosEmUso, ["222"], "o formulário precisa ser achado dentro de asset_feed_spec");
});

test("página que o CRM não conhece é bloqueio crítico", () => {
  // O caso que a mutação M27 provou não estar protegido.
  const p = derivar({
    fontes: [{ form_id: "222", page_id: "999", active: true, development_id: "dev-1", name: "Outra" }],
  });
  const bloqueio = p.bloqueios.find((b) => b.codigo === "pagina_desconhecida");
  assert.ok(bloqueio, "sem isto a verba é liberada e a lead paga cai em meta_leads_sem_destino");
  assert.equal(bloqueio.gravidade, "critical");
  assert.match(bloqueio.resumo, /111/, "o resumo precisa dizer QUAL página, senão ninguém resolve");
});

test("teto de gasto esgotado é bloqueio crítico, e sobra não é", () => {
  const esgotado = derivar({ conta: { name: "C", account_status: 1, spend_cap: 527_100, amount_spent: 527_100 } });
  assert.ok(esgotado.bloqueios.some((b) => b.codigo === "teto_esgotado" && b.gravidade === "critical"));
  assert.equal(esgotado.verba.esgotado, true);
  assert.equal(esgotado.verba.restanteBrl, 0);

  const comSobra = derivar({ conta: { name: "C", account_status: 1, spend_cap: 527_100, amount_spent: 100_00 } });
  assert.equal(comSobra.verba.esgotado, false);
  assert.ok(!comSobra.bloqueios.some((b) => b.codigo === "teto_esgotado"));
});

test("conta sem teto definido não vira 'esgotado'", () => {
  // spend_cap 0 significa SEM TETO, não teto zerado. Tratar como esgotado
  // publicaria um bloqueio crítico permanente e insolúvel.
  const p = derivar({ conta: { name: "C", account_status: 1, spend_cap: 0, amount_spent: 900_00 } });
  assert.equal(p.verba.esgotado, false);
  assert.equal(p.verba.tetoBrl, null);
  assert.ok(!p.bloqueios.some((b) => b.codigo === "teto_esgotado"));
});

test("conta inativa e ausência de campanha ativa aparecem", () => {
  const inativa = derivar({ conta: { name: "C", account_status: 2, spend_cap: 0, amount_spent: 0 } });
  assert.ok(inativa.bloqueios.some((b) => b.codigo === "conta_inativa"));
  assert.equal(inativa.conta.ativa, false);

  const paradas = derivar({ campanhas: [{ effective_status: "PAUSED" }, { effective_status: "PAUSED" }] });
  const bloqueio = paradas.bloqueios.find((b) => b.codigo === "sem_campanha_ativa");
  assert.ok(bloqueio);
  assert.match(bloqueio.resumo, /2 campanhas/);

  // Conta sem campanha nenhuma não é o mesmo que campanhas todas pausadas.
  const semNada = derivar({ campanhas: [] });
  assert.ok(!semNada.bloqueios.some((b) => b.codigo === "sem_campanha_ativa"),
    "conta nova sem campanha nenhuma não tem o que 'reativar'");
});

test("formulário em uso sem cadastro é crítico; cadastrado com lacuna é atenção", () => {
  const semCadastro = derivar({ fontes: [{ form_id: "outro", page_id: "111", active: true, development_id: "d", name: null }] });
  assert.ok(semCadastro.bloqueios.some((b) => b.codigo === "formulario_nao_cadastrado" && b.gravidade === "critical"));

  const desativada = derivar({ fontes: [{ form_id: "222", page_id: "111", active: false, development_id: "d", name: "Spin" }] });
  const b1 = desativada.bloqueios.find((b) => b.codigo === "fonte_desativada");
  assert.ok(b1 && b1.gravidade === "attention", "fonte desativada represa a lead, mas ela chega — é atenção, não crítico");

  const semEmpreendimento = derivar({ fontes: [{ form_id: "222", page_id: "111", active: true, development_id: null, name: "Spin" }] });
  assert.ok(semEmpreendimento.bloqueios.some((b) => b.codigo === "fonte_sem_empreendimento" && b.gravidade === "attention"));
});

test("o formulário é achado em qualquer formato de criativo", () => {
  // Três montagens diferentes do mesmo anúncio. A varredura por caminho fixo
  // concluiu "0 formulários" com 19 anúncios ativos usando um.
  const formatos = [
    { creative: { object_story_spec: { link_data: { call_to_action: { value: { lead_gen_form_id: "777" } }, page_id: "111" } } } },
    { creative: { asset_feed_spec: { call_to_actions: [{ value: { lead_gen_form_id: 777 } }] }, object_story_spec: { page_id: 111 } } },
    { creative: { alguma_coisa: { aninhada: { fundo: { lead_gen_form_id: "777", page_id: "111" } } } } },
  ];
  for (const [indice, anuncio] of formatos.entries()) {
    const p = derivarProntidao({
      contaId: "act_123", lidoEm: LIDO_EM,
      conta: { name: "C", account_status: 1, spend_cap: 0, amount_spent: 0 },
      campanhas: [{ effective_status: "ACTIVE" }],
      anuncios: [anuncio],
      fontes: [],
    });
    assert.deepEqual(p.formulariosEmUso, ["777"], `formato ${indice} escondeu o formulário`);
    assert.deepEqual(p.paginasEmUso, ["111"], `formato ${indice} escondeu a página`);
  }
});

test("vários anúncios na mesma página produzem UM bloqueio, não um por anúncio", () => {
  const p = derivar({
    anuncios: [anuncioCom("999", "222"), anuncioCom("999", "222"), anuncioCom("999", "222")],
    fontes: [{ form_id: "222", page_id: "111", active: true, development_id: "d", name: "Spin" }],
  });
  assert.equal(p.bloqueios.filter((b) => b.codigo === "pagina_desconhecida").length, 1,
    "19 anúncios na mesma página gerariam 19 linhas idênticas e enterrariam o resto da fila");
  assert.equal(p.anunciosAtivos, 3);
});
