/**
 * Contrato: MIGRATION VAZIA MENTE — SÓ COMENTÁRIO NÃO É CONSERTO VERSIONADO.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * Medido em 2026-07-29 varrendo as 167 migrations:
 * `supabase/migrations/20260727050000_corrige_move_pipeline_lead.sql` tinha ZERO
 * linhas de SQL executável. Dezessete linhas de comentário, terminando em
 * "Aplicada em homologação em 27/07/2026. Ver a função completa no banco."
 *
 * A única definição de `move_pipeline_lead` que o repositório realmente aplicava
 * era a de `20260717190000_phase_33_atomic_pipeline_moves.sql`, que insere
 * `public.activities(... title ...)`. `activities` não tem `title` — nunca teve.
 * Provado executando a versão do repositório contra o banco de homologação:
 *
 *   42703 / column "title" of relation "activities" does not exist
 *
 * Consequência: reconstruir o banco a partir do repositório devolvia o Kanban
 * quebrado. Toda movimentação de funil estourava, e a rota traduzia 42703 como
 * 409 "recusada pela regra do funil" — mandando o corretor conferir a etapa
 * quando o problema era esquema. Beco: a etapa está certa, e continua recusando.
 *
 * ── POR QUE VAZIA É PIOR QUE AUSENTE ────────────────────────────────────────
 *
 * Ausente falha alto: ninguém a aplica, ninguém acha que foi aplicada. VAZIA
 * aparece na pasta, entra no ledger, passa em revisão de código e em `git log`.
 * Ela não deixa o conserto de fora — ela AFIRMA que o conserto está dentro.
 *
 * ── POR QUE O CONTRATO EXECUTA O DETECTOR, E NÃO LÊ O FONTE DELE ────────────
 *
 * Duas armadilhas já mordidas nesta base:
 *   · asserção que procura a palavra sobrevive à mutação, porque o identificador
 *     continua na linha do `import`;
 *   · asserção presa a formatação quebra no primeiro reflow.
 * Então aqui o detector é CHAMADO contra entradas sintéticas escritas neste
 * arquivo, e os DOIS lados são exigidos: que ele acuse o arquivo só-comentário E
 * que ele deixe passar o arquivo com SQL. Detector que acusa tudo passaria num
 * teste de vazamento e reprovaria as 167 migrations do repositório.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ehSomenteComentario,
  linhasDeSqlExecutavel,
  semComentarios,
  varreMigrations,
  veredito,
  leDeclaracoes,
  PISO_DO_MOTIVO,
  TETO_DE_DIVIDA,
  TIPOS,
} from "../../scripts/lib/migracoes-sem-sql.mjs";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const dirMigrations = path.join(raiz, "supabase", "migrations");

/** O arquivo que era o bloqueio. Ancorado pelo nome porque é ELE a prova viva. */
const O_ARQUIVO_QUE_ERA_VAZIO = "20260727050000_corrige_move_pipeline_lead.sql";

// ─────────────────────────────────────────────────────────────────────────────
// LADO QUE ACUSA — o detector precisa ver a mentira
// ─────────────────────────────────────────────────────────────────────────────

test("acusa: arquivo só com comentário de linha não tem SQL nenhum", () => {
  const so_comentario = [
    "-- ════════════════════════════════════════",
    "-- CONSERTA A FUNÇÃO DO FUNIL",
    "--",
    "-- Aplicada em homologação em 27/07/2026.",
    "-- Ver a função completa no banco.",
    "",
    "   -- até indentado continua sendo comentário",
    "",
  ].join("\n");

  assert.equal(linhasDeSqlExecutavel(so_comentario).length, 0);
  assert.equal(ehSomenteComentario(so_comentario), true);
});

test("acusa: arquivo só com comentário de bloco também não tem SQL", () => {
  const bloco = "/*\n  create or replace function foo() ...\n  (comentado enquanto a gente decide)\n*/\n\n";
  assert.equal(ehSomenteComentario(bloco), true);
});

