/**
 * Contrato do MOTOR DE COMPATIBILIDADE CLIENTE × IMÓVEL.
 *
 * ── O QUE ESTE CONTRATO PROTEGE, E POR QUE É EXECUTÁVEL ─────────────────────
 *
 * O motor é PURO de propósito: nenhum acesso a banco, nenhuma chamada de IA,
 * nenhum `server-only`. Por isso este contrato CHAMA as funções com clientes
 * sintéticos em vez de casar regex no arquivo — e é a diferença entre provar
 * comportamento e provar que alguém escreveu uma palavra.
 *
 * As armadilhas desta base que essa escolha evita, todas já medidas antes:
 * uma asserção que procura a PALAVRA passa porque o identificador sobrevive na
 * linha do `import`; e uma asserção presa à formatação quebra no primeiro
 * reflow. Aqui as duas são impossíveis: se a regra sumir, a chamada devolve
 * outro valor.
 *
 * ── OS QUATRO CENÁRIOS EXIGIDOS ─────────────────────────────────────────────
 *
 *   tudo casando · nada casando · dado faltando · estoque desatualizado
 *
 * E, em cada um, OS DOIS LADOS: que o motor ENTREGA para quem deve e RECUSA
 * quem não deve. A recusa é a metade que costuma ficar sem teste, e é a metade
 * que aqui carrega o valor: um motor que recomenda sempre é um motor que mente
 * às vezes.
 *
 * Rodar: node --experimental-strip-types --test tests/contracts/compatibilidade-por-regras.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  agregarOfertas,
  CRITERIOS,
  diagnosticarCarteira,
  distanciaKm,
  DIAS_PARA_ESTOQUE_SUSPEITO,
  faixasSeCruzam,
  MINIMO_DE_DECISIVOS_PARA_RECOMENDAR,
  normalizarBairro,
  normalizarFinalidade,
  pontuarCompatibilidade,
  QUANTOS_RECOMENDAR,
  recomendarPara,
} from "../../lib/crm/compatibilidade-imovel.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

/** Instante fixo: sem isto, "estoque desatualizado" muda de veredito com o calendário. */
const AGORA = new Date("2026-07-30T12:00:00.000Z");

/** Um imóvel COMPLETO — todas as 14 colunas que o motor sabe ler. */
const imovelCompleto = {
  id: "imovel-completo",
  name: "Residencial Completo",
  neighborhood: "Perdizes",
  city: "São Paulo",
  latitude: -23.5329,
  longitude: -46.6795,
  market_segment: "residencial",
  product_type: "apartamento",
  bedrooms_min: 1,
  bedrooms_max: 3,
  private_area_min: 40,
  private_area_max: 90,
  price_min: 400000,
  price_max: 900000,
  sales_cycle_status: "ready",
  delivery_date: "2026-10-01",
  updated_at: "2026-07-29T00:00:00.000Z",
  parking_spaces_max: 2,
  units_available: 12,
  // A regra de pagamento com os NÚMEROS, não só o booleano: entrada de 20% sobre
  // 400.000 = 80.000, e 60 parcelas lineares de (400.000 − 80.000) ÷ 60 = 5.333.
  // Sem estes dois campos o imóvel não é "completo" — entrada e renda ficariam
  // como lacuna de catálogo, que é justamente o comportamento correto e o que os
  // outros cenários exercitam.
  tem_regra_de_pagamento: true,
  entrada_percentual: 20,
  parcelas: 60,
};

/** Um cliente COMPLETO — todos os campos que destravam os 14 critérios. */
const clienteCompleto = {
  id: "cliente-completo",
  name: "Cliente Completo",
  budget_min: 450000,
  budget_max: 700000,
  preferred_bedrooms: 2,
  preferred_min_area: 50,
  preferred_neighborhoods: ["Perdizes"],
  purpose: "morar",
  monthly_income: 20000,
  available_down_payment: 100000,
  fgts_balance: 30000,
  financing_required: true,
  payment_method: "financiamento",
  vagas_desejadas: 1,
  prazo_entrega_meses: 12,
  latitude: -23.5333,
  longitude: -46.68,
  raio_km: 5,
};

/* ══════════════════════════════════════════════════════════════════════════
 * CENÁRIO 1 — TUDO CASANDO
 * ══════════════════════════════════════════════════════════════════════════ */

test("CENÁRIO tudo casando: os 14 critérios são avaliados e nenhum fica ausente", () => {
  const p = pontuarCompatibilidade(clienteCompleto, imovelCompleto, { agora: AGORA });

  assert.equal(p.criterios.length, 14, "os 14 critérios do pedido do dono precisam ser avaliados");
  assert.deepEqual(
    p.faltaDoCliente.map((c) => c.chave),
    [],
    "cliente completo não pode gerar lacuna do lado dele",
  );
  assert.deepEqual(
    p.faltaDaOferta.map((c) => c.chave),
    [],
    "imóvel completo não pode gerar lacuna de cadastro",
  );
  // Cobertura TOTAL: é o único caso em que aderência pode ser lida sozinha.
  assert.equal(p.cobertura, 1, "com os dois lados completos, a cobertura é 100%");
  assert.equal(p.pontosAvaliaveis, p.pontosTotais);
  assert.equal(p.aderencia, 1, "todos os critérios batem neste cenário");
  assert.equal(p.confianca, "alta");
  assert.equal(p.naoAtendidos.length, 0);
});

