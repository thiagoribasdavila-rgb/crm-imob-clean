/**
 * Contrato do GÊMEO DIGITAL DA OPERAÇÃO (frente 6.4).
 *
 * ── A PROPRIEDADE CENTRAL ───────────────────────────────────────────────────
 *
 * O módulo RECUSA projetar venda, receita ou conversão quando não existe
 * histórico de vendas com valor apurado. Não é um caso de borda: é o motivo do
 * arquivo existir. Medido na base viva em 2026-07-30, a organização tem 1 lead
 * em etapa `ganho` e ZERO com `sale_value_brl` — não há taxa de conversão nem
 * ticket médio observado. Qualquer número dessa família seria invenção, e o dono
 * do produto proibiu inventar métrica comercial.
 *
 * ── POR QUE ESTES TESTES EXECUTAM ───────────────────────────────────────────
 *
 * Nenhuma asserção aqui procura PALAVRA em arquivo fonte. Grep prova que alguém
 * escreveu certo texto; a lição registrada neste repositório é que o
 * identificador sobrevive no `import` e a asserção fica verde com o
 * comportamento desligado. Todo teste abaixo CHAMA a função e mede o retorno.
 *
 * ── OS DOIS LADOS ───────────────────────────────────────────────────────────
 *
 * Guarda que recusa sempre passa em teste de vazamento e destrói o produto —
 * nesta base a armadilha já mordeu várias vezes no mesmo dia. Então metade dos
 * testes prova que ele RECUSA sem lastro, e a outra metade prova que ele
 * PROJETA com lastro. As duas metades são o contrato.
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  JANELA_DE_PRESENCA_SEGUNDOS,
  MINIMO_DE_VENDAS_PARA_TAXA,
  REGUA_DA_CARTEIRA,
  ROTULO_DE_ESTIMATIVA,
  TETO_DO_LOTE_DE_REDISTRIBUICAO,
  cargaDaOperacao,
  contaComoAbertoNaRedistribuicao,
  gargalosDaOperacao,
  leadsQueMoveriamHoje,
  portasDaRedistribuicao,
  presenteParaReceberLead,
  projetarComercial,
  simularAumentoDeLeads,
  simularMudancaDeSla,
  simularReducaoDaEquipe,
  simularRedistribuicao,
} from "../../lib/atlas/gemeo-digital.ts";
import { cargaDaEquipePorContagem } from "../../lib/ai/previsao-aritmetica.ts";

const AGORA = Date.parse("2026-07-30T04:20:00.000Z");
const GERENTE = "gerente-1";

/** Uma carteira sintética. Nada aqui é PII: nomes são rótulos. */
function carteira(patch = {}) {
  return {
    id: patch.id ?? "corretor-1",
    nome: patch.nome ?? "Corretor",
    abertos: patch.abertos ?? 0,
    esperandoPrimeiroContato: patch.esperandoPrimeiroContato ?? 0,
    tetoExibido: patch.tetoExibido ?? 100,
    tetoAplicado: patch.tetoAplicado ?? null,
    presencaVistaEmMs: patch.presencaVistaEmMs ?? null,
    presencaDisponivel: patch.presencaDisponivel ?? false,
    gerenteId: patch.gerenteId ?? GERENTE,
  };
}

/**
 * O estado REAL medido em 2026-07-30 na organização viva, reduzido ao que o
 * módulo consome. É o cenário que importa: se o contrato só usasse números
 * redondos, ele não provaria nada sobre a operação que existe.
 */
function estadoReal(patch = {}) {
  return {
    medidoEm: "2026-07-30T04:19:52.215Z",
    leadsAbertos: 390,
    esperandoPrimeiroContato: 473,
    prazoDePrimeiroContatoVencido: 473,
    carteiras: [
      carteira({ id: "vinicius", nome: "viniciusadolfodasilva", abertos: 272, esperandoPrimeiroContato: 271, tetoExibido: 100 }),
      carteira({ id: "ddcorretor", nome: "ddcorretorsp", abertos: 112, esperandoPrimeiroContato: 107, tetoExibido: 300 }),
      carteira({ id: "francisco", nome: "francisco.junior1979.fsj", abertos: 1, esperandoPrimeiroContato: 0 }),
      ...Array.from({ length: 9 }, (_, i) => carteira({ id: `vazio-${i}`, nome: `Corretor ${i}`, abertos: 0 })),
    ],
    lastro: {
      ganhosRegistrados: 1,
      vendasComValorApurado: 0,
      receitaApuradaBrl: null,
      leadsConsiderados: 482,
    },
    coberturaDaFonte: "apenas leads da organização medida",
    ...patch,
  };
}

