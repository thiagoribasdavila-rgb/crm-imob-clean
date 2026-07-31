/**
 * Contrato: O CENTRO DE CUSTO NÃO PUBLICA NÚMERO QUE NÃO MEDIU.
 *
 * ── A ASSERÇÃO CENTRAL ───────────────────────────────────────────────────────
 *
 * Um painel de custos que inventa número é pior que painel nenhum. Este arquivo
 * EXECUTA o portão de publicação e cobra que ele reprove as formas conhecidas de
 * mentir — em primeiro lugar a mais provável de todas: trocar "não medido" por 0.
 *
 * A mutação correspondente em `scripts/mutacoes.mjs` (M25) faz exatamente isso no
 * código de produção. Se este arquivo ficar verde com ela aplicada, ele é
 * decorativo.
 *
 * ── POR QUE AS REGRAS DE LINHA FORAM TIRADAS DA ROTA ─────────────────────────
 *
 * Uma rota do App Router não é carregável por `node --test`: o contrato só
 * conseguiria raspar o arquivo com regex, e regex prova que alguém escreveu o
 * texto certo, não que o comportamento acontece. Três pontos cegos deste
 * repositório passaram por "protegido por contrato" desse jeito.
 *
 * Então `linhasDeIa` e `linhaDeMensagens` são funções PURAS em
 * lib/finops/centro-de-custo.ts, e aqui elas rodam com a forma REAL dos dados
 * medidos no banco canônico em 2026-07-30.
 *
 * ── AS DUAS METADES DE TUDO ──────────────────────────────────────────────────
 *
 * Cada regra é provada nos dois sentidos: que ela DEIXA passar o que é medido E
 * que RECUSA o que não é. Um portão que só sabe recusar reprova o painel inteiro
 * e ninguém o mantém aceso; um que só sabe aceitar é o zero inventado de volta.
 *
 * A metade VIVA (contra o banco canônico) prova que a leitura de infraestrutura
 * chega para o service_role e é NEGADA para a chave pública. Sem essa metade, a
 * função poderia estar aberta ao mundo e o contrato não veria.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DEFINICOES_DOS_DENOMINADORES,
  FONTES_DE_MEDICAO,
  NIVEIS_DE_ALERTA,
  TETO_FASE_1_BRL,
  avaliarOrcamento,
  consumoMedido,
  consumoNaoMedido,
  converterParaBrl,
  custoMedido,
  custoNaoMedido,
  custoUnitario,
  defeitosDaPublicacao,
  linhaDeMensagens,
  linhasDeIa,
  projetarFechamentoDoMes,
  semServico,
  somarLinhas,
  textoDoCusto,
  valorPublicavel,
  vereditoDoTetoDaFase1,
} from "../../lib/finops/centro-de-custo.ts";
import { CATALOGO_DE_CUSTO, FORA_DO_ESCOPO } from "../../lib/finops/catalogo-de-custo.ts";
import { leLiderancaInteira } from "../../lib/crm/escopo-de-leitura.ts";

const RAIZ = process.cwd();
const ROTA = path.join(RAIZ, "app/api/v1/finops/cost-center/route.ts");
const COMPONENTE = path.join(RAIZ, "components/atlas/CentroDeCustoTecnologico.tsx");
const MIGRATION = path.join(RAIZ, "supabase/migrations/20260730060000_finops_uso_de_infra.sql");
const ROLLBACK = path.join(RAIZ, "supabase/rollbacks/20260730060000_finops_uso_de_infra.down.sql");

/** Fonte sem as linhas de `import`: a armadilha nº 1 deste repositório é a
 *  asserção que casa a PALAVRA e a encontra viva na linha do import. */
function fonteSemImports(arquivo) {
  return fs
    .readFileSync(arquivo, "utf8")
    .split("\n")
    .filter((linha) => !/^\s*(import|export type|\s*type)\b/.test(linha))
    .join("\n");
}

/**
 * Fonte sem COMENTÁRIOS, para as asserções NEGATIVAS.
 *
 * ── Por que isto é indispensável ─────────────────────────────────────────────
 *
 * A primeira versão do teste "a rota não reescreve quem é liderança" ficou
 * vermelha por causa do comentário que EXPLICA a proibição: a rota documenta
 * `Escrever um "new Set([\"director\",...])" criaria a segunda definição`, e a
 * guarda achou o próprio aviso. É a armadilha nº 2 deste repositório, e já
 * morderam cinco vezes: a guarda que proíbe NOMEAR o problema reprova o texto
 * que o nomeia.
 *
 * A regra: asserção negativa case a FORMA no código, nunca a palavra na prosa.
 */
