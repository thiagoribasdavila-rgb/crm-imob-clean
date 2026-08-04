/**
 * Contrato: FONTE ANTES DO FATO.
 *
 * ── O que este contrato guarda ─────────────────────────────────────────────
 *
 * Este produto vende imóvel, e um número num anúncio é afirmação comercial:
 * "valorização de 12% ao ano", "R$ 14 mil o m²", "entrega em 2027". Sem fonte,
 * é risco jurídico real (publicidade vincula quem anuncia) e risco de bloqueio
 * na Meta.
 *
 * Medido em 02/08/2026: `project_region_sources` — a tabela do estudo de região
 * da Fase 69, com publicador, data, validade e `review_status` — tinha ZERO
 * linha. A única porta de entrada era um formulário manual que ninguém preencheu
 * nunca. A coleta automática abre essa porta, e este contrato existe para que
 * abrir a porta não signifique baixar a régua.
 *
 * As quatro perguntas que ele responde, e que não podem mudar de resposta:
 *
 *   1. a pergunta de pesquisa nasce do CADASTRO (bairro e cidade reais)?
 *   2. afirmação sem fonte, com URL inventada ou vencida, fica de fora?
 *   3. o que a máquina produz nasce PENDENTE — nunca "verified"?
 *   4. o criativo só cita número com fonte verificada e vigente (ou cadastrada)?
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  CATEGORIAS_DE_REGIAO,
  REVIEW_STATUS_DA_MAQUINA,
  VALIDADE_POR_CATEGORIA,
  afirmacoesComFonte,
  bairrosDoCadastro,
  perguntaDeRegiao,
  recortarObjetoJson,
} from "../../lib/marketing/pesquisa-de-regiao.ts";
import {
  PROMESSAS_PROIBIDAS,
  auditarCriativoContraFontes,
  fontesUtilizaveis,
  normalizarNumero,
  numerosSensiveis,
  podarTextosSemLastro,
} from "../../lib/marketing/fato-com-lastro.ts";
import { ACOES_PROIBIDAS_AUTONOMAMENTE, catalogoDeAgentes } from "../../lib/ai/niveis-de-autonomia.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...partes) => fs.readFileSync(path.join(raiz, ...partes), "utf8");

const HOJE = "2026-08-02";
const CITACOES = ["https://www.fipezap.com.br/indice/perdizes", "https://www.metro.sp.gov.br/obras/linha-6"];

/** Uma afirmação completa e legítima — as variações abaixo a estragam de um jeito só. */
const afirmacaoBoa = (extra = {}) => ({
  category: "price_m2",
  title: "Preço médio do m² em Perdizes",
  publisher: "FipeZAP",
  sourceUrl: "https://www.fipezap.com.br/indice/perdizes",
  summary: "O índice aponta preço médio de venda de R$ 13.800 por m² em Perdizes na apuração do mês.",
  referenceDate: "2026-06-01",
  ...extra,
});

const resposta = (afirmacoes) => JSON.stringify({ afirmacoes });

// ---------------------------------------------------------------------------
// 1 · A pergunta nasce do cadastro
// ---------------------------------------------------------------------------

test("a pergunta de pesquisa é montada com o bairro e a cidade REAIS do banco", () => {
  const r = perguntaDeRegiao({ id: "d1", nome: "Inside Perdizes", bairro: "Perdizes", cidade: "São Paulo", estado: "SP" });
  assert.equal(r.problemas.length, 0);
  assert.ok(r.pergunta.includes("Perdizes"), "a pergunta tem de citar o bairro cadastrado");
  assert.ok(r.pergunta.includes("São Paulo"), "a pergunta tem de citar a cidade cadastrada");
  assert.ok(r.pergunta.includes("SP"), "o estado desambigua cidades homônimas");
});