/** O mesmo estado, mas com histórico de vendas suficiente — o outro lado. */
function estadoComLastro(vendas = MINIMO_DE_VENDAS_PARA_TAXA, receita = 20_000_000) {
  return estadoReal({
    lastro: { ganhosRegistrados: vendas, vendasComValorApurado: vendas, receitaApuradaBrl: receita, leadsConsiderados: 482 },
  });
}

describe("gêmeo digital — a recusa de projetar o que não tem baseline", () => {
  test("sem venda com valor apurado, projetar receita RECUSA e diz quanto falta", () => {
    const projecao = projetarComercial(estadoReal(), { pedido: "receita", leads: 473 });
    assert.equal(projecao.projetavel, false, "projetou receita sem nenhuma venda apurada");
    assert.equal(projecao.recusa.lastro.amostra, 0);
    assert.equal(projecao.recusa.lastro.minimo, MINIMO_DE_VENDAS_PARA_TAXA);
    assert.match(projecao.recusa.motivo, /não projetável/i);
    // O número que falta tem de estar na recusa: "não dá" sem quantidade não é
    // acionável, e o dono pediu que a lacuna viesse com número.
    assert.match(projecao.recusa.motivo, new RegExp(String(MINIMO_DE_VENDAS_PARA_TAXA)));
  });

  test("etapa `ganho` sem valor apurado NÃO abre a porta", () => {
    // Era o caminho mais tentador de todos: 1 lead está em `ganho` na base viva.
    // Contar etapa como venda daria taxa de conversão a partir de zero dinheiro.
    const projecao = projetarComercial(
      estadoReal({ lastro: { ganhosRegistrados: 40, vendasComValorApurado: 0, receitaApuradaBrl: null, leadsConsiderados: 482 } }),
      { pedido: "receita", leads: 100 },
    );
    assert.equal(projecao.projetavel, false, "40 ganhos SEM valor abriram a porta da projeção");
    assert.match(projecao.recusa.motivo, /etapa é declaração e valor é fato/i);
  });

  test("uma venda abaixo do piso ainda recusa (a fronteira exata)", () => {
    const projecao = projetarComercial(estadoComLastro(MINIMO_DE_VENDAS_PARA_TAXA - 1), { pedido: "receita", leads: 100 });
    assert.equal(projecao.projetavel, false, `${MINIMO_DE_VENDAS_PARA_TAXA - 1} vendas passaram por um piso de ${MINIMO_DE_VENDAS_PARA_TAXA}`);
  });

  test("O OUTRO LADO: com lastro no piso, projeta sobre a taxa OBSERVADA", () => {
    // Guarda que recusa sempre destrói o produto. Este teste é o que impede
    // "consertar" a recusa transformando-a em recusa permanente.
    const projecao = projetarComercial(estadoComLastro(MINIMO_DE_VENDAS_PARA_TAXA, 20_000_000), { pedido: "receita", leads: 482 });
    assert.equal(projecao.projetavel, true, "com lastro suficiente o módulo tem de projetar");
    // Taxa observada = 20/482, em 6 casas. A asserção mede a CONTA, não o texto —
    // e as 6 casas são deliberadas: com 2, a taxa viraria 0,04 e a receita
    // projetada sobre ela erraria por arredondamento.
    assert.equal(projecao.taxaObservada, Math.round((MINIMO_DE_VENDAS_PARA_TAXA / 482) * 1_000_000) / 1_000_000);
    assert.ok(projecao.taxaObservada > 0.0414 && projecao.taxaObservada < 0.0415, "a taxa perdeu precisão no arredondamento");
    assert.equal(projecao.ticketMedioBrl, 1_000_000, "ticket médio = receita apurada ÷ vendas apuradas");
    assert.ok(projecao.vendasEsperadas > 0, "projeção viva não pode sair zerada");
  });

  test("com vendas apuradas mas SEM receita medida, a receita fica null e a venda sai", () => {
    // A metade que separa "não sei o dinheiro" de "não sei nada": a taxa existe,
    // o ticket não. Publicar receita 0 aqui seria pior que publicar null.
    const projecao = projetarComercial(
      estadoReal({ lastro: { ganhosRegistrados: 25, vendasComValorApurado: 25, receitaApuradaBrl: null, leadsConsiderados: 482 } }),
      { pedido: "receita", leads: 482 },
    );
    assert.equal(projecao.projetavel, true);
    assert.equal(projecao.receitaEsperadaBrl, null, "sem soma de valores não existe receita projetada");
    assert.equal(projecao.ticketMedioBrl, null);
    assert.ok(projecao.vendasEsperadas > 0, "a venda é projetável mesmo sem o valor");
  });

  test("taxa sem denominador recusa — vendas apuradas e zero leads considerados", () => {
    const projecao = projetarComercial(
      estadoReal({ lastro: { ganhosRegistrados: 25, vendasComValorApurado: 25, receitaApuradaBrl: 1000, leadsConsiderados: 0 } }),
      { pedido: "conversão", leads: 10 },
    );
    assert.equal(projecao.projetavel, false, "dividiu por um denominador zerado");
    assert.match(projecao.recusa.motivo, /denominador/i);
  });
});

