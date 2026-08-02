#!/usr/bin/env node
/**
 * QUANTOS DOS 13 VIGIAS SABEM DIZER QUE RODARAM.
 *
 * ── Uma catraca ao contrário: esta SOBE ─────────────────────────────────────
 *
 * As outras catracas deste repositório limitam um número ruim (cor cravada,
 * silêncio de vigia) e só podem descer. Esta mede COBERTURA, e por isso o piso
 * só pode subir: cada vigia que passa a registrar execução é um ganho que não
 * volta atrás.
 *
 * ── O que ela guarda ────────────────────────────────────────────────────────
 *
 * Medido em 02/08/2026: nenhum dos 13 vigias grava incondicionalmente. Toda
 * escrita deles acontece dentro de um laço sobre uma fila, ou dentro de uma RPC
 * que só age quando há item elegível. Então "tabela de efeito vazia" não
 * distingue "nunca rodou" de "rodou e corretamente não fez nada" — e o portão
 * `check-vigias-vivos` publicava a primeira leitura como fato.
 *
 * `lib/integrations/livro-de-execucoes.ts` fecha isso: uma linha por invocação,
 * inclusive (e principalmente) quando não havia trabalho. Um vigia só sai da
 * ambiguidade depois de chamar `registrarExecucao`.
 *
 * ── O QUE ESTE PORTÃO NÃO PROVA, e vale dizer ───────────────────────────────
 *
 * Ele prova que o código CHAMA o registro. Não prova que a linha foi gravada —
 * isso depende da migration `20260802120000_livro_de_execucoes_dos_vigias.sql`
 * estar aplicada, e aplicar migration em produção é decisão do dono. Enquanto
 * não estiver, o helper devolve `livro_nao_instalado` e a resposta do vigia diz
 * isso em voz alta.
 *
 * Quem responde "a linha existe?" é `vigias-vivos:check`, contra o banco.
 *
 * uso: node scripts/check-livro-de-execucoes.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const AGENDA = JSON.parse(readFileSync("config/workers-schedule.json", "utf8"));
const HELPER = "lib/integrations/livro-de-execucoes.ts";
const MIGRATION = "supabase/migrations/20260802120000_livro_de_execucoes_dos_vigias.sql";
const TABELA = "atlas_worker_runs";

/**
 * Piso MEDIDO em 02/08/2026: começou em 2 (os dois vigias noturnos, já
 * reescritos no mesmo dia para parar de engolir erro) e subiu para 3 com o
 * `first-contact-sla`.
 *
 * Ele entrou por um motivo prático: é o de MAIOR cadência, 5 em 5 minutos. Com
 * só os noturnos registrando, a primeira linha do livro apareceria às 3h da
 * manhã seguinte ao deploy; com ele, aparece em minutos. Prova rápida vale mais
 * que prova tardia quando o que se quer saber é "isto está funcionando?".
 *
 * Só sobe.
 */
const PISO = 3;

const falhas = [];

// 1. O helper e a migration existem, e falam da MESMA tabela. Divergir aqui daria
//    um vigia que registra num lugar e um portão que procura em outro.
if (!existsSync(HELPER)) falhas.push(`${HELPER} não existe — sem ele nenhum vigia consegue registrar execução`);
if (!existsSync(MIGRATION)) falhas.push(`${MIGRATION} não existe — o livro não teria onde ser criado`);

if (existsSync(HELPER) && existsSync(MIGRATION)) {
  const helperFala = readFileSync(HELPER, "utf8").includes(`"${TABELA}"`);
  const migrationCria = new RegExp(`create table if not exists public\\.${TABELA}\\b`).test(readFileSync(MIGRATION, "utf8"));
  if (!helperFala) falhas.push(`${HELPER} não escreve em "${TABELA}"`);
  if (!migrationCria) falhas.push(`${MIGRATION} não cria public.${TABELA}`);
  if (helperFala && migrationCria) console.log(`✔ helper e migration falam da mesma tabela: ${TABELA}`);
}

// 2. Quantos vigias chamam o registro.
const comLivro = [];
const semLivro = [];
for (const w of AGENDA.workers) {
  const arquivo = `app${w.rota}/route.ts`;
  if (!existsSync(arquivo)) {
    falhas.push(`${w.nome}: ${arquivo} não existe — o agendador chamaria um 404`);
    continue;
  }
  const src = readFileSync(arquivo, "utf8");
  const chama = /registrarExecucao\s*\(/.test(src) && src.includes("livro-de-execucoes");
  (chama ? comLivro : semLivro).push(w.nome);
}

console.log(`\nvigias que registram execução: ${comLivro.length}/${AGENDA.workers.length} (piso ${PISO})`);
for (const v of comLivro) console.log(`    ✔ ${v}`);
if (semLivro.length) {
  console.log(`\n  ainda sem registro (${semLivro.length}):`);
  for (const v of semLivro) console.log(`    · ${v}`);
}

if (comLivro.length < PISO) {
  falhas.push(
    `a cobertura CAIU: ${comLivro.length} vigias registram execução, e o piso é ${PISO}. ` +
      "Esta catraca sobe e não desce — tirar o registro de um vigia devolve a ambiguidade que ele já tinha saído.",
  );
}

if (falhas.length) {
  console.error("\n✘ livro de execuções:\n");
  for (const f of falhas) console.error(`  ${f}`);
  console.error(
    "\n  Sem o registro, 'não rodou' e 'rodou e não havia trabalho' continuam sendo\n" +
      "  a mesma resposta — e foi assim que a automação ficou meses em zero sem\n" +
      "  ninguém conseguir afirmar por quê.\n",
  );
  process.exit(1);
}

if (comLivro.length > PISO) {
  console.log(`\n✔ ${comLivro.length - PISO} acima do piso. Suba o piso para ${comLivro.length} e trave o ganho.`);
}
console.log("\n✔ nenhuma cobertura perdida.");