test("empreendimento com vários bairros estuda TODOS — não só o primeiro", () => {
  // "Spin Mood" está cadastrado assim no banco de produção. Estudar só
  // "Perdizes" seria estudar um terço do produto.
  const bairros = bairrosDoCadastro("Perdizes / Vila Madalena / Vila Anglo Brasileira");
  assert.deepEqual(bairros, ["Perdizes", "Vila Madalena", "Vila Anglo Brasileira"]);
  const r = perguntaDeRegiao({ id: "d2", nome: "Spin Mood", bairro: "Perdizes / Vila Madalena / Vila Anglo Brasileira", cidade: "São Paulo", estado: "SP" });
  for (const bairro of bairros) assert.ok(r.pergunta.includes(bairro), `${bairro} ficou fora da pergunta`);
});

test("sem bairro ou sem cidade cadastrados NÃO há pergunta — e o motivo é dito", () => {
  for (const dev of [
    { id: "d3", nome: "X", bairro: null, cidade: "São Paulo", estado: "SP" },
    { id: "d4", nome: "X", bairro: "Perdizes", cidade: null, estado: "SP" },
    { id: "d5", nome: "X", bairro: "", cidade: "", estado: null },
  ]) {
    const r = perguntaDeRegiao(dev);
    assert.equal(r.pergunta, null, "pergunta montada sem o recorte real do cadastro");
    assert.ok(r.problemas.length > 0, "recusa sem motivo é zero desenhado como saúde");
  }
});

// ---------------------------------------------------------------------------
// 2 · Afirmação sem fonte não entra
// ---------------------------------------------------------------------------

test("afirmação completa, citada pelo provedor e vigente é aceita", () => {
  const r = afirmacoesComFonte({ texto: resposta([afirmacaoBoa()]), citacoes: CITACOES, hoje: HOJE });
  assert.equal(r.aceitas.length, 1, `descartes inesperados: ${JSON.stringify(r.descartadas)}`);
  assert.equal(r.descartadas.length, 0);
  const [fonte] = r.aceitas;
  assert.equal(fonte.payload.sourceUrl, "https://www.fipezap.com.br/indice/perdizes");
  assert.equal(fonte.payload.referenceDate, "2026-06-01");
  // A validade é calculada pela categoria, não escolhida pelo modelo.
  assert.equal(fonte.payload.validUntil, "2026-11-28");
  assert.ok(fonte.numerosSensiveis.length > 0, "o número do resumo tem de ser sinalizado para o revisor");
});

test("data de referência igual à da consulta é MARCADA no resumo que o revisor lê", () => {
  // Medido no ensaio a seco de 02/08/2026 (Perdizes): 10 das 11 afirmações
  // aceitas vieram com referenceDate = hoje. Página de índice de portal
  // legitimamente não tem data; artigo sem data também sai assim e ganharia 180
  // dias de validade de brinde. A máquina não sabe separar — então avisa.
  const presumida = afirmacoesComFonte({ texto: resposta([afirmacaoBoa({ referenceDate: HOJE })]), citacoes: CITACOES, hoje: HOJE });
  assert.equal(presumida.aceitas.length, 1);
  assert.equal(presumida.aceitas[0].dataPresumida, true);
  assert.match(presumida.aceitas[0].payload.summary, /Confira a data na fonte/i,
    "o aviso precisa viajar dentro do `summary`, que é o campo que a tela de revisão mostra");

  const datada = afirmacoesComFonte({ texto: resposta([afirmacaoBoa()]), citacoes: CITACOES, hoje: HOJE });
  assert.equal(datada.aceitas[0].dataPresumida, false);
  assert.ok(!/Confira a data na fonte/i.test(datada.aceitas[0].payload.summary), "fonte datada não pode receber aviso de data presumida");
});

test("o aviso do Atlas não vira lastro: os números medidos são os do resumo original", () => {
  const r = afirmacoesComFonte({ texto: resposta([afirmacaoBoa({ referenceDate: HOJE })]), citacoes: CITACOES, hoje: HOJE });
  const valores = r.aceitas[0].numerosSensiveis.map((item) => item.valor);
  assert.ok(valores.includes("13800"), "o número da fonte sumiu do sinal para o revisor");
  assert.ok(!valores.some((valor) => valor.startsWith("2026")), "número do aviso do Atlas entrou como se fosse fato da fonte");
});

