/**
 * Contrato do VOCABULÁRIO DE STATUS DE TAREFA.
 *
 * Havia CINCO definições de "tarefa concluída" no projeto, uma por rota, e
 * nenhuma igual à outra. A mesma tarefa contava como aberta numa tela e fechada
 * na outra — e "cancelada" era pendente para sempre em três das cinco.
 *
 * Rodar: node --test tests/contracts/tarefa-status-unico.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "crm", "task-status.ts"), "utf8");
const { tarefaEncerrada, tarefaAberta, statusEncerradosParaPostgrest } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

test("reconhece as duas grafias que o projeto escreve hoje", () => {
  // O POST de /api/v1/tasks e o vigia de SLA gravam "pendente"; as objeções, as
  // aprovações e o relatório do parceiro gravam "OPEN". As duas são abertas.
  assert.equal(tarefaAberta("pendente"), true);
  assert.equal(tarefaAberta("OPEN"), true);
  assert.equal(tarefaAberta("open"), true);
});

test("cancelada é encerrada — três das cinco listas antigas não sabiam disso", () => {
  for (const status of ["cancelada", "cancelado", "cancelled", "canceled"]) {
    assert.equal(tarefaEncerrada(status), true, `${status} deveria encerrar`);
  }
});

test("concluído com acento conta, em qualquer caixa", () => {
  for (const status of ["concluida", "concluída", "concluido", "concluído", "CONCLUÍDA", " Done "]) {
    assert.equal(tarefaEncerrada(status), true, `${status} deveria encerrar`);
  }
});

test("status desconhecido conta como ABERTA", () => {
  // Cobrar uma tarefa já feita custa um clique de quem recebe; esquecer uma
  // pendente custa um cliente. Na dúvida, aberta.
  assert.equal(tarefaAberta("status_que_ninguem_viu"), true);
  assert.equal(tarefaAberta(null), true);
  assert.equal(tarefaAberta(undefined), true);
  assert.equal(tarefaAberta(""), true);
});

test("o filtro do PostgREST não leva acento", () => {
  // PostgREST não escapa caracteres fora de ASCII nesse formato e a consulta
  // quebraria. O acento é tratado na leitura em memória.
  const filtro = statusEncerradosParaPostgrest();
  assert.match(filtro, /^\([a-z_,]+\)$/, `veio ${filtro}`);
  assert.ok(filtro.includes("done") && filtro.includes("cancelada"));
});

// ── Estrutura: as cinco listas não podem voltar ────────────────────────────

test("nenhuma rota mantém a própria lista de status encerrado", () => {
  const rotas = [
    "app/api/v1/tasks/route.ts",
    "app/api/v1/calendar/route.ts",
    "app/api/v1/leads/[id]/route.ts",
    "app/api/v1/ai/proactive/route.ts",
    "app/api/v1/governance/command-center/route.ts",
  ];
  const comListaPropria = rotas.filter((arquivo) => {
    const texto = fs.readFileSync(path.join(raiz, arquivo), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    // Lista literal com pelo menos dois status de encerramento juntos.
    return /\[[^\]]*"(done|concluida|completed)"[^\]]*"(done|concluida|completed|cancelado)"/.test(texto)
      || /"\((done|concluida)[a-z,]*\)"/.test(texto);
  });
  assert.deepEqual(comListaPropria, [],
    "lista própria é como as cinco divergiram — a definição tem que vir de lib/crm/task-status");
});

test("a IA proativa consulta as colunas que a tabela tem", () => {
  const proativa = fs.readFileSync(path.join(raiz, "app", "api", "v1", "ai", "proactive", "route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  // Recorte só até o fim DESTA consulta: a linha seguinte lê `leads`, onde
  // `assigned_to` é coluna legítima. A primeira versão deste teste reprovava
  // por causa dela — asserção larga demais mede o vizinho.
  const inicio = proativa.indexOf('from("tasks")');
  const trecho = proativa.slice(inicio, proativa.indexOf("),", inicio));
  assert.match(trecho, /\.eq\("user_id", brokerId\)/,
    "a tabela tasks tem user_id, não assigned_to");
  assert.match(trecho, /\.lt\("due_date"/,
    "a tabela tasks tem due_date, não due_at");
  assert.ok(!/assigned_to|due_at/.test(trecho),
    "colunas inexistentes davam 42703, o count vinha null, e o alerta de tarefas atrasadas nunca disparava");
});
