#!/usr/bin/env node
/**
 * PORTÃO: o repositório reconstrói o banco?
 *
 * ── A pergunta que ninguém estava fazendo ──────────────────────────────────
 *
 * Todo portão deste repositório mede o CÓDIGO. Nenhum media se o código,
 * sozinho, levanta o banco de que ele depende. E essa é a diferença entre um
 * pacote que alguém instala e um pacote que só funciona na máquina de quem o
 * escreveu.
 *
 * Medido em 01/08/2026, contra o banco vivo:
 *
 *     tabelas no banco ......... 188
 *     criadas por migration .... 187   →  99%
 *     funções (RPC) ............ 115 de 115 com CREATE FUNCTION  →  100%
 *     SEM migration ............   1   ←  campaign_assets (0 linhas, 0 usos)
 *
 * ── E as três medições erradas que vieram antes desta ──────────────────────
 *
 * O caminho até esse número passou por três instrumentos quebrados, todos
 * meus, e vale registrar porque cada um erra de um jeito diferente:
 *
 *   1. `grep "CREATE TABLE"` em caixa alta → 0 em 181 arquivos. O repositório
 *      escreve em minúsculas. Erro de CAIXA.
 *   2. Contar entradas `rpc/` do catálogo como tabela → cobertura de 57%.
 *      Erro de DENOMINADOR: função não é tabela.
 *   3. `grep "create table if not exists"` → 92%. Deixava de fora
 *      `create view`, `create materialized view` e `create table` sem a
 *      cláusula. Erro de PADRÃO INCOMPLETO — e este é o pior, porque o número
 *      sai plausível.
 *
 * O 99% é deste script, que casa as quatro formas. É por isso que a medição
 * vive em código versionado e não numa linha de terminal: linha de terminal
 * ninguém revisa.
 *
 * ── Por que ele NÃO fica verde sem banco ───────────────────────────────────
 *
 * Sai com 2 e "NÃO EXECUTADO" quando não alcança o banco. Verde por ausência de
 * medição é pior que vermelho: aqui ele afirmaria que o pacote instala, que é
 * exatamente o que não se sabe sem olhar.
 *
 * Rodar: node --env-file=.env.local scripts/check-cobertura-de-schema.mjs
 */
import fs from "node:fs";
import path from "node:path";

/* Catraca medida em 01/08/2026 pelo PRÓPRIO script: 1. O buraco só pode
   DIMINUIR — cada tabela que ganhar migration derruba o número, e quem derrubar
   deve baixar a catraca. */
const TETO_SEM_MIGRATION = 1;

const DIR = "supabase/migrations";
const URL_BANCO = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function naoExecutado(motivo) {
  console.error(`⚠  NÃO EXECUTADO — ${motivo}`);
  console.error(
    "   Verde por ausência de medição seria pior que vermelho: este portão\n" +
      "   afirmaria que o pacote instala, que é o que não se sabe sem olhar.",
  );
  process.exit(2);
}

if (!URL_BANCO || !CHAVE) {
  naoExecutado("faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no ambiente.");
}

/* ── O QUE AS MIGRATIONS CRIAM ─────────────────────────────────────────────
   `create table` vem em minúsculas neste repositório. A primeira medição desta
   auditoria procurou `CREATE TABLE` em caixa alta e concluiu ZERO em 181
   arquivos — o instrumento errou, não o repositório. Por isso o `i`. */
let arquivos;
try {
  arquivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
} catch {
  naoExecutado(`não consegui ler ${DIR}.`);
}

const criadas = new Set();
const funcoes = new Set();
for (const f of arquivos) {
  const sql = fs.readFileSync(path.join(DIR, f), "utf8");
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?["']?([a-z0-9_]+)/gi)) {
    criadas.add(m[1].toLowerCase());
  }
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?["']?([a-z0-9_]+)/gi)) {
    funcoes.add(m[1].toLowerCase());
  }
}