test("a URL que o provedor NÃO consultou é recusada — é a trava contra fonte inventada", () => {
  const r = afirmacoesComFonte({
    texto: resposta([afirmacaoBoa({ sourceUrl: "https://portal-de-noticias-inventado.com.br/perdizes" })]),
    citacoes: CITACOES,
    hoje: HOJE,
  });
  assert.equal(r.aceitas.length, 0, "URL fora da lista de citações do provedor entrou");
  assert.match(r.descartadas[0].motivo, /procedência|consultad/i);
});

test("sem NENHUMA citação, nada é aproveitado — mesmo com afirmações bem formadas", () => {
  const r = afirmacoesComFonte({ texto: resposta([afirmacaoBoa(), afirmacaoBoa()]), citacoes: [], hoje: HOJE });
  assert.equal(r.aceitas.length, 0);
  assert.match(r.descartadas[0].motivo, /citação|citac/i);
});

test("cada campo obrigatório da fonte derruba a afirmação sozinho", () => {
  const quebras = [
    ["categoria fora do CHECK", { category: "clima" }],
    ["sem publicador", { publisher: "" }],
    ["URL http, não https", { sourceUrl: "http://www.fipezap.com.br/indice/perdizes" }],
    ["resumo curto demais", { summary: "sobe muito" }],
    ["sem data de referência", { referenceDate: "" }],
    ["data que não existe", { referenceDate: "2026-02-31" }],
    ["data no futuro", { referenceDate: "2027-01-01" }],
  ];
  for (const [nome, extra] of quebras) {
    const r = afirmacoesComFonte({ texto: resposta([afirmacaoBoa(extra)]), citacoes: CITACOES, hoje: HOJE });
    assert.equal(r.aceitas.length, 0, `"${nome}" passou pela conferência`);
    assert.equal(r.descartadas.length, 1, `"${nome}" foi descartada sem motivo registrado`);
    assert.ok(r.descartadas[0].motivo.length > 20, `"${nome}" foi descartada sem explicação útil`);
  }
});

test("fonte antiga demais para a categoria é descartada, não gravada vencida", () => {
  // Preço por m² vale 180 dias. Uma apuração de 2024 num anúncio de 2026 é o
  // número sensível mais perigoso que existe neste mercado.
  const r = afirmacoesComFonte({ texto: resposta([afirmacaoBoa({ referenceDate: "2024-01-10" })]), citacoes: CITACOES, hoje: HOJE });
  assert.equal(r.aceitas.length, 0);
  assert.match(r.descartadas[0].motivo, /vencida/i);
});

test("resposta que não é JSON não vira coleta vazia silenciosa", () => {
  const r = afirmacoesComFonte({ texto: "Não consegui pesquisar agora.", citacoes: CITACOES, hoje: HOJE });
  assert.equal(r.aceitas.length, 0);
  assert.equal(r.descartadas.length, 1);
  assert.match(r.descartadas[0].motivo, /JSON/i);
});

