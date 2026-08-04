/**
 * CONTRATO: evento fora da janela da CAPI para de ser retentado.
 *
 * ── A causa, provada por bisseção em 03/08/2026 ───────────────────────────
 *
 * `meta_conversion_events` tinha 78 linhas e ZERO entregues. Sessenta e sete em
 * `failed`, todas com:
 *
 *     Meta Graph HTTP 400 [code 100/2804003]: Invalid parameter
 *
 * A mensagem não diz qual parâmetro, e o subcódigo é o mesmo que a Meta usa
 * para outras coisas. Testei contra o dataset real e descartei, um a um: o
 * dataset existe e é alcançável; os dois tokens funcionam; o `test_event_code`
 * de exemplo funciona; `custom_data` com chave nula funciona.
 *
 * Sobrou a idade:
 *
 *     1 hora → OK        6 dias → OK
 *     8 dias → 2804003   41 dias → 2804003
 *
 * Os 67 eventos são de 23 a 25 de junho — 41 dias. Nunca vão entrar, e o worker
 * os retenta a cada 4 horas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cabeNaJanelaDaCapi, DIAS_DA_JANELA_CAPI, HORAS_DE_MARGEM, STATUS_FORA_DA_JANELA,
} from "../../lib/meta/janela-de-conversao.ts";

const AGORA = "2026-08-03T18:00:00.000Z";
const horasAtras = (h) => new Date(new Date(AGORA).getTime() - h * 3_600_000).toISOString();
const diasAtras = (d) => horasAtras(d * 24);

/* ── A FRONTEIRA MEDIDA ──────────────────────────────────────────────────── */

test("6 dias passa e 8 dias não — a fronteira que a Meta impõe", () => {
  assert.equal(cabeNaJanelaDaCapi({ ocorridoEm: diasAtras(6), agora: AGORA }).dentro, true);
  assert.equal(cabeNaJanelaDaCapi({ ocorridoEm: diasAtras(8), agora: AGORA }).dentro, false);
});

test("os 67 eventos de 41 dias são recusados, e o motivo NOMEIA a causa", () => {
  const v = cabeNaJanelaDaCapi({ ocorridoEm: diasAtras(41), agora: AGORA });
  assert.equal(v.dentro, false);
  assert.match(v.motivo, /fora da janela/i);
  assert.match(v.motivo, /41\.0 dias/, "o número exato evita a discussão sobre se é mesmo isso");
  assert.match(v.motivo, /Retentar não resolve/i, "quem lê precisa parar de tentar");
  assert.match(v.motivo, /2804003/, "liga o motivo ao erro que aparece no log");
});

test("no limite exato de 7 dias ainda cabe — recusar aqui seria fora por um", () => {
  assert.equal(cabeNaJanelaDaCapi({ ocorridoEm: diasAtras(DIAS_DA_JANELA_CAPI), agora: AGORA }).dentro, true);
});

/* ── A MARGEM: ENFILEIRAR É MAIS RÍGIDO QUE ENVIAR ──────────────────────── */

test("6 dias e 23 horas passa no ENVIO e é recusado ao ENFILEIRAR", () => {
  // Este é o caso que a margem existe para impedir: o evento entra na fila
  // válido e chega ao envio vencido, para ser recusado e voltar para a fila.
  const quase = horasAtras(DIAS_DA_JANELA_CAPI * 24 - 1);
  assert.equal(cabeNaJanelaDaCapi({ ocorridoEm: quase, agora: AGORA }).dentro, true, "no envio ainda cabe");
  assert.equal(
    cabeNaJanelaDaCapi({ ocorridoEm: quase, agora: AGORA, paraEnfileirar: true }).dentro,
    false,
    "na fila não entra: nasceria condenado",
  );
});

test("a margem é declarada, não improvisada", () => {
  assert.equal(HORAS_DE_MARGEM, 12);
  const dentroDaMargem = horasAtras(DIAS_DA_JANELA_CAPI * 24 - HORAS_DE_MARGEM - 1);
  assert.equal(cabeNaJanelaDaCapi({ ocorridoEm: dentroDaMargem, agora: AGORA, paraEnfileirar: true }).dentro, true);
});

/* ── O QUE NÃO PODE PASSAR CALADO ────────────────────────────────────────── */

