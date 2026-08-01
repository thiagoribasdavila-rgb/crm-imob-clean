/**
 * Contrato da FILA DE DECISÕES — as 20 redistribuições que a IA preparou e que
 * nenhuma tela lia.
 *
 * O caso que mais importa não é a listagem: é a recusa a decidir duas vezes, e
 * a recusa a mostrar um UUID para uma pessoa. Os dois nasceram de dado REAL
 * medido em 01/08/2026, não de imaginação.
 *
 * Rodar: node --test tests/contracts/fila-de-decisoes.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  pareceIdentificador, rotularPessoa, limparFrase, porqueNaoPodeDecidir,
  normalizarDecisao, ordenarPorConsequencia, montarFila, decisaoValida,
} from "../../lib/crm/fila-de-decisoes.ts";

const UUID_A = "240a6bc5-5163-42ab-9d0f-729c7d0b0d35";
const UUID_B = "aa077aa4-28a7-49cb-98ea-dac8b2908a97";
const LEAD = "2562eea4-4800-41b0-83b9-11f9e933fc1a";

/** A linha REAL do banco, com `paraQuemNome: null` — a que vazava o UUID. */
const linhaReal = {
  id: "244d83ef-f08c-4e42-8dd8-e9833ff88100",
  agent: "sla-primeiro-contato",
  acao: "redistribuir_lead",
  entidade_tipo: "lead",
  entidade_id: LEAD,
  retido: true,
  executado: false,
  decisao_humana: null,
  created_at: "2026-07-31T04:30:46.295680+00:00",
  recomendacao: `Passar a lead Tatiane Camargo para ${UUID_A}: 1661h sem primeiro contato.`,
  motivo: "Modo sombra ligado.",
  preparado: {
    deQuem: UUID_B, paraQuem: UUID_A, paraQuemNome: null,
    atrasoMin: 99667,
    porque: "Destino com 0 lead(s) sem primeiro contato e 0 em aberto.",
  },
};

// ── NENHUM IDENTIFICADOR CHEGA AOS OLHOS DE UMA PESSOA ──────────────────────

test("UUID é reconhecido como identificador, nome próprio não", () => {
  assert.equal(pareceIdentificador(UUID_A), true);
  assert.equal(pareceIdentificador("Thiago Ribas D'Avila"), false);
  assert.equal(pareceIdentificador("Ana"), false);
  // Nome curto com hífen não pode ser confundido com id.
  assert.equal(pareceIdentificador("Ana-Maria"), false);
});

test("cadeia longa de hex sem espaço também é identificador", () => {
  assert.equal(pareceIdentificador("a1b2c3d4e5f60718"), true);
});

test("sem nome, o rótulo diz o que fazer — e NÃO mostra o UUID inteiro", () => {
  const r = rotularPessoa(null, UUID_A);
  assert.match(r, /sem nome cadastrado/);
  assert.equal(r.includes(UUID_A), false, "o UUID inteiro não pode aparecer");
  // Os 4 últimos caracteres bastam para o suporte achar a linha.
  assert.match(r, /d35/);
});

test("nome que na verdade é um UUID não passa por nome", () => {
  // Defesa contra o dado sujo: alguém gravou o id no campo de nome.
  assert.match(rotularPessoa(UUID_A, UUID_A), /sem nome cadastrado/);
});

test("sem nome e sem id, ainda assim uma frase legível", () => {
  assert.equal(rotularPessoa(null, null), "corretor não identificado");
});

test("a frase gravada é reescrita, e o UUID some dela", () => {
  const d = normalizarDecisao(linhaReal);
  assert.equal(d.frase.includes(UUID_A), false, "o UUID do destino continua na frase");
  assert.equal(d.frase.includes(UUID_B), false, "o UUID do dono continua na frase");
  assert.equal(d.frase.includes(LEAD), false, "o UUID da lead continua na frase");
  assert.match(d.frase, /Tatiane Camargo/, "o nome da pessoa tem de sobreviver à limpeza");
});

test("limparFrase ignora substituição vazia — não apaga a frase inteira", () => {
  // `"".split("")` quebraria a string em caracteres; o guarda impede.
  const original = "Passar a lead X para Y.";
  assert.equal(limparFrase(original, [{ id: "", rotulo: "ZZZ" }]), original);
});

// ── NÃO SE DECIDE DUAS VEZES ────────────────────────────────────────────────

test("pendente de verdade pode ser decidida", () => {
  assert.equal(porqueNaoPodeDecidir(linhaReal), null);
});

test("já executada não pode — aplicaria a mudança duas vezes", () => {
  const m = porqueNaoPodeDecidir({ ...linhaReal, executado: true });
  assert.match(m ?? "", /duas vezes/);
});

