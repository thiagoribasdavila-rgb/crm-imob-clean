/**
 * Contrato do NOME DA PESSOA — a leitura de perfil compartilhada.
 *
 * `LIVE_PROFILE_SELECT` é lido por 15 arquivos: toda tela que mostra o nome de
 * alguém. Ele buscava só `name`, a coluna legada.
 *
 *   full_name   8/8 preenchidos
 *   name        3/8 preenchidos
 *
 * Cinco das oito pessoas apareciam sem nome ou como "Usuário Atlas" — inclusive
 * os três corretores, que são justamente quem a Distribuição precisa nomear
 * para decidir a quem mandar a próxima lead.
 *
 * `mapLegacyProfile` sempre tentou a canônica primeiro; ela é que nunca chegava.
 *
 * Rodar: node --test tests/contracts/perfil-nome-canonico.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "compat", "legacy-v2.ts"), "utf8");
const distribuicao = fs.readFileSync(
  path.join(raiz, "app", "(crm)", "distribution", "page.tsx"), "utf8",
);
const { LIVE_PROFILE_SELECT, mapLegacyProfile } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

test("o select de perfil busca a coluna canônica", () => {
  const colunas = LIVE_PROFILE_SELECT.split(",");
  assert.ok(colunas.includes("full_name"),
    "sem ela o mapeador cai em `name`, vazia em 5 de 8 perfis");
  assert.ok(colunas.includes("name"),
    "a legada continua: a base tem histórico nas duas e descartá-la perderia quem só tem `name`");
});

test("o mapeador prefere a canônica e aceita a legada", () => {
  assert.equal(mapLegacyProfile({ full_name: "Maria Silva", name: null }).full_name, "Maria Silva");
  assert.equal(mapLegacyProfile({ full_name: null, name: "João Antigo" }).full_name, "João Antigo");
  assert.equal(mapLegacyProfile({ full_name: "Nova", name: "Antiga" }).full_name, "Nova",
    "quando as duas existem, vence a canônica");
});

test("perfil sem nenhum nome não vira string vazia disfarçada", () => {
  const semNome = mapLegacyProfile({ full_name: null, name: null });
  assert.equal(semNome.full_name, null,
    "null deixa a tela escolher o rótulo; string vazia vira um nome invisível");
});

test("a distribuição só anuncia ponderação quando há peso", () => {
  // `project_distribution_members` está vazia nesta base: todo peso é 1, a
  // divisão não muda nada, e "pond." prometia um critério que a fila não
  // aplica. A API já declarava `weightedLoad: false`.
  assert.match(distribuicao, /state\?\.weight && state\.weight !== 1 \?/,
    "sem peso cadastrado, o rótulo não pode prometer ponderação");
  assert.match(distribuicao, /Sem peso cadastrado, a fila não pondera/,
    "e precisa dizer por que o número não está ponderado");
});