test("CENÁRIO tudo casando: o cliente recebe os TRÊS imóveis, ordenados por evidência", () => {
  const ofertas = [
    imovelCompleto,
    { ...imovelCompleto, id: "b", name: "B Parcial", bedrooms_min: null, bedrooms_max: null },
    { ...imovelCompleto, id: "c", name: "C Longe", neighborhood: "Santo Amaro", latitude: -23.65, longitude: -46.7 },
    { ...imovelCompleto, id: "d", name: "D Caro", price_min: 2000000, price_max: 3000000 },
  ];
  const r = recomendarPara(clienteCompleto, ofertas, { agora: AGORA });

  assert.equal(r.recomendavel, true);
  assert.equal(r.top.length, QUANTOS_RECOMENDAR, "o pedido é os TRÊS mais compatíveis");
  assert.equal(r.top[0].ofertaId, "imovel-completo", "o que atende tudo vem primeiro");

  // ── A ORDENAÇÃO É POR EVIDÊNCIA, NÃO POR RAZÃO ──────────────────────────
  //
  // "B Parcial" perdeu a faixa de dormitórios: ele NÃO PODE passar na frente do
  // imóvel que atende os 14. Ordenar por aderência o colocaria à frente, porque
  // razão sobre menos critérios é mais fácil de ficar alta.
  const pontos = r.top.map((t) => t.pontos);
  assert.deepEqual([...pontos].sort((a, b) => b - a), pontos, "o top precisa estar em ordem decrescente de pontos");
});

/* ══════════════════════════════════════════════════════════════════════════
 * CENÁRIO 2 — NADA CASANDO  (o lado da RECUSA)
 * ══════════════════════════════════════════════════════════════════════════ */

test("CENÁRIO nada casando: critérios avaliados e REPROVADOS, sem virar ausência", () => {
  const incompativel = {
    ...imovelCompleto,
    id: "incompativel",
    name: "Incompatível",
    neighborhood: "Santo Amaro",
    latitude: -23.65,
    longitude: -46.71,
    bedrooms_min: 4,
    bedrooms_max: 5,
    // MENOR que o mínimo do cliente (50 m²), de propósito. A primeira versão
    // deste fixture usava 200–300 m² e o teste reprovou com razão: metragem é
    // critério de MÍNIMO, e 300 m² atende quem pede "pelo menos 50". Para
    // reprovar metragem o imóvel tem de ser pequeno, não grande.
    private_area_min: 20,
    private_area_max: 25,
    price_min: 3000000,
    price_max: 4000000,
    sales_cycle_status: "planning",
    delivery_date: "2031-01-01",
    parking_spaces_max: 0,
    units_available: 0,
  };
  const p = pontuarCompatibilidade(clienteCompleto, incompativel, { agora: AGORA });

  const reprovados = p.naoAtendidos.map((c) => c.chave);
  for (const esperado of ["faixaDePreco", "bairro", "dormitorios", "metragem", "raio", "vagas", "disponibilidade", "dataDeEntrega"]) {
    assert.ok(reprovados.includes(esperado), `${esperado} tinha dado dos dois lados e precisava REPROVAR, não virar ausência`);
  }
  assert.equal(p.faltaDoCliente.length, 0, "reprovação não pode ser confundida com falta de dado do cliente");
  assert.equal(p.faltaDaOferta.length, 0, "reprovação não pode ser confundida com falta de cadastro");
  assert.equal(p.aderencia < 0.5, true, `aderência deveria ser baixa, veio ${p.aderencia}`);
});

test("CENÁRIO nada casando: aderência 0 continua sendo RESPOSTA, não recusa de responder", () => {
  // Um imóvel que erra tudo mas com dado completo AINDA é avaliável: o corretor
  // precisa saber que foi olhado e reprovado. "Não sei" e "não serve" são
  // informações diferentes, e trocá-las é o defeito central desta frente.
  const p = pontuarCompatibilidade(
    { ...clienteCompleto, preferred_bedrooms: 9, budget_min: 10, budget_max: 20, preferred_min_area: 900 },
    imovelCompleto,
    { agora: AGORA },
  );
  assert.ok(p.decisivosAvaliados >= MINIMO_DE_DECISIVOS_PARA_RECOMENDAR, "os decisivos tinham dado e foram avaliados");
  assert.equal(p.faltaDoCliente.length + p.faltaDaOferta.length, 0);
  assert.ok(p.naoAtendidos.length > 0);
});

/* ══════════════════════════════════════════════════════════════════════════
 * CENÁRIO 3 — DADO FALTANDO  (a regra mais importante do motor)
 * ══════════════════════════════════════════════════════════════════════════ */

test("CENÁRIO dado faltando: cliente sobre quem NADA se sabe NÃO recebe imóvel", () => {
  // É a exigência literal do dono: um motor que devolve 3 imóveis para um cliente
  // sobre quem nada se sabe é PIOR que um que diz o que falta, porque parece
  // funcionar. Este é o teste que impede isso de voltar.
  const desconhecido = { id: "vazio", name: "Cliente Sem Nada" };
  const r = recomendarPara(desconhecido, [imovelCompleto], { agora: AGORA });

  assert.equal(r.recomendavel, false, "sem nenhum critério decisivo avaliável, não se recomenda");
  assert.deepEqual(r.top, [], "e a lista precisa vir VAZIA, não com três por desencargo");
  assert.ok(r.motivoDaRecusa, "a recusa precisa ter motivo escrito");
  assert.ok(r.perguntasQueDestravam.length > 0, "a entrega passa a ser a lista do que perguntar");
});

test("CENÁRIO dado faltando: as perguntas vêm ORDENADAS, decisivo primeiro", () => {
  const r = recomendarPara({ id: "vazio" }, [imovelCompleto], { agora: AGORA });
  const chaves = r.perguntasQueDestravam.map((p) => p.chave);

  // Preço, bairro e dormitórios são os decisivos: precisam vir na frente, senão
  // o corretor gasta a ligação perguntando metragem e continua sem poder
  // recomendar nada.
  const decisivos = CRITERIOS.filter((c) => c.decisivo).map((c) => c.chave);
  const primeiros = chaves.slice(0, decisivos.length);
  for (const d of decisivos) {
    assert.ok(primeiros.includes(d), `${d} é decisivo e precisa estar entre as primeiras perguntas`);
  }
  // E cada pergunta é uma FRASE para o corretor dizer, não o nome da coluna.
  for (const p of r.perguntasQueDestravam) {
    assert.match(p.pergunta, /\?/, `"${p.rotulo}" precisa ser uma pergunta que o corretor faz em voz alta`);
  }
});