function codigoSemComentarios(arquivo) {
  return fonteSemImports(arquivo)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !/^\s*(\/\/|\*)/.test(linha))
    .map((linha) => linha.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** Um painel mínimo, VÁLIDO, para servir de base às deformações. */
function painelBase() {
  const linhas = [
    {
      chave: "ia:perplexity/sonar",
      rotulo: "IA — perplexity/sonar",
      servico: "perplexity",
      custo: custoMedido(0.011459, "tarifa_declarada", "soma de estimated_cost_usd em 15 de 21 chamadas", "tabela:perplexity/sonar"),
      consumo: consumoMedido(11459, "tokens", "banco", "soma de total_tokens"),
    },
    {
      chave: "hospedagem",
      rotulo: "Hospedagem",
      servico: "Hostinger",
      custo: custoNaoMedido("a fatura da Hostinger não está no banco"),
      consumo: consumoNaoMedido("sem telemetria"),
    },
    {
      chave: "mapas",
      rotulo: "Mapas",
      servico: "nenhum",
      custo: semServico("varredura_de_codigo", "nenhum provedor de mapa referenciado no produto"),
      consumo: consumoMedido(0, "chamadas de mapa", "varredura_de_codigo", "nenhuma integração existe"),
    },
  ];
  const somatorio = somarLinhas(linhas);
  const totalBrl = converterParaBrl(somatorio.totalMedidoUsd, "5.5");
  const alerta = avaliarOrcamento(totalBrl.estado === "medido" ? totalBrl.valorUsd : null, TETO_FASE_1_BRL.maximo, somatorio.fracaoCoberta, somatorio.chavesNaoMedidas.length);
  return {
    geradoEm: new Date().toISOString(),
    janela: { inicio: "2026-07-01T00:00:00.000Z", fim: new Date().toISOString(), diasCorridos: 30, diasNoMes: 31 },
    plano: { provedor: "Supabase", plano: "free", fonte: "tarifa_declarada", comoFoiMedido: "declarado em ATLAS_SUPABASE_PLAN" },
    linhas,
    somatorio,
    totalBrl,
    projecaoUsd: projetarFechamentoDoMes(somatorio.totalMedidoUsd, 30, 31, somatorio.cobertura),
    unitarios: [
      { chave: "por_lead", rotulo: "Custo por lead", denominador: "406 lead(s)", custo: custoUnitario(somatorio.totalMedidoUsd, 406, "lead(s)", "total medido") },
      { chave: "por_venda", rotulo: "Custo por venda", denominador: "0 venda(s)", custo: custoUnitario(somatorio.totalMedidoUsd, 0, "venda(s)", "total medido") },
    ],
    orcamento: { tetoBrl: TETO_FASE_1_BRL, alerta, veredito: vereditoDoTetoDaFase1(alerta, somatorio.chavesNaoMedidas.length) },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. A ASSERÇÃO CENTRAL: custo não medido publicado como número REPROVA.
 * ══════════════════════════════════════════════════════════════════════════ */

test("o painel base, honesto, PASSA no portão de publicação", () => {
  assert.deepEqual(defeitosDaPublicacao(painelBase()), [], "um painel honesto tem de poder ser publicado — portão que só recusa é portão desligado");
});

test("trocar 'não medido' por 0 REPROVA a publicação", () => {
  // Exatamente a mutação M25: a linha da hospedagem passa a alegar zero.
  for (const impostor of [
    { estado: "nao_medido", motivo: "a fatura da Hostinger não está no banco", valorUsd: 0 },
    { estado: "nao_medido", motivo: "a fatura da Hostinger não está no banco", valorBrl: 0 },
    { estado: "nao_medido", motivo: "a fatura da Hostinger não está no banco", valor: 0 },
    { estado: "nao_medido", motivo: "a fatura da Hostinger não está no banco", total: 0 },
  ]) {
    const painel = painelBase();
    painel.linhas[1].custo = impostor;
    const defeitos = defeitosDaPublicacao(painel);
    assert.ok(
      defeitos.some((d) => /NÃO MEDIDO carrega o campo numérico/.test(d)),
      `custo não medido com campo numérico tinha de reprovar. Defeitos: ${JSON.stringify(defeitos)}`,
    );
  }
});

test("virar 'não medido' em 'medido: 0' sem procedência REPROVA", () => {
  const painel = painelBase();
  painel.linhas[1].custo = { estado: "medido", valorUsd: 0, fonte: "banco", comoFoiMedido: "" };
  const defeitos = defeitosDaPublicacao(painel);
  assert.ok(defeitos.some((d) => /SEM procedência/.test(d)), JSON.stringify(defeitos));
});

test("procedência inventada, fora da enumeração, REPROVA", () => {
  const painel = painelBase();
  painel.linhas[1].custo = { estado: "medido", valorUsd: 0, fonte: "achismo", comoFoiMedido: "parece grátis" };
  const defeitos = defeitosDaPublicacao(painel);
  assert.ok(defeitos.some((d) => /fora da enumeração/.test(d)), JSON.stringify(defeitos));
  assert.ok(!FONTES_DE_MEDICAO.includes("achismo"));
});

test("preço vindo de tarifa declarada SEM dizer qual tarifa REPROVA", () => {
  const painel = painelBase();
  painel.linhas[0].custo = { estado: "medido", valorUsd: 99, fonte: "tarifa_declarada", comoFoiMedido: "somei" };
  const defeitos = defeitosDaPublicacao(painel);
  assert.ok(defeitos.some((d) => /sem dizer QUAL tarifa/.test(d)), JSON.stringify(defeitos));
});

test("varredura de código não pode sustentar valor gasto", () => {
  // Construtor recusa na origem…
  const recusado = custoMedido(12.5, "varredura_de_codigo", "achei no código");
  assert.equal(recusado.estado, "nao_medido");
  // …e o portão recusa se alguém montar o objeto à mão.
  const painel = painelBase();
  painel.linhas[2].custo = { estado: "medido", valorUsd: 12.5, fonte: "varredura_de_codigo", comoFoiMedido: "achei no código" };
  assert.ok(defeitosDaPublicacao(painel).some((d) => /não mede valor gasto/.test(d)));
});

test("'sem serviço' sem evidência REPROVA — e o construtor já rebaixa para não medido", () => {
  assert.equal(semServico("varredura_de_codigo", "   ").estado, "nao_medido");
  const painel = painelBase();
  painel.linhas[2].custo = { estado: "sem_servico", fonte: "varredura_de_codigo", evidencia: "" };
  assert.ok(defeitosDaPublicacao(painel).some((d) => /sem evidência/.test(d)));
});

test("cobertura que afirma 100% havendo linha não medida REPROVA", () => {
  const painel = painelBase();
  painel.somatorio.cobertura = "cobrindo 3 de 3 linhas de custo conhecidas (100%)";
  assert.ok(defeitosDaPublicacao(painel).some((d) => /afirma 100%/.test(d)));
});

test("somatório que inclui na soma uma linha não medida REPROVA", () => {
  const painel = painelBase();
  painel.somatorio.chavesMedidas = [...painel.somatorio.chavesMedidas, "hospedagem"];
  assert.ok(defeitosDaPublicacao(painel).some((d) => /somatório inclui "hospedagem"/.test(d)));
});

test("alerta de orçamento sem a ressalva de cobertura parcial REPROVA", () => {
  const painel = painelBase();
  if (painel.orcamento.alerta.estado !== "avaliado") throw new Error("o painel base precisa ter alerta avaliado");
  painel.orcamento.alerta.ressalva = "";
  assert.ok(defeitosDaPublicacao(painel).some((d) => /sem a ressalva/.test(d)));
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. A SOMA — o que entra, o que fica de fora, e a frase que confessa.
 * ══════════════════════════════════════════════════════════════════════════ */

test("a soma ignora o não medido e NOMEIA quem ficou de fora", () => {
  const s = somarLinhas(painelBase().linhas);
  assert.equal(s.totalMedidoUsd, 0.011459, "só o medido entra na soma");
  assert.deepEqual(s.chavesMedidas, ["ia:perplexity/sonar"]);
  assert.deepEqual(s.chavesSemServico, ["mapas"]);
  assert.equal(s.chavesNaoMedidas.length, 1);
  assert.equal(s.chavesNaoMedidas[0].chave, "hospedagem");
  assert.match(s.chavesNaoMedidas[0].motivo, /fatura da Hostinger/, "o motivo tem de viajar junto — 'não medido' pelado não ajuda ninguém");
});

test("a frase de cobertura diz a FRAÇÃO e nunca finge cobrir tudo", () => {
  const s = somarLinhas(painelBase().linhas);
  assert.match(s.cobertura, /cobrindo 2 de 3/);
  assert.match(s.cobertura, /67%/);
  assert.match(s.cobertura, /NÃO medida/);
  assert.ok(!/\(100%\)/.test(s.cobertura));
  // O outro lado: tudo medido, aí sim 100%.
  const tudoMedido = somarLinhas([painelBase().linhas[0], painelBase().linhas[2]]);
  assert.match(tudoMedido.cobertura, /\(100%\)/);
});

test("painel sem linha alguma não vira 0% de cobertura — vira nulo", () => {
  const s = somarLinhas([]);
  assert.equal(s.fracaoCoberta, null, "0/0 não é 0%");
  assert.match(s.cobertura, /não há cobertura a declarar/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. CÂMBIO, UNITÁRIOS E PROJEÇÃO — as três divisões que mentem fácil.
 * ══════════════════════════════════════════════════════════════════════════ */

test("sem taxa de câmbio declarada, o total em reais é NÃO MEDIDO e não tem número", () => {
  for (const taxa of [undefined, null, "", "  ", "abc", "0", "-3"]) {
    const r = converterParaBrl(0.0115, taxa);
    assert.equal(r.estado, "nao_medido", `taxa ${JSON.stringify(taxa)} não pode virar conversão`);
    assert.ok(!("valorUsd" in r), "o não medido não carrega número");
    assert.equal(valorPublicavel(r), null);
  }
  // O outro lado: taxa declarada converte, e diz qual taxa usou.
  const bom = converterParaBrl(2, "5.5");
  assert.equal(bom.estado, "medido");
  assert.equal(bom.valorUsd, 11);
  assert.match(bom.tarifa, /USD→BRL = 5.5/);
});

test("custo por venda com ZERO venda é não medido, nunca R$ 0,00", () => {
  const semVenda = custoUnitario(0.0115, 0, "venda(s)", "total medido");
  assert.equal(semVenda.estado, "nao_medido");
  assert.match(semVenda.motivo, /divisão por zero não é zero/);
  assert.equal(valorPublicavel(semVenda), null);
  // O outro lado: com denominador real, divide.
  const comLeads = custoUnitario(1, 4, "lead(s)", "total medido");
  assert.equal(comLeads.estado, "medido");
  assert.equal(comLeads.valorUsd, 0.25);
  assert.match(comLeads.comoFoiMedido, /÷ 4 lead\(s\)/);
});

test("sem numerador medido, o custo unitário também é não medido", () => {
  const r = custoUnitario(null, 406, "lead(s)", "total medido");
  assert.equal(r.estado, "nao_medido");
  assert.match(r.motivo, /não há numerador/);
});

test("a projeção se declara projeção, com método e com a cobertura herdada", () => {
  const p = projetarFechamentoDoMes(0.0115, 30, 31, "cobrindo 2 de 3 linhas (67%)");
  assert.equal(p.estado, "projetado");
  assert.match(p.metodo, /pró-rata linear/);
  assert.match(p.alerta, /projeção, não medição/);
  assert.match(p.alerta, /67%/, "a projeção herda o buraco do total e tem de dizer isso");
  assert.equal(projetarFechamentoDoMes(null, 30, 31, "x").estado, "nao_projetavel");
  assert.equal(projetarFechamentoDoMes(1, 0, 31, "x").estado, "nao_projetavel");
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4. ALERTAS 50/75/90/100 — e a recusa de inventar percentual.
 * ══════════════════════════════════════════════════════════════════════════ */

test("sem gasto em reais medido, NÃO existe percentual do teto", () => {
  const a = avaliarOrcamento(null, 250, 0.5, 3);
  assert.equal(a.estado, "indeterminado");
  assert.match(a.motivo, /Não se publica 0%/);
  assert.ok(!("percentualDoTeto" in a), "indeterminado não carrega percentual");
});

test("os quatro degraus disparam no lugar certo, e o de baixo não dispara", () => {
  assert.deepEqual([...NIVEIS_DE_ALERTA], [50, 75, 90, 100]);
  const nivel = (brl) => avaliarOrcamento(brl, 250, 1, 0).nivelAtingido;
  assert.equal(nivel(124.9), null, "49,96% não atinge o primeiro degrau");
  assert.equal(nivel(125), 50);
  assert.equal(nivel(187.4), 50);
  assert.equal(nivel(187.5), 75);
  assert.equal(nivel(225), 90);
  assert.equal(nivel(249.99), 90);
  assert.equal(nivel(250), 100);
  assert.equal(nivel(400), 100);
  assert.equal(avaliarOrcamento(249.99, 250, 1, 0).dentroDoTeto, true);
  assert.equal(avaliarOrcamento(250, 250, 1, 0).dentroDoTeto, false);
});

test("o alerta sempre carrega a ressalva de cobertura, e ela muda com o buraco", () => {
  const parcial = avaliarOrcamento(10, 250, 0.67, 2);
  assert.match(parcial.ressalva, /SÓ a parcela medida/);
  assert.match(parcial.ressalva, /67%/);
  assert.match(parcial.ressalva, /2 linha\(s\) não medida\(s\)/);
  const inteiro = avaliarOrcamento(10, 250, 1, 0);
  assert.match(inteiro.ressalva, /todas as linhas de custo conhecidas estão medidas/);
});

test("o teto da Fase 1 é 0 a 250 e o veredito admite 'não dá para saber'", () => {
  assert.deepEqual({ ...TETO_FASE_1_BRL }, { minimo: 0, maximo: 250 });
  // Dentro do teto MAS com linha não medida => indeterminado. É a regra que
  // impede o gate da Fase 2 (5.13) de abrir com custo parcial.
  const parcial = vereditoDoTetoDaFase1(avaliarOrcamento(1, 250, 0.67, 2), 2);
  assert.equal(parcial.veredito, "indeterminado");
  assert.match(parcial.porque, /pode estar acima/);
  // Tudo medido e abaixo do teto => dentro.
  assert.equal(vereditoDoTetoDaFase1(avaliarOrcamento(1, 250, 1, 0), 0).veredito, "dentro");
  // Tudo medido e acima do teto => fora.
  assert.equal(vereditoDoTetoDaFase1(avaliarOrcamento(300, 250, 1, 0), 0).veredito, "fora");
  // Sem reais => indeterminado.
  assert.equal(vereditoDoTetoDaFase1(avaliarOrcamento(null, 250, 1, 0), 0).veredito, "indeterminado");
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5. AS REGRAS DE LINHA, EXECUTADAS com a forma real dos dados medidos.
 * ══════════════════════════════════════════════════════════════════════════ */

test("consumo de IA parcialmente precificado gera DUAS linhas: a medida e a não medida", () => {
  /**
   * Os NÚMEROS REAIS medidos em 2026-07-30 no banco canônico, na organização
   * Atlas One: 21 chamadas a `perplexity/sonar`, das quais 15 precificadas
   * (11.459 tokens, US$ 0,011459) e 6 sem preço (3.317 tokens) — 3 com
   * `pricing_source = 'sem_tarifa:perplexity/sonar'` e 3 anteriores à coluna.
   *
   * A tarifa dessa família é US$ 1,00 por milhão de tokens na entrada e na
   * saída, então o custo de cada linha é `tokens / 1e6` — é por isso que os
   * totais fecham exatos, sem tolerância.
   */
  const eventos = [];
  const precificados = [764, 764, 764, 764, 764, 764, 764, 764, 764, 764, 764, 764, 764, 764, 763];
  for (const tokens of precificados) {
    eventos.push({ provider: "perplexity", model: "sonar", total_tokens: tokens, estimated_cost_usd: tokens / 1e6, pricing_source: "tabela:perplexity/sonar" });
  }
  for (const tokens of [287, 287, 287]) {
    eventos.push({ provider: "perplexity", model: "sonar", total_tokens: tokens, estimated_cost_usd: null, pricing_source: "sem_tarifa:perplexity/sonar" });
  }
  for (const tokens of [818, 818, 820]) {
    eventos.push({ provider: "perplexity", model: "sonar", total_tokens: tokens, estimated_cost_usd: null, pricing_source: null });
  }

  const linhas = linhasDeIa(eventos);
  assert.equal(linhas.length, 2, "o mesmo par vira duas linhas quando parte do consumo não tem preço");

  const medida = linhas.find((l) => l.chave === "ia:perplexity/sonar");
  assert.equal(medida.custo.estado, "medido");
  assert.equal(medida.consumo.valor, 11459, "os tokens precificados são os REAIS medidos no banco");
  assert.ok(Math.abs(medida.custo.valorUsd - 0.011459) < 1e-9, `esperado US$ 0,011459, veio ${medida.custo.valorUsd}`);
  assert.match(medida.custo.comoFoiMedido, /15 de 21 chamada\(s\)/);

  const semTarifa = linhas.find((l) => l.chave === "ia-sem-tarifa:perplexity/sonar");
  assert.equal(semTarifa.custo.estado, "nao_medido", "6 chamadas cobráveis sem preço NÃO podem virar zero");
  assert.ok(!("valorUsd" in semTarifa.custo));
  assert.match(semTarifa.custo.motivo, /6 chamada\(s\) cobrável\(is\)/);
  assert.match(semTarifa.custo.motivo, /3317 tokens/);
  assert.equal(semTarifa.consumo.estado, "medido", "o CONSUMO delas é medido — é o PREÇO que não é");
  assert.equal(semTarifa.consumo.valor, 3317);

  // E a soma não engole o buraco.
  const s = somarLinhas(linhas);
  assert.equal(s.chavesNaoMedidas.length, 1);
  assert.match(s.cobertura, /50%/);
});

test("o fallback local tem custo ZERO de verdade: não chama API e não vira buraco", () => {
  const linhas = linhasDeIa([
    { provider: "local", model: "deterministic-safe-fallback", total_tokens: 0, estimated_cost_usd: 0, pricing_source: "fallback_local_sem_custo" },
    { provider: "local", model: "deterministic-safe-fallback", total_tokens: 0, estimated_cost_usd: null, pricing_source: null },
  ]);
  assert.equal(linhas.length, 1, "local nulo NÃO abre linha de 'sem tarifa' — não há o que cobrar");
  assert.equal(linhas[0].custo.estado, "medido");
  assert.equal(linhas[0].custo.valorUsd, 0);
});

test("IA toda precificada gera UMA linha e cobertura cheia", () => {
  const linhas = linhasDeIa([{ provider: "openai", model: "gpt-5.6-luna", total_tokens: 100, estimated_cost_usd: 0.0006, pricing_source: "tabela:openai/gpt-5.6-luna" }]);
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].custo.estado, "medido");
  assert.match(somarLinhas(linhas).cobertura, /\(100%\)/);
});

test("mensagens: volume ZERO mede; volume acima de zero passa a NÃO medir", () => {
  const comum = { motivoDoPrecoDesconhecido: "a Meta cobra por janela de conversa e o preço não está no banco", rotulo: "Mensagens (WhatsApp)", servico: "WhatsApp" };
  // Zero: o preço desconhecido não importa, e isso é medição.
  const zero = linhaDeMensagens({ volume: 0, ...comum });
  assert.equal(zero.custo.estado, "medido");
  assert.equal(zero.custo.valorUsd, 0);
  assert.match(zero.custo.comoFoiMedido, /sem mensagem não há cobrança por mensagem/);
  // Uma mensagem já derruba a medição — e é assim que o painel avisa.
  const uma = linhaDeMensagens({ volume: 1, ...comum });
  assert.equal(uma.custo.estado, "nao_medido");
  assert.ok(!("valorUsd" in uma.custo));
  assert.match(uma.custo.motivo, /1 mensagem\(ns\) no período/);
  assert.match(uma.custo.motivo, /janela de conversa/);
  assert.equal(uma.consumo.estado, "medido", "o volume continua medido");
  assert.equal(uma.consumo.valor, 1);
  // Leitura quebrada: nem custo nem consumo, e o erro viaja no motivo.
  const quebrada = linhaDeMensagens({ volume: null, erroDeLeitura: "permission denied", ...comum });
  assert.equal(quebrada.custo.estado, "nao_medido");
  assert.match(quebrada.custo.motivo, /permission denied/);
  assert.equal(quebrada.consumo.estado, "nao_medido");
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6. TEXTO — ausência nunca sai formatada como dinheiro.
 * ══════════════════════════════════════════════════════════════════════════ */

test("o texto do não medido não contém número nenhum de dinheiro", () => {
  const t = textoDoCusto(custoNaoMedido("a fatura não está no banco"));
  assert.match(t, /^não medido — /);
  assert.ok(!/R\$|US\$|0[,.]00/.test(t), `"${t}" não pode ter cara de valor`);
  assert.match(textoDoCusto(semServico("varredura_de_codigo", "não há integração")), /^sem serviço contratado — /);
  assert.equal(textoDoCusto(custoMedido(1.5, "banco", "medido"), "BRL"), "R$ 1.50");
});

test("valorPublicavel devolve null para o não medido, para quebrar quem formatar sem conferir", () => {
  assert.equal(valorPublicavel(custoNaoMedido("x")), null);
  assert.equal(valorPublicavel(semServico("varredura_de_codigo", "x")), 0);
  assert.equal(valorPublicavel(custoMedido(3, "banco", "medido")), 3);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7. O CATÁLOGO — o que não dá para medir tem de estar ESCRITO.
 * ══════════════════════════════════════════════════════════════════════════ */

test("todo item fora do sistema declara POR QUE não dá para medir", () => {
  const foraDoSistema = CATALOGO_DE_CUSTO.filter((i) => i.caminho === "fora_do_sistema");
  assert.ok(foraDoSistema.length >= 3, "hospedagem, domínio e preço de mensagem no mínimo");
  for (const item of foraDoSistema) {
    assert.ok(
      item.porQueNaoDaParaMedir && item.porQueNaoDaParaMedir.length > 60,
      `${item.chave} precisa de um motivo escrito para um humano, não um rótulo`,
    );
  }
});

test("as linhas que o dono pediu em §8 estão todas no catálogo", () => {
  const chaves = CATALOGO_DE_CUSTO.map((i) => i.chave);
  for (const exigida of ["ia", "banco", "armazenamento", "mensagens", "mapas", "hospedagem", "dominio"]) {
    assert.ok(chaves.includes(exigida), `§8 pede a linha "${exigida}" e ela não está no catálogo`);
  }
});

test("o que fica fora do painel está declarado, com motivo e endereço", () => {
  assert.ok(FORA_DO_ESCOPO.length >= 1);
  for (const f of FORA_DO_ESCOPO) {
    assert.ok(f.porque.length > 40 && f.ondeVive.length > 5, `${f.item} sem justificativa ou sem dizer onde o assunto vive`);
  }
});

test("os denominadores têm UMA definição, e ela explica a escolha", () => {
  for (const chave of ["lead", "atendimento", "venda", "usuario"]) {
    assert.ok(DEFINICOES_DOS_DENOMINADORES[chave]?.length > 40, `denominador "${chave}" sem definição legível`);
  }
  // A definição de venda tem de dizer por que NÃO usa sale_value_brl: é a
  // divergência medida (1 movimentação para ganho, 0 leads com valor).
  assert.match(DEFINICOES_DOS_DENOMINADORES.venda, /sale_value_brl/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8. MAPAS — a afirmação de ausência que PODE ficar vermelha.
 * ══════════════════════════════════════════════════════════════════════════ */

test("nenhum provedor de mapa entrou no produto — se entrar, esta linha reprova", () => {
  /**
   * O painel publica "mapas: sem serviço" com evidência de varredura. Uma
   * afirmação de ausência que nada verifica é a doença do `/api/ready`, que
   * declarava `smtp: "via-supabase-auth"` a partir da checagem do BANCO — status
   * que nunca podia ficar vermelho.
   *
   * Este teste é o que pode ficar vermelho. Se alguém integrar mapa, ele quebra e
   * a linha do painel tem de mudar de estado.
   */
  const alvos = ["lib", "app", "components"];
  const PROVEDORES = /maps\.googleapis|googlemaps|@react-google-maps|mapbox-gl|MAPBOX|GOOGLE_MAPS_API|leaflet|nominatim\.openstreetmap|api\.here\.com|tomtom\.com/i;
  const achados = [];
  const varrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
        varrer(completo);
      } else if (/\.(ts|tsx)$/.test(entrada.name)) {
        const conteudo = fs.readFileSync(completo, "utf8");
        if (PROVEDORES.test(conteudo)) achados.push(path.relative(RAIZ, completo));
      }
    }
  };
  for (const alvo of alvos) varrer(path.join(RAIZ, alvo));
  assert.deepEqual(
    achados,
    [],
    `o painel publica "mapas: sem serviço". Se há provedor de mapa no produto, a linha passou a mentir. Achados: ${achados.join(", ")}`,
  );
});

/* ══════════════════════════════════════════════════════════════════════════
 * 9. A FIAÇÃO — a rota USA o portão e NÃO reescreve a regra de liderança.
 * ══════════════════════════════════════════════════════════════════════════ */

test("a rota submete o painel ao portão e responde ERRO quando ele acusa", () => {
  const fonte = fonteSemImports(ROTA);
  // Ancorado na REGIÃO, não em formatação: a chamada, a condição e a recusa
  // precisam estar no mesmo trecho. Assim um reflow não quebra a asserção e um
  // `if (false)` quebra.
  const regiao = fonte.slice(fonte.indexOf("defeitosDaPublicacao(painel)"));
  assert.ok(regiao.length > 0, "a rota não chama defeitosDaPublicacao fora dos imports");
  const trecho = regiao.slice(0, 900);
  assert.match(trecho, /if\s*\(\s*defeitos\.length\s*\)/, "o resultado do portão precisa DECIDIR algo");
  assert.match(trecho, /apiError\(/, "quando o portão acusa, a rota responde erro — não publica");
  assert.match(trecho, /PAINEL_DE_CUSTO_REPROVADO/);
});

test("a rota NÃO reescreve quem é liderança: usa lib/crm/escopo-de-leitura", () => {
  const fonte = fonteSemImports(ROTA);
  assert.match(fonte, /leLiderancaInteira\(\s*\{/, "a decisão de acesso tem de CHAMAR a definição única");
  // A segunda definição de liderança é a classe de defeito que já vazou 200
  // leads para um corretor. Nenhum conjunto de papéis à mão nesta rota — e a
  // busca é no CÓDIGO, sem comentários, porque o comentário que explica a
  // proibição contém a própria forma proibida.
  assert.ok(
    !/new Set\(\s*\[\s*"(director|superintendent|manager|admin)"/.test(codigoSemComentarios(ROTA)),
    "não crie um segundo conjunto de papéis nesta rota",
  );
  // E as duas metades da regra, executadas:
  assert.equal(leLiderancaInteira({ commercialRole: "director", role: "broker" }), true);
  assert.equal(leLiderancaInteira({ commercialRole: "manager", role: null }), true);
  assert.equal(leLiderancaInteira({ commercialRole: "broker", role: "broker" }), false);
  assert.equal(leLiderancaInteira({ commercialRole: null, role: "admin" }), true);
});

test("a rota não cria segunda tabela de consumo de IA — lê ai_usage_events", () => {
  const fonte = fonteSemImports(ROTA);
  assert.match(fonte, /from\("ai_usage_events"\)/);
  assert.ok(!/create table/i.test(fonte));
});

test("o componente formata ausência como texto, e nunca com toFixed", () => {
  const fonte = fs.readFileSync(COMPONENTE, "utf8");
  // `toFixed` só pode aparecer depois de um teste de estado. A forma proibida é
  // `custo.valorUsd.toFixed` sem guarda — cobramos que a leitura do valor esteja
  // sempre dentro de um ramo que já confirmou `estado === "medido"`.
  const regiao = fonte.slice(fonte.indexOf("function textoDoCusto"), fonte.indexOf("function motivoDoCusto"));
  assert.match(regiao, /estado === "nao_medido"/, "a formatação confere o estado antes de qualquer número");
  assert.match(regiao, /return "não medido"/);
  const indiceNaoMedido = regiao.indexOf('estado === "nao_medido"');
  const indiceToFixed = regiao.indexOf("toFixed");
  assert.ok(indiceNaoMedido >= 0 && indiceNaoMedido < indiceToFixed, "o desvio do não medido tem de vir ANTES de formatar número");
});

test("a migration e o rollback existem, e o rollback NÃO vive em migrations/", () => {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.finops_uso_de_infra\(\) from anon/);
  assert.match(sql, /revoke all on function public\.finops_uso_de_infra\(\) from authenticated/);
  assert.match(sql, /grant execute on function public\.finops_uso_de_infra\(\) to service_role/);
  // A função NÃO pode devolver preço: se um dia devolver, o painel passa a somar
  // tarifa que ninguém declarou.
  assert.ok(!/usd|preco|price|tarifa\s+numeric/i.test(sql.replace(/^--.*$/gm, "")), "a função de infraestrutura não devolve preço");
  assert.ok(fs.existsSync(ROLLBACK), "toda migration desta entrega tem rollback");
  assert.ok(
    !fs.existsSync(path.join(RAIZ, "supabase/migrations/20260730060000_finops_uso_de_infra.down.sql")),
    ".down.sql dentro de migrations/ cria versão duplicada e aborta o db push no último arquivo",
  );
});

/* ══════════════════════════════════════════════════════════════════════════
 * 10. A METADE VIVA — a leitura de infraestrutura chega a quem deve e é
 *     NEGADA a quem não deve. Sem isto, a função poderia estar aberta.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * As credenciais são lidas do `.env.local` pelo mesmo caminho que os outros
 * contratos vivos deste repositório usam.
 *
 * ── Por que não depender de `--env-file` ─────────────────────────────────────
 *
 * `npm run test:contracts` não passa `--env-file`, e é ele que a suíte e o
 * `scripts/mutacoes.mjs` executam. Uma metade viva que só roda com uma flag
 * manual fica PULADA no dia a dia — e teste pulado é suíte verde por ausência de
 * credencial, que é pior que vermelha: declara protegido o que ninguém exerceu.
 *
 * Medido: antes desta mudança, a prova de permissão da leitura de infraestrutura
 * aparecia como `﹣ skipped` na corrida padrão.
 */
function ambienteLocal() {
  const arquivo = path.join(RAIZ, ".env.local");
  if (!fs.existsSync(arquivo)) return {};
  const env = {};
  for (const linha of fs.readFileSync(arquivo, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const ENV = ambienteLocal();
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY || ENV.SUPABASE_SERVICE_ROLE_KEY;
// `NEXT_PUBLIC_SUPABASE_ANON_KEY` existe no ambiente e está VAZIA (medido em
// 2026-07-30); a chave pública em uso é a `PUBLISHABLE`. Por isso a publishable
// vem primeiro: cair na anon vazia faria a metade "recusa quem não deve" pular.
const CHAVE_PUBLICA =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICO && CHAVE_PUBLICA);

async function chamarRpc(chave) {
  const res = await fetch(`${URL_SUPABASE}/rest/v1/rpc/finops_uso_de_infra`, {
    method: "POST",
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: "{}",
  });
  return { status: res.status, corpo: await res.text() };
}

test(
  "banco vivo: a leitura de infraestrutura ENTREGA ao service_role e RECUSA a chave pública",
  { skip: TEM_BANCO ? false : "sem credenciais do Supabase em .env.local" },
  async () => {
    const servico = await chamarRpc(CHAVE_SERVICO);
    assert.equal(servico.status, 200, `service_role tinha de conseguir ler: ${servico.corpo.slice(0, 200)}`);
    const linhas = JSON.parse(servico.corpo);
    assert.ok(Array.isArray(linhas) && linhas.length === 1);
    const uso = linhas[0];
    for (const campo of ["banco_bytes", "armazenamento_bytes", "armazenamento_objetos", "armazenamento_buckets", "usuarios_de_autenticacao"]) {
      assert.ok(Number.isFinite(Number(uso[campo])), `${campo} tem de vir numérico`);
    }
    assert.ok(Number(uso.banco_bytes) > 0, "banco com zero byte seria medição impossível");
    // E a função NÃO devolve preço: se alguém acrescentar, o painel passaria a
    // publicar tarifa sem procedência.
    for (const proibido of Object.keys(uso)) {
      assert.ok(!/usd|preco|price|custo/i.test(proibido), `a função devolveu "${proibido}" — ela não pode falar de dinheiro`);
    }

    const publica = await chamarRpc(CHAVE_PUBLICA);
    assert.ok(publica.status >= 400, `a chave pública NÃO pode executar a leitura de infraestrutura (recebeu ${publica.status})`);
    assert.match(publica.corpo, /permission denied/i, `a recusa tem de ser de permissão: ${publica.corpo.slice(0, 200)}`);
  },
);