test("o recorte de JSON aguenta cerca de código e texto em volta", () => {
  assert.deepEqual(recortarObjetoJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(recortarObjetoJson('segue o resultado: {"a":{"b":2}} espero ter ajudado'), { a: { b: 2 } });
  assert.equal(recortarObjetoJson("sem json nenhum"), null);
});

// ---------------------------------------------------------------------------
// 3 · O que vem da máquina nasce PENDENTE
// ---------------------------------------------------------------------------

test("a máquina nunca emite 'verified' — nem no tipo, nem no valor, nem no código", () => {
  assert.equal(REVIEW_STATUS_DA_MAQUINA, "pending");
  const r = afirmacoesComFonte({ texto: resposta([afirmacaoBoa()]), citacoes: CITACOES, hoje: HOJE });
  for (const fonte of r.aceitas) assert.equal(fonte.reviewStatus, "pending");

  // E o caminho de escrita não pode conter a palavra: a RPC já força `pending`
  // no insert, mas um `review_status: 'verified'` no payload seria a tentativa.
  for (const arquivo of [
    ["lib", "marketing", "coleta-de-regiao.ts"],
    ["app", "api", "v1", "developments", "[id]", "region-study", "collect", "route.ts"],
  ]) {
    const fonte = ler(...arquivo);
    assert.ok(!/["']verified["']/.test(fonte), `${arquivo.join("/")} escreve o literal 'verified' — verificação é ato humano`);
  }
});

test("a coleta entrega pela MESMA porta da Fase 69 — não cria um segundo caminho", () => {
  const coleta = ler("lib", "marketing", "coleta-de-regiao.ts");
  assert.match(coleta, /upsert_project_region_source/, "a coleta tem de usar a RPC que já existe");
  assert.ok(!/\.from\(\s*["']project_region_sources["']\s*\)\s*\.insert/.test(coleta),
    "insert direto na tabela contornaria a RPC, que é quem força 'pending' e confere o papel do ator");
  assert.match(coleta, /ensaioSeco/, "sem ensaio a seco não dá para provar o fluxo sem escrever em produção");
});

test("a coleta é alcançável por quem revisa — botão na própria tela de revisão", () => {
  // Rota sem porta é código que nunca roda: a Fase 69 inteira existe desde
  // 18/07 e a tabela tem zero linha justamente porque a única porta era digitar
  // seis campos à mão. A coleta não pode repetir isso.
  const pagina = ler("app", "(crm)", "developments", "[id]", "region-study", "page.tsx");
  assert.match(pagina, /region-study\/collect/, "a tela não chama a rota de coleta");
  assert.match(pagina, /ensaioSeco/, "sem ensaio a seco na tela, conferir procedência exige gravar antes");
  assert.match(pagina, /pendente/i, "a tela precisa dizer que o que foi coletado ainda não vale");
  // E continua sendo a MESMA tela que revisa: coleta e revisão no mesmo lugar.
  assert.match(pagina, /Validar/, "a revisão humana sumiu da tela da coleta");
});

test("as 10 categorias não divergem do CHECK do banco nem do config", () => {
  const sql = ler("supabase", "migrations", "20260718193000_phase_69_governed_region_study.sql");
  const check = sql.match(/category text not null check\(category in\(([^)]+)\)\)/i);
  assert.ok(check, "o CHECK de categoria sumiu da migration");
  const doBanco = [...check[1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual([...CATEGORIAS_DE_REGIAO].sort(), doBanco, "categoria fora do CHECK vira region_source_invalid sem pista nenhuma");

  const config = JSON.parse(ler("config", "governed-region-study.json"));
  assert.deepEqual([...CATEGORIAS_DE_REGIAO].sort(), [...config.categories].sort());

  for (const categoria of CATEGORIAS_DE_REGIAO) {
    assert.ok(Number.isInteger(VALIDADE_POR_CATEGORIA[categoria]) && VALIDADE_POR_CATEGORIA[categoria] > 0,
      `categoria ${categoria} sem validade declarada — a validade não pode ser escolhida pelo modelo`);
  }
});

test("o agente da coleta está declarado, e num nível que a escrita exige", () => {
  const agente = catalogoDeAgentes().find((item) => item.agente === "pesquisa-de-regiao");
  assert.ok(agente, "agente não declarado nasce nível 0 e a coleta seria recusada por esquecimento, não por decisão");
  assert.equal(agente.nivel, 3, "gravar fonte pendente é execução interna reversível");
  assert.ok(agente.porque.length > 40, "nível sem justificativa é nível que ninguém revisou");
});

// ---------------------------------------------------------------------------
// 4 · O criativo só cita fato com fonte verificada
// ---------------------------------------------------------------------------

const fonteVerificada = (extra = {}) => ({
  id: "f1",
  category: "price_m2",
  publisher: "FipeZAP",
  sourceUrl: "https://www.fipezap.com.br/indice/perdizes",
  summary: "Preço médio de venda de R$ 13.800 por m² em Perdizes, com valorização de 8,4% em 12 meses.",
  referenceDate: "2026-06-01",
  validUntil: "2026-11-28",
  reviewStatus: "verified",
  ...extra,
});

test("número de mercado SEM fonte verificada reprova a peça", () => {
  const r = auditarCriativoContraFontes({ textos: ["Perdizes com valorização de 12% ao ano."], fontes: [], hoje: HOJE });
  assert.equal(r.aprovado, false);
  assert.equal(r.violacoes.length, 1);
  assert.equal(r.violacoes[0].tipo, "percentual");
  assert.match(r.violacoes[0].motivo, /sem lastro/i);
  assert.deepEqual(r.textosAprovados, [], "texto reprovado não pode constar como aprovado");
});

test("o MESMO número com fonte verificada e vigente é aprovado, e a peça sabe citar a fonte", () => {
  const r = auditarCriativoContraFontes({
    textos: ["Perdizes registrou valorização de 8,4% em 12 meses."],
    fontes: [fonteVerificada()],
    hoje: HOJE,
  });
  assert.equal(r.aprovado, true, JSON.stringify(r.violacoes));
  assert.equal(r.lastros.length, 1);
  assert.equal(r.lastros[0].origem, "fonte_verificada");
  assert.equal(r.lastros[0].fonte.publisher, "FipeZAP");
  assert.equal(r.lastros[0].fonte.sourceUrl, "https://www.fipezap.com.br/indice/perdizes");
});

test("número igual em ASSUNTO diferente não dá lastro", () => {
  // Defeito real, pego por este contrato em 02/08/2026: a fonte dizia
  // "valorização de 8,4% em 12 MESES" e a comparação era só pelo valor, então o
  // 12 de "12 meses" dava lastro a "valorização de 12% ao ano" — um número
  // inventado saía aprovado citando uma fonte de verdade, que é o pior desfecho
  // possível: parece conferido.
  const doDozeMeses = auditarCriativoContraFontes({
    textos: ["Perdizes com valorização de 12% ao ano."],
    fontes: [fonteVerificada()],
    hoje: HOJE,
  });
  assert.equal(doDozeMeses.aprovado, false, "'12 meses' na fonte deu lastro a '12%' na peça");

  const assuntoTrocado = auditarCriativoContraFontes({
    textos: ["Vacância de 8,4% na região."],
    fontes: [fonteVerificada()],
    hoje: HOJE,
  });
  assert.equal(assuntoTrocado.aprovado, false, "percentual de valorização virou percentual de vacância");
});

test("preço colado na pontuação continua sendo visto pelo portão", () => {
  // Outro defeito pego aqui: "R$ 450.000," levava a vírgula junto na captura,
  // a normalização falhava e o preço ficava INVISÍVEL — número invisível é
  // número sem lastro que passa.
  const r = auditarCriativoContraFontes({ textos: ["Studios a partir de R$ 450.000, prontos para morar."], fontes: [], hoje: HOJE });
  assert.equal(r.aprovado, false, "preço grudado na vírgula passou sem ser conferido");
  assert.equal(r.violacoes[0].tipo, "preco");
});

test("fonte PENDENTE não dá lastro — é exatamente o estado em que a coleta nasce", () => {
  const r = auditarCriativoContraFontes({
    textos: ["Perdizes registrou valorização de 8,4% em 12 meses."],
    fontes: [fonteVerificada({ reviewStatus: REVIEW_STATUS_DA_MAQUINA })],
    hoje: HOJE,
  });
  assert.equal(r.aprovado, false, "fonte recém-coletada pela máquina liberou número em anúncio");
  assert.equal(r.fontesUtilizaveis, 0);
  assert.match(r.fontesIgnoradas[0].motivo, /verificada por uma pessoa/i);
});

test("fonte verificada mas VENCIDA não dá lastro", () => {
  const r = auditarCriativoContraFontes({
    textos: ["Perdizes registrou valorização de 8,4% em 12 meses."],
    fontes: [fonteVerificada({ validUntil: "2026-07-31" })],
    hoje: HOJE,
  });
  assert.equal(r.aprovado, false, "número de mercado fora da validade sustentou anúncio de hoje");
  assert.match(r.fontesIgnoradas[0].motivo, /vencida/i);
});

test("preço do PRÓPRIO produto tem lastro no cadastro, não na web", () => {
  // Sem isto o portão reprovaria "a partir de R$ 450.000" quando 450000 é
  // literalmente o price_min da linha de developments — o jeito mais rápido de
  // alguém desligar o portão.
  const aprovado = auditarCriativoContraFontes({
    textos: ["Studios em Perdizes a partir de R$ 450.000, entrega em 2027."],
    fontes: [],
    // POR COLUNA: array plano deixava `total_units = 80` lastrear "80 metros".
    cadastro: { price_min: 450000, delivery_date: "2027-12-31" },
    hoje: HOJE,
  });
  assert.equal(aprovado.aprovado, true, JSON.stringify(aprovado.violacoes));
  assert.deepEqual(aprovado.lastros.map((item) => item.origem), ["cadastro", "cadastro"]);

  const reprovado = auditarCriativoContraFontes({
    textos: ["Studios em Perdizes a partir de R$ 390.000."],
    fontes: [],
    cadastro: { price_min: 450000 },
    hoje: HOJE,
  });
  assert.equal(reprovado.aprovado, false, "preço que não está no cadastro passou como se estivesse");
});

test("promessa de preço/estoque e de crédito é recusada MESMO com fonte verificada", () => {
  const textos = [
    "Financiamento aprovado na hora para o seu novo apartamento.",
    "Últimas unidades com preço garantido até sexta.",
  ];
  const r = auditarCriativoContraFontes({ textos, fontes: [fonteVerificada()], hoje: HOJE });
  assert.equal(r.aprovado, false);
  const acoes = [...new Set(r.violacoes.map((item) => item.acaoProibida).filter(Boolean))].sort();
  assert.deepEqual(acoes, ["garantir_preco_ou_estoque", "prometer_financiamento"]);
  for (const violacao of r.violacoes) assert.match(violacao.motivo, /nível 5|nivel 5/i);
});

test("as ações proibidas citadas aqui existem no catálogo do nível 5", () => {
  // Se `niveis-de-autonomia.ts` renomear uma ação, este portão passa a citar uma
  // classe que não existe mais — e a recusa vira texto sem lastro nenhum.
  const declaradas = new Set(ACOES_PROIBIDAS_AUTONOMAMENTE.map((item) => item.acao));
  for (const promessa of PROMESSAS_PROIBIDAS) {
    assert.ok(declaradas.has(promessa.acao), `"${promessa.acao}" não está em ACOES_PROIBIDAS_AUTONOMAMENTE`);
    assert.ok(promessa.porque.length > 30, "recusa sem porquê não ensina nada a quem escreveu a peça");
  }
});

test("a poda devolve só o que tem lastro, e diz o que caiu", () => {
  const textos = [
    "Studios prontos para morar em Perdizes.",
    "Valorização de 12% ao ano garantida na região.",
    "Perdizes registrou valorização de 8,4% em 12 meses.",
  ];
  const r = podarTextosSemLastro({ textos, fontes: [fonteVerificada()], hoje: HOJE });
  assert.deepEqual(r.mantidos, [textos[0], textos[2]]);
  assert.equal(r.removidos.length, 1);
  assert.equal(r.removidos[0].texto, textos[1]);
  assert.ok(r.removidos[0].motivo.length > 30);
});

test("a leitura de número em português não faz o portão reprovar o que está certo", () => {
  assert.equal(normalizarNumero("R$ 450.000".replace("R$ ", "")), "450000");
  assert.equal(normalizarNumero("13.800"), "13800");
  assert.equal(normalizarNumero("8,4"), "8.4");
  assert.equal(normalizarNumero("8,40"), "8.4");
  assert.equal(normalizarNumero("1.234,56"), "1234.56");
  // "R$ 500 mil" e "500000" são o mesmo número — sem a escala, a peça citaria
  // meio milhão e o portão procuraria por "500".
  const [numero] = numerosSensiveis("Studios a partir de R$ 500 mil.");
  assert.equal(numero.valor, "500000");
});

test("número que NÃO é afirmação de mercado não é barrado", () => {
  // Um portão que reprova "portaria 24 horas" vira ruído e alguém o desliga.
  const r = auditarCriativoContraFontes({ textos: ["Portaria 24 horas e 3 opções de planta."], fontes: [], hoje: HOJE });
  assert.equal(r.aprovado, true, JSON.stringify(r.violacoes));
});

test("fontesUtilizaveis é o único juiz de 'o que serve' — e explica cada exclusão", () => {
  const { utilizaveis, ignoradas } = fontesUtilizaveis(
    [
      fonteVerificada({ id: "ok" }),
      fonteVerificada({ id: "pendente", reviewStatus: "pending" }),
      fonteVerificada({ id: "rejeitada", reviewStatus: "rejected" }),
      fonteVerificada({ id: "vencida", validUntil: "2020-01-01" }),
    ],
    HOJE,
  );
  assert.deepEqual(utilizaveis.map((item) => item.id), ["ok"]);
  assert.deepEqual(ignoradas.map((item) => item.id).sort(), ["pendente", "rejeitada", "vencida"]);
  for (const ignorada of ignoradas) assert.ok(ignorada.motivo.length > 20);
});

test("a rota de lastro não aprova por falha: erro de leitura vira recusa, não liberação", () => {
  const rota = ler("app", "api", "v1", "developments", "[id]", "region-study", "lastro", "route.ts");
  assert.match(rota, /LASTRO_INDISPONIVEL/, "a rota precisa ter um desfecho de erro nomeado");
  assert.match(rota, /NÃO liberado/i, "a resposta de erro precisa dizer que não é aprovação");
  const servidor = ler("lib", "marketing", "lastro-do-criativo.ts");
  assert.match(servidor, /leituraIncompleta/, "sem esse sinal, falha de banco vira 'não há fonte' e libera a peça");
});

test("o numero de UNIDADES nao lastreia uma distancia — o saco unico era o defeito", () => {
  // ── ACHADO POR UM CÉTICO EM 02/08/2026 ────────────────────────────────────
  //
  // As seis colunas de lastro viravam um SACO ÚNICO de números sem tipo, e
  // qualquer um casava com qualquer tipo permitido. `distancia` estava entre os
  // tipos com lastro de cadastro — e não existe coluna de distância.
  //
  // Efeito concreto: prédio com `total_units = 80` dava aval de "cadastro" à
  // frase "a 80 metros do metrô". Distância é afirmação sobre o MUNDO, e num
  // anúncio de imóvel é exatamente o que precisa de fonte verificada.
  const r = auditarCriativoContraFontes({
    textos: ["Studios a 80 metros do metrô."],
    fontes: [],
    cadastro: { total_units: 80, price_min: 450000 },
    hoje: HOJE,
  });
  assert.equal(r.aprovado, false, "a distância ganhou lastro do número de unidades");
  assert.ok(
    r.violacoes.some((v) => /80/.test(v.trecho || "")),
    "a violação precisa apontar o número que ficou sem fonte",
  );
});

test("preco por m2 NAO se lastreia num preco cru — derivado precisa de fonte", () => {
  // Motivo diferente do da distância: `preco_por_m2` é valor DERIVADO e o
  // cadastro não guarda nenhum. Casá-lo com `price_min` daria a "R$ 12.400/m²"
  // o aval de um preço de 450.000 só porque os dois são "preço".
  const r = auditarCriativoContraFontes({
    textos: ["Perdizes a R$ 12.400 por m²."],
    fontes: [],
    cadastro: { price_min: 12400 },
    hoje: HOJE,
  });
  assert.equal(r.aprovado, false, "preço por m² foi aprovado por um preço cru de mesmo valor");
});

test("o preco do proprio produto CONTINUA passando — o portao nao virou muro", () => {
  // O outro lado: apertar sem este caso transformaria o portão em muro, e muro
  // é desligado na primeira semana.
  const r = auditarCriativoContraFontes({
    textos: ["Studios a partir de R$ 450.000."],
    fontes: [],
    cadastro: { price_min: 450000 },
    hoje: HOJE,
  });
  assert.equal(r.aprovado, true, JSON.stringify(r.violacoes));
});
