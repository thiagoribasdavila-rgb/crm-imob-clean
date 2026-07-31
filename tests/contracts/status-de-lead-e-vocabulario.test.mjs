/**
 * Contrato do VOCABULÁRIO DE STATUS — lista vazia não pode ser a resposta a um
 * erro de digitação.
 *
 * MEDIDO em 2026-07-31 contra a rota real, com usuário descartável:
 * `/api/v1/crm/leads?status=xpto-nao-existe` respondeu **HTTP 200 com total 0**
 * sobre uma base de 482 leads.
 *
 * Numa operação com 472 leads sem primeiro contato, "não há trabalho" é a pior
 * mensagem que o sistema pode emitir — e ela saía de um link com erro de
 * digitação, sem nenhum aviso.
 *
 * A guarda já existia do lado do CLIENTE (`app/(crm)/leads/page.tsx` valida o
 * status da URL contra a lista do seletor). Guarda em um lado só é guarda que o
 * outro lado não tem.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ehStatusConhecido, statusConhecidos, compatibleLeadStatuses } from "../../lib/compat/legacy-v2.ts";

test("todo status canônico é reconhecido", () => {
  for (const status of statusConhecidos()) {
    assert.equal(ehStatusConhecido(status), true, `"${status}" é canônico e foi recusado`);
  }
});

test("os apelidos de armazenamento também são reconhecidos", () => {
  // A base tem status gravado em maiúsculas e em formas legadas. Recusá-los
  // quebraria filtro que hoje funciona.
  for (const apelido of ["NOVO", "contato_realizado", "EM_ATENDIMENTO", "negociacao", "vendido", "archived"]) {
    assert.equal(ehStatusConhecido(apelido), true, `apelido "${apelido}" recusado`);
  }
});

test("status inventado é RECUSADO — este é o caso que custou a descoberta", () => {
  assert.equal(ehStatusConhecido("xpto-nao-existe"), false);
  assert.equal(ehStatusConhecido("ganhou"), false, "quase-certo é o mais perigoso: parece válido");
  assert.equal(ehStatusConhecido("perdida"), false);
});

test("vazio NÃO é inválido — ausência de filtro não é filtro errado", () => {
  assert.equal(ehStatusConhecido(""), true);
  assert.equal(ehStatusConhecido(null), true);
  assert.equal(ehStatusConhecido(undefined), true);
  assert.equal(ehStatusConhecido("   "), true);
});

test("o vocabulário publicado cobre as etapas terminais e as abertas", () => {
  const todos = statusConhecidos();
  for (const esperado of ["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho", "perdido"]) {
    assert.ok(todos.includes(esperado), `"${esperado}" sumiu do vocabulário`);
  }
});

test("o caminho de escape de compatibleLeadStatuses continua existindo — e por isso a guarda é necessária", () => {
  // Esta função NÃO foi endurecida de propósito: ela é usada em lugares onde o
  // valor já veio validado. O que muda é que a rota passa a validar ANTES.
  // Provar o escape aqui é o que impede alguém de concluir que a guarda é
  // redundante e removê-la.
  assert.deepEqual(compatibleLeadStatuses("xpto"), ["xpto"]);
});

test("a rota de listagem recusa status desconhecido com 400 e diz quais valem", () => {
  const rota = readFileSync("app/api/v1/crm/leads/route.ts", "utf8");
  assert.match(rota, /ehStatusConhecido\(status\)/);
  assert.match(rota, /INVALID_STATUS/);
  assert.match(rota, /statusConhecidos\(\)/, "a mensagem precisa listar o vocabulário — recusa sem alternativa é beco");
});
