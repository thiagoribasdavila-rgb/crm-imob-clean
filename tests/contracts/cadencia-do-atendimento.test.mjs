/**
 * Contrato da CADÊNCIA DO ATENDIMENTO.
 *
 * Os casos abaixo são o dado REAL de 02/08/2026, não formas imaginadas:
 * 478 movimentos, 2 atores (477 e 1), 429 das 444 leads com um único toque,
 * 13 dos 34 intervalos abaixo de 5 minutos, e duas fontes de venda que apontam
 * leads diferentes.
 *
 * O que estes testes protegem, acima de tudo: AUSÊNCIA DE DADO NÃO PODE VIRAR
 * ZERO. Toda asserção de "não medido" confere o discriminante E confere que o
 * valor é `null` — um `0` passando por ali é o defeito que a tela desenharia
 * como "cadência instantânea" ou "corretor que não trabalha".
 *
 * Rodar: node --experimental-strip-types --test tests/contracts/cadencia-do-atendimento.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  PISO_DE_LOTE_MS,
  CONCENTRACAO_QUE_IMPEDE_COMPARACAO,
  movimentosLiquidos,
  intervalosDaBase,
  cadenciaDaBase,
  volumePorPessoa,
  concentracaoDoLedger,
  veredictoDaConversao,
  toquesAteAvancar,
  formatarDuracaoEmMinutos,
} from "../../lib/crm/cadencia-do-atendimento.ts";

const CORRETOR = "aa077aa4-28a7-49cb-98ea-dac8b2908a97";
const DIRETOR = "6f150832-4c97-42a7-954e-eea962a003fa";

let sequencia = 0;
/** Um movimento do ledger; `min` é o deslocamento em minutos a partir do zero. */
function mov(leadId, atorId, min, extras = {}) {
  sequencia += 1;
  return {
    id: `m${sequencia}`,
    lead_id: leadId,
    actor_id: atorId,
    from_stage: "novo",
    to_stage: "contato",
    reversal_of: null,
    occurred_at: new Date(Date.UTC(2026, 6, 27, 12, 0, 0) + min * 60_000).toISOString(),
    ...extras,
  };
}

// ── LOTE NÃO É CADÊNCIA ─────────────────────────────────────────────────────

test("dois movimentos na mesma lead a 90 segundos são lote, não dois toques", () => {
  const { trabalho, lote } = intervalosDaBase([mov("L1", CORRETOR, 0), mov("L1", CORRETOR, 1.5)]);
  assert.equal(trabalho.length, 0, "90s não pode contar como intervalo de trabalho");
  assert.equal(lote.length, 1);
});

test("o piso separa exatamente em 5 minutos: abaixo é lote, no piso é trabalho", () => {
  const abaixo = intervalosDaBase([mov("L1", CORRETOR, 0), mov("L1", CORRETOR, 4.9)]);
  assert.equal(abaixo.lote.length, 1);
  assert.equal(abaixo.trabalho.length, 0);

  const noPiso = intervalosDaBase([mov("L2", CORRETOR, 0), mov("L2", CORRETOR, 5)]);
  assert.equal(noPiso.trabalho.length, 1, "exatamente no piso conta como trabalho");
  assert.equal(noPiso.lote.length, 0);
  assert.equal(PISO_DE_LOTE_MS, 5 * 60_000);
});

test("o intervalo é medido DENTRO da lead — nunca entre leads diferentes", () => {
  // Duas leads, um toque em cada, separados por uma hora. Zero intervalos:
  // o tempo entre elas é a agenda do corretor, não a cadência de ninguém.
  const { trabalho, lote, leadsComIntervalo, leadsComToqueUnico } = intervalosDaBase([
    mov("L1", CORRETOR, 0),
    mov("L2", CORRETOR, 60),
  ]);
  assert.equal(trabalho.length + lote.length, 0);
  assert.equal(leadsComIntervalo, 0);
  assert.equal(leadsComToqueUnico, 2);
});

