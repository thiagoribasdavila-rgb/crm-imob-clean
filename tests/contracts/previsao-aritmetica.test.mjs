/**
 * Contrato da PREVISÃO ARITMÉTICA.
 *
 * ── Por que isto é separado do preditor ─────────────────────────────────────
 *
 * Carga da equipe é contagem. Tempo até esgotar a fila é divisão. Nenhuma das
 * duas é modelo, nenhuma precisa de baseline, e nenhuma pode ser apresentada
 * como "previsão da IA" — foi exatamente por essa porta que, historicamente,
 * divisões ganharam aparência de inferência.
 *
 * O contrato confere o resultado contra a conta feita À MÃO, com os números
 * medidos no banco canônico em 2026-07-30, e prova o lado em que a conta se
 * RECUSA a responder.
 *
 * ── E, DESDE A CONSOLIDAÇÃO, A DEFINIÇÃO ÚNICA ──────────────────────────────
 *
 * `cargaDaEquipe` passou a ser a UMA conta de carga e concentração desta base:
 * `gargalosDaOperacao` no gêmeo digital perdeu a desigualdade própria e lê
 * `concentrada` daqui. Os testes de borda no fim deste arquivo são o que impede
 * a segunda definição de renascer — inclusive a que nasceria de derivar o
 * veredito do número ARREDONDADO de exibição.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  REGUAS_DE_ABERTO,
  cargaDaEquipe,
  cargaDaEquipePorContagem,
  tempoAteEsgotarFila,
} from "../../lib/ai/previsao-aritmetica.ts";

/** A régua da RPC — a que o gêmeo digital usa. Ver `ReguaDeAberto`. */
const RPC = "rpc_redistribuicao";

/* ── CARGA DA EQUIPE ───────────────────────────────────────────────────── */

test("a conta bate com o cálculo à mão", () => {
  // 10 leads: 5 para A, 3 para B, 2 para C. Quatro corretores ativos (D vazio).
  const atribuicoes = [
    ...Array(5).fill({ assignedTo: "A" }),
    ...Array(3).fill({ assignedTo: "B" }),
    ...Array(2).fill({ assignedTo: "C" }),
  ];
  const carga = cargaDaEquipe(atribuicoes, ["A", "B", "C", "D"], RPC);
  assert.equal(carga.calculavel, true);
  assert.equal(carga.totalDeLeads, 10);
  assert.equal(carga.corretores, 4);
  assert.equal(carga.comCarteira, 3);
  assert.deepEqual(carga.semCarteira, ["D"]);
  // À mão: 10 ÷ 4 = 2,5. Maior carga = 5. Concentração = 5 ÷ 2,5 = 2.
  assert.equal(carga.cargaMedia, 2.5);
  assert.equal(carga.cargaMaxima, 5);
  assert.equal(carga.concentracao, 2);
  assert.deepEqual(carga.ranking, [
    { corretorId: "A", leads: 5 },
    { corretorId: "B", leads: 3 },
    { corretorId: "C", leads: 2 },
    { corretorId: "D", leads: 0 },
  ]);
});

test("a média divide pela equipe INTEIRA, não só por quem tem carteira", () => {
  // O caso medido: 468 leads concentrados em 3 corretores, 12 no total.
  const atribuicoes = [
    ...Array(300).fill({ assignedTo: "A" }),
    ...Array(120).fill({ assignedTo: "B" }),
    ...Array(48).fill({ assignedTo: "C" }),
  ];
  const equipe = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const carga = cargaDaEquipe(atribuicoes, equipe, RPC);
  // À mão: 468 ÷ 12 = 39. Dividir só pelos 3 com carteira daria 156 e a má
  // distribuição desapareceria do relatório.
  assert.equal(carga.cargaMedia, 39);
  assert.equal(carga.semCarteira.length, 9);
  assert.equal(carga.concentracao, Math.round((300 / 39) * 100) / 100);
  assert.ok(carga.concentracao > 7, "um corretor carregando 7,7× a média tem de aparecer");
});

