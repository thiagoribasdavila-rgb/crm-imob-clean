/**
 * Contrato do IMPORTADOR DE INVESTIMENTO DE MÍDIA.
 *
 * Nasceu de uma medição de 2026-07-31: a conta de anúncios da Meta registrava
 * **R$ 3.612,01 gastos em 30 dias**, em 7 campanhas e 94 combinações dia×
 * campanha, e `marketing_spend` tinha **0 linhas**. Sete leitores do produto
 * respondiam R$ 0 — sem erro, sem aviso, sem nada.
 *
 * O sistema já sabia BUSCAR o gasto (três rotas o fazem ao vivo para desenhar
 * tela). O que faltava era GRAVAR. Enquanto isso, conviviam duas respostas para
 * "quanto gastamos": a da tela, vinda da Meta na hora, e a do banco, zero.
 *
 * Os casos abaixo cobrem, em ordem, os três jeitos de errar dinheiro:
 *   1. contar duas vezes  (paginação repetindo a linha de borda)
 *   2. contar de menos    (gasto de campanha desconhecida sumindo em silêncio)
 *   3. contar do dono errado (plataforma divergente criando campanha duplicada)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  agrupaInvestimentoPorDia,
  linhasParaGravar,
  deveAtualizarNome,
  PLATAFORMA_META,
  PREFIXO_NOME_PROVISORIO,
} from "../../lib/marketing/investimento-puro.ts";

const linha = (campanha, data, gasto, extras = {}) => ({
  campaignId: campanha,
  campaignName: extras.nome ?? `Campanha ${campanha}`,
  date: data,
  spend: gasto,
  impressions: extras.impressoes ?? 100,
  clicks: extras.cliques ?? 10,
});

// ── 1. CONTAR DUAS VEZES ────────────────────────────────────────────────────

test("linha repetida pela paginação NÃO soma duas vezes o mesmo dia", () => {
  // Este é o caso que a auditoria teme: o número dobra e continua plausível.
  const saida = agrupaInvestimentoPorDia([
    linha("120", "2026-07-01", 40.64),
    linha("120", "2026-07-01", 40.64),
  ]);
  assert.equal(saida.length, 1);
  assert.equal(saida[0].spend, 40.64, "somou a repetição — o gasto do dia dobrou");
});

test("a ÚLTIMA leitura de uma mesma chave prevalece — a Meta corrige o dia corrente", () => {
  const saida = agrupaInvestimentoPorDia([
    linha("120", "2026-07-01", 30),
    linha("120", "2026-07-01", 40.64),
  ]);
  assert.equal(saida[0].spend, 40.64);
});

test("dias diferentes da MESMA campanha continuam sendo linhas distintas", () => {
  // O espelho do teste anterior: agrupar demais apagaria a série temporal, que é
  // justamente o que a tabela existe para guardar.
  const saida = agrupaInvestimentoPorDia([
    linha("120", "2026-07-01", 40),
    linha("120", "2026-07-02", 55),
  ]);
  assert.equal(saida.length, 2);
  assert.equal(saida[0].spend + saida[1].spend, 95);
});

test("campanhas diferentes no mesmo dia continuam separadas", () => {
  const saida = agrupaInvestimentoPorDia([
    linha("120", "2026-07-01", 40),
    linha("121", "2026-07-01", 51.97),
  ]);
  assert.equal(saida.length, 2);
});

test("a saída é ordenada por dia e depois por campanha — leitura estável", () => {
  const saida = agrupaInvestimentoPorDia([
    linha("121", "2026-07-02", 1),
    linha("120", "2026-07-01", 2),
    linha("121", "2026-07-01", 3),
  ]);
  assert.deepEqual(saida.map((l) => `${l.date}|${l.campaignId}`), [
    "2026-07-01|120", "2026-07-01|121", "2026-07-02|121",
  ]);
});

// ── 2. LINHA MALFORMADA NÃO VIRA GASTO NO DIA ERRADO ────────────────────────

test("linha sem data ISO é descartada — gasto no dia errado é pior que gasto ausente", () => {
  const saida = agrupaInvestimentoPorDia([
    linha("120", "", 40),
    linha("120", "01/07/2026", 40),
    linha("120", "2026-07-01", 40),
  ]);
  assert.equal(saida.length, 1);
  assert.equal(saida[0].date, "2026-07-01");
});

test("linha sem campanha é descartada — gasto sem dono não entra", () => {
  assert.equal(agrupaInvestimentoPorDia([linha("", "2026-07-01", 40)]).length, 0);
});

test("gasto não numérico vira 0 e não NaN — NaN contamina toda a soma", () => {
  const saida = agrupaInvestimentoPorDia([linha("120", "2026-07-01", Number("abc"))]);
  assert.equal(saida[0].spend, 0);
});

// ── 3. CONTAR DE MENOS ──────────────────────────────────────────────────────

test("gasto de campanha desconhecida é CONTADO como pendência, nunca gravado sem campanha", () => {
  const { gravar, semCampanha } = linhasParaGravar("org-1", [
    linha("120", "2026-07-01", 40),
    linha("999", "2026-07-01", 77),
  ], new Map([["120", "uuid-da-120"]]));
  assert.equal(gravar.length, 1);
  assert.deepEqual(semCampanha, ["999"], "o gasto órfão sumiu em silêncio");
});

test("a mesma campanha desconhecida em vários dias é contada UMA vez na pendência", () => {
  const { semCampanha } = linhasParaGravar("org-1", [
    linha("999", "2026-07-01", 10),
    linha("999", "2026-07-02", 10),
  ], new Map());
  assert.deepEqual(semCampanha, ["999"]);
});

test("nenhuma linha gravada tem campaign_id nulo — a coluna é not null com FK composta", () => {
  const { gravar } = linhasParaGravar("org-1", [linha("120", "2026-07-01", 40)], new Map([["120", "uuid"]]));
  for (const l of gravar) {
    assert.ok(l.campaign_id, "campaign_id vazio quebraria a FK composta com a organização");
    assert.equal(l.organization_id, "org-1");
  }
});

test("o valor é arredondado para centavos — dinheiro não carrega resíduo binário", () => {
  const { gravar } = linhasParaGravar("org-1", [linha("120", "2026-07-01", 40.6449999)], new Map([["120", "u"]]));
  assert.equal(gravar[0].amount, 40.64);
});

test("a linha gravada usa a data da Meta, não a data de hoje", () => {
  const { gravar } = linhasParaGravar("org-1", [linha("120", "2026-07-01", 40)], new Map([["120", "u"]]));
  assert.equal(gravar[0].spend_date, "2026-07-01");
});

// ── 4. CONTAR DO DONO ERRADO ────────────────────────────────────────────────

test("a plataforma é META em MAIÚSCULAS — é assim que a linha viva está gravada", () => {
  // Esta constante não é estilo: o índice único do banco é
  // (organization_id, platform, external_campaign_id). Gravar 'meta' criaria uma
  // SEGUNDA campanha para o mesmo anúncio e dividiria o gasto entre as duas,
  // sem erro em tela nenhuma. É a doença desta base: duas verdades para o mesmo
  // fato.
  assert.equal(PLATAFORMA_META, "META");
});

test("o índice único que sustenta a idempotência existe na migration versionada", () => {
  // Sem o índice, o `upsert` do importador vira `insert` e cada execução do cron
  // soma gasto que não aconteceu. O contrato guarda o elo entre os dois.
  const sql = readFileSync("supabase/migrations/20260731120000_investimento_de_midia_sem_duplicata.sql", "utf8");
  assert.match(sql, /create unique index[\s\S]*marketing_spend[\s\S]*organization_id,\s*campaign_id,\s*spend_date/i);
  assert.match(sql, /ROLLBACK/i, "migration sem rollback declarado");
});

// ── 5. O NOME DA CAMPANHA ───────────────────────────────────────────────────

test("nome provisório [auto] é substituído pelo nome real da Meta", () => {
  assert.equal(deveAtualizarNome(`${PREFIXO_NOME_PROVISORIO} Campanha Meta 120 (nome real só a Meta tem)`, "Inside Smart | Lead"), true);
});

test("nome digitado por gente NUNCA é sobrescrito pelo importador", () => {
  // Quem renomeou a campanha na tela tinha um motivo. O importador não é dono
  // dessa decisão.
  assert.equal(deveAtualizarNome("Lançamento Torre A — verba do Thiago", "Inside Smart | Lead"), false);
});

test("nome ausente é preenchido", () => {
  assert.equal(deveAtualizarNome(null, "Inside Smart | Lead"), true);
  assert.equal(deveAtualizarNome("   ", "Inside Smart | Lead"), true);
});

test("nome igual não gera escrita — update inútil é ruído no log", () => {
  assert.equal(deveAtualizarNome("Inside Smart | Lead", "Inside Smart | Lead"), false);
});

test("a Meta sem nome não apaga o nome guardado", () => {
  assert.equal(deveAtualizarNome("[auto] Campanha 120", ""), false);
  assert.equal(deveAtualizarNome("[auto] Campanha 120", "   "), false);
});

// ── 6. O WORKER ESTÁ AGENDADO E PROTEGIDO ───────────────────────────────────

test("o worker está no agendamento versionado, com cadência e motivo", () => {
  // Worker sem linha no agendamento é worker que só roda se alguém lembrar — foi
  // assim que a fila ficou 44h49m parada.
  const agenda = JSON.parse(readFileSync("config/workers-schedule.json", "utf8"));
  const w = agenda.workers.find((x) => x.rota === "/api/v2/marketing/investimento/process");
  assert.ok(w, "o importador não está agendado");
  assert.match(w.cadencia, /^\S+ \S+ \S+ \S+ \S+$/);
  assert.ok(w.porque.length > 80, "cadência sem justificativa é cadência que ninguém pode revisar");
});

test("o worker exige ATLAS_CRON_SECRET e falha FECHADO", () => {
  const rota = readFileSync("app/api/v2/marketing/investimento/process/route.ts", "utf8");
  assert.match(rota, /ATLAS_CRON_SECRET/);
  // `!esperado` PRIMEIRO: na ordem inversa a rota ficaria aberta exatamente onde
  // o segredo não foi configurado — todo ambiente novo.
  assert.match(rota, /if\s*\(\s*!esperado\s*\|\|/);
});

test("o worker não escreve em leads nem movimenta verba", () => {
  const rota = readFileSync("app/api/v2/marketing/investimento/process/route.ts", "utf8");
  const modulo = readFileSync("lib/marketing/importa-investimento.ts", "utf8");
  for (const fonte of [rota, modulo]) {
    assert.doesNotMatch(fonte, /from\("leads"\)/);
    assert.doesNotMatch(fonte, /method:\s*"(POST|DELETE|PUT)"/);
  }
});