test("ordem de chegada não importa: o ledger vem decrescente da rota", () => {
  const crescente = intervalosDaBase([mov("L1", CORRETOR, 0), mov("L1", CORRETOR, 90)]);
  const decrescente = intervalosDaBase([mov("L1", CORRETOR, 90), mov("L1", CORRETOR, 0)]);
  assert.deepEqual(decrescente.trabalho, crescente.trabalho);
  assert.equal(decrescente.trabalho.length, 1);
});

// ── AUSÊNCIA DE DADO NÃO É ZERO ─────────────────────────────────────────────

test("base onde toda lead tem um toque só: mediana NÃO MEDIDA, e o valor é null", () => {
  // A base real: 429 de 444 leads assim.
  const base = cadenciaDaBase([mov("L1", CORRETOR, 0), mov("L2", CORRETOR, 10), mov("L3", CORRETOR, 20)]);
  assert.equal(base.intervaloMediano.suficiente, false);
  assert.equal(base.intervaloMediano.valor, null, "sem intervalo o valor é null, JAMAIS 0");
  assert.notEqual(base.intervaloMediano.valor, 0);
  assert.equal(base.leadsComToqueUnico, 3);
  assert.equal(base.leadsComIntervalo, 0);
  assert.equal(base.fracaoComToqueUnico, 1);
});

test("sem movimento nenhum, a fração de toque único é null e não 0", () => {
  const base = cadenciaDaBase([]);
  assert.equal(base.fracaoComToqueUnico, null, "0 leria como 'todas receberam segundo toque'");
  assert.equal(base.intervaloMediano.valor, null);
  assert.equal(base.intervaloMediano.amostra, 0);
});

test("três intervalos de trabalho sustentam mediana; dois não", () => {
  const dois = cadenciaDaBase([mov("A", CORRETOR, 0), mov("A", CORRETOR, 60), mov("A", CORRETOR, 120)]);
  assert.equal(dois.intervalosDeTrabalho, 2);
  assert.equal(dois.intervaloMediano.suficiente, false, "2 intervalos não fazem mediana");
  assert.equal(dois.intervaloMediano.valor, null);

  const tres = cadenciaDaBase([mov("A", CORRETOR, 0), mov("A", CORRETOR, 60), mov("A", CORRETOR, 120), mov("A", CORRETOR, 180)]);
  assert.equal(tres.intervalosDeTrabalho, 3);
  assert.equal(tres.intervaloMediano.suficiente, true);
  assert.equal(tres.intervaloMediano.valor, 60, "três intervalos de 60min → mediana 60min");
});

test("o lote é publicado, não sumido em silêncio", () => {
  // Lista que encolhe sem dizer de quanto já esvaziou uma tela deste produto.
  const base = cadenciaDaBase([
    mov("A", CORRETOR, 0), mov("A", CORRETOR, 1), mov("A", CORRETOR, 2),
    mov("B", CORRETOR, 0), mov("B", CORRETOR, 60),
  ]);
  assert.equal(base.intervalosDeLote, 2);
  assert.equal(base.intervalosDeTrabalho, 1);
  assert.equal(base.pisoDeLoteMin, 5, "a régua viaja para a tela junto do número");
});

// ── MOVIMENTO DESFEITO NÃO CONTA DUAS VEZES ─────────────────────────────────

test("desfazer não vira trabalho: some a linha original E a reversão", () => {
  const original = mov("L1", CORRETOR, 0);
  const reversao = mov("L1", CORRETOR, 30, { reversal_of: original.id });
  const liquidos = movimentosLiquidos([original, reversao]);
  assert.equal(liquidos.length, 0, "corrigir um engano não pode contar como dois toques");

  const volumes = volumePorPessoa([original, reversao]);
  assert.equal(volumes.length, 0);
});

