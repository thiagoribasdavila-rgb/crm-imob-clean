/**
 * Contrato: DUAS MIGRATIONS NÃO PODEM TER A MESMA VERSÃO.
 *
 * ── O DEFEITO QUE ISTO FIXA, E ELE FOI MEU ──────────────────────────────────
 *
 * Em 2026-07-29 escrevi a migration da cerca de RLS e, seguindo boa prática,
 * deixei o rollback ao lado:
 *
 *   supabase/migrations/20260729140000_leads_cerca….sql
 *   supabase/migrations/20260729140000_leads_cerca….down.sql   ← o problema
 *
 * O Supabase CLI trata TODO `supabase/migrations/*.sql` como migration e extrai a
 * versão do prefixo numérico. Os dois arquivos viram a MESMA versão.
 *
 * MEDIDO por um cético adversarial: o CLI enxergava 167 arquivos e 166 versões
 * distintas, e o insert em `supabase_migrations.schema_migrations` (cuja PK é
 * `version`) devolve `sqlstate 23505 duplicate key`.
 *
 * O que torna isso grave é a POSIÇÃO: `20260729140000` era a versão mais ALTA do
 * repositório. O push aplica em ordem crescente, então a colisão acontece no
 * ÚLTIMO arquivo — depois de 165 já aplicados. Não é uma falha que impede o
 * deploy: é uma **migração parcial sobre dado vivo**, o pior desfecho possível.
 *
 * Boa prática que virou defeito porque ninguém mediu o que a ferramenta faz com
 * ela. O rollback mudou para `supabase/rollbacks/`, fora do alcance do CLI.
 *
 * ── POR QUE UM CONTRATO, E NÃO SÓ MOVER O ARQUIVO ───────────────────────────
 *
 * Mover resolve hoje. A próxima pessoa que quiser versionar um rollback vai ter o
 * mesmo instinto correto e cometer o mesmo erro — a menos que algo reprove. E o
 * modo de falha é silencioso: `npm run build`, os contratos e os 214 portões
 * ficam todos VERDES com a duplicata no lugar. Só o `db push` descobre, no meio
 * do deploy.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const dirMigrations = path.join(raiz, "supabase", "migrations");

/** A mesma regra do CLI: todo `.sql` na pasta é migration, versão = prefixo numérico. */
function migrationsComoOCliVe() {
  return fs
    .readdirSync(dirMigrations)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ arquivo: f, versao: (f.match(/^(\d+)/) || [])[1] ?? null }));
}

test("a pasta de migrations tem arquivos — senão o teste passa por vacuidade", () => {
  const todas = migrationsComoOCliVe();
  assert.ok(
    todas.length >= 150,
    `achei ${todas.length} migrations; eram 166 em 2026-07-29. Varredura que não acha nada fica ` +
      "verde protegendo nada — foi assim que a cadeia de evolução morreu na fase 018.",
  );
});

test("nenhuma versão de migration aparece duas vezes", () => {
  const porVersao = new Map();
  for (const m of migrationsComoOCliVe()) {
    if (!m.versao) continue;
    porVersao.set(m.versao, [...(porVersao.get(m.versao) ?? []), m.arquivo]);
  }
  const duplicadas = [...porVersao.entries()].filter(([, arquivos]) => arquivos.length > 1);
  assert.deepEqual(
    duplicadas,
    [],
    "duas migrations com a mesma versão colidem na PK de supabase_migrations.schema_migrations " +
      "(sqlstate 23505). Se a versão duplicada for alta, o push aborta DEPOIS de aplicar as " +
      "anteriores — migração parcial sobre dado vivo. Rollback vai em supabase/rollbacks/, " +
      "que o CLI não varre.",
  );
});

test("toda migration tem versão numérica — sem ela o CLI não sabe a ordem", () => {
  for (const m of migrationsComoOCliVe()) {
    assert.ok(m.versao, `"${m.arquivo}" não começa com timestamp: o CLI não sabe quando aplicá-la`);
  }
});

test("nenhum rollback mora na pasta de migrations", () => {
  /**
   * O sufixo `.down.sql` não protege nada: para o CLI é `*.sql` como qualquer
   * outro. Esta asserção é o outro lado — impede que a boa prática volte para o
   * lugar errado, mesmo com versão diferente (um rollback aplicado como migration
   * DESFAZ o que a migration acabou de fazer).
   */
  /**
   * Casa o SUFIXO `.down.sql`, não a palavra "rollback" em qualquer lugar do nome.
   * A primeira versão desta asserção proibia `_rollback` e reprovou
   * `20260717011059_v2_rollback_drill_evidence.sql` — que é uma migration
   * legítima, registrando EVIDÊNCIA de um exercício de rollback. Proibir a
   * palavra em vez da forma é o mesmo erro de proibir NOMEAR o problema, e
   * empurra quem consertar a apagar o nome em vez do defeito.
   */
  for (const m of migrationsComoOCliVe()) {
    assert.ok(
      !/\.down\.sql$/i.test(m.arquivo),
      `"${m.arquivo}" é um rollback dentro de supabase/migrations — o CLI o aplicaria como ` +
        "migration, desfazendo o que acabou de fazer. Mova para supabase/rollbacks/.",
    );
  }
});

test("o rollback da cerca de RLS continua existindo, só mudou de lugar", () => {
  // Mover não pode virar perder. Migration de segurança sem caminho de volta é
  // pior que sem rollback declarado: ela finge que existe reversão.
  const destino = path.join(raiz, "supabase", "rollbacks");
  assert.ok(fs.existsSync(destino), "a pasta de rollbacks precisa existir");
  const nomes = fs.readdirSync(destino);
  assert.ok(
    nomes.some((n) => n.includes("leads_cerca_da_organizacao")),
    "o rollback da cerca de leads sumiu — a migration que estreitou o RLS ficou sem volta",
  );
});
