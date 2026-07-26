/**
 * Contrato do painel de LACUNAS de Clientes 360.
 *
 * A tela existe para dizer o que falta preencher em cada cliente. Ela
 * consultava duas colunas que nunca eram buscadas:
 *
 *   development_id   174/217 preenchidos · ausente do select
 *   purpose          174/217 preenchidos · ausente do select
 *
 * Resultado: 434 lacunas falsas — todos os 217 clientes apareciam como "sem
 * projeto" e "sem finalidade", inclusive os 174 que tinham as duas coisas.
 *
 * **Painel de qualidade que manda preencher o que já está preenchido é pior que
 * painel nenhum**: ensina a operação a ignorá-lo, e aí ele também não serve
 * quando a lacuna é de verdade.
 *
 * Rodar: node --test tests/contracts/clientes-360-lacunas-reais.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const compat = fs.readFileSync(path.join(raiz, "lib", "compat", "legacy-v2.ts"), "utf8");
const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "customers", "route.ts"), "utf8");

/** Colunas do grupo estendido, como o código as declara. */
function colunasEstendidas() {
  const bloco = compat.slice(
    compat.indexOf("NEXT_ACTION_COLUMNS = ["),
    compat.indexOf("] as const", compat.indexOf("NEXT_ACTION_COLUMNS = [")),
  );
  return [...bloco.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

test("o select busca as colunas que o painel de lacunas consulta", () => {
  const colunas = colunasEstendidas();
  for (const coluna of ["development_id", "purpose", "next_action_at"]) {
    assert.ok(colunas.includes(coluna),
      `${coluna} tem dado no banco e o painel a consulta — sem buscá-la, a lacuna é falsa`);
  }
});

test("toda coluna do grupo estendido existe no banco vivo", () => {
  // O fallback é tudo ou nada: uma coluna ausente devolve 42703 e a leitura cai
  // para o select base, perdendo o grupo inteiro — inclusive o SLA. Ja aconteceu
  // com `next_action_label`, que não existe nesta base.
  const conhecidasComoAusentes = ["next_action_label", "profile_type", "interest_type"];
  const intrusas = colunasEstendidas().filter((c) => conhecidasComoAusentes.includes(c));
  assert.deepEqual(intrusas, [],
    "coluna inexistente no grupo estendido derruba a leitura inteira, não só a si mesma");
});

test("a lacuna de projeto aceita a coluna canônica E a legada", () => {
  assert.match(
    rota,
    /text\(lead, "development_id", "project_id"\)/,
    "a base tem histórico nas duas; exigir só uma marcaria lacuna onde não há",
  );
});

test("a finalidade também pode vir das notas", () => {
  // `mapLegacyLead` faz purpose = coluna || purposeFromNotes(notes). Uma lead
  // com a coluna vazia e "Objetivo declarado: moradia." nas notas TEM
  // finalidade conhecida — cobrá-la seria pedir o que já foi respondido.
  assert.match(compat, /purpose: first\(row, "purpose"\) \|\| purposeFromNotes\(row\.notes\)/);
});

test("o painel não inventa lacuna de contato quando há telefone OU e-mail", () => {
  assert.match(rota, /text\(lead, "email", "phone"\)/,
    "um dos dois basta para falar com a pessoa");
});