test("CENÁRIO dado faltando: ausência NUNCA conta como atendida nem como reprovada", () => {
  // As duas mentiras simétricas. Tratar ausência como atendida inventa
  // compatibilidade; como reprovada, inventa incompatibilidade.
  const p = pontuarCompatibilidade({ id: "so-dorm", preferred_bedrooms: 2 }, imovelCompleto, { agora: AGORA });
  const ausentes = [...p.faltaDoCliente, ...p.faltaDaOferta];
  assert.ok(ausentes.length > 0, "este cliente tem lacunas de propósito");

  for (const a of ausentes) {
    assert.ok(!p.atendidos.includes(a), `${a.chave} está ausente e apareceu como ATENDIDO`);
    assert.ok(!p.naoAtendidos.includes(a), `${a.chave} está ausente e apareceu como REPROVADO`);
  }
  // A conta tem de fechar sem o peso dos ausentes.
  const pesoAusente = ausentes.reduce((s, c) => s + c.peso, 0);
  assert.equal(p.pontosAvaliaveis + pesoAusente, p.pontosTotais, "o peso ausente sai do denominador, não entra como zero");
  assert.ok(p.cobertura < 1, "cobertura precisa DENUNCIAR a lacuna");
});

test("CENÁRIO dado faltando: a lacuna é separada por DONO — cliente contra catálogo", () => {
  // A distinção que decide para quem o painel manda a tarefa. Preço ausente no
  // catálogo não se resolve ligando para o cliente, e foi isso que a medição de
  // 2026-07-30 mostrou: 4 de 4 imóveis sem preço.
  const semPreco = { ...imovelCompleto, price_min: null, price_max: null };
  const p = pontuarCompatibilidade(clienteCompleto, semPreco, { agora: AGORA });

  const preco = p.criterios.find((c) => c.chave === "faixaDePreco");
  assert.equal(preco.estado, "falta_oferta", "cliente TEM orçamento; quem falta é o cadastro do imóvel");

  const r = recomendarPara(clienteCompleto, [semPreco], { agora: AGORA });
  assert.ok(
    r.lacunasDoCatalogo.some((l) => l.chave === "faixaDePreco"),
    "preço ausente precisa aparecer como lacuna do CATÁLOGO",
  );
  assert.ok(
    !r.perguntasQueDestravam.some((p2) => p2.chave === "faixaDePreco"),
    "e NÃO pode virar pergunta ao cliente: ele já respondeu, ligar de novo não destrava nada",
  );
});

test("CENÁRIO dado faltando: imóvel sem nenhum decisivo sai do ranking COM MOTIVO", () => {
  // O defeito que a execução contra o catálogo real pegou: um imóvel de que
  // quase nada se sabe entrava no top 3 com "aderência 100%" ao lado.
  const fantasma = { id: "fantasma", name: "Só o Nome", market_segment: "residencial", updated_at: AGORA.toISOString() };
  const r = recomendarPara(
    { id: "c", preferred_bedrooms: 2, purpose: "morar" },
    [imovelCompleto, fantasma],
    { agora: AGORA },
  );

  assert.deepEqual(r.top.map((t) => t.ofertaId), ["imovel-completo"], "o fantasma não pode ser recomendação");
  const fora = r.ofertasNaoAvaliaveis.find((o) => o.ofertaId === "fantasma");
  assert.ok(fora, "e precisa aparecer nomeado como não avaliável");
  assert.match(fora.porque, /CADASTRO/, "com o motivo dizendo que a lacuna é de cadastro");
});

/* ══════════════════════════════════════════════════════════════════════════
 * CENÁRIO 4 — ESTOQUE DESATUALIZADO
 * ══════════════════════════════════════════════════════════════════════════ */

test("CENÁRIO estoque desatualizado: cadastro velho vira RISCO declarado", () => {
  const velho = { ...imovelCompleto, id: "velho", updated_at: "2026-01-01T00:00:00.000Z" };
  const p = pontuarCompatibilidade(clienteCompleto, velho, { agora: AGORA });

  assert.equal(p.riscoDeEstoque.suspeito, true);
  assert.ok(p.riscoDeEstoque.diasDesdeAtualizacao > DIAS_PARA_ESTOQUE_SUSPEITO);
  assert.equal(p.criterios.find((c) => c.chave === "atualizacaoDoEstoque").estado, "nao_atendido");
});

test("CENÁRIO estoque desatualizado: cadastro fresco SEM contagem também é risco", () => {
  // A distinção fina que a medição real exigiu: os 4 empreendimentos foram
  // editados dias atrás e NENHUM tem `units_available`. Dizer "estoque fresco"
  // pelo `updated_at` trocaria a pergunta ("quantas unidades sobraram?") por
  // outra, mais fácil e irrelevante.
  const frescoSemContagem = { ...imovelCompleto, id: "fresco", updated_at: AGORA.toISOString(), units_available: null };
  const p = pontuarCompatibilidade(clienteCompleto, frescoSemContagem, { agora: AGORA });

  assert.equal(p.criterios.find((c) => c.chave === "atualizacaoDoEstoque").estado, "atendido", "o cadastro é recente");
  assert.equal(p.riscoDeEstoque.suspeito, true, "mas sem contagem de unidades o estoque continua incerto");
  assert.match(p.riscoDeEstoque.motivo, /frescor do registro não é frescor do estoque/);
});