describe("gêmeo digital — a simulação que o dono vive: e se eu redistribuir?", () => {
  test("a redistribuição entrega ARITMÉTICA e recusa a família comercial", () => {
    const resultado = simularRedistribuicao(estadoReal(), {}, AGORA);

    assert.equal(resultado.rotulo, ROTULO_DE_ESTIMATIVA, "toda simulação tem de sair marcada como estimativa");
    assert.equal(resultado.medidoEm, "2026-07-30T04:19:52.215Z", "resultado sem data envelhece mentindo");

    // Aritmética: 385 leads em carteira / 12 corretores.
    const carga = resultado.numeros.find((n) => n.nome === "carga por corretor depois do rateio");
    assert.ok(carga, "a carga por corretor é o número central deste cenário");
    assert.equal(carga.deducao, true, "divisão é dedução, não previsão");
    assert.equal(carga.valor, Math.round((385 / 12) * 100) / 100);

    // E a família comercial sai recusada, com motivo.
    assert.ok(resultado.recusas.length >= 2, "conversão e receita têm de aparecer como recusadas");
    for (const recusa of resultado.recusas) {
      assert.match(recusa.motivo, /não projetável/i);
      assert.equal(recusa.lastro.minimo, MINIMO_DE_VENDAS_PARA_TAXA);
    }
    const receita = resultado.numeros.find((n) => n.nome.startsWith("receita"));
    assert.ok(receita, "a receita tem de aparecer como número declarado");
    assert.equal(receita.valor, null, "receita sem baseline tem de ser null, nunca um valor plausível");
    assert.equal(typeof receita.motivo, "string", "null sem motivo é indistinguível de bug");
  });

  test("nenhum número de dedução sai null quando o dado existe", () => {
    const resultado = simularRedistribuicao(estadoReal(), {}, AGORA);
    for (const numero of resultado.numeros.filter((n) => n.deducao)) {
      assert.notEqual(numero.valor, null, `dedução "${numero.nome}" saiu não medida com o dado na mão`);
    }
  });

  test("a simulação NÃO inventa gente que não existe no cadastro", () => {
    const resultado = simularRedistribuicao(estadoReal(), { entreQuantosCorretores: 40 }, AGORA);
    const carga = resultado.numeros.find((n) => n.nome === "carga por corretor depois do rateio");
    // 12 medidos: o rateio usa 12, não 40.
    assert.equal(carga.valor, Math.round((385 / 12) * 100) / 100, "ratear entre 40 pessoas inexistentes inventaria capacidade");
    assert.ok(
      resultado.premissas.some((p) => /40/.test(p) && /12/.test(p)),
      "o recorte tem de estar declarado como premissa, não acontecer em silêncio",
    );
  });
});

