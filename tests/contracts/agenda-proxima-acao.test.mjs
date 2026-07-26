/**
 * Contrato da AGENDA e do select de leads que a alimenta.
 *
 * Dois defeitos, ambos do tipo "o dado existe, ninguém o busca":
 *
 * 1. `mapLegacyLead` mapeia `next_action_at` desde sempre, mas a coluna não
 *    estava em nenhum select. O mapeador caía na legada `next_contact`, vazia
 *    em 217/217. A agenda mostrava ZERO follow-ups com 9 leads agendados.
 *
 * 2. O select das visitas não faz join com lead, e o código lia `visit.lead`.
 *    Toda visita aparecia como "Cliente" — sem dizer com QUEM é, que é a única
 *    coisa que importa numa agenda.
 *
 * Rodar: node --test tests/contracts/agenda-proxima-acao.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const compat = fs.readFileSync(path.join(raiz, "lib", "compat", "legacy-v2.ts"), "utf8");
const agenda = fs.readFileSync(path.join(raiz, "app", "api", "v1", "calendar", "route.ts"), "utf8");

test("o select estendido busca next_action_at", () => {
  // Afere PERTENCIMENTO, não a lista literal. A primeira versão deste teste
  // fixava `["next_action_at"]` exato e reprovou assim que a auditoria de
  // Clientes 360 somou `development_id` e `purpose` ao mesmo grupo — bloqueando
  // uma correção legítima por causa da forma, não do comportamento.
  const bloco = compat.slice(
    compat.indexOf("NEXT_ACTION_COLUMNS = ["),
    compat.indexOf("] as const", compat.indexOf("NEXT_ACTION_COLUMNS = [")),
  );
  const colunas = [...bloco.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(colunas.includes("next_action_at"),
    "sem esta coluna o mapeador cai na legada e a agenda fica vazia");
  assert.match(
    compat,
    /LIVE_LEAD_SELECT_WITH_SLA = \[[\s\S]{0,200}\.\.\.NEXT_ACTION_COLUMNS,?[\s\S]{0,40}\]\.join/,
    "o grupo precisa entrar no select estendido",
  );
});

test("o grupo estendido só contém coluna que existe no banco", () => {
  // O fallback é TUDO OU NADA: uma coluna ausente devolve 42703 e a leitura cai
  // para o select base, perdendo o grupo inteiro — inclusive o SLA, que não tem
  // relação nenhuma. Foi o que aconteceu quando `next_action_label` entrou aqui
  // por engano: ela não existe neste banco e derrubou o SLA junto.
  assert.ok(
    !/NEXT_ACTION_COLUMNS = \[[^\]]*next_action_label/.test(compat),
    "next_action_label não existe no banco vivo — incluí-la derruba o grupo inteiro",
  );
});

test("o perigo do fallback está escrito onde alguém vai mexer", () => {
  const bloco = compat.slice(
    compat.indexOf("NEXT_ACTION_COLUMNS") - 1400,
    compat.indexOf("NEXT_ACTION_COLUMNS"),
  );
  assert.match(bloco, /TUDO OU NADA/,
    "quem for somar uma coluna precisa ler o aviso antes, não depois de quebrar o SLA");
});

test("a visita resolve o nome do lead pelo mapa já montado", () => {
  assert.match(
    agenda,
    /const lead = visit\.lead_id \? leadMap\.get\(String\(visit\.lead_id\)\) : null;/,
  );
  assert.ok(
    !/Array\.isArray\(visit\.lead\)/.test(agenda),
    "`visit.lead` nunca existiu: o select não faz join",
  );
});

test("o select das visitas continua sem join — e por isso o mapa é obrigatório", () => {
  const select = agenda.match(/\.select\("([^"]*scheduled_at[^"]*)"\)/)?.[1] ?? "";
  assert.ok(select.length > 0, "o select das visitas sumiu");
  assert.ok(
    !/lead\s*[:(]/.test(select),
    "se um dia entrar join, remova o leadMap — duas fontes para o mesmo nome divergem",
  );
});
