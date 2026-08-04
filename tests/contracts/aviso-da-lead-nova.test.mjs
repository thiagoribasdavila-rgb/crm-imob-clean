/**
 * Contrato do AVISO DE LEAD NOVA AO CORRETOR (canal externo).
 *
 * Dois riscos governam este arquivo, e os dois já custaram caro neste produto:
 * mandar PII por um canal de terceiro, e mandar tanta mensagem que a pessoa
 * silencia o canal — depois do que nenhum aviso chega mais, nem o urgente.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { planejarAvisos, montarAviso, marcaDagua } from "../../lib/crm/aviso-da-lead-nova.ts";

const LINK = "https://atlas.exemplo/leads";
const atribuicao = (corretorId, leadId) => ({ leadId, corretorId, em: "2026-08-03T21:00:00Z" });
const corretor = (profileId, telegramChatId = "chat-1", nome = `Corretor ${profileId}`) =>
  ({ profileId, nome, telegramChatId });

// ── A POLÍTICA DE PII ───────────────────────────────────────────────────────

test("o texto NÃO leva nome, telefone nem e-mail", () => {
  const texto = montarAviso(1, LINK);
  // A mensagem viaja por app de terceiro, para aparelho que pode não ser
  // corporativo, e fica lá para sempre.
  assert.ok(!/@/.test(texto.replace(LINK, "")), "sem e-mail");
  assert.ok(!/\d{8,}/.test(texto.replace(LINK, "")), "sem telefone");
  assert.match(texto, /caiu na sua carteira/);
  assert.match(texto, new RegExp(LINK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("o aviso diz o próximo passo, não só o fato", () => {
  // Aviso sem próximo passo é aviso que se aprende a fechar.
  assert.match(montarAviso(3, LINK), /registre o contato no Atlas/i);
});

test("uma lead e várias leads falam diferente", () => {
  assert.match(montarAviso(1, LINK), /Uma lead nova/);
  assert.match(montarAviso(4, LINK), /4 leads novas/);
});

// ── UMA MENSAGEM POR PESSOA ─────────────────────────────────────────────────

test("cinco leads para o mesmo corretor viram UMA mensagem", () => {
  const plano = planejarAvisos(
    Array.from({ length: 5 }, (_, i) => atribuicao("ana", `l${i}`)),
    [corretor("ana")],
    LINK,
  );
  assert.equal(plano.enviar.length, 1);
  assert.equal(plano.enviar[0].quantas, 5);
  assert.match(plano.enviar[0].texto, /5 leads novas/);
});

test("cada corretor recebe a própria contagem", () => {
  const plano = planejarAvisos(
    [atribuicao("ana", "l1"), atribuicao("ana", "l2"), atribuicao("bru", "l3")],
    [corretor("ana", "chat-ana"), corretor("bru", "chat-bru")],
    LINK,
  );
  assert.equal(plano.enviar.length, 2);
  const ana = plano.enviar.find((e) => e.profileId === "ana");
  const bru = plano.enviar.find((e) => e.profileId === "bru");
  assert.equal(ana.quantas, 2);
  assert.equal(ana.chatId, "chat-ana");
  assert.equal(bru.quantas, 1);
});

test("a ordem do envio é estável entre duas passagens iguais", () => {
  const entrada = [atribuicao("zeca", "l1"), atribuicao("ana", "l2")];
  const corretores = [corretor("ana"), corretor("zeca")];
  const a = planejarAvisos(entrada, corretores, LINK).enviar.map((e) => e.profileId);
  const b = planejarAvisos([...entrada].reverse(), corretores, LINK).enviar.map((e) => e.profileId);
  assert.deepEqual(a, b);
});

// ── A LACUNA QUE NÃO PODE SER SILENCIOSA ────────────────────────────────────

test("corretor sem canal entra em semCanal, não some", () => {
  // Medido em 03/08/2026: 5 corretores ativos, ZERO com telegram_chat_id. Sem
  // esta lista, ligar o recurso responderia 200 e não avisaria ninguém.
  const plano = planejarAvisos(
    [atribuicao("ana", "l1"), atribuicao("ana", "l2")],
    [corretor("ana", null, "Ana")],
    LINK,
  );
  assert.equal(plano.enviar.length, 0);
  assert.deepEqual(plano.semCanal, [{ profileId: "ana", nome: "Ana", quantas: 2 }]);
});

test("corretor desconhecido também vira lacuna, não descarte", () => {
  const plano = planejarAvisos([atribuicao("fantasma", "l1")], [], LINK);
  assert.equal(plano.semCanal.length, 1);
  assert.equal(plano.semCanal[0].quantas, 1);
});

test("consideradas conta tudo, inclusive o que não deu para enviar", () => {
  const plano = planejarAvisos(
    [atribuicao("ana", "l1"), atribuicao("sem", "l2")],
    [corretor("ana")],
    LINK,
  );
  assert.equal(plano.consideradas, 2);
  assert.equal(plano.enviar.length, 1);
  assert.equal(plano.semCanal.length, 1);
});

test("atribuição sem corretor não vira mensagem para ninguém", () => {
  const plano = planejarAvisos([atribuicao("", "l1")], [corretor("ana")], LINK);
  assert.equal(plano.enviar.length, 0);
  assert.equal(plano.semCanal.length, 0);
});

// ── A MARCA D'ÁGUA ──────────────────────────────────────────────────────────

const AGORA = Date.parse("2026-08-03T21:00:00Z");

test("a passagem seguinte começa onde a anterior parou", () => {
  // A marca sai normalizada em ISO — mesmo instante, formato único. Comparar
  // com o texto cru de entrada testaria o formato, não a regra.
  const anterior = "2026-08-03T20:55:00Z";
  assert.equal(marcaDagua(anterior, AGORA), new Date(anterior).toISOString());
});

test("a primeira passagem de todas não avisa sobre o histórico inteiro", () => {
  // A estreia do recurso não pode disparar centenas de mensagens sobre
  // atribuições antigas.
  const marca = marcaDagua(null, AGORA, 15);
  assert.equal(marca, new Date(AGORA - 15 * 60_000).toISOString());
});

test("worker parado por dias não volta avisando sobre tudo", () => {
  const marca = marcaDagua("2026-07-28T10:00:00Z", AGORA);
  assert.equal(marca, new Date(AGORA - 6 * 60 * 60_000).toISOString(),
    "o teto de recuperação é 6 h — o resto é passado, não fila");
});

test("carimbo ilegível cai na janela de estreia, não no início dos tempos", () => {
  const marca = marcaDagua("não é data", AGORA, 15);
  assert.equal(marca, new Date(AGORA - 15 * 60_000).toISOString());
});
