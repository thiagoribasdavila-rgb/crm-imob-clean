/**
 * CONTRATO: o limite da recuperação protege a caixa postal, não o IP.
 *
 * ── O defeito medido em 03/08/2026, contra a produção ─────────────────────
 *
 * Um corretor recém-criado não conseguia entrar. A rota respondia
 * `429 — "Muitas solicitações. Aguarde alguns minutos."`
 *
 * A cota era 5 por 15 minutos POR IP, com a chave vinda de `x-forwarded-for`.
 * Duas consequências, e as duas erradas:
 *
 *   · QUEM É LEGÍTIMO TRAVA. O SMTP embutido do Supabase tem limite próprio
 *     (1 envio a cada 57 segundos, visto no log como
 *     `over_email_send_rate_limit`). A pessoa não recebe, tenta de novo, e na
 *     quinta vez leva 429 — que ela lê como "o sistema está quebrado".
 *
 *   · QUEM QUER BURLAR, BURLA. Provado: a mesma chamada que devolvia 429 do
 *     meu IP passou com 202 mandando um `X-Forwarded-For` inventado. O
 *     cabeçalho vem de fora e ninguém o valida.
 *
 * O recurso escasso não é o IP: é a CAIXA POSTAL.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avaliarPedidoDeRecuperacao, fraseDoEnvioAceito,
  TENTATIVAS_POR_EMAIL, TENTATIVAS_POR_IP,
} from "../../lib/security/limite-de-recuperacao.ts";

const AGORA = 1_785_800_000_000;
const minAtras = (m) => AGORA - m * 60_000;

/* ── A CAIXA POSTAL É O QUE SE PROTEGE ───────────────────────────────────── */

test("o mesmo e-mail pedindo demais é barrado, e a frase diz QUANDO voltar", () => {
  const v = avaliarPedidoDeRecuperacao({
    agora: AGORA,
    tentativasDoEmail: [minAtras(1), minAtras(3), minAtras(5)],
    tentativasDoIp: [],
  });
  assert.equal(v.permitido, false);
  assert.equal(v.travaQueFechou, "email");
  assert.match(v.mensagem, /\d+ minuto/, "sem o tempo, 'muitas solicitações' vira 'está quebrado'");
  assert.match(v.mensagem, /SPAM/i, "o motivo mais comum de não receber precisa estar na frase");
  assert.ok(v.esperarSegundos > 0);
});

test("a espera conta a partir da tentativa MAIS ANTIGA — é quando abre vaga", () => {
  const v = avaliarPedidoDeRecuperacao({
    agora: AGORA,
    tentativasDoEmail: [minAtras(14), minAtras(2), minAtras(1)],
    tentativasDoIp: [],
  });
  // A de 14 minutos sai da janela em ~1 minuto.
  assert.ok(v.esperarSegundos <= 60 + 1, `esperou ${v.esperarSegundos}s, devia ser ~60`);
});

test("tentativa fora da janela não conta", () => {
  const v = avaliarPedidoDeRecuperacao({
    agora: AGORA,
    tentativasDoEmail: [minAtras(20), minAtras(30), minAtras(40)],
    tentativasDoIp: [],
  });
  assert.equal(v.permitido, true, "três tentativas velhas não bloqueiam a de hoje");
});

/* ── O ESCRITÓRIO INTEIRO NÃO PODE TRAVAR ────────────────────────────────── */

test("o teto por IP é MUITO mais alto — rede compartilhada é normal", () => {
  assert.ok(TENTATIVAS_POR_IP > TENTATIVAS_POR_EMAIL * 5,
    "operadora de celular, VPN e escritório colocam dezenas de pessoas no mesmo IP");
});

test("cinco pessoas diferentes na mesma rede passam", () => {
  // Era exatamente este o caso que o limite antigo barrava com 5/15min.
  const v = avaliarPedidoDeRecuperacao({
    agora: AGORA,
    tentativasDoEmail: [],
    tentativasDoIp: [minAtras(1), minAtras(2), minAtras(3), minAtras(4), minAtras(5)],
  });
  assert.equal(v.permitido, true);
});

test("varredura a partir de um ponto ainda é barrada", () => {
  const v = avaliarPedidoDeRecuperacao({
    agora: AGORA,
    tentativasDoEmail: [],
    tentativasDoIp: Array.from({ length: TENTATIVAS_POR_IP }, (_, i) => minAtras(i % 14)),
  });
  assert.equal(v.permitido, false);
  assert.equal(v.travaQueFechou, "ip");
});

test("a frase do IP não acusa a pessoa de algo que ela não fez", () => {
  const v = avaliarPedidoDeRecuperacao({
    agora: AGORA, tentativasDoEmail: [],
    tentativasDoIp: Array.from({ length: TENTATIVAS_POR_IP }, () => minAtras(1)),
  });
  assert.match(v.mensagem, /desta rede/i);
  assert.doesNotMatch(v.mensagem, /seu IP|você fez/i, "a pessoa não tem como agir sobre o IP dela");
});

/* ── A TRAVA DO E-MAIL VEM PRIMEIRO ──────────────────────────────────────── */

test("com as duas estouradas, o motivo relatado é o do E-MAIL", () => {
  // É o que a pessoa consegue entender e agir: olhar a caixa de spam.
  const v = avaliarPedidoDeRecuperacao({
    agora: AGORA,
    tentativasDoEmail: Array.from({ length: TENTATIVAS_POR_EMAIL }, () => minAtras(1)),
    tentativasDoIp: Array.from({ length: TENTATIVAS_POR_IP }, () => minAtras(1)),
  });
  assert.equal(v.travaQueFechou, "email");
});

/* ── PRIMEIRA TENTATIVA SEMPRE PASSA ─────────────────────────────────────── */

test("sem histórico, passa — e não devolve espera nem mensagem", () => {
  const v = avaliarPedidoDeRecuperacao({ agora: AGORA, tentativasDoEmail: [], tentativasDoIp: [] });
  assert.deepEqual(v, { permitido: true, esperarSegundos: 0, mensagem: null, travaQueFechou: null });
});

/* ── O QUE A PESSOA LÊ AO DAR CERTO ──────────────────────────────────────── */

test("a frase de sucesso não revela quem tem conta, mas diz o que esperar", () => {
  const f = fraseDoEnvioAceito();
  assert.match(f, /Se este e-mail tiver conta/i, "não confirma nem nega a existência");
  assert.match(f, /SPAM/i);
  assert.match(f, /1 hora/, "o prazo do link evita a segunda tentativa desnecessária");
  assert.match(f, /uma vez/i);
});
