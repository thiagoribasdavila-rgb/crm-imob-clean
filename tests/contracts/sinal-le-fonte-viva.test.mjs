/**
 * Contrato: SINAL DE ATENÇÃO LÊ FONTE VIVA — E DECLARA QUANDO NÃO TEM O QUE LER.
 *
 * ── O DEFEITO QUE ISTO FIXA ──────────────────────────────────────────────────
 *
 * Medido no banco vivo (org 7c8c71c1, 490 leads): das cinco fontes dos sinais
 * de atenção, TRÊS tinham zero linhas — `pipeline_history` 0, `followups` 0,
 * `lead_objections` 0. O alerta existia, a tela existia, e ele nunca acendia.
 *
 * O perigo não é o alerta mudo. É o alerta mudo ser byte a byte idêntico a
 * "operação impecável". A tela dizia "nada a fazer" porque não tinha onde
 * olhar.
 *
 * E havia coisa pior que silêncio. Com `pipeline_history` vazia, `stale_stage`
 * caía para `leads.created_at` e AFIRMAVA, para os 66 leads vivos, "Nenhuma
 * movimentação registrada desde a criação do lead". Medido: 29 desses 66 TINHAM
 * movimentação gravada em `pipeline_stage_moves`. O sinal não estava mudo,
 * estava mentindo — e contando os dias parados a partir da data errada.
 *
 * ── AS TRÊS FONTES VAZIAS NÃO ERAM A MESMA DOENÇA ────────────────────────────
 *
 * 1. `pipeline_history` — espelho MORTO de fato vivo. Quem grava é a RPC
 *    `move_pipeline_lead`, em `pipeline_stage_moves` (478 linhas). Reapontado.
 *
 * 2. `followups` — NUNCA teve INSERT em lugar nenhum do repositório; a única
 *    escrita é um UPDATE por id de linha que não podia existir. O fato vivo é
 *    `tasks`, que a própria broker-daily já lia. Reapontado.
 *
 * 3. `lead_objections` — vazia, mas VIVA: a rota de objeções insere e resolve
 *    normalmente. Ninguém registrou objeção ainda. Não há para onde reapontar,
 *    então o sinal passou a DIZER que não pode ser medido.
 *
 * ── A ARMADILHA QUE ESTE CONTRATO GUARDA ─────────────────────────────────────
 *
 * O candidato "óbvio" para substituir `lead_objections` era
 * `pipeline_stage_moves.discard_reason_key` (273 preenchidos). É uma cilada
 * medida: os 273 descartes estão TODOS em leads com status "perdido", que é
 * etapa terminal — e o motor descarta etapas terminais ANTES de calcular
 * qualquer sinal. Apontar para lá daria zero por construção: trocaria fonte
 * vazia por fonte filtrada a vazio, com aparência de conserto. Este contrato
 * existe para que ninguém "conserte" o sinal 4 desse jeito.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  tarefaEstaConcluida,
  tarefaVencida,
} from "../../lib/atlas/tarefa-em-aberto.ts";

const raiz = path.resolve(import.meta.dirname, "../..");
const motor = fs.readFileSync(path.join(raiz, "lib/atlas/attention-signals.ts"), "utf8");

// As tabelas que o motor realmente CONSULTA — só `.from("...")`, para não
// confundir com as citações em comentário, que descrevem o defeito antigo e
// precisam continuar podendo ser escritas.
const consultadas = new Set([...motor.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]));

test("o motor consulta a tabela CANÔNICA de movimentação, não o espelho morto", () => {
  assert.ok(
    consultadas.has("pipeline_stage_moves"),
    "stale_stage precisa ler pipeline_stage_moves (478 linhas), a tabela que a RPC move_pipeline_lead grava",
  );
  assert.ok(
    !consultadas.has("pipeline_history"),
    "pipeline_history tem 0 linhas em produção: consultá-la faz o sinal contar desde created_at e afirmar 'nenhuma movimentação' para leads que moveram",
  );
});

test("o motor consulta tasks, não a tabela de follow-up que nunca recebeu INSERT", () => {
  assert.ok(
    consultadas.has("tasks"),
    "follow_up_overdue precisa ler tasks.due_date, o fato vivo equivalente",
  );
  assert.ok(
    !consultadas.has("followups"),
    "followups tem 0 linhas e nenhum caminho de INSERT no repositório: o sinal nunca poderia acender",
  );
});

test("o sinal de objeção continua lendo lead_objections — a fonte viva, ainda que vazia", () => {
  // Vazia não é morta: a rota de objeções insere de verdade. No dia em que um
  // corretor registrar a primeira objeção, o sinal tem de acender sozinho.
  assert.ok(
    consultadas.has("lead_objections"),
    "objection_open lê lead_objections; trocar por outra fonte quebraria o sinal quando a tabela enfim receber dados",
  );
});

test("objeção NÃO pode ser reapontada para o descarte com motivo", () => {
  // Os 273 descartes estão todos em leads "perdido", e etapa terminal é
  // descartada antes de qualquer sinal — o resultado seria zero por construção.
  const leDescarteParaObjecao = /lead_objections[\s\S]{0,400}discard_reason_key/.test(motor)
    && /\.from\("pipeline_stage_moves"\)[\s\S]{0,300}discard_reason_key/.test(motor);
  assert.ok(
    !leDescarteParaObjecao,
    "descarte é laudo de óbito, objeção em aberto é cliente esperando resposta; e todo descarte está em etapa terminal, que o motor filtra antes",
  );
});

test("o motor sabe DIZER que uma fonte não pode ser medida", () => {
  assert.match(
    motor,
    /export async function medirFontesDosSinais/,
    "sem uma medição das fontes, zero-por-tabela-vazia é indistinguível de zero-por-operação-saudável",
  );
  assert.match(motor, /mensuravel/, "cada fonte precisa declarar se tem como ser medida");
  assert.match(
    motor,
    /Não medido/,
    "a declaração precisa virar frase para a tela, não só um booleano",
  );
});

// ── O predicado de tarefa em aberto, exercitado nos DOIS sentidos ────────────
//
// Um filtro só está provado quando se prova o que ele deixa passar E o que ele
// barra. Provar só um lado deixa passar a versão que devolve sempre o mesmo.

const AGORA = Date.parse("2026-08-02T12:00:00.000Z");
const ONTEM = Date.parse("2026-08-01T12:00:00.000Z");
const AMANHA = Date.parse("2026-08-03T12:00:00.000Z");

test("status vivos de produção contam como EM ABERTO", () => {
  // Medido: os únicos status em tasks são "pendente" (7) e "OPEN" (6).
  assert.equal(tarefaEstaConcluida("pendente"), false);
  assert.equal(tarefaEstaConcluida("OPEN"), false);
});

test("status encerrados contam como CONCLUÍDOS, com ou sem acento e caixa", () => {
  for (const status of ["done", "concluido", "concluído", "CONCLUÍDA", "Completed", "cancelado", "CANCELADA"]) {
    assert.equal(tarefaEstaConcluida(status), true, `"${status}" encerra a tarefa`);
  }
});

test("vencida é prazo no passado E tarefa ainda em aberto", () => {
  assert.equal(tarefaVencida("pendente", ONTEM, AGORA), true, "em aberto e prazo passado");
  assert.equal(tarefaVencida("pendente", AMANHA, AGORA), false, "em aberto mas prazo futuro");
  assert.equal(tarefaVencida("concluido", ONTEM, AGORA), false, "prazo passado mas já concluída");
});

test("tarefa SEM prazo não é vencida — ausência de data não é atraso", () => {
  // Tratar null como vencido marcaria a carteira inteira: é a mesma classe de
  // erro que `primeiroContatoMensuravel` evita no motor.
  assert.equal(tarefaVencida("pendente", null, AGORA), false);
  assert.equal(tarefaVencida("pendente", Number.NaN, AGORA), false);
});

test("a rota do corretor não mantém cópia própria do critério de conclusão", () => {
  const rota = fs.readFileSync(
    path.join(raiz, "app/api/v1/analytics/broker-daily/route.ts"),
    "utf8",
  );
  assert.match(
    rota,
    /tarefaEstaConcluida/,
    "a rota e o sinal leem a MESMA tabela tasks; dois critérios dariam dois números para o mesmo fato na mesma tela",
  );
  assert.ok(
    !/const DONE = new Set\(/.test(rota),
    "a cópia local do conjunto de status concluídos foi substituída pela fonte única",
  );
});
