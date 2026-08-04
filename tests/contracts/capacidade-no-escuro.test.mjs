/**
 * Contrato do painel CAPACIDADE NO ESCURO.
 *
 * Medido em 03/08/2026: 82 tabelas com zero linhas, 67 com código que as lê.
 * Nenhuma quebrada — todas apagadas por falta de configuração. O produto não
 * tinha como dizer isso, e um painel vazio lê-se como "não gastei" em vez de
 * "não cadastrei".
 *
 * Os casos abaixo protegem as três coisas que fazem um painel destes virar
 * ruído em uma semana: prometer verde sem ter medido, mandar agir num degrau
 * bloqueado, e listar tarefa sem dizer o que ela custa hoje.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { montarPainel, resumo, CATALOGO } from "../../lib/atlas/capacidade-no-escuro.ts";

const cap = (over = {}) => ({
  chave: "x", titulo: "Coisa", oQueFicaNoEscuro: "Nada funciona.",
  comoAcender: "Fazer o passo", onde: "/algum-lugar", peso: 2, ...over,
});
const fato = (over = {}) => ({ chave: "x", configuradas: 0, ...over });

// ── APAGADA, ACESA, BLOQUEADA ───────────────────────────────────────────────

test("zero configurações é APAGADA, com a ação e o lugar", () => {
  const [l] = montarPainel([cap()], [fato()]);
  assert.equal(l.estado, "apagada");
  assert.equal(l.comoAcender, "Fazer o passo");
  assert.equal(l.onde, "/algum-lugar");
});

test("configurada é ACESA e para de pedir ação", () => {
  const [l] = montarPainel([cap()], [fato({ configuradas: 3 })]);
  assert.equal(l.estado, "acesa");
  assert.equal(l.comoAcender, null, "capacidade no ar não pode continuar cobrando");
  assert.match(l.frase, /3 configurações/);
});

test("o mínimo pode ser maior que um", () => {
  const [l] = montarPainel([cap()], [fato({ configuradas: 2, minimo: 5 })]);
  assert.equal(l.estado, "apagada");
});

// ── A REGRA QUE IMPEDE O RUÍDO ──────────────────────────────────────────────

test("pré-requisito não pronto BLOQUEIA e não manda ninguém agir", () => {
  // Mandar cadastrar o dataset da CAPI antes de existir token é gastar a
  // atenção da pessoa no degrau errado — e ensinar a ignorar a lista.
  const [l] = montarPainel(
    [cap({ prerequisito: "o token da Meta" })],
    [fato({ prerequisitoPronto: false })],
  );
  assert.equal(l.estado, "bloqueada");
  assert.equal(l.comoAcender, null);
  assert.match(l.frase, /Depende de o token da Meta/);
  assert.match(l.frase, /Nada funciona/, "o custo continua dito, mesmo bloqueado");
});

test("capacidade sem medição NUNCA aparece como acesa", () => {
  // Ausência de medição não vira boa notícia.
  const [l] = montarPainel([cap()], []);
  assert.equal(l.estado, "bloqueada");
  assert.match(l.frase, /desconhecido, não saudável/);
});

test("pré-requisito pronto não bloqueia", () => {
  const [l] = montarPainel([cap()], [fato({ prerequisitoPronto: true })]);
  assert.equal(l.estado, "apagada");
});

// ── O CUSTO MEDIDO VEM ANTES DA INSTRUÇÃO ───────────────────────────────────

test("o custo de hoje entra na frente da frase", () => {
  const [l] = montarPainel([cap()], [fato()], { x: "R$ 4.355,83 saíram este mês e" });
  assert.match(l.frase, /^R\$ 4\.355,83 saíram este mês e Nada funciona\.$/);
});

test("sem custo medido a frase continua completa, sem buraco", () => {
  const [l] = montarPainel([cap()], [fato()]);
  assert.equal(l.frase, "Nada funciona.");
});

// ── A ORDEM ─────────────────────────────────────────────────────────────────

test("apagadas na frente, depois bloqueadas, acesas por último", () => {
  const painel = montarPainel(
    [cap({ chave: "a", titulo: "Acesa" }), cap({ chave: "b", titulo: "Bloqueada" }), cap({ chave: "c", titulo: "Apagada" })],
    [
      { chave: "a", configuradas: 1 },
      { chave: "b", configuradas: 0, prerequisitoPronto: false },
      { chave: "c", configuradas: 0 },
    ],
  );
  assert.deepEqual(painel.map((l) => l.estado), ["apagada", "bloqueada", "acesa"]);
});

test("dentro do grupo, a maior consequência vem primeiro", () => {
  const painel = montarPainel(
    [cap({ chave: "leve", titulo: "Leve", peso: 1 }), cap({ chave: "grave", titulo: "Grave", peso: 3 })],
    [{ chave: "leve", configuradas: 0 }, { chave: "grave", configuradas: 0 }],
  );
  assert.deepEqual(painel.map((l) => l.titulo), ["Grave", "Leve"]);
});

test("a ordem é estável entre duas leituras dos mesmos fatos", () => {
  const c = [cap({ chave: "z", titulo: "Zebra" }), cap({ chave: "a", titulo: "Anta" })];
  const f = [{ chave: "z", configuradas: 0 }, { chave: "a", configuradas: 0 }];
  const um = montarPainel(c, f).map((l) => l.chave);
  const dois = montarPainel([...c].reverse(), [...f].reverse()).map((l) => l.chave);
  assert.deepEqual(um, dois);
});

// ── O RESUMO ────────────────────────────────────────────────────────────────

test("o resumo conta os três estados e o total fecha", () => {
  const painel = montarPainel(
    [cap({ chave: "a" }), cap({ chave: "b" }), cap({ chave: "c" })],
    [{ chave: "a", configuradas: 1 }, { chave: "b", configuradas: 0 }, { chave: "c", configuradas: 0, prerequisitoPronto: false }],
  );
  const r = resumo(painel);
  assert.deepEqual(r, { apagadas: 1, bloqueadas: 1, acesas: 1, total: 3 });
});

// ── O CATÁLOGO ──────────────────────────────────────────────────────────────

test("toda capacidade do catálogo diz o que fica no escuro E como acender", () => {
  for (const c of CATALOGO) {
    assert.ok(c.oQueFicaNoEscuro.length > 30, `${c.chave}: a consequência precisa ser concreta`);
    assert.ok(c.comoAcender.length > 5, `${c.chave}: falta a ação`);
    assert.match(c.onde, /^\//, `${c.chave}: o lugar precisa ser um caminho do produto`);
  }
});

test("nenhuma frase do catálogo promete melhoria vaga", () => {
  /**
   * A primeira versão deste portão proibia os VERBOS "melhora/otimiza/aprimora"
   * e reprovou uma frase correta: "a Meta otimiza para quem PREENCHE
   * FORMULÁRIO, não para quem compra" — que não promete nada, descreve o que
   * acontece hoje e é justamente o custo concreto.
   *
   * Reapontado para a substância: o que não pode existir é a CONSTRUÇÃO de
   * promessa vaga ("melhora a experiência", "otimiza o processo"), e o que TEM
   * de existir é um sujeito concreto — alguém ou alguma coisa que sofre.
   */
  const promessaVaga = /(melhora|otimiza|aprimora|potencializa)\s+(a|o|as|os)?\s*(experiência|processo|performance|resultado|gestão|eficiência)/i;
  const sujeitoConcreto = /lead|corretor|verba|prazo|Meta|carteira|origem|painel|distribuição|dataset|CAC/i;
  for (const c of CATALOGO) {
    assert.ok(!promessaVaga.test(c.oQueFicaNoEscuro),
      `${c.chave}: diga o que PARA de funcionar, não que algo melhora`);
    assert.ok(sujeitoConcreto.test(c.oQueFicaNoEscuro),
      `${c.chave}: a consequência precisa ter sujeito concreto — quem ou o que sofre`);
  }
});

test("capacidade com pré-requisito nomeia qual é", () => {
  for (const c of CATALOGO.filter((x) => x.chave === "dataset_da_capi")) {
    assert.ok(c.prerequisito, "sem o nome do pré-requisito a mensagem de bloqueio fica muda");
  }
});