describe("gêmeo digital — as portas da execução real", () => {
  test("sem substituto presente na janela, o sistema move ZERO hoje", () => {
    // O estado medido: 11 substitutos passam por equipe/papel/atividade e
    // NENHUM tem presença na janela de 90s. Provado executando a própria
    // consulta de candidatos da RPC contra a base viva em 2026-07-30.
    const estado = estadoReal();
    const origem = estado.carteiras[0];
    const portas = portasDaRedistribuicao(estado, origem, AGORA);

    const equipe = portas.find((p) => p.chave === "substituto_mesma_equipe");
    assert.equal(equipe.atendida, true, "os 11 colegas do mesmo gerente existem");

    const presenca = portas.find((p) => p.chave === "presenca_na_janela");
    assert.equal(presenca.atendida, false, "ninguém está presente na janela medida");
    assert.equal(presenca.bloqueiaTudo, true, "presença ausente aborta a transação inteira");

    assert.equal(leadsQueMoveriamHoje(portas, 240), 0, "porta bloqueante fechada tem de zerar o movimento");
  });

  test("O OUTRO LADO: com um substituto presente, o sistema move", () => {
    const estado = estadoReal();
    estado.carteiras[3] = carteira({
      id: "vazio-0",
      nome: "Corretor presente",
      abertos: 0,
      presencaDisponivel: true,
      presencaVistaEmMs: AGORA - 30_000,
    });
    const portas = portasDaRedistribuicao(estado, estado.carteiras[0], AGORA);
    assert.equal(portas.find((p) => p.chave === "presenca_na_janela").atendida, true);
    assert.equal(leadsQueMoveriamHoje(portas, 240), TETO_DO_LOTE_DE_REDISTRIBUICAO, "240 desejados recortam no teto de 200");
    assert.equal(leadsQueMoveriamHoje(portas, 50), 50, "abaixo do teto, move o que se pediu");
  });

  test("presenteParaReceberLead exige disponibilidade E recência — as duas", () => {
    // A função é UMA e serve a dois consumidores (as portas e o payload da
    // rota). Os quatro cantos da tabela, porque cada um já foi um bug real
    // possível: disponível+recente entra, e as outras três combinações não.
    const dentro = AGORA - 10_000;
    const fora = AGORA - (JANELA_DE_PRESENCA_SEGUNDOS + 1) * 1000;
    assert.equal(presenteParaReceberLead(carteira({ presencaDisponivel: true, presencaVistaEmMs: dentro }), AGORA), true);
    assert.equal(presenteParaReceberLead(carteira({ presencaDisponivel: true, presencaVistaEmMs: fora }), AGORA), false, "disponível mas visto há muito tempo não está presente");
    assert.equal(presenteParaReceberLead(carteira({ presencaDisponivel: false, presencaVistaEmMs: dentro }), AGORA), false, "visto agora mas indisponível não recebe lead");
    assert.equal(presenteParaReceberLead(carteira({ presencaDisponivel: true, presencaVistaEmMs: null }), AGORA), false, "sem data de presença não há janela que expire");
  });

  test("presença VELHA não conta como presença", () => {
    // A doença desta base em miniatura: `commercial_presence` tem 2 linhas
    // 'available' com last_seen_at de 2026-07-24. Disponível sem ser recente é
    // exatamente "não sei quando" publicado como "agora".
    const estado = estadoReal();
    estado.carteiras[3] = carteira({
      id: "vazio-0",
      abertos: 0,
      presencaDisponivel: true,
      presencaVistaEmMs: AGORA - (JANELA_DE_PRESENCA_SEGUNDOS + 1) * 1000,
    });
    const portas = portasDaRedistribuicao(estado, estado.carteiras[0], AGORA);
    assert.equal(portas.find((p) => p.chave === "presenca_na_janela").atendida, false, "presença fora da janela abriu a porta");
  });

  test("substituto de OUTRA equipe não serve — a RPC só move dentro da equipe", () => {
    const estado = estadoReal();
    estado.carteiras = [
      carteira({ id: "origem", nome: "Sobrecarregado", abertos: 272, gerenteId: "gerente-A" }),
      carteira({ id: "outro", nome: "Outra equipe", abertos: 0, gerenteId: "gerente-B", presencaDisponivel: true, presencaVistaEmMs: AGORA }),
    ];
    const portas = portasDaRedistribuicao(estado, estado.carteiras[0], AGORA);
    assert.equal(portas.find((p) => p.chave === "substituto_mesma_equipe").atendida, false);
    assert.equal(leadsQueMoveriamHoje(portas, 100), 0, "cruzou a fronteira de equipe que o banco não cruza");
  });

  test("o teto do lote recorta, mas NÃO bloqueia", () => {
    // A distinção importa: publicar "move zero" para uma carteira que move em
    // duas chamadas seria tão errado quanto prometer as 272 de uma vez.
    const estado = estadoReal();
    estado.carteiras[3] = carteira({ id: "vazio-0", abertos: 0, presencaDisponivel: true, presencaVistaEmMs: AGORA });
    const portas = portasDaRedistribuicao(estado, estado.carteiras[0], AGORA);
    const lote = portas.find((p) => p.chave === "teto_do_lote");
    assert.equal(lote.atendida, false, "272 abertos excedem o teto de 200");
    assert.equal(lote.bloqueiaTudo, false, "exceder o lote divide o trabalho, não o impede");
    assert.ok(leadsQueMoveriamHoje(portas, 240) > 0, "o teto não pode zerar o movimento");
  });
});

