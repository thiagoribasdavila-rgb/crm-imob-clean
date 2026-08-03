/**
 * CONTRATO: a ficha da lead diz QUEM é o dono, e quem assinou cada interação.
 *
 * ── O DEFEITO QUE ISTO GUARDA ───────────────────────────────────────────────
 *
 * `GET /api/v1/leads/[id]` lia o dono com `select("id,name,role,team")` e os
 * autores do histórico com `select("id,name")`. `mapLegacyProfile` resolve
 * `full_name: first(row,"full_name","name")` — ele PREFERE a canônica — mas ela
 * não estava em nenhum dos dois selects, então as duas leituras caíam em `name`.
 *
 * Medido no banco vivo (pozbrcsfthnhmnebfoxv) em 02/08/2026:
 *
 *   perfis ................................ 23 · full_name em 23 · name em 10
 *   leads com dono ........................ 489
 *   leads cujo dono tem name NULO ......... 488
 *   linhas de `activities` com autor de name NULO ... 479 de 481
 *
 * Efeito na tela: o cabeçalho da Lead 360 (`owner.full_name || "Sem
 * responsável"`) dizia "Sem responsável · distribuição necessária" em 488
 * fichas cujo dono está gravado, e o link ao lado convidava a ATRIBUIR uma lead
 * que já tem corretor. No histórico, 479 interações apareciam assinadas por
 * "Equipe Atlas".
 *
 * E o pior era na MESMA tela: a linha do tempo mescla essas interações com a
 * movimentação de `/api/v1/acompanhamento-corretor/linha-do-tempo`, que lê
 * `id,name,full_name` e resolve `full_name || name`. O mesmo corretor assinava
 * "ddcorretorsp" na movimentação e "Equipe Atlas" na interação de dois minutos
 * antes — duas verdades sobre o mesmo autor, uma embaixo da outra.
 *
 * ── POR QUE AS DUAS METADES ─────────────────────────────────────────────────
 *
 * A metade de COMPORTAMENTO prova que é o SELECT que decide: a mesma linha, com
 * e sem a coluna, produz nome e ausência de nome. Sem ela, a metade estrutural
 * seria uma asserção que só verifica a si mesma.
 *
 * A metade ESTRUTURAL guarda os dois selects da rota, que é onde a regressão
 * entraria — e o caso NEGATIVO impede a "correção" preguiçosa de fazer o
 * mapeador inventar um nome quando não há nenhum: perfil sem nome nenhum tem de
 * continuar caindo no rótulo genérico, senão a tela passa a afirmar autoria que
 * o banco não tem.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapLegacyProfile } from "../../lib/compat/legacy-v2.ts";

const ROTA = readFileSync("app/api/v1/leads/[id]/route.ts", "utf8");

/** A linha real do corretor que é dono de 485 leads nesta base. */
const perfilReal = {
  id: "aa077aa4-28a7-49cb-98ea-dac8b2908a97",
  name: null,
  full_name: "ddcorretorsp",
  role: "broker",
  commercial_role: "broker",
  team: null,
};

/** O select decide o que o mapeador recebe: sem a coluna, a chave nem existe. */
const comoOSelectEntrega = (linha, colunas) =>
  Object.fromEntries(Object.entries(linha).filter(([chave]) => colunas.includes(chave)));

/* ── COMPORTAMENTO ───────────────────────────────────────────────────────── */

test("sem `full_name` no select, o dono da ficha vira 'Sem responsável'", () => {
  const semAColuna = comoOSelectEntrega(perfilReal, ["id", "name", "role", "team"]);
  const dono = mapLegacyProfile(semAColuna);
  // Isto é o que a ficha faz: `owner?.full_name || "Sem responsável"`.
  assert.equal(dono.full_name ?? null, null);
});

test("com `full_name` no select, o dono aparece com o nome que o banco tem", () => {
  const comAColuna = comoOSelectEntrega(perfilReal, ["id", "name", "full_name", "role", "commercial_role", "team"]);
  const dono = mapLegacyProfile(comAColuna);
  assert.equal(dono.full_name, "ddcorretorsp");
  assert.equal(dono.commercial_role, "broker");
});

test("perfil sem nome NENHUM continua sem nome — o mapeador não inventa", () => {
  const dono = mapLegacyProfile({ id: "x", name: null, full_name: null, role: "broker", commercial_role: "broker" });
  assert.equal(dono.full_name ?? null, null);
});

/* ── ESTRUTURA ───────────────────────────────────────────────────────────── */

test("a rota da ficha pede `full_name` ao ler o dono da lead", () => {
  const select = ROTA.match(/from\("profiles"\)\.select\("([^"]+)"\)\.eq\("id", lead\.assigned_to\)/);
  assert.ok(select, "não achei a leitura do dono da lead na rota da ficha");
  const colunas = select[1].split(",");
  assert.ok(colunas.includes("full_name"), `o select do dono não pede full_name: ${select[1]}`);
  assert.ok(colunas.includes("commercial_role"), `o select do dono não pede commercial_role: ${select[1]}`);
});

test("a rota da ficha pede `full_name` ao nomear os autores do histórico", () => {
  const select = ROTA.match(/from\("profiles"\)\.select\("([^"]+)"\)\.eq\("organization_id", identity\.organizationId\)\.in\("id", authorIds\)/);
  assert.ok(select, "não achei a leitura dos autores do histórico na rota da ficha");
  assert.ok(select[1].split(",").includes("full_name"), `o select dos autores não pede full_name: ${select[1]}`);
});

test("o nome do autor prefere `full_name` antes de cair no rótulo genérico", () => {
  // A ordem importa: `name || "Equipe Atlas"` apagava 479 assinaturas.
  assert.match(ROTA, /profile\.full_name \|\| profile\.name \|\| "Equipe Atlas"/);
});