test("CENÁRIO estoque desatualizado: cadastro fresco COM contagem não é risco", () => {
  // O outro lado: o motor não pode gritar risco sempre, senão o aviso não
  // significa nada quando o risco é real.
  const p = pontuarCompatibilidade(
    clienteCompleto,
    { ...imovelCompleto, updated_at: AGORA.toISOString(), units_available: 5 },
    { agora: AGORA },
  );
  assert.equal(p.riscoDeEstoque.suspeito, false);
});

test("estoque zerado é REPROVAÇÃO, e ausência de contagem NÃO é esgotado", () => {
  const zerado = pontuarCompatibilidade(clienteCompleto, { ...imovelCompleto, units_available: 0 }, { agora: AGORA });
  assert.equal(zerado.criterios.find((c) => c.chave === "disponibilidade").estado, "nao_atendido");

  const semContagem = pontuarCompatibilidade(clienteCompleto, { ...imovelCompleto, units_available: null }, { agora: AGORA });
  assert.equal(
    semContagem.criterios.find((c) => c.chave === "disponibilidade").estado,
    "falta_oferta",
    "0 e null são coisas diferentes: um diz esgotado, o outro diz que ninguém contou",
  );
});

/* ══════════════════════════════════════════════════════════════════════════
 * O MOTOR NÃO INVENTA CONDIÇÃO — a lei do dono
 * ══════════════════════════════════════════════════════════════════════════ */

test("sem regra de pagamento declarada, entrada e renda NÃO são estimadas", () => {
  // `developer_payment_flow_rules` tem 0 linhas no banco canônico. Calcular
  // parcela exigiria arbitrar juros e prazo — "inventar condições", proibido.
  const semRegra = { ...imovelCompleto, tem_regra_de_pagamento: false, entrada_percentual: null, parcelas: null };
  const p = pontuarCompatibilidade(clienteCompleto, semRegra, { agora: AGORA });

  for (const chave of ["valorDeEntrada", "rendaEstimada", "financiamento"]) {
    const c = p.criterios.find((x) => x.chave === chave);
    assert.equal(c.estado, "falta_oferta", `${chave} depende de condição declarada e não pode ser estimado`);
  }
  // E o cliente TEM renda e entrada preenchidas — logo o motor não está apenas
  // repassando a lacuna do cliente: ele está se recusando a arbitrar a condição.
  assert.ok(clienteCompleto.monthly_income > 0 && clienteCompleto.available_down_payment > 0);
});

test("fluxo declarado SEM os números continua sendo lacuna de catálogo", () => {
  // ── A MENTIRA LATENTE QUE ESTE TESTE MATA ─────────────────────────────────
  //
  // A primeira versão avaliava entrada só pelo booleano "existe regra?": bastava
  // o cliente ter entrada > 0 e o critério saía ATENDIDO com a frase "contra
  // regra declarada do imóvel" — comparação que o código nunca fazia. Como não
  // há regra cadastrada hoje, o ramo era inalcançável e a suíte ficava verde. No
  // dia da primeira regra, o motor aprovaria quem tem R$ 1 dizendo que conferiu.
  const soBooleano = { ...imovelCompleto, tem_regra_de_pagamento: true, entrada_percentual: null, parcelas: null };
  const p = pontuarCompatibilidade(clienteCompleto, soBooleano, { agora: AGORA });

  assert.equal(p.criterios.find((c) => c.chave === "valorDeEntrada").estado, "falta_oferta",
    "sem percentual não há entrada exigida com que comparar");
  assert.equal(p.criterios.find((c) => c.chave === "rendaEstimada").estado, "falta_oferta",
    "sem número de parcelas não há parcela com que comparar");
  // O fluxo em si, esse sim, está declarado — e só ele pode ser avaliado.
  assert.equal(p.criterios.find((c) => c.chave === "financiamento").estado, "atendido");
});

test("com a regra declarada, entrada é COMPARADA de verdade — nos dois sentidos", () => {
  // Fórmula igual à de `calculatePaymentScenario`: entrada = preço × percentual.
  // price_min 400000 × 20% = 80000 exigidos.
  const comRegra = { ...imovelCompleto, tem_regra_de_pagamento: true, entrada_percentual: 20, parcelas: 60 };

  const cabe = pontuarCompatibilidade(
    { ...clienteCompleto, available_down_payment: 60000, fgts_balance: 30000 },
    comRegra,
    { agora: AGORA },
  );
  const atendida = cabe.criterios.find((c) => c.chave === "valorDeEntrada");
  assert.equal(atendida.estado, "atendido", "90.000 disponíveis cobrem os 80.000 exigidos");
  assert.match(atendida.detalhe, /80000/, "o detalhe precisa mostrar a entrada exigida calculada");

  const naoCabe = pontuarCompatibilidade(
    { ...clienteCompleto, available_down_payment: 1, fgts_balance: null },
    comRegra,
    { agora: AGORA },
  );
  assert.equal(
    naoCabe.criterios.find((c) => c.chave === "valorDeEntrada").estado,
    "nao_atendido",
    "R$ 1 de entrada NÃO pode passar — era exatamente o que a versão anterior aprovava",
  );
});

