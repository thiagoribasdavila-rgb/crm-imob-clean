/**
 * Contrato do RELATÓRIO SEMANAL DO INCORPORADOR.
 *
 * Este relatório sai da casa: a incorporadora decide verba e renovação de
 * parceria com ele. A promessa que estes testes protegem é uma só — **número
 * não medido nunca vira zero.**
 *
 * Rodar: node --test tests/contracts/relatorio-semanal-incorporador.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "developers", "weekly-report.ts"), "utf8");
const { montarRelatorioSemanal, semanaFechadaAte, semanaAnteriorA } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

const empreendimento = (extra = {}) => ({
  developmentId: "d1",
  nome: "Inside Perdizes",
  leadsRecebidas: 20,
  leadsContatadas: 12,
  medianaDeRespostaMin: 8,
  leadsComSlaVencido: 3,
  visitasAgendadas: 4,
  propostas: 1,
  vendas: 0,
  campanhas: ["Inside Perdizes — Meta"],
  gasto: null,
  ...extra,
});

const entrada = (extra = {}) => ({
  incorporador: { id: "i1", nome: "Teixeira Duarte" },
  semana: semanaFechadaAte(new Date("2026-07-26T09:00:00-03:00")),
  empreendimentos: [empreendimento()],
  ...extra,
});

// ── A semana ────────────────────────────────────────────────────────────────

test("a semana do relatório de domingo é a que ACABOU de fechar", () => {
  // Rodar o worker à meia-noite de domingo e mandar a semana que está
  // começando seria entregar sete dias de zero à incorporadora.
  const s = semanaFechadaAte(new Date("2026-07-26T00:30:00-03:00"));
  assert.equal(new Date(s.fim).getDay(), 0, "termina num domingo");
  assert.equal(new Date(s.inicio).getDay(), 1, "começa numa segunda");
  const dias = (new Date(s.fim) - new Date(s.inicio)) / 86_400_000;
  assert.ok(dias > 6.9 && dias < 7, `sete dias fechados, veio ${dias}`);
});

test("de uma quarta-feira, a semana fechada é a anterior", () => {
  const s = semanaFechadaAte(new Date("2026-07-22T15:00:00-03:00")); // quarta
  assert.equal(new Date(s.fim).getDay(), 0);
  assert.ok(new Date(s.fim) < new Date("2026-07-22T00:00:00-03:00"),
    "não pode incluir dias que ainda não aconteceram");
});

test("a semana anterior não encosta na atual", () => {
  const atual = semanaFechadaAte(new Date("2026-07-26T09:00:00-03:00"));
  const anterior = semanaAnteriorA(atual);
  assert.ok(new Date(anterior.fim) < new Date(atual.inicio), "não pode haver sobreposição");
});

// ── A promessa central ──────────────────────────────────────────────────────

test("gasto não lido NÃO vira zero — vira ressalva declarada", () => {
  const r = montarRelatorioSemanal(entrada());
  assert.equal(r.total.gasto, null, "gasto ausente é null, nunca 0");
  assert.equal(r.total.cpl, null, "sem gasto não há CPL");
  assert.ok(r.naoMedido.some((linha) => /gasto/i.test(linha)), "a ausência tem que ser dita");
  assert.ok(!/R\$\s*0,00/.test(r.book), "o book não pode anunciar mídia de graça");
});

test("gasto parcial não é somado como se fosse total", () => {
  const r = montarRelatorioSemanal(entrada({
    empreendimentos: [
      empreendimento({ gasto: 3000, leadsRecebidas: 20 }),
      empreendimento({ developmentId: "d2", nome: "Tiê Aclimação", gasto: null, leadsRecebidas: 30 }),
    ],
  }));
  assert.equal(r.total.gasto, 3000);
  assert.equal(r.total.cpl, 150, "o CPL considera só as leads do que teve gasto medido: 3000/20");
  assert.ok(r.naoMedido.some((l) => /parcial/i.test(l) && /Tiê Aclimação/.test(l)));
});

test("semana sem lead: taxa de atendimento é null, não 0%", () => {
  const r = montarRelatorioSemanal(entrada({
    empreendimentos: [empreendimento({ leadsRecebidas: 0, leadsContatadas: 0, medianaDeRespostaMin: null, leadsComSlaVencido: 0, visitasAgendadas: 0, propostas: 0, vendas: 0 })],
  }));
  assert.equal(r.total.taxaDeAtendimento, null, "dividir por zero não dá 0%");
  assert.equal(r.vazio, true);
  assert.match(r.resumo, /Nenhuma lead nova/, "o relatório sai mesmo assim, dizendo o que houve");
});

test("sem tempo de resposta medido, o book diz isso em vez de mostrar 0 min", () => {
  const r = montarRelatorioSemanal(entrada({
    empreendimentos: [empreendimento({ leadsContatadas: 0, medianaDeRespostaMin: null })],
  }));
  assert.match(r.book, /sem tempo de resposta medido/);
  assert.ok(!/resposta em 0 min/.test(r.book));
  assert.ok(r.naoMedido.some((l) => /Tempo de resposta/i.test(l)));
});

// ── O que a incorporadora lê ────────────────────────────────────────────────

test("atendimento fraco é nomeado, e a culpa vai para o lugar certo", () => {
  // O caso real da base: 174 leads de Inside Perdizes, nenhuma contatada.
  // Dizer "campanha performou" com esse número seria vender o erro de casa.
  const r = montarRelatorioSemanal(entrada({
    empreendimentos: [empreendimento({ leadsRecebidas: 174, leadsContatadas: 0, medianaDeRespostaMin: null, leadsComSlaVencido: 174 })],
  }));
  assert.match(r.resumo, /gargalo está no atendimento, não na mídia/);
});

test("a variação contra a semana anterior só existe com base", () => {
  const semBase = montarRelatorioSemanal(entrada({ semanaAnterior: { leadsRecebidas: 0, leadsContatadas: 0 } }));
  assert.equal(semBase.variacaoDeLeads, null, "crescer a partir de zero não é percentual");

  const comBase = montarRelatorioSemanal(entrada({ semanaAnterior: { leadsRecebidas: 10, leadsContatadas: 5 } }));
  assert.equal(comBase.variacaoDeLeads, 1, "20 contra 10 é +100%");
  assert.match(comBase.book, /\+100%/);
});

test("a ressalva vem ANTES do fecho, nunca enterrada no rodapé", () => {
  const r = montarRelatorioSemanal(entrada());
  const posRessalva = r.book.indexOf("O QUE NÃO FOI MEDIDO");
  const posFecho = r.book.indexOf("Relatório gerado pelo Atlas");
  assert.ok(posRessalva > 0 && posRessalva < posFecho,
    "enterrar a ressalva no fim é o mesmo que escondê-la");
});

test("o book é texto puro — chega inteiro em e-mail, WhatsApp e PDF", () => {
  const r = montarRelatorioSemanal(entrada());
  assert.ok(!/<[a-z]+[\s>]/i.test(r.book), "HTML quebrado no cliente do parceiro é pior que texto simples");
  assert.match(r.book, /RELATÓRIO SEMANAL · TEIXEIRA DUARTE/);
  assert.match(r.book, /Semana de/);
});

test("o módulo não vai ao banco nem manda e-mail", () => {
  assert.ok(!/fetch\(|supabase|nodemailer|sendgrid/i.test(fonte),
    "apuração, envio e formatação são fronteiras diferentes — misturá-las torna o cálculo intestável");
});
