/**
 * Contrato da SALA DE COMANDO: falha de leitura nunca vira número, e o funil
 * não se mede contra o próprio estoque.
 *
 * ── OS DOIS DEFEITOS QUE ISTO EXISTE PARA IMPEDIR ───────────────────────────
 *
 * 1. TRÊS ZEROS VERDES. A rota fazia sete leituras e conferia o erro de quatro.
 *    `marketing_spend`, `lead_attribution_touches` e `pipeline_stage_settings`
 *    tinham o erro ENGOLIDO: as duas primeiras viravam "Nenhum investimento
 *    importado ainda — o worker não rodou" (acusando o componente errado por um
 *    erro de banco, com 102 linhas de gasto gravadas), e a terceira caía na
 *    régua PADRÃO do código, que nesta organização é idêntica à configurada —
 *    ou seja, a falha só apareceria na empresa que configurou o funil diferente.
 *    E `pipeline_stage_moves` publicava "não há um único movimento registrado"
 *    a partir do mesmo zero que a falha de leitura produz.
 *
 * 2. O DENOMINADOR QUE ESCONDE. "% do topo" dividia cada etapa pelo ESTOQUE
 *    parado em "novo". Medido na organização real em 02/08/2026: contato lia
 *    73,5% (25/34) quando a razão sobre quem entrou é 5,1% (25/489) — quatorze
 *    vezes, e na direção que faz a operação parecer melhor do que é. O pior:
 *    esse denominador ENCOLHE conforme as leads avançam ou são descartadas, de
 *    modo que o número sobe quando a operação piora.
 *
 * Estes casos EXECUTAM as regras (módulo puro), em vez de procurá-las com grep:
 * suíte verde sobre asserção de texto não prova comportamento.
 *
 * Rodar: node --experimental-strip-types --test tests/contracts/sala-de-comando-nao-inventa-zero.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  comparacaoDeEstado,
  coorteDeEntrada,
  declaraLeituras,
  medidaDoInvestimento,
  montaEtapasDoFunil,
  razaoSobreCoorte,
} from "../../lib/atlas/sala-de-comando-medicao.ts";

/* ── O ESTOQUE REAL DA ORGANIZAÇÃO, MEDIDO EM 02/08/2026 ──────────────────── */
const ESTOQUE = new Map([
  ["novo", 34], ["contato", 25], ["qualificacao", 8],
  ["visita", 0], ["proposta", 0], ["contrato", 0],
]);
const ETAPAS = [
  { key: "novo", label: "Novos" }, { key: "contato", label: "Contato" },
  { key: "qualificacao", label: "Qualificação" }, { key: "visita", label: "Visita" },
  { key: "proposta", label: "Proposta" }, { key: "contrato", label: "Contrato" },
];
const JA_PASSARAM = new Map([
  ["contato", 33], ["qualificacao", 10], ["visita", 2], ["proposta", 3], ["contrato", 3],
]);
const TOTAL = 489;
const coorte = coorteDeEntrada(
  Array.from({ length: TOTAL }, (_, i) => ({ created_at: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z` })),
);

const funil = (extra = {}) =>
  montaEtapasDoFunil({
    etapas: ETAPAS,
    quantidadePorEtapa: ESTOQUE,
    jaPassaramPorEtapa: JA_PASSARAM,
    coorte,
    movimentoMensuravel: true,
    desdeQuando: "27/07",
    emNovo: 34,
    totalDeLeads: TOTAL,
    ...extra,
  });

/* ── 1. O DENOMINADOR ─────────────────────────────────────────────────────── */

test("o percentual do funil é sobre quem ENTROU, não sobre o estoque parado em novo", () => {
  const contato = funil().find((e) => e.chave === "contato");
  // 25/489 = 5,1%. A conta antiga (25/34) dava 73,5% — o número que a tela
  // imprimia, e que descreve uma operação catorze vezes melhor do que a real.
  assert.equal(contato.percentualDoTopo, 5.1);
  assert.notEqual(contato.percentualDoTopo, 73.5);
  assert.equal(contato.denominador.leads, 489);
});

test("a coorte não some quando o estoque de novo esvazia — o estoque, sim", () => {
  // O defeito em uma linha: com "novo" zerado, o denominador ANTIGO some (ou
  // vira divisão por zero) enquanto a operação continua existindo. A coorte é a
  // mesma 489 leads: ninguém deixa de ter entrado no funil porque avançou.
  const semNovo = new Map(ESTOQUE);
  semNovo.set("novo", 0);
  const contato = montaEtapasDoFunil({
    etapas: ETAPAS, quantidadePorEtapa: semNovo, jaPassaramPorEtapa: JA_PASSARAM,
    coorte, movimentoMensuravel: true, desdeQuando: "27/07", emNovo: 0, totalDeLeads: TOTAL,
  }).find((e) => e.chave === "contato");
  assert.equal(contato.percentualDoTopo, 5.1);
});

test("o percentual sobe quando a etapa cresce, não quando o topo esvazia", () => {
  // Régua de sanidade contra a volta do defeito: a monotonicidade tem de vir do
  // NUMERADOR. Com o denominador antigo, tirar leads de "novo" inflava todas as
  // outras etapas sem que uma única lead tivesse avançado.
  assert.equal(razaoSobreCoorte(25, 489), 5.1);
  assert.equal(razaoSobreCoorte(50, 489), 10.2);
  assert.equal(razaoSobreCoorte(25, 34), 73.5, "a conta antiga, para o contraste ficar no arquivo");
});

test("sem coorte não há percentual — e não há divisão por zero", () => {
  assert.equal(razaoSobreCoorte(0, 0), null);
  const vazio = montaEtapasDoFunil({
    etapas: ETAPAS, quantidadePorEtapa: new Map(), jaPassaramPorEtapa: new Map(),
    coorte: coorteDeEntrada([]), movimentoMensuravel: true, desdeQuando: null,
    emNovo: 0, totalDeLeads: 0,
  });
  assert.equal(vazio[0].percentualDoTopo, null);
});

test("a coorte conta quem entrou sem carimbo, e declara quantos são", () => {
  const c = coorteDeEntrada([{ created_at: "2026-07-01T00:00:00Z" }, { created_at: null }, {}]);
  assert.equal(c.entradas, 3, "quem não tem carimbo entrou no funil do mesmo jeito");
  assert.equal(c.semDataDeEntrada, 2);
  assert.equal(c.de, "2026-07-01T00:00:00Z");
});

/* ── 2. "JÁ PASSARAM" NÃO PODE SER ZERO POR FALHA ─────────────────────────── */

test("sem conseguir ler o histórico, jaPassaram é null — nunca 0", () => {
  const etapas = funil({ movimentoMensuravel: false });
  for (const etapa of etapas) {
    assert.equal(etapa.jaPassaram, null,
      "0 aqui significa 'nenhuma lead nunca alcançou esta etapa' — o diagnóstico mais grave que este painel dá");
    assert.equal(etapa.jaPassaramMensuravel, false);
  }
  const visita = etapas.find((e) => e.chave === "visita");
  assert.match(visita.porqueVazia, /Não foi possível ler o histórico/);
  assert.doesNotMatch(visita.porqueVazia, /nenhuma passou/);
});

test("com histórico lido, a etapa vazia distingue 'vazou' de 'não chegou'", () => {
  const etapas = funil();
  const visita = etapas.find((e) => e.chave === "visita");
  assert.equal(visita.jaPassaram, 2);
  assert.match(visita.porqueVazia, /vazou|esvaziou/);

  const semPassagem = montaEtapasDoFunil({
    etapas: ETAPAS, quantidadePorEtapa: ESTOQUE, jaPassaramPorEtapa: new Map(),
    coorte, movimentoMensuravel: true, desdeQuando: "27/07", emNovo: 34, totalDeLeads: TOTAL,
  }).find((e) => e.chave === "visita");
  assert.match(semPassagem.porqueVazia, /nenhuma passou por esta etapa/);
});

/* ── 3. O DINHEIRO ────────────────────────────────────────────────────────── */

test("leitura de gasto que falha não vira 'nenhum investimento importado'", () => {
  const m = medidaDoInvestimento({
    gastoErro: { message: "connection reset", code: "57P01" },
    atribuicaoErro: null,
    linhasDeGasto: 0,
  });
  assert.equal(m.mensuravel, false);
  assert.match(m.porqueIndisponivel, /marketing_spend/);
  assert.match(m.porqueIndisponivel, /não são zero/);
  assert.match(m.porqueIndisponivel, /não é o worker/,
    "a frase padrão da tela manda depurar o worker de importação — com a leitura quebrada, isso é acusar o inocente");
});

test("a falha da atribuição também derruba a medida, e é nomeada", () => {
  const m = medidaDoInvestimento({ gastoErro: null, atribuicaoErro: { message: "timeout" }, linhasDeGasto: 102 });
  assert.equal(m.mensuravel, false);
  assert.match(m.porqueIndisponivel, /lead_attribution_touches/);
});

test("tabela vazia com leitura boa continua sendo 'não importado' — este zero é resposta", () => {
  const m = medidaDoInvestimento({ gastoErro: null, atribuicaoErro: null, linhasDeGasto: 0 });
  assert.equal(m.mensuravel, true);
  assert.equal(m.importado, false);
  assert.equal(m.porqueIndisponivel, null);
});

test("com as 102 linhas de hoje, a medida é afirmada", () => {
  const m = medidaDoInvestimento({ gastoErro: null, atribuicaoErro: null, linhasDeGasto: 102 });
  assert.deepEqual(m, { mensuravel: true, importado: true, porqueIndisponivel: null });
});

/* ── 4. O DELTA DE ESTADO ─────────────────────────────────────────────────── */

test("sem ler pipeline_stage_moves, a rota não afirma que a janela anterior está vazia", () => {
  const d = comparacaoDeEstado({
    movimentoMensuravel: false, movimentosNaJanelaAnterior: 0, inicioFormatado: "27/07/2026",
  });
  assert.equal(d.mensuravel, false);
  assert.equal(d.movimentosNaJanelaAnterior, null);
  assert.match(d.porqueIndisponivel, /leitura indisponível/);
  assert.doesNotMatch(d.porqueIndisponivel, /não há um único movimento/,
    "essa é uma afirmação sobre o banco, e ela estava sendo feita sem ter conseguido ler o banco");
});

test("com leitura boa e janela vazia, a afirmação forte continua — ela é verdadeira", () => {
  const d = comparacaoDeEstado({
    movimentoMensuravel: true, movimentosNaJanelaAnterior: 0, inicioFormatado: "27/07/2026",
  });
  assert.equal(d.mensuravel, true);
  assert.equal(d.baseDeComparacaoExiste, false);
  assert.match(d.porqueIndisponivel, /não há um único movimento registrado/);
});

test("a frase nunca some — painel sem frase é indistinguível de painel quebrado", () => {
  for (const caso of [
    { movimentoMensuravel: false, movimentosNaJanelaAnterior: 0, inicioFormatado: null },
    { movimentoMensuravel: true, movimentosNaJanelaAnterior: 0, inicioFormatado: null },
    { movimentoMensuravel: true, movimentosNaJanelaAnterior: 7, inicioFormatado: "27/07/2026" },
  ]) {
    assert.equal(typeof comparacaoDeEstado(caso).porqueIndisponivel, "string");
    assert.ok(comparacaoDeEstado(caso).porqueIndisponivel.length > 40);
  }
});

/* ── 5. O ROSTER — o lastro para um chip "N/N" honesto ────────────────────── */

test("o roster só conta como medida a leitura que respondeu por inteiro", () => {
  const r = declaraLeituras([
    { fonte: "leads", serve: "Os indicadores", erro: null },
    { fonte: "marketing_spend", serve: "O investimento", erro: { message: "boom" } },
    { fonte: "pipeline_stage_moves", serve: "As saídas", erro: null, truncada: true },
  ]);
  assert.equal(r.total, 3);
  assert.equal(r.medidas, 1, "truncada NÃO é medida: agregado sobre amostra cortada é errado em silêncio");
  assert.equal(r.todasMedidas, false);
  assert.deepEqual(r.naoMedidas, ["marketing_spend", "pipeline_stage_moves"]);
  assert.match(r.resumo, /indisponível, não zerado/);
});

test("cada leitura quebrada diz O QUE a tela perde — roster sem isso é enfeite", () => {
  const r = declaraLeituras([{ fonte: "profiles", serve: "O nome dos corretores", erro: { message: "x" } }]);
  assert.match(r.fontes[0].porque, /O nome dos corretores está INDISPONÍVEL/);
  assert.equal(r.fontes[0].falhou, true);
});

test("tudo lido: o roster afirma 'N de N' — e é a única situação em que ele pode", () => {
  const r = declaraLeituras([
    { fonte: "leads", serve: "a", erro: null },
    { fonte: "profiles", serve: "b", erro: null, truncada: false },
  ]);
  assert.equal(r.todasMedidas, true);
  assert.equal(r.medidas, 2);
  assert.deepEqual(r.naoMedidas, []);
  assert.equal(r.fontes.every((f) => f.porque === null), true);
});
