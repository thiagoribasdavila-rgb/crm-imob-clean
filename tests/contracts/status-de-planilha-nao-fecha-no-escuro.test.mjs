/**
 * CONTRATO: o status escrito à mão vira funil sem fechar lead no escuro.
 *
 * ── Por que este contrato existe ─────────────────────────────────────────
 *
 * A planilha DAVILA_CHRONOS trouxe 51 pessoas com o andamento datilografado
 * pelo corretor. As frases são reais e estão aqui como estão lá — com os erros
 * de digitação inclusive, porque é isso que a importação vai encontrar.
 *
 * O risco da tradução não é errar `contato` por `qualificacao`: é FECHAR. Um
 * `perdido` indevido tira a pessoa da fila do corretor para sempre, e ninguém
 * revisa uma lead perdida. Por isso a maior parte deste arquivo é sobre o que
 * NÃO pode fechar.
 *
 * ── O defeito que este contrato pegou no primeiro ensaio ─────────────────
 *
 * A primeira versão colhia TODAS as regras que casavam e depois preferia a que
 * fecha. Com isso "Cliente informou que ainda não tem interesse" saía
 * `perdido`: casava com a regra do adiamento E com a da recusa, e o fechamento
 * atropelava justamente a regra escrita para impedi-lo.
 *
 * A correção foi primeira-regra-vence — a ordem declarada É a precedência.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { traduzirStatusDaPlanilha } from "../../lib/crm/traduz-status-de-planilha.ts";

/* ── NA DÚVIDA, NÃO FECHA ────────────────────────────────────────────────── */

test("o 'ainda' salva a lead: adiamento não é recusa", () => {
  // Frase REAL da planilha. Foi ela que reprovou a primeira versão do módulo.
  const r = traduzirStatusDaPlanilha("Cliente informou que ainda não tem interesse.");
  assert.equal(r.estagio, "contato", "'ainda' é 'agora não' — e agora-não é lead viva");
  assert.equal(r.motivo, null);
});

test("'deixou mais pra frente a compra' também não fecha", () => {
  assert.equal(traduzirStatusDaPlanilha("Deixou mais pra frente a compra.").estagio, "contato");
});

test("a regra do adiamento vem ANTES da recusa — trocar a ordem quebra isto", () => {
  // Guarda contra alguém reordenar REGRAS achando que dá no mesmo.
  const adiou = traduzirStatusDaPlanilha("ainda não tem interesse");
  const recusou = traduzirStatusDaPlanilha("Disse não ter interesse.");
  assert.equal(adiou.estagio, "contato");
  assert.equal(recusou.estagio, "perdido", "a recusa explícita continua fechando");
});

test("texto desconhecido NÃO vira palpite — fica novo e se declara", () => {
  const r = traduzirStatusDaPlanilha("cliente pediu para retornar depois do carnaval");
  assert.equal(r.estagio, "novo");
  assert.equal(r.reconhecido, false, "quem importa precisa saber quantas não foram entendidas");
  assert.equal(r.textoOriginal, "cliente pediu para retornar depois do carnaval");
});

test("célula vazia é novo, e não inventa texto", () => {
  const r = traduzirStatusDaPlanilha("", null, undefined);
  assert.deepEqual(r, { estagio: "novo", motivo: null, textoOriginal: "", reconhecido: false });
});

/* ── SÓ FECHA COM TEXTO INEQUÍVOCO ───────────────────────────────────────── */

test("contrato assinado é ganho", () => {
  const r = traduzirStatusDaPlanilha("Contrato assinado");
  assert.equal(r.estagio, "ganho");
});

test("telefone incorreto é perdido COM motivo — a lead precisa dizer por quê", () => {
  const r = traduzirStatusDaPlanilha("Telefone incorreto");
  assert.equal(r.estagio, "perdido");
  assert.equal(r.motivo, "telefone incorreto", "perdido sem motivo é a lead que ninguém consegue auditar");
});

/* ── AS QUATRO GRAFIAS DE "EM CONTATO" ───────────────────────────────────── */

test("os erros de digitação da planilha caem todos no mesmo lugar", () => {
  // Estas quatro grafias estão TODAS na planilha real, nas mesmas 51 linhas.
  for (const grafia of ["Em contato", "em contato", "em ontato", "Em contaro"]) {
    const r = traduzirStatusDaPlanilha(grafia);
    assert.equal(r.estagio, "contato", `"${grafia}" precisa ser reconhecido`);
    assert.equal(r.reconhecido, true);
  }
});

test("as três grafias de 'encaminhei' também", () => {
  for (const grafia of ["Encaminhei informações", "Encamminhei informações via whatsApp.", "Encamiaanhei material"]) {
    assert.equal(traduzirStatusDaPlanilha(grafia).estagio, "contato", grafia);
  }
});

/* ── VISITA: MARCADA ≠ MARCANDO ──────────────────────────────────────────── */

test("agendou visita é qualificação; agendando visita ainda é contato", () => {
  assert.equal(traduzirStatusDaPlanilha("Cliente agendou visita").estagio, "qualificacao");
  assert.equal(
    traduzirStatusDaPlanilha("Em tratativa, agendando visita.").estagio,
    "contato",
    "quem está marcando ainda não marcou — a diferença é o trabalho que falta",
  );
});

/* ── NECESSIDADE DECLARADA PASSA DO PRIMEIRO CONTATO ─────────────────────── */

test("quem diz o que procura já está qualificado", () => {
  const r = traduzirStatusDaPlanilha("Cliente procura 1 ou 2 dorms enquadrado em HIS2.");
  assert.equal(r.estagio, "qualificacao");
});

/* ── DUAS COLUNAS QUE SE CONTRADIZEM ─────────────────────────────────────── */

test("quando as colunas discordam, o encerramento vence pela ordem", () => {
  const r = traduzirStatusDaPlanilha("Em contato", "Telefone incorreto");
  assert.equal(r.estagio, "perdido", "o contato foi tentado e o telefone não presta");
  assert.equal(r.textoOriginal, "Em contato · Telefone incorreto", "as duas células ficam à vista");
});

test("o texto original é sempre preservado — a tradução não apaga o que a pessoa escreveu", () => {
  const r = traduzirStatusDaPlanilha("Encamminhei informações via whatsApp.");
  assert.equal(r.textoOriginal, "Encamminhei informações via whatsApp.");
});

/* ── ACENTO E CAIXA NÃO PODEM CRIAR CASOS NOVOS ──────────────────────────── */

test("acento, caixa e espaço duplo dão o mesmo veredito", () => {
  const variantes = ["Sem interação", "SEM INTERAÇÃO", "sem  interacao", "  Sem Interação  "];
  const vereditos = new Set(variantes.map((v) => traduzirStatusDaPlanilha(v).estagio));
  assert.equal(vereditos.size, 1, `variações de escrita viraram ${vereditos.size} casos diferentes`);
  assert.equal([...vereditos][0], "novo");
});
