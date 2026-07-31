/**
 * Contrato da RECOMENDAÇÃO DE REDISTRIBUIÇÃO — o primeiro agente que decide em
 * sombra.
 *
 * Antes disto, três módulos completos (modo-sombra 278 linhas,
 * niveis-de-autonomia 307, registro-de-sombra 157) estavam ligados uns aos
 * outros e a `ai_shadow_decisions` — que tinha **0 linhas**. O diagnóstico
 * estava escrito na própria matriz de autonomia: "Pré-requisito único: um
 * agente que decida em sombra. Hoje não existe."
 *
 * E do outro lado havia `ATLAS_SLA_AUTO_REASSIGN`, uma variável de ambiente com
 * cara de interruptor que, ligada, não acendia luz nenhuma — o próprio worker
 * reportava "habilitada por ambiente, mas ainda não implementada".
 *
 * Os casos abaixo cobrem, principalmente, as RECUSAS: guarda que nunca foi vista
 * recusando é guarda não verificada.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  recomendarRedistribuicao,
  ATRASO_MINIMO_PARA_RECOMENDAR_MIN,
  TETO_DE_RECOMENDACOES,
} from "../../lib/crm/redistribuicao-em-sombra.ts";

const lead = (id, atrasoMin, dono = "corretor-a") => ({ id, nome: `Lead ${id}`, donoAtual: dono, atrasoMin, origem: "meta" });
const corretor = (id, semContato, emAberto = semContato, nome = null) => ({ brokerId: id, nome: nome ?? `Corretor ${id}`, semPrimeiroContato: semContato, emAberto });

// ── AS RECUSAS ──────────────────────────────────────────────────────────────

test("sem corretor nenhum não há recomendação — e o motivo é dito", () => {
  const r = recomendarRedistribuicao([lead("l1", 999)], []);
  assert.deepEqual(r.recomendacoes, []);
  assert.match(r.porqueVazio, /Nenhum corretor ativo/i);
});

test("com UM corretor só, redistribuir devolveria a lead para a mesma pessoa", () => {
  const r = recomendarRedistribuicao([lead("l1", 999)], [corretor("corretor-a", 5)]);
  assert.deepEqual(r.recomendacoes, []);
  assert.match(r.porqueVazio, /mesma pessoa/i);
});

test("lead vencida há POUCO não entra — pode estar sendo trabalhada agora", () => {
  // O SLA venceu, mas 10 minutos não é abandono. Recomendar tirar a lead de
  // quem pode estar no telefone com o cliente é atropelar o atendimento.
  const r = recomendarRedistribuicao([lead("l1", 10)], [corretor("a", 1), corretor("b", 2)]);
  assert.deepEqual(r.recomendacoes, []);
  assert.match(r.porqueVazio, /não é abandonado/i);
});

test("o corte de atraso é exatamente ATRASO_MINIMO — o limite entra, o anterior não", () => {
  const dois = [corretor("a", 1), corretor("b", 2)];
  assert.equal(recomendarRedistribuicao([lead("l1", ATRASO_MINIMO_PARA_RECOMENDAR_MIN - 1, "b")], dois).recomendacoes.length, 0);
  assert.equal(recomendarRedistribuicao([lead("l1", ATRASO_MINIMO_PARA_RECOMENDAR_MIN, "b")], dois).recomendacoes.length, 1);
});

test("a lead NUNCA é recomendada para o próprio dono", () => {
  // Redistribuir para quem já não contatou é manter o problema com outro nome —
  // e o dono atual é justamente o de menor fila neste caso, então a regra
  // precisa vencer o critério de carga.
  const r = recomendarRedistribuicao(
    [lead("l1", 999, "a")],
    [corretor("a", 0), corretor("b", 50)],
  );
  assert.equal(r.recomendacoes[0].paraQuem, "b");
});

// ── A ESCOLHA DO DESTINO ────────────────────────────────────────────────────

test("o destino é quem tem MENOS leads sem primeiro contato, não a menor carteira", () => {
  // `b` tem carteira maior, e é quem está de fato atendendo. Ordenar por
  // carteira mandaria a lead para quem já tem 30 paradas.
  const r = recomendarRedistribuicao(
    [lead("l1", 999, "z")],
    [corretor("a", 30, 31), corretor("b", 2, 90)],
  );
  assert.equal(r.recomendacoes[0].paraQuem, "b");
});

test("empate em não-atendidas desempata pela menor carteira", () => {
  const r = recomendarRedistribuicao([lead("l1", 999, "z")], [corretor("a", 3, 90), corretor("b", 3, 10)]);
  assert.equal(r.recomendacoes[0].paraQuem, "b");
});

test("empate total desempata pelo id — duas execuções seguidas não podem divergir", () => {
  // Saída instável destruiria a comparação: a mesma lead apareceria recomendada
  // para pessoas diferentes sem que nada tivesse mudado.
  const um = recomendarRedistribuicao([lead("l1", 999, "z")], [corretor("b", 3, 10), corretor("a", 3, 10)]);
  const dois = recomendarRedistribuicao([lead("l1", 999, "z")], [corretor("a", 3, 10), corretor("b", 3, 10)]);
  assert.equal(um.recomendacoes[0].paraQuem, dois.recomendacoes[0].paraQuem);
  assert.equal(um.recomendacoes[0].paraQuem, "a");
});

test("a carga do destino sobe a cada recomendação — 20 leads não vão todas para o mesmo", () => {
  // Sem simular a carga, o "menos carregado" receberia o lote inteiro e o
  // plano criaria, no papel, o gargalo que quer desfazer.
  const r = recomendarRedistribuicao(
    [lead("l1", 999, "z"), lead("l2", 998, "z"), lead("l3", 997, "z"), lead("l4", 996, "z")],
    [corretor("a", 0), corretor("b", 0)],
  );
  const destinos = r.recomendacoes.map((x) => x.paraQuem);
  assert.equal(new Set(destinos).size, 2, "todas foram para o mesmo corretor");
  assert.deepEqual(destinos, ["a", "b", "a", "b"]);
});

// ── O TETO É DECLARADO, NUNCA SILENCIOSO ────────────────────────────────────

test("o que passa do teto é CONTADO — corte silencioso lê-se como 'cobrimos tudo'", () => {
  const leads = Array.from({ length: TETO_DE_RECOMENDACOES + 7 }, (_, i) => lead(`l${i}`, 999 - i, "z"));
  const r = recomendarRedistribuicao(leads, [corretor("a", 0), corretor("b", 0)]);
  assert.equal(r.recomendacoes.length, TETO_DE_RECOMENDACOES);
  assert.equal(r.foraDoTeto, 7);
});

test("as mais atrasadas entram primeiro — o teto não corta pela ordem de chegada", () => {
  const r = recomendarRedistribuicao(
    [lead("nova", 400, "z"), lead("antiga", 9999, "z")],
    [corretor("a", 0), corretor("b", 0)],
    { teto: 1 },
  );
  assert.equal(r.recomendacoes[0].leadId, "antiga");
  assert.equal(r.foraDoTeto, 1);
});

// ── A FRASE QUE VAI PARA O REGISTRO DE SOMBRA ───────────────────────────────

test("a recomendação carrega nome, destino e o tamanho do atraso em horas", () => {
  const r = recomendarRedistribuicao([lead("l1", 720, "z")], [corretor("a", 0, 0, "Ana"), corretor("b", 9)]);
  assert.match(r.recomendacoes[0].recomendacao, /Ana/);
  assert.match(r.recomendacoes[0].recomendacao, /12h sem primeiro contato/);
});

test("o `porque` explica a escolha com número, não com adjetivo", () => {
  const r = recomendarRedistribuicao([lead("l1", 999, "z")], [corretor("a", 2, 40), corretor("b", 9)]);
  assert.match(r.recomendacoes[0].porque, /2 lead\(s\) sem primeiro contato e 40 em aberto/);
});

// ── O ELO COM O SHADOW MODE ─────────────────────────────────────────────────

test("`redistribuir_lead` está na lista de ações retidas por padrão", async () => {
  // É esta linha que garante que a recomendação NUNCA execute, mesmo se alguém
  // ligar ATLAS_SLA_AUTO_REASSIGN. Se a ação sair da lista, este contrato cai —
  // e é exatamente esse o alarme que se quer.
  const { ACOES_RETIDAS_PADRAO } = await import("../../lib/ai/modo-sombra.ts");
  assert.ok(ACOES_RETIDAS_PADRAO.includes("redistribuir_lead"));
});