test("corretor de carteira VAZIA aparece — é o caso que interessa ver", () => {
  const carga = cargaDaEquipe([{ assignedTo: "A" }], ["A", "B", "C"], RPC);
  assert.deepEqual(carga.semCarteira, ["B", "C"]);
  // Derivar a equipe só das leads esconderia exatamente quem não recebeu nada.
  const semEquipe = cargaDaEquipe([{ assignedTo: "A" }], [], RPC);
  assert.deepEqual(semEquipe.semCarteira, []);
  assert.equal(semEquipe.corretores, 1);
});

test("lead sem dono não entra na conta e não vira corretor fantasma", () => {
  const carga = cargaDaEquipe(
    [{ assignedTo: "A" }, { assignedTo: null }, { assignedTo: "   " }, { assignedTo: undefined }],
    ["A"],
    RPC,
  );
  assert.equal(carga.totalDeLeads, 1);
  assert.equal(carga.corretores, 1);
});

test("LADO B: sem lead atribuída a conta se RECUSA a responder", () => {
  const carga = cargaDaEquipe([], ["A", "B"], RPC);
  assert.equal(carga.calculavel, false);
  assert.equal(carga.cargaMedia, null);
  assert.equal(carga.concentracao, null);
  assert.ok(carga.motivo.includes("carteira inteira está vazia"));
  // A equipe continua visível: o problema é o dado, não a leitura.
  assert.deepEqual(carga.semCarteira, ["A", "B"]);
});

test("LADO B: sem corretor nenhum, também se recusa", () => {
  const carga = cargaDaEquipe([], [], RPC);
  assert.equal(carga.calculavel, false);
  assert.ok(carga.motivo.includes("nenhum corretor"));
});

/* ── A DEFINIÇÃO ÚNICA DE CONCENTRAÇÃO ─────────────────────────────────── */

test("o VEREDITO não sai do número arredondado de exibição", () => {
  // A borda que separava as duas contas antes da fusão, e o motivo de
  // `concentrada` existir separado de `concentracao`.
  //
  // [334, 333, 333]: a maior carteira ESTÁ acima do rateio uniforme — 334 × 3 =
  // 1002 > 1000. Mas a média arredonda para 333,33 e a razão 334 ÷ 333,33
  // arredonda para exatamente 1,00. Quem lê o veredito no número de exibição
  // conclui "perfeitamente distribuído" com uma carteira acima da média.
  const carga = cargaDaEquipePorContagem(
    [
      { corretorId: "A", leads: 334 },
      { corretorId: "B", leads: 333 },
      { corretorId: "C", leads: 333 },
    ],
    ["A", "B", "C"],
    RPC,
  );
  assert.equal(carga.concentracao, 1, "premissa do teste: a razão de exibição arredonda para 1,00");
  assert.equal(carga.concentrada, true, "334 de 1000 em 3 pessoas está acima do rateio uniforme");
});

test("o OUTRO lado: rateio exato NÃO é concentração", () => {
  // Um detector que sempre acusa é tão inútil quanto um que nunca acusa — e a
  // multiplicação cruzada tem de dar false na igualdade EXATA, não "quase".
  const exata = cargaDaEquipePorContagem(
    [25, 25, 25, 25].map((leads, i) => ({ corretorId: `c-${i}`, leads })),
    ["c-0", "c-1", "c-2", "c-3"],
    RPC,
  );
  assert.equal(exata.concentrada, false, "100 leads em 4 carteiras de 25 não é concentração");
  assert.equal(exata.concentracao, 1);

  // Um único corretor carrega 100% e mesmo assim não há concentração: não há
  // entre quem ratear. Antes isto era um guard `ativos > 1` numa das contas e
  // não existia na outra.
  const sozinho = cargaDaEquipePorContagem([{ corretorId: "A", leads: 400 }], ["A"], RPC);
  assert.equal(sozinho.concentrada, false, "um corretor sozinho não concentra contra ninguém");

  // E um lead a mais na mesma carteira já vira concentração.
  const quase = cargaDaEquipePorContagem(
    [26, 25, 25, 25].map((leads, i) => ({ corretorId: `c-${i}`, leads })),
    ["c-0", "c-1", "c-2", "c-3"],
    RPC,
  );
  assert.equal(quase.concentrada, true, "um lead acima do rateio já é acima do rateio");
});

