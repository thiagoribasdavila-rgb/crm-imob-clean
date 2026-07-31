/**
 * Contrato da RECONCILIAÇÃO ENTRE O DINHEIRO E AS LEADS.
 *
 * Em 31/07/2026, no minuto seguinte à primeira importação de gasto, a base viva
 * devolveu isto:
 *
 *   7 campanhas com gasto ..... R$ 3.612,01 ..... 0 leads atribuídas
 *   1 campanha com leads ...... 24 leads ........ nenhum gasto registrado
 *
 * A campanha das 24 leads não pertence à conta de anúncios que o CRM lê — a
 * Graph API recusa a consulta dela com "(#10) Application does not have
 * permission", e ela não está entre as 10 campanhas da conta configurada.
 *
 * O NÚMERO QUE ESTE CONTRATO EXISTE PARA IMPEDIR é R$ 150,50 — que é
 * 3.612,01 ÷ 24, cabe num tile, é apresentável em reunião, e divide o custo de
 * uma conta pelo resultado de outra.
 *
 * A regra: CPL só existe onde as duas pontas são a MESMA campanha.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { reconciliaInvestimento } from "../../lib/marketing/reconciliacao-de-investimento.ts";

const gasto = (ext, reais, nome = `Campanha ${ext}`) => ({ externalId: ext, nome, reais, de: "2026-07-01", ate: "2026-07-23" });
const leads = (ext, n) => ({ externalId: ext, leads: n });

// ── O CASO REAL, COM OS NÚMEROS REAIS ───────────────────────────────────────

test("gasto numa conta e leads em outra NÃO produzem CPL — o número falso não nasce", () => {
  const r = reconciliaInvestimento(
    [gasto("120250212474540700", 855.6), gasto("120250291299880700", 786.36), gasto("120250723445740700", 617.05),
     gasto("120250087889320700", 508.28), gasto("120250723445710700", 341.68), gasto("120251064213360700", 261.52),
     gasto("120251064213240700", 241.52)],
    [leads("120251113236400624", 24)],
  );
  assert.equal(r.investimentoTotal, 3612.01, "o total precisa bater com a soma real da conta");
  assert.equal(r.leadsAtribuidas, 24);
  assert.equal(r.cplGlobal, null, "calculou CPL cruzando contas de anúncio diferentes");
  assert.ok(r.porqueSemCpl && r.porqueSemCpl.length > 60, "recusou o número e não explicou — pior que mostrar");
  // A asserção adversarial: o número falso não pode aparecer em lugar nenhum.
  assert.doesNotMatch(JSON.stringify(r), /150[.,]5/, "o CPL falso vazou para a resposta");
});

test("as duas pilhas são contadas e separadas, com o dinheiro de cada uma", () => {
  const r = reconciliaInvestimento([gasto("A", 100), gasto("B", 50)], [leads("Z", 24)]);
  assert.deepEqual(r.gastoSemLead, { campanhas: 2, reais: 150 });
  assert.deepEqual(r.leadSemGasto, { campanhas: 1, leads: 24 });
});

test("a frase de recusa diz que são contas diferentes quando as duas pilhas existem", () => {
  const r = reconciliaInvestimento([gasto("A", 3612.01)], [leads("Z", 24)]);
  assert.match(r.porqueSemCpl, /contas de anúncio diferentes/i);
  assert.match(r.porqueSemCpl, /3\.612,01/, "a frase precisa carregar o valor, não só o adjetivo");
});

// ── O OUTRO LADO DO FILTRO: quando as pontas se encontram, o CPL SAI ────────

test("campanha com gasto E leads produz CPL — a guarda não pode ser um 'nunca'", () => {
  // Sem este caso, a regra "CPL só onde as pontas se encontram" seria
  // indistinguível de "CPL nunca aparece", e ninguém saberia.
  const r = reconciliaInvestimento([gasto("A", 1000)], [leads("A", 20)]);
  assert.equal(r.cplGlobal, 50);
  assert.equal(r.porqueSemCpl, null);
  assert.equal(r.campanhas[0].cpl, 50);
});

test("o CPL global é ponderado pelo gasto, não é média das médias", () => {
  // A ÷ 100/10 = 10; B ÷ 900/10 = 90. A média das médias daria 50; a ponderada
  // dá 50 também... então os números são escolhidos para separá-las:
  // A: 100 reais / 50 leads = 2 · B: 900 reais / 10 leads = 90
  // média das médias = 46 · ponderada = 1000/60 = 16,67
  const r = reconciliaInvestimento([gasto("A", 100), gasto("B", 900)], [leads("A", 50), leads("B", 10)]);
  assert.equal(r.cplGlobal, 16.67);
});

test("campanhas SEM as duas pontas ficam fora do CPL global, mesmo com outras dentro", () => {
  // A tem as duas pontas; B só gasto. O CPL global é o de A, não o de A+B.
  const r = reconciliaInvestimento([gasto("A", 100), gasto("B", 900)], [leads("A", 10)]);
  assert.equal(r.cplGlobal, 10, "o gasto de B contaminou o CPL de A");
  assert.equal(r.gastoSemLead.reais, 900);
  assert.equal(r.investimentoTotal, 1000, "o total mostrado ainda é o gasto INTEIRO");
});

// ── AS TRÊS FRASES DIFERENTES ───────────────────────────────────────────────

test("só gasto: a frase manda procurar por que os anúncios não converteram", () => {
  const r = reconciliaInvestimento([gasto("A", 500)], []);
  assert.match(r.porqueSemCpl, /nenhuma lead atribuída/i);
});

test("só lead: a frase manda procurar a conta de anúncios certa", () => {
  const r = reconciliaInvestimento([], [leads("Z", 24)]);
  assert.match(r.porqueSemCpl, /conta de anúncios configurada no CRM não é a que produziu/i);
});

test("nenhum dos dois: a frase diz que não há o que reconciliar, e não finge erro", () => {
  const r = reconciliaInvestimento([], []);
  assert.equal(r.investimentoTotal, 0);
  assert.match(r.porqueSemCpl, /não há as duas pontas/i);
});

// ── SOMAS E BORDAS ──────────────────────────────────────────────────────────

test("várias linhas de gasto da mesma campanha somam numa campanha só", () => {
  // No banco há uma linha por DIA; a reconciliação é por campanha.
  const r = reconciliaInvestimento(
    [{ externalId: "A", nome: "A", reais: 40.64, de: "2026-07-01", ate: "2026-07-01" },
     { externalId: "A", nome: "A", reais: 51.97, de: "2026-07-02", ate: "2026-07-02" }],
    [leads("A", 2)],
  );
  assert.equal(r.campanhas.length, 1);
  assert.equal(r.campanhas[0].reais, 92.61);
  assert.equal(r.periodo.de, "2026-07-01");
  assert.equal(r.periodo.ate, "2026-07-02");
});

test("a mesma lead tocada duas vezes pela mesma campanha não vira duas leads", () => {
  // A rota conta leads DISTINTAS por campanha; aqui o módulo apenas soma o que
  // recebe. O contrato guarda o contrato entre os dois: quem recebe já vem
  // deduplicado.
  const r = reconciliaInvestimento([gasto("A", 100)], [leads("A", 10)]);
  assert.equal(r.campanhas[0].leads, 10);
});

test("campanha que só aparece do lado das leads é rotulada como fora da conta", () => {
  const r = reconciliaInvestimento([], [leads("Z", 5)]);
  assert.match(r.campanhas[0].nome, /fora da conta de anúncios configurada/i);
});

test("a lista sai ordenada por gasto — quem consome mais aparece primeiro", () => {
  const r = reconciliaInvestimento([gasto("A", 10), gasto("B", 900), gasto("C", 100)], []);
  assert.deepEqual(r.campanhas.map((c) => c.externalId), ["B", "C", "A"]);
});

test("gasto zero com leads não vira divisão por zero nem CPL R$ 0", () => {
  const r = reconciliaInvestimento([gasto("A", 0)], [leads("A", 5)]);
  assert.equal(r.campanhas[0].cpl, null, "CPL de R$ 0,00 diria que a lead saiu de graça");
  assert.equal(r.cplGlobal, null);
});
