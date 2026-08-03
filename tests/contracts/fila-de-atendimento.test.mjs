/**
 * Contrato da FILA DE ATENDIMENTO — de quem é a vez.
 *
 * O caminho feliz de um rodízio é trivial (três pessoas, uma de cada vez). O que
 * quebra operação é o ponteiro: para onde ele aponta quando alguém saiu depois
 * de receber, quando ninguém nunca recebeu, quando a vez cai em quem não pode
 * atender. É onde a maioria dos casos abaixo mora.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { montarFila, mover, renumerar } from "../../lib/distribution/fila-de-atendimento.ts";

const membro = (profileId, posicao = null, ativo = true, entrouEm = "2026-01-01T00:00:00Z") =>
  ({ profileId, posicao, ativo, entrouEm });
const livre = (profileId, ultimaLeadEm = null) =>
  ({ profileId, ultimaLeadEm, elegivelAgora: true, porQueNao: null });
const fora = (profileId, porQueNao, ultimaLeadEm = null) =>
  ({ profileId, ultimaLeadEm, elegivelAgora: false, porQueNao });

// ── O CICLO ─────────────────────────────────────────────────────────────────

test("ninguém nunca recebeu: a vez é do primeiro da ordem", () => {
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2), membro("cau", 3)],
    [livre("ana"), livre("bru"), livre("cau")],
  );
  assert.equal(fila.proximoId, "ana");
  assert.deepEqual(fila.lugares.map((l) => l.ordem), [1, 2, 3]);
});

test("a vez é de quem vem DEPOIS de quem recebeu por último", () => {
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2), membro("cau", 3)],
    [livre("ana", "2026-08-03T10:00:00Z"), livre("bru"), livre("cau")],
  );
  assert.equal(fila.proximoId, "bru");
});

test("depois do último da fila, o ciclo volta ao primeiro", () => {
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2), membro("cau", 3)],
    [
      livre("ana", "2026-08-03T08:00:00Z"),
      livre("bru", "2026-08-03T09:00:00Z"),
      livre("cau", "2026-08-03T10:00:00Z"),
    ],
  );
  assert.equal(fila.proximoId, "ana");
});

test("o ponteiro é a marca MAIS RECENTE, não a ordem de chegada dela", () => {
  // `cau` está em 3º mas recebeu por último; a vez volta para `ana`, e não
  // para quem simplesmente tem a marca mais antiga.
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2), membro("cau", 3)],
    [
      livre("ana", "2026-08-03T09:00:00Z"),
      livre("bru", "2026-08-01T09:00:00Z"),
      livre("cau", "2026-08-03T23:00:00Z"),
    ],
  );
  assert.equal(fila.proximoId, "ana");
});

test("fuso diferente não confunde o ponteiro (compara instante, não texto)", () => {
  // "2026-08-03T21:00:00-03:00" é meia-noite de 04/08 em UTC — DEPOIS de
  // "2026-08-03T22:00:00Z" no relógio, e ANTES dele na ordem alfabética.
  // Comparar texto elegeria `bru` como âncora e devolveria `ana`; comparar
  // instante elege `ana` e devolve `bru`, que é quem de fato não recebeu.
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2)],
    [livre("ana", "2026-08-03T21:00:00-03:00"), livre("bru", "2026-08-03T22:00:00Z")],
  );
  assert.equal(fila.proximoId, "bru");
});

// ── QUEM É PULADO NÃO É EXPULSO ─────────────────────────────────────────────

test("a vez cai em quem não pode atender: passa adiante e diz por quê", () => {
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2), membro("cau", 3)],
    [livre("ana"), fora("bru", "sem WhatsApp conectado"), livre("cau")],
  );
  assert.equal(fila.proximoId, "ana");

  const comAnaServida = montarFila(
    [membro("ana", 1), membro("bru", 2), membro("cau", 3)],
    [livre("ana", "2026-08-03T10:00:00Z"), fora("bru", "sem WhatsApp conectado"), livre("cau")],
  );
  assert.equal(comAnaServida.proximoId, "cau");
  const bru = comAnaServida.lugares.find((l) => l.profileId === "bru");
  assert.equal(bru.puladoPorque, "sem WhatsApp conectado");
  assert.match(comAnaServida.porque, /sem WhatsApp conectado/);
});

test("quem foi pulado continua NA fila, com a posição intacta", () => {
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2), membro("cau", 3)],
    [livre("ana", "2026-08-03T10:00:00Z"), fora("bru", "na capacidade"), livre("cau")],
  );
  const bru = fila.lugares.find((l) => l.profileId === "bru");
  assert.equal(bru.ordem, 2);
  assert.equal(bru.elegivelAgora, false);
});

test("ninguém elegível: proximoId é null e o motivo lista todos", () => {
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2)],
    [fora("ana", "fora da fila"), fora("bru", "sem WhatsApp conectado")],
  );
  assert.equal(fila.proximoId, null);
  assert.match(fila.porque, /NENHUM pode receber agora/);
  assert.match(fila.porque, /fora da fila/);
  assert.match(fila.porque, /sem WhatsApp conectado/);
});

test("corretor sem estado conhecido não recebe por omissão", () => {
  // Estado ausente é ignorância, não permissão: entregar a lead a quem não
  // sabemos se pode atender é o mesmo defeito de tratar vazio como zero.
  const fila = montarFila([membro("ana", 1)], []);
  assert.equal(fila.proximoId, null);
});

// ── QUEM SAIU DA FILA ───────────────────────────────────────────────────────

test("membro inativo não recebe e não ocupa lugar na ordem", () => {
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2, false), membro("cau", 3)],
    [livre("ana"), livre("bru"), livre("cau")],
  );
  assert.deepEqual(fila.lugares.map((l) => l.profileId), ["ana", "cau"]);
  assert.deepEqual(fila.lugares.map((l) => l.ordem), [1, 2]);
});

test("quem recebeu por último saiu da fila: o ponteiro não trava", () => {
  // Sem tratar este caso, o ponteiro apontaria para um índice que não existe
  // mais — e a fila devolveria sempre a mesma pessoa.
  const fila = montarFila(
    [membro("ana", 1), membro("bru", 2, false), membro("cau", 3)],
    [
      livre("ana", "2026-08-03T08:00:00Z"),
      livre("bru", "2026-08-03T23:00:00Z"),
      livre("cau", null),
    ],
  );
  // Entre quem SOBROU, ana é a marca mais recente; a vez é de cau.
  assert.equal(fila.proximoId, "cau");
});

test("fila vazia responde vazio explicado, não escolhe ninguém", () => {
  const fila = montarFila([], []);
  assert.equal(fila.proximoId, null);
  assert.equal(fila.lugares.length, 0);
  assert.match(fila.porque, /Nenhum corretor na fila/);
});

// ── ORDEM ESTÁVEL ───────────────────────────────────────────────────────────

test("quem nunca foi ordenado à mão vai para o fim, na ordem de entrada", () => {
  const fila = montarFila(
    [
      membro("novo", null, true, "2026-08-03T00:00:00Z"),
      membro("velho", null, true, "2026-01-01T00:00:00Z"),
      membro("fixo", 1),
    ],
    [livre("novo"), livre("velho"), livre("fixo")],
  );
  assert.deepEqual(fila.lugares.map((l) => l.profileId), ["fixo", "velho", "novo"]);
});

test("a ordem não muda entre duas leituras dos mesmos dados", () => {
  const membros = [membro("b", null, true, null), membro("a", null, true, null)];
  const estados = [livre("a"), livre("b")];
  const primeira = montarFila(membros, estados).lugares.map((l) => l.profileId);
  const segunda = montarFila(membros.slice().reverse(), estados).lugares.map((l) => l.profileId);
  assert.deepEqual(primeira, segunda);
});

// ── MOVER E RENUMERAR ───────────────────────────────────────────────────────

test("subir troca com quem está acima e renumera 1..N", () => {
  const nova = mover([membro("ana", 1), membro("bru", 2), membro("cau", 3)], "cau", "subir");
  assert.deepEqual(nova, [
    { profileId: "ana", posicao: 1 },
    { profileId: "cau", posicao: 2 },
    { profileId: "bru", posicao: 3 },
  ]);
});

test("descer troca com quem está abaixo", () => {
  const nova = mover([membro("ana", 1), membro("bru", 2), membro("cau", 3)], "ana", "descer");
  assert.deepEqual(nova.map((m) => m.profileId), ["bru", "ana", "cau"]);
});

test("movimento que não existe devolve a ordem atual, sem erro", () => {
  const membros = [membro("ana", 1), membro("bru", 2)];
  assert.deepEqual(mover(membros, "ana", "subir").map((m) => m.profileId), ["ana", "bru"]);
  assert.deepEqual(mover(membros, "bru", "descer").map((m) => m.profileId), ["ana", "bru"]);
  assert.deepEqual(mover(membros, "ninguem", "subir").map((m) => m.profileId), ["ana", "bru"]);
});

test("renumerar fecha o buraco deixado por quem saiu", () => {
  const nova = renumerar([membro("ana", 1), membro("bru", 2, false), membro("cau", 3)]);
  assert.deepEqual(nova, [
    { profileId: "ana", posicao: 1 },
    { profileId: "cau", posicao: 2 },
  ]);
});

test("mover não promove quem está fora da fila", () => {
  const nova = mover([membro("ana", 1), membro("bru", 2, false), membro("cau", 3)], "bru", "subir");
  assert.deepEqual(nova.map((m) => m.profileId), ["ana", "cau"]);
});