test("evento SEM data é recusado — não deixado passar para virar 400 opaco", () => {
  for (const vazio of [null, undefined, "", "não é data"]) {
    const v = cabeNaJanelaDaCapi({ ocorridoEm: vazio, agora: AGORA });
    assert.equal(v.dentro, false, `deixou passar: ${String(vazio)}`);
    assert.match(v.motivo, /sem data/i);
  }
});

test("evento no FUTURO é recusado — relógio adiantado dá o mesmo 400 sem explicação", () => {
  const v = cabeNaJanelaDaCapi({ ocorridoEm: horasAtras(-48), agora: AGORA });
  assert.equal(v.dentro, false);
  assert.match(v.motivo, /futuro/i);
});

test("uma hora no futuro NÃO é recusada — relógios de servidor derivam", () => {
  // Recusar por segundos de diferença faria evento legítimo virar lixo.
  assert.equal(cabeNaJanelaDaCapi({ ocorridoEm: horasAtras(-0.5), agora: AGORA }).dentro, true);
});

/* ── O DESFECHO TEM NOME PRÓPRIO ─────────────────────────────────────────── */

test("vencido usa um status que o BANCO aceita, e nunca `failed`", () => {
  // Declarei "expired" primeiro, que descreve melhor. O CHECK do banco vivo
  // aceita só pending|processing|delivered|failed|blocked|dead_letter — e o
  // próprio código já avisava que inventar status fazia o evento sair sem
  // registro. `blocked` já significa "decidimos não enviar".
  const ACEITOS = ["pending", "processing", "delivered", "failed", "blocked", "dead_letter"];
  assert.ok(ACEITOS.includes(STATUS_FORA_DA_JANELA), `${STATUS_FORA_DA_JANELA} não passa no CHECK do banco`);
  assert.equal(STATUS_FORA_DA_JANELA, "blocked");
  assert.notEqual(STATUS_FORA_DA_JANELA, "failed", "prazo não é erro de rede — misturar traz de volta as 67 'falhas'");
  assert.notEqual(STATUS_FORA_DA_JANELA, "dead_letter", "'desistimos de tentar' ≠ 'nem se deve tentar'");
});

/* ── O MESMO DADO, O MESMO VEREDITO ──────────────────────────────────────── */

test("o agora entra como parâmetro: duas chamadas iguais dão o mesmo resultado", () => {
  const entrada = { ocorridoEm: diasAtras(3), agora: AGORA };
  assert.deepEqual(cabeNaJanelaDaCapi(entrada), cabeNaJanelaDaCapi(entrada));
  assert.equal(cabeNaJanelaDaCapi(entrada).idadeEmHoras, 72);
});

// ── O ENVIO TAMBÉM CONFERE, NÃO SÓ O ENFILEIRAMENTO ─────────────────────────

test("o caminho de ENVIO do outbox confere a janela antes de chamar a Meta", () => {
  /**
   * `cabeNaJanelaDaCapi` existia e era chamada só em `capi-feedback/process`,
   * que ENFILEIRA. O envio não conferia nada: evento que envelhecia DENTRO da
   * fila saía assim mesmo, levava 2804003 e voltava para `failed` — para ser
   * retentado quatro vezes por dia, para sempre.
   *
   * Medido em 03/08/2026: 78 conversões, UMA entregue; as 67 em `failed` com
   * `occurred_at` entre 23/06 e 26/07, ZERO dentro da janela.
   *
   * Este portão confere SUBSTÂNCIA, não a presença do import: a chamada precisa
   * acontecer antes do `fetch` para a Graph, e o desfecho precisa ser fechado
   * (`STATUS_FORA_DA_JANELA`), nunca `failed` — que traria o evento de volta.
   */
  const rota = readFileSync(new URL("../../app/api/v2/outbox/process/route.ts", import.meta.url), "utf8");
  const bloco = rota.slice(rota.indexOf('event.topic === "meta.conversion.send"'));
  const ondeConfere = bloco.indexOf("cabeNaJanelaDaCapi(");
  const ondeEnvia = bloco.indexOf("graph.facebook.com");
  assert.ok(ondeConfere > -1, "o envio precisa conferir a janela");
  assert.ok(ondeEnvia > -1, "o bloco de envio precisa existir");
  assert.ok(ondeConfere < ondeEnvia,
    "conferir DEPOIS de chamar a Graph não evita nada — a chamada já foi feita e já falhou");
  assert.match(bloco.slice(ondeConfere, ondeEnvia), /STATUS_FORA_DA_JANELA/,
    "vencido precisa fechar com o status de bloqueado; `failed` traz o evento de volta à fila");
});