test("as DUAS portas da conta dão a mesma resposta", () => {
  // Uma conta, dois portões: por lead e por contagem somada. Se divergirem, a
  // consolidação criou o defeito que ela existia para remover.
  const porLead = cargaDaEquipe(
    [
      ...Array(272).fill({ assignedTo: "vinicius" }),
      ...Array(112).fill({ assignedTo: "ddcorretor" }),
      ...Array(1).fill({ assignedTo: "francisco" }),
    ],
    ["vinicius", "ddcorretor", "francisco", ...Array.from({ length: 9 }, (_, i) => `vazio-${i}`)],
    RPC,
  );
  const porContagem = cargaDaEquipePorContagem(
    [
      { corretorId: "vinicius", leads: 272 },
      { corretorId: "ddcorretor", leads: 112 },
      { corretorId: "francisco", leads: 1 },
      ...Array.from({ length: 9 }, (_, i) => ({ corretorId: `vazio-${i}`, leads: 0 })),
    ],
    ["vinicius", "ddcorretor", "francisco", ...Array.from({ length: 9 }, (_, i) => `vazio-${i}`)],
    RPC,
  );
  assert.deepEqual(porContagem, porLead, "os dois portões da mesma conta divergiram");
  // E o estado medido em 2026-07-30 é mesmo concentrado: 385 leads, 12 pessoas.
  assert.equal(porLead.totalDeLeads, 385);
  assert.equal(porLead.corretores, 12);
  assert.equal(porLead.semCarteira.length, 9);
  assert.equal(porLead.concentrada, true);
});

/* ── A RÉGUA, QUE ERA A OUTRA METADE DA CONSOLIDAÇÃO ───────────────────── */

test("a régua declarada VIAJA no resultado e na fórmula", () => {
  // 112 pela régua da RPC, 110 pela da listagem: o mesmo corretor, o mesmo dia.
  // Um número de carteira sem régua ao lado não é comparável com outro, e era
  // essa a segunda divergência que a fusão podia ter criado.
  const rpc = cargaDaEquipePorContagem(
    [{ corretorId: "ddcorretor", leads: 112 }, { corretorId: "outro", leads: 1 }],
    ["ddcorretor", "outro"],
    RPC,
  );
  const listagem = cargaDaEquipePorContagem(
    [{ corretorId: "ddcorretor", leads: 110 }, { corretorId: "outro", leads: 1 }],
    ["ddcorretor", "outro"],
    "listagem_de_leads",
  );
  assert.equal(rpc.regua, "rpc_redistribuicao");
  assert.equal(listagem.regua, "listagem_de_leads");
  assert.notEqual(rpc.totalDeLeads, listagem.totalDeLeads, "as duas réguas medem a MESMA carteira diferente");
  // A fórmula acompanha o resultado, e tem de dizer QUAL régua contou.
  assert.ok(rpc.formula.includes(REGUAS_DE_ABERTO.rpc_redistribuicao));
  assert.ok(listagem.formula.includes(REGUAS_DE_ABERTO.listagem_de_leads));
  assert.notEqual(rpc.formula, listagem.formula, "as duas réguas saíram com a mesma fórmula");
});

