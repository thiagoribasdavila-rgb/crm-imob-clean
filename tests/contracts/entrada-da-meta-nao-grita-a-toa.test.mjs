/**
 * CONTRATO: o vigia da entrada da Meta acende pelo motivo certo.
 *
 * ── O alarme que este contrato impede de nascer ───────────────────────────
 *
 * O pedido foi "alertar quando ficar sem eventos". Medido em 03/08/2026: o
 * último evento tinha 6 dias, e um alarme por silêncio teria acendido — sobre
 * uma integração PERFEITA. A lead mais nova na Meta era de 26/07; não havia o
 * que entregar. O silêncio era da campanha, não do webhook.
 *
 * Vigia que acende sem defeito é pior que vigia nenhum: a operação aprende a
 * ignorá-lo, e no dia do defeito real ele acende junto com o ruído de sempre.
 *
 * O sintoma é a DIVERGÊNCIA entre os dois lados, nunca o silêncio sozinho.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarEntradaDaMeta, HORAS_ATE_MUDO } from "../../lib/meta/saude-da-entrada.ts";

const AGORA = "2026-08-03T12:00:00.000Z";
const horasAtras = (h) => new Date(new Date(AGORA).getTime() - h * 3_600_000).toISOString();

/* ── O CASO QUE MOTIVOU O CONTRATO ───────────────────────────────────────── */

test("6 dias de silêncio com represa ZERO é EM DIA — não acende", () => {
  const v = avaliarEntradaDaMeta({ ultimoEventoEm: horasAtras(144), represa: 0, fontesAtivas: 16, agora: AGORA });
  assert.equal(v.estado, "em_dia");
  assert.equal(v.exigeAcao, false, "campanha parada não é defeito de integração");
  assert.match(v.resumo, /não de falha|nenhuma lead esperando/i, "quem lê precisa entender POR QUE está calmo");
});

test("o mesmo silêncio COM represa é MUDO — acende", () => {
  const v = avaliarEntradaDaMeta({ ultimoEventoEm: horasAtras(144), represa: 103, fontesAtivas: 16, agora: AGORA });
  assert.equal(v.estado, "mudo");
  assert.equal(v.exigeAcao, true);
  assert.match(v.resumo, /103/, "o número da represa é a informação, não o adjetivo");
  assert.match(v.resumo, /não é campanha parada/i, "precisa dizer que a hipótese fácil já foi descartada");
});

/* ── A FRONTEIRA ─────────────────────────────────────────────────────────── */

test("represa com evento recente é ATRASADO, não mudo — a esteira anda", () => {
  const v = avaliarEntradaDaMeta({ ultimoEventoEm: horasAtras(2), represa: 5, fontesAtivas: 3, agora: AGORA });
  assert.equal(v.estado, "atrasado");
  assert.equal(v.exigeAcao, true, "lead paga esperando exige ação mesmo com a esteira andando");
  assert.match(v.resumo, /represa/i, "o conserto é a represa — dizer só 'atrasado' não ajuda ninguém");
});

test("na hora exata do limite o estado vira mudo, não fica indefinido", () => {
  const antes = avaliarEntradaDaMeta({ ultimoEventoEm: horasAtras(HORAS_ATE_MUDO - 1), represa: 1, fontesAtivas: 1, agora: AGORA });
  const depois = avaliarEntradaDaMeta({ ultimoEventoEm: horasAtras(HORAS_ATE_MUDO), represa: 1, fontesAtivas: 1, agora: AGORA });
  assert.equal(antes.estado, "atrasado");
  assert.equal(depois.estado, "mudo");
});

/* ── SEM CONFIGURAÇÃO VENCE TUDO ─────────────────────────────────────────── */

test("nenhuma fonte ativa acende ANTES de qualquer conta de tempo", () => {
  // Sem fonte ativa, toda lead nova vai para a fila sem destino em silêncio.
  // Reportar "em dia" aqui seria a mentira mais cara possível.
  const v = avaliarEntradaDaMeta({ ultimoEventoEm: horasAtras(1), represa: 0, fontesAtivas: 0, agora: AGORA });
  assert.equal(v.estado, "sem_configuracao");
  assert.equal(v.exigeAcao, true);
  assert.match(v.resumo, /sem destino|fila/i);
});

/* ── NUNCA RECEBEU: DUAS LEITURAS OPOSTAS ────────────────────────────────── */

test("integração nova e sem represa não é defeito — é integração nova", () => {
  const v = avaliarEntradaDaMeta({ ultimoEventoEm: null, represa: 0, fontesAtivas: 2, agora: AGORA });
  assert.equal(v.estado, "nunca_recebeu");
  assert.equal(v.exigeAcao, false);
  assert.equal(v.horasSemEvento, null, "sem evento não existe 'há quantas horas' — null, nunca zero");
});

test("nunca recebeu COM represa é mudo — nunca funcionou", () => {
  const v = avaliarEntradaDaMeta({ ultimoEventoEm: null, represa: 40, fontesAtivas: 2, agora: AGORA });
  assert.equal(v.estado, "mudo");
  assert.equal(v.exigeAcao, true);
});

/* ── O VEREDITO NÃO PODE DEPENDER DE QUANDO RODA ─────────────────────────── */

test("o agora entra como parâmetro: mesmo dado, mesmo veredito", () => {
  const entrada = { ultimoEventoEm: "2026-08-01T12:00:00.000Z", represa: 7, fontesAtivas: 4 };
  const a = avaliarEntradaDaMeta({ ...entrada, agora: AGORA });
  const b = avaliarEntradaDaMeta({ ...entrada, agora: AGORA });
  assert.deepEqual(a, b);
  assert.equal(a.horasSemEvento, 48);
});

test("represa negativa ou lixo não vira alarme — é saneada para zero", () => {
  const v = avaliarEntradaDaMeta({ ultimoEventoEm: horasAtras(100), represa: -5, fontesAtivas: 1, agora: AGORA });
  assert.equal(v.represa, 0);
  assert.equal(v.exigeAcao, false, "um número corrompido não pode inventar um defeito");
});