describe("gêmeo digital — os outros cenários pedidos", () => {
  test("aumento de leads é dedução e não vira receita sem lastro", () => {
    const resultado = simularAumentoDeLeads(estadoReal(), 120, AGORA);
    assert.equal(resultado.rotulo, ROTULO_DE_ESTIMATIVA);
    const acrescimo = resultado.numeros.find((n) => n.nome === "acréscimo de carga por corretor");
    assert.equal(acrescimo.valor, 10, "120 leads entre 12 corretores dá 10 por pessoa");
    const receita = resultado.numeros.find((n) => n.nome.startsWith("receita"));
    assert.equal(receita.valor, null, "aumento de leads não vira dinheiro sem taxa observada");
    assert.equal(resultado.recusas.length, 1);
  });

  test("redução a ZERO corretor é fila sem dono, não carga infinita", () => {
    const resultado = simularReducaoDaEquipe(estadoReal(), 12, AGORA);
    const carga = resultado.numeros.find((n) => n.nome === "carga por corretor depois");
    assert.equal(carga.valor, null, "dividir por zero pessoas não pode produzir número");
    assert.match(carga.motivo, /sem dono/i);
  });

  test("redução pede mais gente do que existe e o cenário recorta declarando", () => {
    const resultado = simularReducaoDaEquipe(estadoReal(), 99, AGORA);
    const restantes = resultado.numeros.find((n) => n.nome === "corretores depois");
    assert.equal(restantes.valor, 0, "não se remove mais gente do que existe");
    assert.ok(resultado.premissas.some((p) => /99/.test(p)), "o recorte tem de ser declarado");
  });

  test("mudar o SLA não promete cumprimento — essa metade sai não medida", () => {
    const resultado = simularMudancaDeSla(estadoReal(), 15, AGORA);
    const cumprimento = resultado.numeros.find((n) => n.nome === "cumprimento esperado do prazo novo");
    assert.equal(cumprimento.valor, null, "cumprimento de prazo exige ritmo observado");
    assert.equal(cumprimento.deducao, false);
    assert.match(cumprimento.motivo, /ritmo de atendimento/i);
    // E o que É dedutível sai preenchido.
    const violam = resultado.numeros.find((n) => n.nome === "violariam o prazo novo imediatamente");
    assert.equal(violam.valor, 473);
  });

  test("TODO cenário sai marcado como estimativa — sem exceção", () => {
    const cenarios = [
      simularRedistribuicao(estadoReal(), {}, AGORA),
      simularAumentoDeLeads(estadoReal(), 50, AGORA),
      simularReducaoDaEquipe(estadoReal(), 2, AGORA),
      simularMudancaDeSla(estadoReal(), 30, AGORA),
      // Com lastro também: o rótulo não é consequência de faltar dado.
      simularRedistribuicao(estadoComLastro(), {}, AGORA),
      simularAumentoDeLeads(estadoComLastro(), 50, AGORA),
    ];
    for (const resultado of cenarios) {
      // LITERAL, de propósito. Comparar com a constante importada faria as duas
      // pontas mudarem juntas: renomear o rótulo para "MEDIDO" deixaria este
      // teste VERDE enquanto a tela passa a chamar estimativa de medição. É a
      // armadilha registrada neste repositório — a asserção que procura a
      // palavra não prova que o código a usa.
      assert.equal(resultado.rotulo, "ESTIMATIVA", `cenário "${resultado.cenario}" não saiu marcado como ESTIMATIVA`);
      assert.equal(ROTULO_DE_ESTIMATIVA, "ESTIMATIVA", "o rótulo exportado deixou de ser ESTIMATIVA");
      assert.ok(resultado.premissas.length > 0, `cenário "${resultado.cenario}" saiu sem premissa nenhuma`);
      assert.equal(typeof resultado.medidoEm, "string");
    }
  });
});