test("renda: a parcela desejada pelo CLIENTE ganha da suposição de percentual", () => {
  // A palavra do cliente é dado; 30% da renda é convenção. Quando as duas
  // existem, o motor usa a do cliente e não introduz suposição nenhuma.
  const comRegra = { ...imovelCompleto, tem_regra_de_pagamento: true, entrada_percentual: 20, parcelas: 100 };
  // parcela linear = (400000 - 80000) / 100 = 3200
  const p = pontuarCompatibilidade(
    { ...clienteCompleto, desired_monthly_payment: 3500, monthly_income: 1000 },
    comRegra,
    { agora: AGORA },
  );
  const renda = p.criterios.find((c) => c.chave === "rendaEstimada");
  assert.equal(renda.estado, "atendido", "3200 cabe nos 3500 que o cliente declarou");
  assert.match(renda.detalhe, /declarou querer pagar/, "e o detalhe diz que usou a palavra do cliente");
  assert.doesNotMatch(renda.detalhe, /SUPOSIÇÃO/, "com a parcela declarada, nenhuma suposição entra");

  const aperta = pontuarCompatibilidade(
    { ...clienteCompleto, desired_monthly_payment: 1000, monthly_income: 999999 },
    comRegra,
    { agora: AGORA },
  );
  assert.equal(aperta.criterios.find((c) => c.chave === "rendaEstimada").estado, "nao_atendido",
    "renda alta não pode sobrepor a parcela que o cliente disse aceitar");
});

test("renda: quando só há renda, a SUPOSIÇÃO aparece na frase que o corretor lê", () => {
  // Se a convenção de 30% for usada, ela tem de estar visível — não pode passar
  // por número apurado. É a regra do dono sobre não inventar métrica, aplicada
  // ao caso em que a conta é inevitável.
  const comRegra = { ...imovelCompleto, tem_regra_de_pagamento: true, entrada_percentual: 20, parcelas: 100 };
  const p = pontuarCompatibilidade(
    { ...clienteCompleto, desired_monthly_payment: null, monthly_income: 20000 },
    comRegra,
    { agora: AGORA },
  );
  const renda = p.criterios.find((c) => c.chave === "rendaEstimada");
  assert.match(renda.detalhe, /SUPOSIÇÃO declarada de 30% da renda/, "a suposição precisa estar escrita");
  assert.match(renda.detalhe, /não análise de crédito/, "e precisa negar o que ela não é");
});

test("o motor não deriva orçamento a partir de renda", () => {
  // A tentação clássica: "ganha 20 mil, então pode pagar X". Isso é preço
  // inventado. Sem `budget_*`, faixa de preço fica ausente mesmo com renda alta.
  const soRenda = { id: "so-renda", monthly_income: 50000, preferred_bedrooms: 2 };
  const p = pontuarCompatibilidade(soRenda, imovelCompleto, { agora: AGORA });
  assert.equal(p.criterios.find((c) => c.chave === "faixaDePreco").estado, "falta_cliente");
});

test("o motor não lê dormitório nem vaga do TEXTO da tipologia", () => {
  // As 6 tipologias reais dizem "NR 1 dormitório — 35 a 42 m², sem vaga" no NOME,
  // com as colunas nulas. Ler prosa para preencher coluna estruturada é
  // adivinhação com cara de dado — o motor relata a lacuna e não adivinha.
  const ofertas = agregarOfertas(
    [{ id: "d1", name: "Tiê", updated_at: AGORA.toISOString() }],
    [
      { development_id: "d1", name: "NR 1 dormitório — 35 a 42 m², sem vaga", private_area: 35, bedrooms: null, parking_spaces: null, units_available: null, price_from: null, price_to: null },
      { development_id: "d1", name: "2 dormitórios com 1 suíte — 59 a 61 m², com 1 vaga", private_area: 59, bedrooms: null, parking_spaces: null, units_available: null, price_from: null, price_to: null },
    ],
    false,
  );
  assert.equal(ofertas[0].bedrooms_min, null, "o nome diz '1 dormitório' e a coluna é nula: fica NULA");
  assert.equal(ofertas[0].parking_spaces_max, null, "o nome diz 'com 1 vaga' e a coluna é nula: fica NULA");
  assert.equal(ofertas[0].private_area_min, 35, "metragem, essa sim, vem da coluna preenchida");
  assert.equal(ofertas[0].private_area_max, 59);
});

test("aderência NUNCA viaja sem cobertura", () => {
  // 100% de aderência sobre 1 critério de 14 não é compatibilidade — é
  // ignorância bem apresentada. As duas medidas saem juntas, sempre.
  const p = pontuarCompatibilidade({ id: "x", purpose: "morar", preferred_bedrooms: 2 }, imovelCompleto, { agora: AGORA });
  assert.equal(typeof p.aderencia, "number");
  assert.equal(typeof p.cobertura, "number");
  assert.ok(p.cobertura < 0.5, "cobertura baixa precisa aparecer ao lado da aderência alta");
  assert.equal(p.pontosTotais, CRITERIOS.reduce((s, c) => s + c.peso, 0), "o denominador é auditável");
});

/* ══════════════════════════════════════════════════════════════════════════
 * NORMALIZAÇÃO — os defeitos que só o dado real revela
 * ══════════════════════════════════════════════════════════════════════════ */

test("bairro: acento, espaço e barra — as três formas medidas na base", () => {
  assert.deepEqual(normalizarBairro("Vila Olímpia"), ["vilaolimpia"]);
  assert.deepEqual(normalizarBairro("vilaolímpia"), ["vilaolimpia"], "o valor real chegou SEM espaço");
  assert.deepEqual(normalizarBairro("perdizes/pompeia"), ["perdizes", "pompeia"], "dois bairros num campo");
  assert.deepEqual(normalizarBairro("Perdizes"), ["perdizes"]);
  assert.deepEqual(normalizarBairro(null), []);
});

test("bairro: 'perdizes/pompeia' encontra 'Perdizes' — o cliente real vê o imóvel real", () => {
  // Sem a quebra na barra este cliente (cd3d66f3, medido na base) pediria
  // Perdizes e não veria o Inside Perdizes. Comparação de texto cru falharia.
  const p = pontuarCompatibilidade(
    { id: "real", preferred_neighborhoods: ["perdizes/pompeia"] },
    { ...imovelCompleto, neighborhood: "Perdizes" },
    { agora: AGORA },
  );
  assert.equal(p.criterios.find((c) => c.chave === "bairro").estado, "atendido");
});

