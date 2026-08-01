/**
 * Contrato dos SINAIS DE AQUISIÇÃO.
 *
 * A regra que estes testes protegem: o motor proativo só fala quando tem o que
 * dizer, e nunca inventa gravidade. Cada sinal existe porque um defeito real foi
 * medido em 2026-07-26 — e todos eram silenciosos.
 *
 * Rodar: node --test tests/contracts/acquisition-signals.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "ai", "acquisition-signals.ts"), "utf8");
const { sinaisDeAquisicao, resumoDaAquisicao } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

const saudavel = {
  fontesOrfas: 0,
  formulariosForaDoCrm: 0,
  leadsForaDoCrm: 0,
  leadsPagasSemCampanha: 0,
  leadsDeCampanhaSemDono: 0,
  leadsDeCampanhaComSlaVencido: 0,
  diasSemLeadNova: 0,
  contaDeAnunciosAcessivel: true,
};

test("operação saudável não gera ruído nenhum", () => {
  assert.deepEqual(sinaisDeAquisicao(saudavel), []);
  assert.equal(resumoDaAquisicao([]), null);
});

test("lead presa em formulário desconhecido é urgência máxima", () => {
  const sinais = sinaisDeAquisicao({ ...saudavel, formulariosForaDoCrm: 4, leadsForaDoCrm: 88 });
  const alvo = sinais.find((s) => s.chave === "formularios-fora-do-crm");
  assert.ok(alvo, "sinal ausente");
  assert.equal(alvo.urgencia, 5);
  assert.match(alvo.titulo, /88 lead/);
  assert.match(alvo.detalhe, /4 formulário/);
});

test("lead de campanha sem dono é tratada como dinheiro saindo", () => {
  const alvo = sinaisDeAquisicao({ ...saudavel, leadsDeCampanhaSemDono: 3 })
    .find((s) => s.chave === "lead-de-campanha-sem-dono");
  assert.equal(alvo.urgencia, 5);
  // A frase precisa dizer POR QUE ninguém é avisado — é o elo não óbvio.
  assert.match(alvo.detalhe, /não alcança lead sem dono/);
});

test("a ação muda conforme a conta de anúncios esteja acessível ou não", () => {
  const comConta = sinaisDeAquisicao({ ...saudavel, leadsPagasSemCampanha: 5, contaDeAnunciosAcessivel: true })
    .find((s) => s.chave === "lead-paga-sem-campanha");
  const semConta = sinaisDeAquisicao({ ...saudavel, leadsPagasSemCampanha: 5, contaDeAnunciosAcessivel: false })
    .find((s) => s.chave === "lead-paga-sem-campanha");
  assert.match(comConta.acao, /backfill/i);
  assert.match(semConta.acao, /ads_read/);
  assert.notEqual(comConta.acao, semConta.acao);
});

test("silêncio curto não vira alarme; silêncio longo vira", () => {
  const doisDias = sinaisDeAquisicao({ ...saudavel, diasSemLeadNova: 2 });
  assert.ok(!doisDias.some((s) => s.chave === "silencio-na-entrada"), "2 dias ainda é variação");
  const cincoDias = sinaisDeAquisicao({ ...saudavel, diasSemLeadNova: 5 });
  assert.ok(cincoDias.some((s) => s.chave === "silencio-na-entrada"));
});

test("nunca teve lead (null) não é o mesmo que parou de ter", () => {
  const sinais = sinaisDeAquisicao({ ...saudavel, diasSemLeadNova: null });
  assert.ok(!sinais.some((s) => s.chave === "silencio-na-entrada"),
    "null significa 'nunca entrou' — alarmar sobre queda de algo que nunca existiu é ruído");
});

test("os sinais saem do mais urgente para o menos", () => {
  const sinais = sinaisDeAquisicao({
    ...saudavel,
    leadsPagasSemCampanha: 2,
    fontesOrfas: 1,
    leadsDeCampanhaComSlaVencido: 7,
  });
  const urgencias = sinais.map((s) => s.urgencia);
  assert.deepEqual([...urgencias].sort((a, b) => b - a), urgencias);
});

test("toda ação é executável — diz onde ir, não só o que está errado", () => {
  const sinais = sinaisDeAquisicao({
    fontesOrfas: 1, formulariosForaDoCrm: 1, leadsForaDoCrm: 1,
    leadsPagasSemCampanha: 1, leadsDeCampanhaSemDono: 1, leadsDeCampanhaComSlaVencido: 1,
    diasSemLeadNova: 9, contaDeAnunciosAcessivel: false,
  });
  assert.equal(sinais.length, 7, "todos os sinais precisam disparar neste cenário");
  for (const sinal of sinais) {
    assert.ok(sinal.acao.length > 15, `ação vaga em ${sinal.chave}`);
    assert.ok(sinal.titulo.length > 10, `título vago em ${sinal.chave}`);
    assert.ok(sinal.urgencia >= 1 && sinal.urgencia <= 5, `urgência fora da escala em ${sinal.chave}`);
  }
  assert.match(resumoDaAquisicao(sinais), /custando dinheiro agora/);
});

test("resumo distingue crítico de atenção", () => {
  const soAtencao = sinaisDeAquisicao({ ...saudavel, fontesOrfas: 1 });
  assert.match(resumoDaAquisicao(soAtencao), /ponto\(s\) de atenção/);
});

test("o motor não depende de IA — nenhuma chamada de rede no módulo", () => {
  assert.ok(!/fetch\(|axios|http/.test(fonte), "diagnóstico que é aritmética não deve gastar token nem rede");
});