test("LADO B: sem régua declarada a conta se RECUSA — não escolhe uma", () => {
  // Um padrão silencioso seria a régua invisível de quem não a informou, que é
  // o defeito com outro nome. Aqui a conta para e diz o que falta.
  for (const semRegua of [undefined, null, "", "aberto", "toString"]) {
    const carga = cargaDaEquipePorContagem(
      [{ corretorId: "A", leads: 400 }, { corretorId: "B", leads: 1 }],
      ["A", "B"],
      semRegua,
    );
    assert.equal(carga.calculavel, false, `régua ${JSON.stringify(semRegua)} passou como declarada`);
    assert.equal(carga.concentrada, false, "veredito afirmado sem saber o que foi contado");
    assert.equal(carga.cargaMedia, null);
    assert.equal(carga.concentracao, null);
    assert.match(carga.motivo, /régua/i);
    // 112 e 110 na recusa: a lacuna vem com o número, não só com o adjetivo.
    assert.match(carga.motivo, /112/);
    assert.match(carga.motivo, /110/);
  }
});

/* ── TEMPO ATÉ ESGOTAR A FILA ──────────────────────────────────────────── */

test("a fila bate com o cálculo à mão sobre os números medidos", () => {
  // Medido em 2026-07-30: 474 leads sem primeiro contato; 137 movimentações de
  // pipeline em 28 dias (= 4 semanas).
  const previsao = tempoAteEsgotarFila(474, 137, 4);
  assert.equal(previsao.calculavel, true);
  // À mão: 137 ÷ 4 = 34,25 por semana. 474 ÷ 34,25 = 13,84 semanas.
  assert.equal(previsao.vazaoSemanal, 34.25);
  assert.equal(previsao.semanasParaEsgotar, 13.84);
  assert.equal(previsao.fila, 474);
  assert.equal(previsao.janelaEmSemanas, 4);
  // Fila, vazão e janela viajam com o resultado — sem eles o número é opaco.
  assert.equal(previsao.movimentacoesNaJanela, 137);
});

test("LADO B: vazão zero devolve 'não previsível', nunca infinito", () => {
  const previsao = tempoAteEsgotarFila(474, 0, 4);
  assert.equal(previsao.calculavel, false);
  assert.equal(previsao.semanasParaEsgotar, null);
  assert.equal(previsao.vazaoSemanal, 0);
  assert.ok(previsao.motivo.includes("não previsível"));
  // Infinity serializa como null em JSON e a tela mostraria campo vazio sem
  // explicação; um número grande seria lido como estimativa.
  assert.notEqual(previsao.semanasParaEsgotar, Infinity);
});

test("janela inválida é recusada — sem período não existe vazão", () => {
  for (const janela of [0, -1, NaN, null, undefined]) {
    const previsao = tempoAteEsgotarFila(474, 137, janela);
    assert.equal(previsao.calculavel, false, `janela ${janela} deveria recusar`);
    assert.equal(previsao.vazaoSemanal, null);
    assert.ok(previsao.motivo.includes("janela inválida"));
  }
});

test("fila zero é resposta válida: zero semanas, não recusa", () => {
  const previsao = tempoAteEsgotarFila(0, 137, 4);
  assert.equal(previsao.calculavel, true);
  assert.equal(previsao.semanasParaEsgotar, 0);
});

test("entrada negativa ou não numérica não vira número negativo", () => {
  assert.equal(tempoAteEsgotarFila(-10, 137, 4).fila, 0);
  assert.equal(tempoAteEsgotarFila(NaN, 137, 4).fila, 0);
  assert.equal(tempoAteEsgotarFila(474, -5, 4).calculavel, false);
});

/* ── O RÓTULO, QUE É O PONTO ───────────────────────────────────────────── */

test("toda saída carrega o rótulo aritmético e a fórmula", () => {
  const saidas = [
    cargaDaEquipe([{ assignedTo: "A" }], ["A"], RPC),
    cargaDaEquipe([], [], RPC),
    tempoAteEsgotarFila(474, 137, 4),
    tempoAteEsgotarFila(474, 0, 4),
  ];
  for (const saida of saidas) {
    // Sem isto a tela não tem como distinguir divisão de inferência.
    assert.equal(saida.natureza, "aritmetica");
    assert.equal(saida.verificavelAMao, true);
    assert.ok(
      typeof saida.formula === "string" && saida.formula.trim().length > 0,
      "a fórmula tem de acompanhar o resultado para poder ser refeita",
    );
  }
});
