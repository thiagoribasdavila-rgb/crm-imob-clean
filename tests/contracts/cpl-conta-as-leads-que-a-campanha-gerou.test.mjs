/**
 * CONTRATO: o custo por lead se divide pelo que a campanha GEROU, não pelo que
 * chegou ao CRM.
 *
 * ── O erro de 50 vezes, medido em 03/08/2026 ──────────────────────────────
 *
 * As sete campanhas "[Cia360] Inside Smart" somam R$ 4.122,19 de verba. O CRM
 * tem 4 leads ligadas a elas. O relatório calculava R$ 1.030 por lead.
 *
 * As mesmas campanhas geraram 202 leads na Meta. 198 seguem represadas, porque
 * a Página da Inside só foi conectada hoje. O custo real é da ordem de R$ 20.
 *
 * A conta estava certa. O DENOMINADOR estava errado: contava leads que
 * CHEGARAM e chamava isso de leads GERADAS. E o número inflado não some quando
 * alguém recuperar a represa — some quando alguém consertar a divisão.
 *
 * Este arquivo é o irmão do que já existia para o NUMERADOR: lá, gasto zero
 * fazia "CPL R$ 0,00" ler-se como "lead de graça"; a correção foi devolver
 * `null`. Aqui, denominador incompleto faz o CPL parecer caro — e a correção é
 * a mesma família: dizer que não sabe, em vez de dizer um número errado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../../lib/marketing/cost-report.ts";

const campanha = (over = {}) => ({
  campaignId: "f1250a63", campaignName: "[Cia360] Inside Smart| Lead | Imob | Jul.26",
  product: "Inside", developer: "Cia360", date: "2026-07-20",
  spend: 0, leads: 0, sales: 0, ...over,
});

/* ── O CASO REAL ─────────────────────────────────────────────────────────── */

test("com leads represadas, o CPL usa o que a campanha GEROU", () => {
  const [b] = aggregate([
    campanha({ spend: 4122.19 }),
    ...Array.from({ length: 4 }, () => campanha({ leads: 1, leadsNaOrigem: 0 })),
    campanha({ leadsNaOrigem: 202 }),
  ], "campaign");

  assert.equal(b.leads, 4, "as que chegaram continuam visíveis");
  assert.equal(b.leadsNaOrigem, 202, "as que a campanha gerou");
  assert.equal(b.leadsNaoEntraram, 198, "e a diferença tem nome");
  assert.equal(b.cpl, 20.41, "4122.19 / 202 — o custo real");
  assert.equal(b.cplSobreEntradas, 1030.55, "o número antigo continua exposto, para comparação");
  assert.equal(b.cplConfiavel, false, "com 198 leads fora, nenhum CPL desta campanha é confiável");
});

/* ── QUANDO NÃO HÁ REPRESA ───────────────────────────────────────────────── */

test("sem represa, os dois CPLs coincidem e o número é confiável", () => {
  const [b] = aggregate([
    campanha({ spend: 400 }),
    ...Array.from({ length: 10 }, () => campanha({ leads: 1 })),
    campanha({ leadsNaOrigem: 10 }),
  ], "campaign");
  assert.equal(b.cpl, 40);
  assert.equal(b.cplSobreEntradas, 40);
  assert.equal(b.leadsNaoEntraram, 0);
  assert.equal(b.cplConfiavel, true);
});

/* ── QUANDO A META NÃO FOI CONSULTADA ────────────────────────────────────── */

test("sem saber o que a campanha gerou, o CPL NÃO é declarado confiável", () => {
  // É o estado do caminho de banco: ele conhece só o CRM. Mostrar R$ 1.030 sem
  // ressalva foi exatamente o que aconteceu.
  const [b] = aggregate([
    campanha({ spend: 4122.19 }),
    ...Array.from({ length: 4 }, () => campanha({ leads: 1 })),
  ], "campaign");
  assert.equal(b.leadsNaOrigem, null, "null é 'não perguntei', nunca zero");
  assert.equal(b.leadsNaoEntraram, null);
  assert.equal(b.cpl, 1030.55, "sem outra fonte, o CPL das entradas é o que há");
  assert.equal(b.cplConfiavel, false, "mas ninguém pode apresentá-lo como fato");
});

/* ── O NUMERADOR CONTINUA PROTEGIDO ──────────────────────────────────────── */

test("gasto zero continua devolvendo CPL nulo — a correção antiga não regrediu", () => {
  const [b] = aggregate([
    ...Array.from({ length: 24 }, () => campanha({ leads: 1, spend: 0 })),
    campanha({ leadsNaOrigem: 24 }),
  ], "campaign");
  assert.equal(b.cpl, null, "'CPL R$ 0,00' lê-se como lead de graça");
  assert.equal(b.cplSobreEntradas, null);
});

test("origem MENOR que o CRM não vira negativo — a Meta esquece lead após 90 dias", () => {
  const [b] = aggregate([
    campanha({ spend: 100 }),
    ...Array.from({ length: 10 }, () => campanha({ leads: 1 })),
    campanha({ leadsNaOrigem: 3 }),
  ], "campaign");
  assert.equal(b.leadsNaoEntraram, 0, "nunca negativo");
  assert.equal(b.cpl, 10, "com origem menor que o CRM, o CRM é o denominador honesto");
});

/* ── AGREGAÇÃO POR PRODUTO SOMA AS ORIGENS ───────────────────────────────── */

test("agrupando por produto, as leads geradas somam entre campanhas", () => {
  const [b] = aggregate([
    campanha({ campaignId: "a", spend: 1000, leadsNaOrigem: 0 }),
    campanha({ campaignId: "a", leadsNaOrigem: 100 }),
    campanha({ campaignId: "b", spend: 1000, leadsNaOrigem: 0 }),
    campanha({ campaignId: "b", leadsNaOrigem: 102 }),
  ], "product");
  assert.equal(b.leadsNaOrigem, 202);
  assert.equal(b.cpl, 9.9, "2000 / 202");
});