test("o movimento desfeito não inventa intervalo", () => {
  const original = mov("L1", CORRETOR, 0);
  const reversao = mov("L1", CORRETOR, 600, { reversal_of: original.id });
  const base = cadenciaDaBase([original, reversao]);
  assert.equal(base.intervalosDeTrabalho, 0);
  assert.equal(base.intervaloMediano.valor, null);
});

// ── VOLUME POR PESSOA ───────────────────────────────────────────────────────

test("volume separa movimentos, leads distintas e dias ativos", () => {
  const volumes = volumePorPessoa([
    mov("L1", CORRETOR, 0),
    mov("L1", CORRETOR, 60),
    mov("L2", CORRETOR, 60 * 26), // dia seguinte
  ]);
  assert.equal(volumes.length, 1);
  assert.equal(volumes[0].movimentos, 3);
  assert.equal(volumes[0].leadsTocadas, 2, "duas leads, três movimentos");
  assert.equal(volumes[0].diasAtivos, 2);
  assert.equal(volumes[0].movimentosPorDiaAtivo, 1.5);
});

test("movimento sem ator não vira uma pessoa fantasma", () => {
  const volumes = volumePorPessoa([mov("L1", null, 0), mov("L1", "", 10)]);
  assert.equal(volumes.length, 0);
});

// ── A COMPARAÇÃO ENTRE PESSOAS, COMO ELA É HOJE ─────────────────────────────

test("477 contra 1: o ledger é de uma pessoa só e a tabela NÃO compara", () => {
  // A forma real do banco em 02/08/2026.
  const volumes = [
    { id: CORRETOR, movimentos: 477, leadsTocadas: 443, diasAtivos: 7, movimentosPorDiaAtivo: 68.1, ultimoEm: null },
    { id: DIRETOR, movimentos: 1, leadsTocadas: 1, diasAtivos: 1, movimentosPorDiaAtivo: 1, ultimoEm: null },
  ];
  const c = concentracaoDoLedger(volumes);
  assert.equal(c.comparavel, false, "comparar 477 com 1 é comparar uma pessoa com uma testemunha");
  assert.equal(c.pessoasComVolume, 1);
  assert.equal(c.totalDeMovimentos, 478);
  assert.ok(c.porque.length > 0, "a recusa precisa dizer POR QUÊ");
  assert.ok(c.maiorFatia > 0.99);
});

test("mesmo com duas pessoas de volume, concentração alta impede comparação", () => {
  const volumes = [
    { id: "a", movimentos: 900, leadsTocadas: 900, diasAtivos: 5, movimentosPorDiaAtivo: 180, ultimoEm: null },
    { id: "b", movimentos: 100, leadsTocadas: 100, diasAtivos: 5, movimentosPorDiaAtivo: 20, ultimoEm: null },
  ];
  const c = concentracaoDoLedger(volumes);
  assert.equal(c.pessoasComVolume, 2, "as duas passam do piso de volume");
  assert.equal(c.maiorFatia, 0.9);
  assert.ok(c.maiorFatia >= CONCENTRACAO_QUE_IMPEDE_COMPARACAO);
  assert.equal(c.comparavel, false, "90% numa pessoa ainda não é uma equipe medida");
});

test("carteiras equilibradas: aí sim a comparação é liberada", () => {
  const volumes = [
    { id: "a", movimentos: 60, leadsTocadas: 50, diasAtivos: 5, movimentosPorDiaAtivo: 12, ultimoEm: null },
    { id: "b", movimentos: 50, leadsTocadas: 45, diasAtivos: 5, movimentosPorDiaAtivo: 10, ultimoEm: null },
    { id: "c", movimentos: 40, leadsTocadas: 38, diasAtivos: 5, movimentosPorDiaAtivo: 8, ultimoEm: null },
  ];
  const c = concentracaoDoLedger(volumes);
  assert.equal(c.comparavel, true);
  assert.equal(c.porque, "", "liberado não carrega ressalva");
});

test("ledger vazio não é 'todo mundo empatado'", () => {
  const c = concentracaoDoLedger([]);
  assert.equal(c.comparavel, false);
  assert.equal(c.maiorFatia, null, "sem movimento a fatia é null, não 0");
});