describe("gêmeo digital — a régua de carteira aberta é a da RPC", () => {
  test("`comprou_outro` conta como ABERTO, porque a RPC o move", () => {
    // Medido em 2026-07-30: ddcorretorsp tem 112 abertos pela régua da RPC e 110
    // pela régua da listagem de leads. Duas réguas para "lead aberto" já existem
    // nesta base; o gêmeo usa a da RPC porque publica "quantos moveriam".
    assert.equal(contaComoAbertoNaRedistribuicao("comprou_outro"), true);
    assert.equal(contaComoAbertoNaRedistribuicao("novo"), true);
    assert.equal(contaComoAbertoNaRedistribuicao(null), true, "status nulo é 'novo' para a RPC, não fechado");
  });

  test("o OUTRO lado: as etapas que a RPC considera fechadas ficam fora", () => {
    for (const fechada of ["ganho", "won", "vendido", "perdido", "lost", "descartado", "arquivado", "archived", "discarded"]) {
      assert.equal(contaComoAbertoNaRedistribuicao(fechada), false, `"${fechada}" entrou na carteira aberta`);
      assert.equal(contaComoAbertoNaRedistribuicao(fechada.toUpperCase()), false, `"${fechada}" em maiúsculas escapou da régua`);
    }
  });
});

describe("gêmeo digital — as constantes copiadas do banco não podem divergir", () => {
  /**
   * Este é o ÚNICO teste do arquivo que lê texto em vez de executar, e a razão é
   * declarada: a regra mora numa função PL/pgSQL, e um contrato que roda sem
   * credencial não consegue executá-la. Grep aqui é o último recurso legítimo —
   * para o que não dá para executar — e não substitui os testes de cima, que
   * chamam o módulo de verdade.
   *
   * O que ele protege: JANELA_DE_PRESENCA_SEGUNDOS e
   * TETO_DO_LOTE_DE_REDISTRIBUICAO são CÓPIAS do que a RPC faz. Cópia que
   * ninguém confere diverge — é a classe de defeito mais frequente deste
   * repositório. Se alguém mudar a janela no SQL, o gêmeo passa a prometer um
   * movimento que o banco recusa, e o vermelho aparece aqui.
   *
   * A asserção ancora na REGIÃO (o corpo da função), não em formatação.
   */
  const raiz = path.resolve(import.meta.dirname, "..", "..");
  const sql = fs.readFileSync(
    path.join(raiz, "supabase", "migrations", "20260718063000_phase_55_governed_absence_redistribution.sql"),
    "utf8",
  );

  test("a janela de presença do módulo é a mesma que a RPC exige", () => {
    const corpo = sql.slice(sql.indexOf("redistribute_absent_broker_leads"));
    assert.ok(corpo.length > 0, "a função saiu da migration — reescreva este contrato");
    assert.match(
      corpo,
      new RegExp(`interval\\s*'${JANELA_DE_PRESENCA_SEGUNDOS} seconds'`),
      `o módulo usa ${JANELA_DE_PRESENCA_SEGUNDOS}s de janela e a RPC não confirma esse número`,
    );
  });

  test("o teto do lote do módulo é o mesmo que a RPC aceita", () => {
    const corpo = sql.slice(sql.indexOf("redistribute_absent_broker_leads"));
    assert.match(
      corpo,
      new RegExp(`p_limit\\s*>\\s*${TETO_DO_LOTE_DE_REDISTRIBUICAO}`),
      `o módulo promete lotes de ${TETO_DO_LOTE_DE_REDISTRIBUICAO} e a RPC não confirma esse teto`,
    );
  });
});

