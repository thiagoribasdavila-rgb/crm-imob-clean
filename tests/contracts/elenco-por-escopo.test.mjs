/**
 * Contrato do ELENCO POR ESCOPO — quem participa da fila deste projeto/campanha.
 *
 * A maioria dos casos abaixo cobre RECUSAS e PRECEDÊNCIA, não o caminho feliz.
 * O caminho feliz de um filtro é trivial; o que quebra operação é ele deixar
 * passar quem não devia, ou prender a lead quando o time está fora.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { resolverElenco, aplicarElenco } from "../../lib/distribution/elenco-por-escopo.ts";

const m = (escopo, escopoId, profileId, ativo = true) => ({ escopo, escopoId, profileId, ativo });
const c = (id) => ({ id });

// ── SEM ELENCO: nada muda ───────────────────────────────────────────────────

test("sem elenco cadastrado, a fila segue aberta a toda a equipe", () => {
  const r = resolverElenco({ projetoId: "p1", campanhaId: "c1" }, []);
  assert.equal(r.permitidos, null);
  assert.equal(r.decididoPor, "sem-elenco");
  const f = aplicarElenco([c("a"), c("b")], r);
  assert.deepEqual(f.elegiveis.map((x) => x.id), ["a", "b"]);
  assert.equal(f.elencoEsvaziou, false);
});

test("lead sem projeto e sem campanha não é restringida por elenco de ninguém", () => {
  const r = resolverElenco({}, [m("projeto", "p1", "ana"), m("campanha", "c1", "bia")]);
  assert.equal(r.permitidos, null);
});

// ── O ELENCO RESTRINGE, NUNCA AMPLIA ────────────────────────────────────────

test("quem não está no elenco não recebe, mesmo estando disponível", () => {
  // `zeca` está livre e disponível — e é justamente por isso que este caso
  // existe: sem a regra, ele receberia por ter a fila mais curta.
  const r = resolverElenco({ projetoId: "arvo" }, [m("projeto", "arvo", "ana")]);
  const f = aplicarElenco([c("zeca"), c("ana")], r);
  assert.deepEqual(f.elegiveis.map((x) => x.id), ["ana"]);
});

test("membro INATIVO não conta como elenco", () => {
  const r = resolverElenco({ projetoId: "arvo" }, [m("projeto", "arvo", "ana", false)]);
  // Só havia um membro e ele está inativo: o elenco não existe na prática.
  assert.equal(r.permitidos, null);
  assert.equal(r.decididoPor, "sem-elenco");
});

test("membro inativo é ignorado mas os ativos do mesmo elenco continuam valendo", () => {
  const r = resolverElenco({ projetoId: "arvo" }, [
    m("projeto", "arvo", "ana", false),
    m("projeto", "arvo", "bia", true),
  ]);
  assert.deepEqual([...r.permitidos], ["bia"]);
});

test("elenco de OUTRO projeto não vaza para este", () => {
  const r = resolverElenco({ projetoId: "arvo" }, [m("projeto", "spin", "ana")]);
  assert.equal(r.permitidos, null, "o elenco do Spin não pode decidir a fila do Arvo");
});

// ── PRECEDÊNCIA: campanha vence projeto ─────────────────────────────────────

test("havendo elenco de campanha E de projeto, a CAMPANHA decide", () => {
  const r = resolverElenco({ projetoId: "arvo", campanhaId: "investidor" }, [
    m("projeto", "arvo", "ana"),
    m("campanha", "investidor", "bia"),
  ]);
  assert.equal(r.decididoPor, "campanha");
  assert.deepEqual([...r.permitidos], ["bia"]);
});

test("sem elenco de campanha, o do projeto decide", () => {
  const r = resolverElenco({ projetoId: "arvo", campanhaId: "investidor" }, [m("projeto", "arvo", "ana")]);
  assert.equal(r.decididoPor, "projeto");
  assert.deepEqual([...r.permitidos], ["ana"]);
});

test("elenco de campanha com todos inativos CAI para o do projeto, não para a fila geral", () => {
  // A campanha tinha time, o time saiu. O projeto ainda tem: é ele que responde.
  const r = resolverElenco({ projetoId: "arvo", campanhaId: "investidor" }, [
    m("campanha", "investidor", "bia", false),
    m("projeto", "arvo", "ana", true),
  ]);
  assert.equal(r.decididoPor, "projeto");
  assert.deepEqual([...r.permitidos], ["ana"]);
});

// ── O CASO DIFÍCIL: elenco existe, ninguém disponível ───────────────────────

test("elenco existe e ninguém dele está disponível → NÃO cai para a fila geral", () => {
  // Esta é a asserção que impede a pior regressão possível: entregar a lead a
  // quem foi explicitamente deixado fora do escopo.
  const r = resolverElenco({ projetoId: "arvo" }, [m("projeto", "arvo", "ana")]);
  const f = aplicarElenco([c("zeca"), c("wilson")], r); // ana não está disponível
  assert.deepEqual(f.elegiveis, []);
  assert.equal(f.elencoEsvaziou, true, "quem chama precisa saber que deve pular para o gerente");
});

test("quando o elenco esvazia, o motivo diz o número e a saída", () => {
  const r = resolverElenco({ projetoId: "arvo" }, [m("projeto", "arvo", "ana")]);
  const f = aplicarElenco([c("zeca")], r);
  assert.match(f.porque, /NENHUM deles está disponível/);
  assert.match(f.porque, /sobe para o gerente/);
  assert.match(f.porque, /1 candidato/);
});

test("elencoEsvaziou é FALSO quando não havia elenco — lista vazia por outro motivo", () => {
  // Sem esta distinção, "ninguém disponível na equipe inteira" seria lido como
  // "o elenco bloqueou", e o histórico mentiria sobre a causa.
  const r = resolverElenco({ projetoId: "arvo" }, []);
  const f = aplicarElenco([], r);
  assert.equal(f.elencoEsvaziou, false);
});

// ── A FRASE QUE VAI PARA O HISTÓRICO ────────────────────────────────────────

test("o motivo carrega quantos do elenco estavam disponíveis, com denominador", () => {
  const r = resolverElenco({ campanhaId: "investidor" }, [
    m("campanha", "investidor", "ana"),
    m("campanha", "investidor", "bia"),
  ]);
  const f = aplicarElenco([c("ana"), c("zeca"), c("wilson")], r);
  assert.match(f.porque, /1 de 3 candidato/);
});

test("nenhum motivo sai vazio", () => {
  for (const escopo of [{}, { projetoId: "p" }, { campanhaId: "c" }]) {
    const r = resolverElenco(escopo, [m("projeto", "p", "ana")]);
    assert.ok(r.porque.length > 20, `motivo curto demais para ${JSON.stringify(escopo)}`);
    assert.ok(aplicarElenco([c("ana")], r).porque.length > 20);
  }
});