/* ── O QUE O BANCO VIVO EXPÕE ──────────────────────────────────────────────
   A raiz do PostgREST devolve o catálogo. Entradas `rpc/` são FUNÇÕES, não
   tabelas — contá-las como tabela derrubou a cobertura de 92% para 57% numa
   medição anterior desta mesma auditoria. Denominador errado é a forma mais
   silenciosa de mentir com número certo. */
const resposta = await fetch(`${URL_BANCO}/rest/v1/`, {
  headers: { apikey: CHAVE, authorization: `Bearer ${CHAVE}` },
}).catch(() => null);

if (!resposta || !resposta.ok) {
  naoExecutado(`o banco não respondeu (${resposta ? `HTTP ${resposta.status}` : "sem conexão"}).`);
}

const catalogo = await resposta.json().catch(() => null);
if (!catalogo?.paths) naoExecutado("o catálogo do PostgREST veio sem `paths`.");

const expostos = Object.keys(catalogo.paths).filter((p) => p !== "/" && !p.includes("{")).map((p) => p.slice(1));
const tabelasVivas = expostos.filter((t) => !t.startsWith("rpc/")).map((t) => t.toLowerCase()).sort();
const rpcVivas = expostos.filter((t) => t.startsWith("rpc/")).map((t) => t.slice(4).toLowerCase()).sort();

const semMigration = tabelasVivas.filter((t) => !criadas.has(t));
const rpcSemMigration = rpcVivas.filter((r) => !funcoes.has(r));
const nuncaAplicadas = [...criadas].filter((t) => !tabelasVivas.includes(t)).sort();

const cobertas = tabelasVivas.length - semMigration.length;
const pct = tabelasVivas.length ? Math.round((cobertas / tabelasVivas.length) * 100) : 0;

console.log(`  tabelas no banco vivo ........ ${tabelasVivas.length}`);
console.log(`  cobertas por migration ....... ${cobertas}  (${pct}%)`);
console.log(`  funções no banco ............. ${rpcVivas.length} · sem CREATE FUNCTION: ${rpcSemMigration.length}`);
console.log(`  em migration e ausentes no banco: ${nuncaAplicadas.length}${nuncaAplicadas.length ? ` (${nuncaAplicadas.join(", ")})` : ""}`);

const falhas = [];

if (semMigration.length > TETO_SEM_MIGRATION) {
  falhas.push(
    `${semMigration.length} tabela(s) existem no banco e NENHUMA migration as cria (teto ${TETO_SEM_MIGRATION}).\n` +
      `        Um clone limpo sobe sem elas: ${semMigration.slice(0, 8).join(", ")}${semMigration.length > 8 ? "…" : ""}`,
  );
} else {
  console.log(`  ok   sem migration: ${semMigration.length} (teto ${TETO_SEM_MIGRATION})`);
  if (semMigration.length) console.log(`       ${semMigration.join(", ")}`);
}

if (rpcSemMigration.length > 0) {
  falhas.push(
    `${rpcSemMigration.length} função(ões) sem CREATE FUNCTION em migration: ${rpcSemMigration.slice(0, 6).join(", ")}.\n` +
      `        Estas eram 0 em 01/08/2026 — função nova precisa nascer versionada.`,
  );
} else {
  console.log("  ok   todas as funções do banco nascem de migration");
}

if (falhas.length) {
  for (const f of falhas) console.error(`  FALHA ${f}`);
  console.error(
    "\n✗ cobertura-de-schema: o repositório NÃO reconstrói o banco que ele usa.\n" +
      "\nTrês desfechos legítimos: escrever a migration que falta; declarar a tabela\n" +
      "como externa ao produto (e dizer por quê); ou parar e relatar. Subir a catraca\n" +
      "sem migration nova transforma dívida em permissão.",
  );
  process.exit(1);
}

console.log(`\n✓ cobertura-de-schema: ${pct}% das tabelas e 100% das funções nascem do repositório.`);