describe("gêmeo digital — gargalos deduzidos", () => {
  test("aponta concentração, pessoa parada e teto exibido sem teto aplicado", () => {
    const gargalos = gargalosDaOperacao(estadoReal());
    const areas = gargalos.map((g) => g.area);

    assert.ok(areas.includes("concentração de carteira"), "272 de 385 numa pessoa é concentração");
    assert.ok(areas.includes("pessoa parada"), "nove carteiras vazias com fila esperando");
    assert.ok(areas.includes("prazo de primeiro contato"), "473 prazos vencidos");
    // O achado que só apareceu porque duas fontes de teto foram medidas
    // separadamente: a tela exibe limite e o banco não aplica nenhum.
    assert.ok(areas.includes("teto de capacidade"), "teto exibido sem teto aplicado é gargalo silencioso");

    for (const gargalo of gargalos) {
      assert.equal(typeof gargalo.numero, "number", `gargalo "${gargalo.area}" sem número é opinião`);
      assert.ok(Number.isFinite(gargalo.numero));
    }
  });

  test("operação equilibrada NÃO produz gargalo inventado", () => {
    // O outro lado: um detector que sempre acusa é tão inútil quanto um que
    // nunca acusa.
    const equilibrada = estadoReal({
      esperandoPrimeiroContato: 0,
      prazoDePrimeiroContatoVencido: 0,
      carteiras: Array.from({ length: 4 }, (_, i) =>
        carteira({ id: `c-${i}`, abertos: 25, tetoExibido: 100, tetoAplicado: 100 }),
      ),
    });
    assert.deepEqual(gargalosDaOperacao(equilibrada), [], "operação equilibrada gerou gargalo do nada");
  });
});