test("bairro: o outro lado — bairro pedido que NÃO existe no imóvel reprova", () => {
  const p = pontuarCompatibilidade(
    { id: "real", preferred_neighborhoods: ["brooklin"] },
    { ...imovelCompleto, neighborhood: "Perdizes" },
    { agora: AGORA },
  );
  assert.equal(p.criterios.find((c) => c.chave === "bairro").estado, "nao_atendido");
});

test("finalidade: as SEIS grafias reais viram duas ideias", () => {
  // Medido: morar 58 · Moradia 42 · investir 37 · Investimento 35 ·
  // investimento 3 · moradia 3. Texto cru trataria morar e Moradia como
  // diferentes e quebraria o critério para ~100 clientes que responderam.
  for (const t of ["morar", "Moradia", "moradia"]) assert.equal(normalizarFinalidade(t), "moradia", t);
  for (const t of ["investir", "Investimento", "investimento"]) assert.equal(normalizarFinalidade(t), "investimento", t);
  assert.equal(normalizarFinalidade(null), null);
  assert.equal(normalizarFinalidade("sei lá"), null, "o que não se reconhece fica null, não vira palpite");
});

test("dormitórios: 0 é STUDIO, não ausência", () => {
  // 2 clientes reais pedem 0 e o Tiê Aclimação tem bedrooms_min 0. Um `||` no
  // lugar de `??` trataria os dois zeros como falta e perderia justamente o
  // encaixe de studio, que é o produto principal do catálogo.
  const p = pontuarCompatibilidade(
    { id: "studio", preferred_bedrooms: 0 },
    { ...imovelCompleto, bedrooms_min: 0, bedrooms_max: 2 },
    { agora: AGORA },
  );
  const dorm = p.criterios.find((c) => c.chave === "dormitorios");
  assert.equal(dorm.estado, "atendido", "0 dormitório é pedido legítimo e o imóvel oferece studio");
  assert.notEqual(dorm.estado, "falta_cliente", "0 não pode ser lido como ausência");
});

test("faixa: borda nula é ABERTA, não zero", () => {
  // 8 clientes reais têm budget_min e apenas 1 tem budget_max. Ler o max ausente
  // como 0 fecharia a faixa em [min, 0] e reprovaria todo mundo.
  assert.equal(faixasSeCruzam(350000, null, 400000, 900000), true, "orçamento aberto acima alcança o imóvel");
  assert.equal(faixasSeCruzam(3499998, null, 400000, 900000), false, "piso acima do teto do imóvel não cruza");
  assert.equal(faixasSeCruzam(null, null, 400000, 900000), null, "sem borda de um lado, não há veredito");
  assert.equal(faixasSeCruzam(350000, null, null, null), null);
});

test("faixa: cliente com só budget_min alto é REPROVADO, não aprovado por dúvida", () => {
  const p = pontuarCompatibilidade(
    { id: "caro", budget_min: 3499998, preferred_bedrooms: 2 },
    imovelCompleto,
    { agora: AGORA },
  );
  assert.equal(p.criterios.find((c) => c.chave === "faixaDePreco").estado, "nao_atendido");
});

test("raio: sem geo no imóvel a distância é lacuna de CADASTRO, não do cliente", () => {
  // Medido: latitude/longitude nulas em 4 de 4 empreendimentos reais. O critério
  // "raio" que o dono pediu é HOJE incalculável para o catálogo inteiro, e o
  // motor precisa dizer isso em vez de omitir o critério.
  const p = pontuarCompatibilidade(clienteCompleto, { ...imovelCompleto, latitude: null, longitude: null }, { agora: AGORA });
  assert.equal(p.criterios.find((c) => c.chave === "raio").estado, "falta_oferta");
});

test("raio: coordenada NEGATIVA é o Brasil, não ausência de dado", () => {
  // ── O DEFEITO QUE ESTE TESTE PEGOU ────────────────────────────────────────
  //
  // O motor validava coordenada com o mesmo helper de preço, que recusa
  // negativo — e a latitude de São Paulo é -23,53. Resultado: para um imóvel com
  // as DUAS colunas preenchidas, a resposta era "Imóvel sem latitude/longitude".
  // Pior que score errado: mandaria a operação preencher coluna já preenchida.
  //
  // O dado vivo não teria exposto isto (geo nulo em 4 de 4), e é por isso que
  // este cenário usa imóvel sintético completo.
  const p = pontuarCompatibilidade(clienteCompleto, imovelCompleto, { agora: AGORA });
  const raio = p.criterios.find((c) => c.chave === "raio");
  assert.notEqual(raio.estado, "falta_oferta", "as duas coordenadas existem — não pode dizer que faltam");
  assert.equal(raio.estado, "atendido");
  assert.match(raio.detalhe, /km/, "o detalhe precisa mostrar a distância medida");

  // E o zero exato continua sendo placeholder, não Golfo da Guiné como endereço.
  const zerado = pontuarCompatibilidade(clienteCompleto, { ...imovelCompleto, latitude: 0, longitude: 0 }, { agora: AGORA });
  assert.equal(zerado.criterios.find((c) => c.chave === "raio").estado, "falta_oferta");
});

test("raio: com geo dos dois lados, a distância decide — e decide nos dois sentidos", () => {
  const perto = pontuarCompatibilidade(clienteCompleto, imovelCompleto, { agora: AGORA });
  assert.equal(perto.criterios.find((c) => c.chave === "raio").estado, "atendido");

  const longe = pontuarCompatibilidade(
    clienteCompleto,
    { ...imovelCompleto, latitude: -23.95, longitude: -46.33 },
    { agora: AGORA },
  );
  assert.equal(longe.criterios.find((c) => c.chave === "raio").estado, "nao_atendido");
  assert.ok(distanciaKm(-23.5333, -46.68, -23.95, -46.33) > 5);
});