test("acusa: arquivo totalmente vazio, e arquivo só com espaço em branco", () => {
  assert.equal(ehSomenteComentario(""), true);
  assert.equal(ehSomenteComentario("\n\n   \n\t\n"), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// LADO QUE DEIXA PASSAR — sem isto, o detector reprovaria as 167 migrations
// ─────────────────────────────────────────────────────────────────────────────

test("deixa passar: uma linha de SQL basta, mesmo afogada em comentário", () => {
  const comSql = [
    "-- ════════════════════════════════════════",
    "-- vinte linhas de explicação",
    "-- e mais explicação",
    "alter table public.activities add column if not exists metadata jsonb not null default '{}';",
    "-- e um rodapé explicando",
  ].join("\n");

  assert.deepEqual(linhasDeSqlExecutavel(comSql), [
    "alter table public.activities add column if not exists metadata jsonb not null default '{}';",
  ]);
  assert.equal(ehSomenteComentario(comSql), false);
});

test("deixa passar: comentário no FIM da linha não apaga o SQL da linha", () => {
  const texto = "create index if not exists i on public.leads(status); -- o Kanban lê por aqui";
  assert.equal(ehSomenteComentario(texto), false);
  assert.equal(linhasDeSqlExecutavel(texto).length, 1);
});

test("deixa passar: SQL depois de bloco de comentário fechado", () => {
  const texto = "/* nota longa\n   em várias linhas */\ncommit;";
  assert.equal(ehSomenteComentario(texto), false);
});

test("um `--` DENTRO de linha de comentário não abre bloco falso e não engole o arquivo", () => {
  // Se os blocos fossem removidos DEPOIS das linhas, este `/*` viraria abertura
  // de bloco sem fechamento e o `create table` abaixo desapareceria — o detector
  // aprovaria um arquivo vazio e reprovaria um arquivo cheio, os dois errados.
  const texto = ["-- cuidado com /* isto aqui", "create table public.x(id uuid);"].join("\n");
  assert.equal(ehSomenteComentario(texto), false);
  assert.ok(semComentarios(texto).includes("create table public.x"));
});

// ─────────────────────────────────────────────────────────────────────────────
// A VARREDURA, sobre entradas sintéticas — prova que ela acha e que ela conta
// ─────────────────────────────────────────────────────────────────────────────

test("a varredura encontra a migration vazia no meio das que têm SQL", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-migvazia-"));
  try {
    fs.writeFileSync(path.join(tmp, "20260101000000_com_sql.sql"), "-- nota\nselect 1;\n");
    fs.writeFileSync(path.join(tmp, "20260102000000_so_comentario.sql"), "-- aplicada no banco, ver lá\n");
    fs.writeFileSync(path.join(tmp, "20260103000000_rollback.down.sql"), "-- desfaz nada\n");
    fs.writeFileSync(path.join(tmp, "leia-me.txt"), "isto não é migration");

    const r = varreMigrations(tmp);
    assert.equal(r.total, 3, "o .txt não pode entrar na conta");
    assert.deepEqual(r.vazias, [
      "20260102000000_so_comentario.sql",
      "20260103000000_rollback.down.sql",
    ], "o .down.sql entra: rollback que não desfaz nada é a mesma mentira, no pior momento");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// O REPOSITÓRIO DE VERDADE
// ─────────────────────────────────────────────────────────────────────────────

test("o bloqueio do Kanban está mesmo consertado: a migration tem SQL executável", () => {
  const texto = fs.readFileSync(path.join(dirMigrations, O_ARQUIVO_QUE_ERA_VAZIO), "utf8");

  assert.equal(
    ehSomenteComentario(texto),
    false,
    `${O_ARQUIVO_QUE_ERA_VAZIO} voltou a ser só comentário — o repositório reconstrói a função QUEBRADA de novo`,
  );

  const sql = linhasDeSqlExecutavel(texto).join("\n");

  // A função tem de estar AQUI, não "no banco".
  assert.match(sql, /create or replace function public\.move_pipeline_lead/i);
  // Idempotente: `create function` puro quebra a segunda aplicação.
  assert.doesNotMatch(sql, /^create function public\.move_pipeline_lead/im);
  // O que o vivo tem e o repositório precisa reproduzir.
  assert.match(sql, /security definer/i);
  assert.match(sql, /search_path/i);

  // O DEFEITO, nomeado pela sua forma: a coluna inexistente na lista de insert
  // de activities. Ancorado na REGIÃO do insert (não numa linha), porque o corpo
  // real tem a lista de colunas numa linha e os valores nas seguintes.
  const insert = sql.match(/insert\s+into\s+public\.activities\s*\(([^)]*)\)/i);
  assert.ok(insert, "não achei o insert em public.activities — a âncora do defeito se perdeu");
  const colunas = insert[1].split(",").map((c) => c.trim());
  assert.ok(
    !colunas.includes("title"),
    "a coluna `title` voltou para o insert de activities: é exatamente o 42703 que travava todo o Kanban",
  );
  // E o texto que se perdia continua a ser gravado em algum lugar.
  assert.ok(colunas.includes("description"), "sem `description` o histórico da transição some");
});

test("nenhuma migration do repositório é só comentário sem estar declarada", () => {
  const v = veredito(raiz);

  assert.deepEqual(
    v.naoDeclaradas,
    [],
    `migration(s) sem uma linha de SQL e sem declaração: ${v.naoDeclaradas.join(", ")}. ` +
      "Migration vazia finge que o conserto está versionado. Escreva o SQL, ou declare em " +
      "supabase/declaracoes-sem-sql.json com motivo escrito.",
  );

  // Sanidade da varredura: se ela parasse de achar arquivos, tudo acima passaria
  // vazio. 167 medidas em 2026-07-29; o piso é folgado de propósito.
  assert.ok(v.total > 150, `a varredura só achou ${v.total} migrations — a âncora do diretório se perdeu`);
});

test("declaração exige motivo ESCRITO — álibi vazio ou curto é recusado", () => {
  const v = veredito(raiz);
  assert.deepEqual(
    v.motivoInsuficiente,
    [],
    `declaração com motivo abaixo de ${PISO_DO_MOTIVO} caracteres: ${v.motivoInsuficiente.join(", ")}. ` +
      '"pendente" e "ok" cabem em 8 e não dizem por quê.',
  );
  assert.deepEqual(v.tipoInvalido, [], `tipo fora de ${Object.values(TIPOS).join("/")}: ${v.tipoInvalido.join(", ")}`);

  // Prova o LADO QUE RECUSA, sem depender de alguém errar o arquivo real.
  const raizFalsa = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-decl-"));
  try {
    fs.mkdirSync(path.join(raizFalsa, "supabase", "migrations"), { recursive: true });
    fs.writeFileSync(path.join(raizFalsa, "supabase", "migrations", "20260101000000_x.sql"), "-- nada aqui\n");
    fs.writeFileSync(
      path.join(raizFalsa, "supabase", "declaracoes-sem-sql.json"),
      JSON.stringify([{ arquivo: "20260101000000_x.sql", tipo: "documentacao", motivo: "" }]),
    );
    const vf = veredito(raizFalsa);
    assert.deepEqual(vf.naoDeclaradas, [], "estava declarada, então não é este o motivo da recusa");
    assert.deepEqual(vf.motivoInsuficiente, ["20260101000000_x.sql"], "motivo vazio tem de ser recusado");
  } finally {
    fs.rmSync(raizFalsa, { recursive: true, force: true });
  }
});

test("declaração obsoleta reprova: a lista não pode virar licença permanente", () => {
  const v = veredito(raiz);
  assert.deepEqual(
    v.declaracoesObsoletas,
    [],
    `declaração para arquivo que TEM SQL (ou não existe mais): ${v.declaracoesObsoletas.join(", ")}. ` +
      "Consertou a migration? Tire a declaração — senão ela autoriza esvaziar o arquivo de novo, calada.",
  );

  // O lado que recusa: declarar um arquivo que tem SQL é erro, não permissão.
  const raizFalsa = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-obsoleta-"));
  try {
    fs.mkdirSync(path.join(raizFalsa, "supabase", "migrations"), { recursive: true });
    fs.writeFileSync(path.join(raizFalsa, "supabase", "migrations", "20260101000000_y.sql"), "select 1;\n");
    fs.writeFileSync(
      path.join(raizFalsa, "supabase", "declaracoes-sem-sql.json"),
      JSON.stringify([
        { arquivo: "20260101000000_y.sql", tipo: "documentacao", motivo: "x".repeat(PISO_DO_MOTIVO + 10) },
        { arquivo: "20260101000000_sumiu.sql", tipo: "documentacao", motivo: "y".repeat(PISO_DO_MOTIVO + 10) },
      ]),
    );
    const vf = veredito(raizFalsa);
    assert.deepEqual(vf.declaracoesObsoletas, ["20260101000000_y.sql", "20260101000000_sumiu.sql"]);
  } finally {
    fs.rmSync(raizFalsa, { recursive: true, force: true });
  }
});

test("a dívida declarada tem TETO — vazia nova não entra pela porta da frente", () => {
  const v = veredito(raiz);

  assert.equal(
    v.dividaAcimaDoTeto,
    false,
    `${v.divida.length} migration(s) declaradas como dívida contra teto de ${TETO_DE_DIVIDA}: ` +
      `${v.divida.join(", ")}. O teto não sobe para acomodar arquivo novo — escreva o SQL.`,
  );

  // A dívida congelada é UMA, e é o stub da foundation. Nomeada aqui de propósito:
  // dívida anônima não é dívida, é desconto. Se ela for paga, este teste cobra a
  // baixa do teto — e é o desfecho (b) legítimo: reapontar para a propriedade.
  assert.deepEqual(
    v.divida,
    ["20260711040000_atlas_v3_foundation.sql"],
    "a lista de dívida mudou. Pagou? baixe TETO_DE_DIVIDA. Nasceu outra? não declare — escreva o SQL.",
  );

  // Toda declaração precisa dizer QUANDO foi medida: motivo sem data envelhece
  // sem ninguém notar, e foi assim que a quarentena de portões guardou dois
  // motivos ERRADOS por dias.
  for (const d of leDeclaracoes(raiz)) {
    assert.match(d.medido_em ?? "", /^\d{4}-\d{2}-\d{2}$/, `declaração de ${d.arquivo} sem data medida`);
  }
});
