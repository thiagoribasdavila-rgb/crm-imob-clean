#!/usr/bin/env node
/**
 * UM VIGIA QUE FALHA EM SILÊNCIO É UM ALERTA QUE NÃO EXISTE.
 *
 * ── O que este portão guarda ────────────────────────────────────────────────
 *
 * O agendador (.github/workflows/atlas-vigias.yml) só enxerga o código HTTP.
 * O arquivo dele promete, com todas as letras: "um vigia que falha em silêncio
 * é um alerta que não existe — por isso este job fica VERMELHO."
 *
 * Medido em 02/08/2026, nas 13 rotas que o agendador chama: **15 consultas
 * descartavam o `error`** na desestruturação e **18 gravações não olhavam o
 * resultado**. O agendador foi construído para ficar vermelho; os vigias foram
 * construídos para nunca falhar. Um deles, o `ai/nightly-sales`, inseria o
 * `approval_requests` sem verificar e contava `prepared += 1` logo abaixo — a
 * jornada nascia impossível de aprovar e era contada como preparada.
 *
 * As duas formas medidas aqui:
 *
 *   `const { data: x } = await …`   o erro é jogado fora na desestruturação.
 *                                   Banco fora do ar e fila vazia viram o
 *                                   mesmo `200 {feito: 0}`.
 *
 *   `await admin.from(…).insert(…)` sem capturar o retorno. A escrita que
 *                                   falhou não deixa rastro, e o contador de
 *                                   sucesso segue em frente.
 *
 * ── Por que um teto, e não zero ─────────────────────────────────────────────
 *
 * `outbox/process` tem 984 linhas minificadas e concentra 24 das 33 ocorrências.
 * Ele é o vigia que MOVE MENSAGEM: mexer nele sem uma passada dedicada troca um
 * defeito silencioso por um barulhento. O teto desce à medida que cada rota é
 * tratada — e nunca sobe.
 *
 * A referência de como fazer certo é `crm/first-contact-sla/process`: `throw`
 * no erro da consulta, try/catch em volta, 500 na saída, e `isMissingColumn`
 * para tolerar o que é tolerável de propósito.
 *
 * uso: node scripts/check-vigia-nao-engole-erro.mjs
 */
import { readFileSync, existsSync } from "node:fs";

/** As 13 rotas que .github/workflows/atlas-vigias.yml chama. */
const VIGIAS = [
  "crm/first-contact-sla/process",
  "outbox/process",
  "tasks/reminders/process",
  "distribution/reservations/process",
  "marketing/meta-sem-destino/process",
  "marketing/capi-feedback/process",
  "tasks/recurrences/process",
  "ai/nightly-sales",
  "ai/nightly-handoff",
  "ai/baseline-de-conversao/process",
  "marketing/investimento/process",
  "meta/daily-report",
  "developers/weekly-reports/process",
];

/**
 * Teto MEDIDO em 02/08/2026, depois de tratar `ai/nightly-sales` e
 * `ai/nightly-handoff`. Antes deles: 33.
 *
 * O número é medido, não estimado. Eu tinha escrito 27 de cabeça (33 menos "uns
 * seis") e o portão me reprovou na primeira execução: eram 4, não 6. Teto
 * chutado é a mesma doença que este arquivo persegue — número que ninguém
 * conferiu.
 *
 * A dívida restante, nomeada:
 *   24  outbox/process                       ← precisa de passada dedicada
 *    2  marketing/meta-sem-destino/process
 *    2  developers/weekly-reports/process
 *    1  meta/daily-report
 *
 * Ele só desce.
 */
const TETO = 29;

/**
 * Conta as duas formas de engolir erro num fonte de rota.
 *
 * A varredura é textual de propósito: os fontes destas rotas estão minificados
 * em uma linha só, então contar LINHAS que casam devolveria 1 onde há 9. É o
 * tipo de erro de instrumento que este repositório já pagou caro — conta-se
 * ocorrência, nunca linha.
 */
function contar(src) {
  // 1. `const { data: x } = await` — sem `error` na mesma desestruturação.
  const errosDescartados = (src.match(/const\s*\{\s*data:?\s*[A-Za-z_]*\s*\}\s*=\s*await/g) ?? []).length;

  // 2. escrita cujo retorno não é capturado. Olha para trás a partir do
  //    `await` até o delimitador de statement mais próximo; se não houver `=`
  //    no meio, ninguém está segurando o resultado.
  let gravacoesMudas = 0;
  const escrita = /await\s+(?:admin|supabase)[^;]*?\.(?:insert|upsert|update)\(/g;
  let m;
  while ((m = escrita.exec(src))) {
    const ini = m.index;
    const corte = Math.max(src.lastIndexOf(";", ini), src.lastIndexOf("{", ini), src.lastIndexOf("\n", ini));
    if (!src.slice(corte + 1, ini).includes("=")) gravacoesMudas += 1;
  }
  return { errosDescartados, gravacoesMudas };
}

let total = 0;
const porRota = [];
const ausentes = [];
for (const rota of VIGIAS) {
  const arquivo = `app/api/v2/${rota}/route.ts`;
  if (!existsSync(arquivo)) {
    ausentes.push(rota);
    continue;
  }
  const { errosDescartados, gravacoesMudas } = contar(readFileSync(arquivo, "utf8"));
  const soma = errosDescartados + gravacoesMudas;
  total += soma;
  if (soma > 0) porRota.push([soma, rota, errosDescartados, gravacoesMudas]);
}
porRota.sort((a, b) => b[0] - a[0]);

// Rota do agendador que não existe mais é falha DURA, não um item a menos: o
// agendador chamaria um 404 e o job ficaria vermelho sem ninguém saber por quê.
if (ausentes.length) {
  console.error(`\n✘ ${ausentes.length} rota(s) do agendador não existem no repositório:`);
  for (const r of ausentes) console.error(`    app/api/v2/${r}/route.ts`);
  console.error("\n  O agendador chama estas rotas. Sem o arquivo, ele recebe 404.\n");
  process.exit(1);
}

console.log(`vigia que engole erro: ${total} ocorrência(s) (teto ${TETO}) em ${porRota.length} de ${VIGIAS.length} rotas`);
for (const [soma, rota, e, g] of porRota) {
  console.log(`    ${String(soma).padStart(3)}  ${rota}  (erro descartado: ${e}, gravação muda: ${g})`);
}

if (total > TETO) {
  console.error(`\n✘ SUBIU: ${total - TETO} a mais que o teto.\n`);
  console.error("  Um vigia que responde 200 depois de falhar não acende o agendador,");
  console.error("  e o agendador é a única coisa que olha para ele.");
  console.error("\n  O padrão certo está em app/api/v2/crm/first-contact-sla/process:");
  console.error("    const r = await admin.from(...).select(...);");
  console.error("    if (r.error) throw r.error;              // consulta");
  console.error("    const { error } = await admin...insert(); // gravação");
  console.error("    if (error) falhas.push(...);             // e 500 na saída\n");
  process.exit(1);
}

if (total < TETO) {
  console.log(`✔ ${TETO - total} abaixo do teto. Baixe o teto para ${total} e trave o ganho.`);
}
console.log("✔ nenhum silêncio novo.");