/* ══════════════════════════════════════════════════════════════════════════
 * ALTERNATIVAS — indisponível COM MOTIVO, nunca calada
 * ══════════════════════════════════════════════════════════════════════════ */

test("alternativa mais barata: sem preço no catálogo, a recusa é NOMEADA", () => {
  const semPreco = [
    { ...imovelCompleto, price_min: null, price_max: null },
    { ...imovelCompleto, id: "b", name: "B", price_min: null, price_max: null },
  ];
  const r = recomendarPara(clienteCompleto, semPreco, { agora: AGORA });
  assert.equal(r.alternativaMaisBarata.indisponivel, true);
  assert.match(r.alternativaMaisBarata.motivo, /preço/, "a tela precisa poder dizer que falta PREÇO, não que não há opção");
});

test("alternativa mais barata: com preço, ela aparece com economia calculada", () => {
  const ofertas = [
    imovelCompleto,
    { ...imovelCompleto, id: "barato", name: "Barato", price_min: 300000, price_max: 350000 },
    { ...imovelCompleto, id: "medio", name: "Médio", price_min: 380000, price_max: 420000 },
    { ...imovelCompleto, id: "outro", name: "Outro", price_min: 500000, price_max: 600000 },
    { ...imovelCompleto, id: "quinto", name: "Quinto", price_min: 700000, price_max: 800000 },
  ];
  const r = recomendarPara(clienteCompleto, ofertas, { agora: AGORA });
  assert.equal(r.top.length, 3);
  assert.ok(!("indisponivel" in r.alternativaMaisBarata), "há preço: a alternativa existe");
  assert.ok(!r.top.some((t) => t.ofertaId === r.alternativaMaisBarata.ofertaId), "a alternativa fica FORA do top");
  assert.equal(typeof r.alternativaMaisBarata.economia, "number");
});

test("alternativa próxima: sem bairro do cliente, a recusa também é nomeada", () => {
  const r = recomendarPara({ id: "x", preferred_bedrooms: 2 }, [imovelCompleto], { agora: AGORA });
  assert.equal(r.alternativaProxima.indisponivel, true);
  assert.match(r.alternativaProxima.motivo, /bairro/);
});

test("alternativa próxima: com bairro pedido, devolve o imóvel de fora do top", () => {
  const ofertas = [
    imovelCompleto,
    { ...imovelCompleto, id: "b", name: "B", bedrooms_min: 1, bedrooms_max: 1 },
    { ...imovelCompleto, id: "c", name: "C", bedrooms_min: 1, bedrooms_max: 1 },
    { ...imovelCompleto, id: "vizinho", name: "Vizinho", neighborhood: "Perdizes", bedrooms_min: 1, bedrooms_max: 1 },
  ];
  const r = recomendarPara(clienteCompleto, ofertas, { agora: AGORA });
  assert.equal(r.top.length, 3);
  assert.ok(!("indisponivel" in r.alternativaProxima), `esperava alternativa próxima, veio ${JSON.stringify(r.alternativaProxima)}`);
  assert.ok(!r.top.some((t) => t.ofertaId === r.alternativaProxima.ofertaId));
});

/* ══════════════════════════════════════════════════════════════════════════
 * DETERMINISMO E AGREGAÇÃO
 * ══════════════════════════════════════════════════════════════════════════ */

test("o motor é determinístico: mesma entrada, mesma saída", () => {
  // Sem o desempate por nome, a ordem do top depende do `sort` e o "três mais
  // compatíveis" muda sozinho entre duas leituras da mesma tela.
  const ofertas = [
    { ...imovelCompleto, id: "z", name: "Zebra" },
    { ...imovelCompleto, id: "a", name: "Abacate" },
    { ...imovelCompleto, id: "m", name: "Manga" },
    { ...imovelCompleto, id: "b", name: "Banana" },
  ];
  const um = recomendarPara(clienteCompleto, ofertas, { agora: AGORA });
  const dois = recomendarPara(clienteCompleto, [...ofertas].reverse(), { agora: AGORA });
  assert.deepEqual(um.top.map((t) => t.ofertaId), dois.top.map((t) => t.ofertaId), "empate resolvido por nome, não pela ordem de entrada");
});

test("agregação: vaga usa MÁXIMO e estoque usa SOMA, com null preservado", () => {
  const ofertas = agregarOfertas(
    [{ id: "d1", name: "Dev", updated_at: AGORA.toISOString() }],
    [
      { development_id: "d1", parking_spaces: 1, units_available: 3, price_from: 300000, price_to: 350000, private_area: 30, bedrooms: 1 },
      { development_id: "d1", parking_spaces: 2, units_available: 4, price_from: 500000, price_to: 600000, private_area: 60, bedrooms: 2 },
    ],
    true,
  );
  assert.equal(ofertas[0].parking_spaces_max, 2, "MÁXIMO: 'tem unidade com vaga?' é a pergunta do cliente");
  assert.equal(ofertas[0].units_available, 7, "SOMA: estoque do empreendimento");
  assert.equal(ofertas[0].price_min, 300000);
  assert.equal(ofertas[0].price_max, 600000);
  assert.equal(ofertas[0].bedrooms_min, 1);
  assert.equal(ofertas[0].bedrooms_max, 2);
});

