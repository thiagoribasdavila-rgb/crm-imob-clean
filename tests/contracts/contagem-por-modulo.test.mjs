/**
 * Contrato da CONTAGEM POR MÓDULO.
 *
 * Nasceu de uma medição na produção: o painel de saúde mostrava 482 para Leads,
 * 482 para Pipeline e 482 para Clientes 360 — três de quatro módulos com o mesmo
 * número, porque os três liam o mesmo `result.count`.
 *
 * Os casos abaixo cobrem sobretudo as bordas em que "não sei" e "não tem" se
 * confundem — que é onde este produto já errou antes.
 *
 * Rodar: node --test tests/contracts/contagem-por-modulo.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { contarNoFunil, contarAlcancaveis } from "../../lib/atlas/core-v2/contagem-por-modulo.ts";

// ── O FUNIL CONTA O QUE ESTÁ EM ANDAMENTO ───────────────────────────────────

test("ganho e perdido saem do funil — são histórico, não trabalho", () => {
  const leads = [
    { status: "novo" }, { status: "contato" }, { status: "proposta" },
    { status: "ganho" }, { status: "perdido" },
  ];
  assert.equal(contarNoFunil(leads), 3);
});

test("etapa DESCONHECIDA conta como aberta", () => {
  // A asserção que importa: some do funil quem saiu dele por PROVA, nunca por
  // falta de informação. Lead sem classificação sumir do número é a forma
  // silenciosa de perdê-la.
  assert.equal(contarNoFunil([{ status: "esperando_jurídico" }, { status: null }, {}]), 3);
});

test("comprou_outro também fecha", () => {
  assert.equal(contarNoFunil([{ status: "comprou_outro" }, { status: "novo" }]), 1);
});

test("o funil usa a régua canônica, não uma lista local de status", () => {
  // Se alguém trocar `canonicalPipelineStage` por comparação de string crua,
  // `won` e o caixa-alta deixam de fechar e este caso cai.
  assert.equal(contarNoFunil([{ status: "won" }, { status: "GANHO" }, { status: "Ganho" }]), 0);
  assert.equal(contarNoFunil([{ status: "lost" }, { status: "PERDIDO" }]), 0);
});

test("DIVERGÊNCIA REGISTRADA: `vendido` fecha na cascata e é desconhecido na régua", () => {
  // Achado ao escrever este arquivo. `lib/distribution/hierarchical-cascade.ts`
  // tem CLOSED_STATUSES = "(won,ganho,vendido,lost,perdido,…)", mas
  // `canonicalPipelineStage("vendido")` devolve null — e null conta como ABERTA.
  //
  // Medido na base de produção (483 leads): os status existentes são novo,
  // perdido, contato, qualificacao, comprou_outro e ganho. Nenhum "vendido".
  // A divergência é LATENTE, não viva.
  //
  // Este caso existe para que ela não passe despercebida se alguém começar a
  // gravar "vendido": o dia em que este assert cair é o dia de unificar as duas
  // listas — e a decisão de qual vence é de produto, não minha.
  assert.equal(contarNoFunil([{ status: "vendido" }]), 1,
    "se isto virar 0, `canonicalPipelineStage` passou a conhecer `vendido` e a divergência com a cascata precisa ser fechada");
});

test("lista vazia é zero, não erro", () => {
  assert.equal(contarNoFunil([]), 0);
});

// ── CLIENTES 360 CONTA QUEM DÁ PARA ALCANÇAR ────────────────────────────────

test("basta UM canal — telefone ou e-mail", () => {
  const leads = [
    { phone: "11999999999" }, { email: "a@b.com" },
    { phone: "11988888888", email: "c@d.com" },
  ];
  assert.equal(contarAlcancaveis(leads), 3);
});

test("sem canal nenhum não é cliente alcançável", () => {
  assert.equal(contarAlcancaveis([{}, { phone: null, email: null }]), 0);
});

test("string vazia e só espaços não valem como contato", () => {
  // O defeito clássico: `""` e `"   "` passam num teste de existência e falham
  // no telefone de verdade.
  assert.equal(contarAlcancaveis([{ phone: "" }, { email: "   " }, { phone: "  ", email: "" }]), 0);
});

test("exigir os DOIS canais reprovaria a maioria das leads de anúncio", () => {
  // Lead de anúncio chega só com telefone. Se a regra exigisse ambos, o número
  // deixaria de descrever a operação.
  const soTelefone = Array.from({ length: 10 }, () => ({ phone: "11999999999" }));
  assert.equal(contarAlcancaveis(soTelefone), 10);
});

// ── OS TRÊS NÚMEROS PRECISAM PODER DIVERGIR ─────────────────────────────────

test("numa base real, os três módulos NÃO dão o mesmo número", () => {
  // É esta a asserção que impede a volta do defeito: se alguém religar os três
  // à mesma contagem, este caso cai.
  const leads = [
    { status: "novo", phone: "119" },
    { status: "contato", email: "a@b.com" },
    { status: "ganho", phone: "118" },
    { status: "perdido" },
    { status: "proposta" },
  ];
  const total = leads.length;
  const funil = contarNoFunil(leads);
  const alcancaveis = contarAlcancaveis(leads);
  assert.equal(total, 5);
  assert.equal(funil, 3);
  assert.equal(alcancaveis, 3);
  assert.notEqual(funil, total, "funil não pode ser igual ao total nesta base");
  assert.notEqual(alcancaveis, total, "alcançáveis não pode ser igual ao total nesta base");
});