describe("gêmeo digital — a concentração tem UMA definição, e não é daqui", () => {
  /**
   * ── O QUE ESTE BLOCO GUARDA ─────────────────────────────────────────────
   *
   * `gargalosDaOperacao` tinha a própria desigualdade ("fatia > 1 ÷ corretores")
   * enquanto `lib/ai/previsao-aritmetica.ts` media a mesma coisa por "maior
   * carga ÷ carga média > 1". Duas definições que nasceram iguais é a classe de
   * defeito que este repositório já pagou quatro vezes. A daqui morreu.
   *
   * Os testes abaixo falham se ela renascer — e o caso [334, 333, 333] é o que
   * prova que a fusão foi feita pelo lado certo: era ali que as duas contas já
   * discordavam, antes de qualquer correção divergir.
   */

  test("o veredito de concentração vem da conta compartilhada", () => {
    // Se alguém reescrever a desigualdade aqui dentro, vai reescrevê-la a partir
    // da razão de exibição (arredondada) e este caso passa a NÃO acusar.
    const borda = estadoReal({
      esperandoPrimeiroContato: 0,
      prazoDePrimeiroContatoVencido: 0,
      carteiras: [334, 333, 333].map((abertos, i) =>
        carteira({ id: `c-${i}`, nome: `Corretor ${i}`, abertos, tetoExibido: 100, tetoAplicado: 100 }),
      ),
    });
    // A conta compartilhada diz: acima do rateio uniforme, apesar da razão 1,00.
    const carga = cargaDaOperacao(borda);
    assert.equal(carga.concentracao, 1, "premissa: a razão de exibição arredonda para 1,00");
    assert.equal(carga.concentrada, true);
    // E os gargalos seguem o veredito, não a razão.
    const areas = gargalosDaOperacao(borda).map((g) => g.area);
    assert.ok(areas.includes("concentração de carteira"), "334 de 1000 em 3 pessoas não foi acusado");
  });

  test("os gargalos e a conta compartilhada respondem a mesma coisa, sempre", () => {
    // Varredura pequena, mas o ponto é o acoplamento: para TODO estado, a
    // presença do gargalo é exatamente `carga.concentrada`. Uma segunda
    // desigualdade aqui dentro quebraria isto em algum dos casos de borda.
    const distribuicoes = [
      [334, 333, 333],
      [25, 25, 25, 25],
      [26, 25, 25, 25],
      [272, 112, 1, 0, 0],
      [400],
      [0, 0, 0],
      [],
      [1, 1],
      [2, 1],
    ];
    for (const abertos of distribuicoes) {
      const estado = estadoReal({
        esperandoPrimeiroContato: 0,
        prazoDePrimeiroContatoVencido: 0,
        carteiras: abertos.map((n, i) => carteira({ id: `c-${i}`, abertos: n, tetoExibido: 100, tetoAplicado: 100 })),
      });
      const esperado = cargaDaOperacao(estado).concentrada;
      const acusou = gargalosDaOperacao(estado).some((g) => g.area === "concentração de carteira");
      assert.equal(acusou, esperado, `[${abertos.join(", ")}]: gargalo e conta compartilhada discordaram`);
    }
  });

  test("a conta compartilhada recebe a régua da RPC — a que este módulo conta", () => {
    // A outra metade da consolidação. `contaComoAbertoNaRedistribuicao` é a
    // régua em código; `REGUA_DA_CARTEIRA` é a mesma régua como rótulo. Trocar
    // um sem o outro publica 110 dizendo 112 — a divergência que a fusão existia
    // para NÃO criar, agora dentro de uma função só.
    assert.equal(REGUA_DA_CARTEIRA, "rpc_redistribuicao");
    assert.equal(
      contaComoAbertoNaRedistribuicao("comprou_outro"),
      true,
      "o rótulo diz régua da RPC, mas o código passou a tratar comprou_outro como fechado",
    );
    // E a régua viaja no resultado da conta, não só na constante.
    const estado = estadoReal();
    const carga = cargaDaOperacao(estado);
    assert.equal(carga.regua, REGUA_DA_CARTEIRA);
    assert.ok(carga.formula.includes("comprou_outro"), "a fórmula publicada não diz qual régua contou");
    assert.equal(carga.calculavel, true);

    // E a conta é MESMO a do módulo irmão, não uma reimplementação com o mesmo
    // nome. Sem esta asserção, `cargaDaOperacao` poderia voltar a calcular por
    // conta própria e todo o resto deste bloco continuaria verde — que é
    // exatamente como a duplicação nasceu da primeira vez.
    assert.deepEqual(
      carga,
      cargaDaEquipePorContagem(
        estado.carteiras.map((c) => ({ corretorId: c.id, leads: c.abertos })),
        estado.carteiras.map((c) => c.id),
        "rpc_redistribuicao",
      ),
      "cargaDaOperacao deixou de ser a conta compartilhada",
    );
  });

  test("carga por corretor: o rateio da simulação bate com a média publicada", () => {
    // O laço entre os dois módulos. Quando o rateio é entre TODOS os ativos, a
    // "carga por corretor depois do rateio" é a mesma `cargaMedia` que a conta
    // compartilhada publica. Se uma das duas mudar de denominador — foi
    // exatamente o que M146 faz — elas param de bater e o gêmeo passa a mostrar
    // um número que a conta oficial contradiz.
    const estado = estadoReal();
    const carga = cargaDaOperacao(estado);
    const resultado = simularRedistribuicao(estado, {}, AGORA);
    const rateio = resultado.numeros.find((n) => n.nome === "carga por corretor depois do rateio");
    assert.equal(rateio.valor, carga.cargaMedia, "o rateio da simulação divergiu da carga média publicada");
    assert.equal(carga.cargaMedia, Math.round((385 / 12) * 100) / 100);
  });

  test("a carteira mais cheia é a MESMA nos gargalos e na simulação", () => {
    // Três `sort` idênticos viraram um. O empate é o caso que importa: com dois
    // empatados, gargalo e simulação tinham de nomear a mesma pessoa, e antes
    // isso dependia da ordem do array em cada lugar.
    const empate = estadoReal({
      carteiras: [
        carteira({ id: "z-ultimo", nome: "Zulmira", abertos: 200 }),
        carteira({ id: "a-primeiro", nome: "Ana", abertos: 200 }),
        carteira({ id: "c-vazio", nome: "Carlos", abertos: 0 }),
      ],
    });
    const gargalo = gargalosDaOperacao(empate).find((g) => g.area === "concentração de carteira");
    const premissa = simularRedistribuicao(empate, {}, AGORA).premissas.find((p) =>
      p.startsWith("A carteira mais cheia"),
    );
    assert.ok(gargalo, "400 leads em 2 de 3 pessoas é concentração");
    assert.ok(premissa, "a simulação tem de nomear a carteira mais cheia");
    assert.ok(
      premissa.includes(gargalo.fato.split(" concentra")[0]),
      `gargalo e simulação nomearam pessoas diferentes: "${gargalo.fato}" vs "${premissa}"`,
    );
  });
});
