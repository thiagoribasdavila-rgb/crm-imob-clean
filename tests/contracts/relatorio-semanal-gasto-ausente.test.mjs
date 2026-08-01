/**
 * Contrato do RELATÓRIO SEMANAL DE AQUISIÇÃO: soma não inventa zero.
 *
 * O relatório que o diretor lê para decidir verba anunciava "investimento na
 * semana: R$ 0,00" enquanto TODA campanha logo abaixo dizia "Não conectado".
 * As partes sabiam que não sabiam; a soma decidiu que era nada.
 *
 * Rodar: node --test tests/contracts/relatorio-semanal-gasto-ausente.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "analytics", "weekly-acquisition-report.ts"), "utf8");
const tela = fs.readFileSync(path.join(raiz, "app", "(crm)", "reports", "page.tsx"), "utf8");
const { buildWeeklyAcquisitionReport } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

const lead = (extra = {}) => ({
  id: `l${Math.round(Math.abs(Math.sin(extra.n ?? 1)) * 1e9)}`,
  campaign_id: "c1", development_id: "d1", status: "novo", score: 10,
  metadata: {}, created_at: "2026-07-20T10:00:00Z", ...extra,
});
const empreendimento = { id: "d1", name: "Inside Perdizes", developer_name: "Teixeira Duarte" };

test("Meta fora do ar: o total é null, nunca R$ 0", () => {
  const r = buildWeeklyAcquisitionReport([lead({ n: 1 }), lead({ n: 2 })], [empreendimento], []);
  assert.equal(r.totals.spend, null, "zero diria que a mídia foi de graça");
  assert.equal(r.totals.cpl, null, "sem gasto não há custo por lead");
  assert.equal(r.governance.spendSource, "Não disponível");
  assert.equal(r.governance.spendOmittedWhenUnknown, true);
});

test("a incorporadora sem custo lido também fica em null", () => {
  const r = buildWeeklyAcquisitionReport([lead({ n: 3 })], [empreendimento], []);
  assert.ok(r.developers.length > 0);
  for (const d of r.developers) {
    assert.equal(d.spend, null, `${d.developer} recebeu zero em vez de ausência`);
    assert.equal(d.cpl, null);
  }
});

test("com custo lido, o número sai — e a cobertura vai junto", () => {
  const r = buildWeeklyAcquisitionReport(
    [lead({ n: 4 }), lead({ n: 5 })],
    [empreendimento],
    [{ campaignId: "c1", campaignName: "Inside — Meta", spend: 1000 }],
  );
  assert.equal(r.totals.spend, 1000);
  assert.equal(r.totals.cpl, 500, "1000 / 2 leads");
  assert.equal(r.totals.campanhasComGastoMedido, 1,
    "somar parte das campanhas e chamar de 'gasto da semana' exige dizer quantas entraram");
  assert.equal(r.developers[0].spend, 1000);
});

test("a soma não trata null como zero ao acumular", () => {
  // Duas campanhas, uma com custo e outra sem: o total reflete só a medida, e a
  // contagem de cobertura denuncia que não são todas.
  const r = buildWeeklyAcquisitionReport(
    [lead({ n: 6, campaign_id: "c1" }), lead({ n: 7, campaign_id: "c2" })],
    [empreendimento],
    [{ campaignId: "c1", campaignName: "A", spend: 300 }],
  );
  assert.equal(r.totals.spend, 300);
  assert.equal(r.totals.campanhasComGastoMedido, 1);
  assert.equal(r.totals.campaigns, 2, "a outra campanha continua listada, só sem custo");
});

test("a tela sabe renderizar ausência nos TRÊS lugares", () => {
  assert.match(tela, /weekly\.totals\.spend === null \? "não medido"/,
    "o total não pode virar NaN nem R$ 0 na tela");
  const linhas = [...tela.matchAll(/row\.spend === null \? "Não conectado"/g)];
  assert.equal(linhas.length, 2,
    "campanhas E incorporadoras precisam da mesma palavra — duas tabelas, um vocabulário");
  assert.match(tela, /totals: \{ leads: number; spend: number \| null;/,
    "o tipo tem que admitir a ausência que a API devolve");
});