test("já decidida por alguém não pode — sobrescreveria o julgamento alheio", () => {
  const m = porqueNaoPodeDecidir({ ...linhaReal, decisao_humana: "recusada" });
  assert.match(m ?? "", /recusada/);
});

test("não retida não é pendência de decisão", () => {
  assert.match(porqueNaoPodeDecidir({ ...linhaReal, retido: false }) ?? "", /não foi retida/);
});

test("sem lead apontada não há o que redistribuir", () => {
  assert.match(porqueNaoPodeDecidir({ ...linhaReal, entidade_id: null }) ?? "", /nenhuma lead/);
});

// ── A ORDEM É A DA CONSEQUÊNCIA ─────────────────────────────────────────────

test("decidíveis vêm antes das travadas", () => {
  const fila = montarFila([
    { ...linhaReal, id: "travada", executado: true, preparado: { ...linhaReal.preparado, atrasoMin: 999999 } },
    { ...linhaReal, id: "aberta", preparado: { ...linhaReal.preparado, atrasoMin: 60 } },
  ]);
  assert.equal(fila.decisoes[0].id, "aberta", "uma fila que abre com item travado ensina a rolar antes de agir");
  assert.equal(fila.decidiveis, 1);
  assert.equal(fila.travadas, 1);
});

test("entre decidíveis, quem espera há mais tempo vem primeiro", () => {
  const fila = montarFila([
    { ...linhaReal, id: "b", preparado: { ...linhaReal.preparado, atrasoMin: 600 } },
    { ...linhaReal, id: "a", preparado: { ...linhaReal.preparado, atrasoMin: 99667 } },
  ]);
  assert.deepEqual(fila.decisoes.map((d) => d.id), ["a", "b"]);
});

test("ordenarPorConsequencia não modifica a lista que recebeu", () => {
  // Ordenar no lugar corromperia a lista do chamador — e aqui o chamador é a
  // rota, que devolve a mesma referência no corpo da resposta.
  const original = [
    { id: "b", podeDecidir: true, atrasoHoras: 10 },
    { id: "a", podeDecidir: true, atrasoHoras: 90 },
  ];
  const copia = JSON.parse(JSON.stringify(original));
  const saida = ordenarPorConsequencia(original);
  assert.deepEqual(original, copia, "a entrada foi mutada");
  assert.deepEqual(saida.map((d) => d.id), ["a", "b"]);
});

test("a ordem é ESTÁVEL entre duas leituras iguais", () => {
  // Sem desempate por id, duas leituras podem trocar itens de lugar e a pessoa
  // clica no que não queria.
  const linhas = ["z", "m", "a"].map((id) => ({ ...linhaReal, id, preparado: { ...linhaReal.preparado, atrasoMin: 100 } }));
  const um = montarFila(linhas).decisoes.map((d) => d.id);
  const dois = montarFila([...linhas].reverse()).decisoes.map((d) => d.id);
  assert.deepEqual(um, dois);
  assert.deepEqual(um, ["a", "m", "z"]);
});

test("atraso ausente não vira zero nem NaN — vira 'não medido'", () => {
  const d = normalizarDecisao({ ...linhaReal, preparado: { ...linhaReal.preparado, atrasoMin: undefined } });
  assert.equal(d.atrasoHoras, null);
});

test("atraso negativo é descartado, não exibido", () => {
  const d = normalizarDecisao({ ...linhaReal, preparado: { ...linhaReal.preparado, atrasoMin: -5 } });
  assert.equal(d.atrasoHoras, null);
});

test("99.667 minutos viram 1.661 horas", () => {
  assert.equal(normalizarDecisao(linhaReal).atrasoHoras, 1661);
});

// ── A LISTA DE RESPOSTAS É FECHADA ──────────────────────────────────────────

test("só aprovada e recusada gravam", () => {
  assert.equal(decisaoValida("aprovada"), true);
  assert.equal(decisaoValida("recusada"), true);
  for (const invalida of ["talvez", "APROVADA", "", null, undefined, 1, {}]) {
    assert.equal(decisaoValida(invalida), false, `"${String(invalida)}" não pode ser aceita`);
  }
});

test("linha sem recomendação gravada ainda produz frase legível", () => {
  const d = normalizarDecisao({ ...linhaReal, recomendacao: null });
  assert.ok(d.frase.length > 0);
  assert.equal(d.frase.includes("undefined"), false);
  assert.equal(d.frase.includes("null"), false);
});

test("fila vazia é zero, não erro", () => {
  const f = montarFila([]);
  assert.deepEqual(f, { decisoes: [], decidiveis: 0, travadas: 0 });
});