// ── CONVERSÃO: A RECUSA, E O MOTIVO CERTO ───────────────────────────────────

test("as duas fontes de venda discordam — e é ISSO que impede a taxa", () => {
  // O dado real: status='ganho' → {Claudia, Monique}; ledger → {Antonio, Claudia}.
  const v = veredictoDaConversao({
    porStatus: ["claudia", "monique"],
    porLedger: ["antonio", "claudia"],
  });
  assert.equal(v.afirmavel, false);
  assert.equal(v.concordam, 1, "as duas fontes só concordam sobre uma lead");
  assert.equal(v.divergem, 2);
  assert.match(v.porque, /discordam/, "o motivo publicado é a divergência, não o tamanho da amostra");
});

test("mesmo com as fontes de acordo, duas vendas não sustentam taxa", () => {
  const v = veredictoDaConversao({ porStatus: ["a", "b"], porLedger: ["a", "b"] });
  assert.equal(v.divergem, 0, "aqui as fontes concordam");
  assert.equal(v.afirmavel, false, "n=2 continua sem sustentar taxa por pessoa");
  assert.match(v.porque, /dobraria/);
});

test("sem venda nenhuma o veredicto não é 'taxa zero'", () => {
  const v = veredictoDaConversao({ porStatus: [], porLedger: [] });
  assert.equal(v.afirmavel, false);
  assert.equal(v.concordam, 0);
  assert.match(v.porque, /Nenhuma venda registrada/);
});

// ── A DURAÇÃO EM TEXTO ──────────────────────────────────────────────────────

test("duração ausente continua ausente — nunca vira '0 min'", () => {
  assert.equal(formatarDuracaoEmMinutos(null), null);
  assert.equal(formatarDuracaoEmMinutos(Number.NaN), null);
  assert.equal(formatarDuracaoEmMinutos(-5), null, "intervalo negativo é sujeira, não velocidade");
});

test("as bordas da duração dizem a coisa certa", () => {
  assert.equal(formatarDuracaoEmMinutos(0), "menos de 1 min");
  assert.equal(formatarDuracaoEmMinutos(45), "45 min");
  assert.equal(formatarDuracaoEmMinutos(60), "1h", "hora exata não imprime '1h 0min'");
  assert.equal(formatarDuracaoEmMinutos(98), "1h 38min");
  assert.equal(formatarDuracaoEmMinutos(1440), "1d");
  assert.equal(formatarDuracaoEmMinutos(1500), "1d 1h");
});

// ── TOQUES ATÉ AVANÇAR — preparado para quando o contato virar rastro ───────

const avancou = (de, para) => de === "novo" && para === "contato";

test("hoje a base não sustenta 'toques até avançar', e ele diz isso em vez de 0", () => {
  const r = toquesAteAvancar([mov("L1", CORRETOR, 0), mov("L2", CORRETOR, 5)], avancou);
  assert.equal(r.medido, false);
  assert.equal(r.valor, null, "o número ausente é null — 0 leria como 'avança sem esforço'");
  assert.equal(r.amostra, 2);
});

test("com histórico suficiente, conta a posição do toque que avançou", () => {
  const semAvanco = { from_stage: "novo", to_stage: "novo" };
  const movimentos = [
    // L1: avança no 2º toque
    mov("L1", CORRETOR, 0, semAvanco), mov("L1", CORRETOR, 60),
    // L2: avança no 1º
    mov("L2", CORRETOR, 0),
    // L3: avança no 3º
    mov("L3", CORRETOR, 0, semAvanco), mov("L3", CORRETOR, 60, semAvanco), mov("L3", CORRETOR, 120),
  ];
  const r = toquesAteAvancar(movimentos, avancou);
  assert.equal(r.medido, true);
  assert.equal(r.amostra, 3);
  assert.equal(r.valor, 2, "posições 2, 1 e 3 → mediana 2");
});