test("agregação: estoque todo nulo NÃO virou zero", () => {
  // `sum` de nulos daria 0, e "0 disponível" é afirmação FORTE e falsa: diria
  // esgotado onde o certo é "ninguém contou". É o caminho que o dado real
  // percorre hoje — 6 de 6 tipologias com units_available nulo.
  const ofertas = agregarOfertas(
    [{ id: "d1", name: "Dev", updated_at: AGORA.toISOString() }],
    [
      { development_id: "d1", parking_spaces: null, units_available: null, price_from: null, price_to: null, private_area: 24, bedrooms: null },
      { development_id: "d1", parking_spaces: null, units_available: null, price_from: null, price_to: null, private_area: 61, bedrooms: null },
    ],
    false,
  );
  assert.equal(ofertas[0].units_available, null, "null preservado — 0 diria 'esgotado'");
  assert.equal(ofertas[0].parking_spaces_max, null);
  assert.equal(ofertas[0].price_min, null);
});

test("agregação: tipologia de OUTRO empreendimento não entra na conta", () => {
  const ofertas = agregarOfertas(
    [{ id: "d1", name: "A", updated_at: AGORA.toISOString() }, { id: "d2", name: "B", updated_at: AGORA.toISOString() }],
    [{ development_id: "d2", units_available: 99, parking_spaces: 3, private_area: 50 }],
    false,
  );
  assert.equal(ofertas.find((o) => o.id === "d1").units_available, null, "o estoque do vizinho não é o meu");
  assert.equal(ofertas.find((o) => o.id === "d2").units_available, 99);
});

/* ══════════════════════════════════════════════════════════════════════════
 * O DIAGNÓSTICO DA CARTEIRA — a medição, e os DOIS LADOS dela
 * ══════════════════════════════════════════════════════════════════════════ */

test("diagnóstico: conta quem dá para recomendar e quem NÃO dá", () => {
  const clientes = [
    { id: "1", preferred_bedrooms: 2 },
    { id: "2", preferred_neighborhoods: ["Perdizes"] },
    { id: "3" },
    { id: "4", purpose: "morar" },
  ];
  const d = diagnosticarCarteira(clientes, [imovelCompleto], { agora: AGORA });
  assert.equal(d.clientes, 4);
  assert.equal(d.comRecomendacao, 2, "só os dois com critério decisivo");
  assert.equal(d.semRecomendacao, 2, "finalidade sozinha NÃO é decisiva — e o cliente vazio muito menos");
  assert.equal(d.proporcaoComRecomendacao, 0.5);
});

test("diagnóstico: sem catálogo, ninguém recebe recomendação", () => {
  // Medido: 268 leads vivem em organizações com ZERO empreendimentos. Para elas
  // o matching é impossível por falta de OFERTA, e o motor não pode fingir.
  const d = diagnosticarCarteira([clienteCompleto, { id: "b", preferred_bedrooms: 2 }], [], { agora: AGORA });
  assert.equal(d.comRecomendacao, 0);
  assert.equal(d.proporcaoComRecomendacao, 0);
});

test("diagnóstico: as perguntas mais frequentes saem ordenadas por quantos clientes destravam", () => {
  const clientes = [
    { id: "1", preferred_bedrooms: 2, preferred_neighborhoods: ["Perdizes"] },
    { id: "2", preferred_bedrooms: 2 },
    { id: "3", preferred_bedrooms: 2 },
  ];
  const d = diagnosticarCarteira(clientes, [imovelCompleto], { agora: AGORA });
  const contagens = d.perguntasMaisFrequentes.map((p) => p.clientes);
  assert.deepEqual([...contagens].sort((a, b) => b - a), contagens, "a fila de perguntas precisa começar pela que serve a mais gente");
  const bairro = d.perguntasMaisFrequentes.find((p) => p.chave === "bairro");
  assert.equal(bairro.clientes, 2, "dois clientes não informaram bairro");
});

/* ══════════════════════════════════════════════════════════════════════════
 * A ROTA — escopo compartilhado, e nenhuma cópia da regra de quem vê o quê
 * ══════════════════════════════════════════════════════════════════════════ */

test("a rota de compatibilidade usa o escopo COMPARTILHADO, não uma cópia", () => {
  // A classe de defeito mais cara desta base é a segunda cópia da regra de
  // "quem vê o quê". Esta rota lê leads, então ela TEM de passar pelo módulo.
  const rota = ler("app", "api", "v1", "crm", "compatibilidade", "route.ts");
  assert.match(rota, /from "@\/lib\/crm\/escopo-de-leitura"/, "o recorte vem do módulo único");
  assert.match(rota, /aplicarPisoDeCarteira\(/, "e é APLICADO, não só importado");
  // Ignora a linha do import ao cobrar o uso: o identificador sobrevive nela e
  // um grep solto passaria com a chamada apagada — armadilha já medida aqui.
  const semImports = rota.replace(/^import[\s\S]*?;$/gm, "");
  assert.match(semImports, /aplicarPisoDeCarteira\(/, "a chamada precisa existir FORA da linha de import");
  assert.doesNotMatch(
    semImports,
    /assigned_user_id\.eq\.\$\{/,
    "montar o filtro de posse à mão aqui recriaria a divergência que o módulo existe para impedir",
  );
});

test("a rota é de LEITURA e não escreve nada", () => {
  const rota = ler("app", "api", "v1", "crm", "compatibilidade", "route.ts");
  assert.match(rota, /export async function GET/);
  assert.doesNotMatch(rota, /export async function (POST|PUT|PATCH|DELETE)/, "o pedido era rota de leitura");
  const semImports = rota.replace(/^import[\s\S]*?;$/gm, "");
  assert.doesNotMatch(semImports, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/, "motor de leitura não grava");
});

test("a rota não promete IA: o motor é determinístico e isso é declarado", () => {
  const rota = ler("app", "api", "v1", "crm", "compatibilidade", "route.ts");
  const semImports = rota.replace(/^import[\s\S]*?;$/gm, "");
  assert.doesNotMatch(semImports, /provider-router|callModel|perplexity|openai|anthropic/i,
    "regras determinísticas ANTES de IA: esta rota não chama provedor nenhum");
  assert.match(rota, /determinist/i, "e diz em voz alta o que é");
});
