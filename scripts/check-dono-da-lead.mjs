#!/usr/bin/env node
/**
 * PORTÃO: quem escreve o dono da lead escreve as DUAS colunas.
 *
 * ── O que foi medido em 01/08/2026, no banco vivo ──────────────────────────
 *
 * `leads` tem DUAS colunas para o mesmo fato — `assigned_to` e
 * `assigned_user_id` — e o código estava dividido:
 *
 *   · a criação (`POST /api/v1/leads`) gravava só `assigned_user_id`;
 *   · `data-quality` e `deduplication` LEEM só `assigned_to`.
 *
 * Resultado medido em 490 leads: **5 com dono em apenas uma das colunas**. Uma
 * lead assim tem dono numa tela e aparece SEM DONO na outra. Não há erro, não
 * há log, não há nada para investigar — só um corretor que não vê a própria
 * carteira e um gestor que vê fila órfã que já tem dono.
 *
 * O mesmo arquivo já tinha resolvido este padrão para `score`/`score_ia`, com
 * o comentário: "eram duas colunas para a mesma coisa e discordavam". Este
 * portão estende a regra ao dono, que importa mais.
 *
 * ── O que ele mede, e o que ele NÃO mede ───────────────────────────────────
 *
 * Mede por ARQUIVO: se um arquivo grava uma das colunas (forma de objeto,
 * `coluna:`), tem de gravar a outra. Não faz análise por instrução — um
 * arquivo com dois `update` distintos, cada um gravando uma coluna, passaria.
 * A limitação está declarada aqui em vez de ser insinuada como cobertura.
 *
 * O dia em que uma das duas colunas morrer, este portão sai junto — e isso é
 * progresso, não regressão.
 *
 * Rodar: node scripts/check-dono-da-lead.mjs
 */
import fs from "node:fs";
import path from "node:path";

const A = "assigned_to";
const B = "assigned_user_id";

function arquivos(raiz) {
  const saida = [];
  const pilha = [raiz];
  while (pilha.length) {
    const d = pilha.pop();
    let itens;
    try { itens = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const i of itens) {
      const p = path.join(d, i.name);
      if (i.isDirectory()) pilha.push(p);
      else if (i.name.endsWith(".ts")) saida.push(p);
    }
  }
  return saida;
}

/**
 * ESCRITA de verdade: a coluna dentro de um `.insert(` ou `.update(` que age
 * sobre `leads`.
 *
 * ── A PRIMEIRA VERSÃO ERA GROSSEIRA DEMAIS, e ela mesma mostrou ───────────
 *
 * Eu procurava só `coluna:` no arquivo inteiro. Acusou 10 arquivos — e o
 * primeiro que abri, `app/api/v1/search/route.ts`, tinha a coluna numa
 * DECLARAÇÃO DE TIPO (`assigned_to: string | null`). Não é escrita; é a forma
 * do dado. Um portão que confunde tipo com escrita manda consertar o que não
 * está quebrado, e quem apanhar dele duas vezes passa a ignorá-lo.
 *
 * Agora a janela começa em `from("leads")` e vai até a próxima chamada de
 * escrita. Fora dela, a coluna é leitura, tipo ou filtro.
 *
 * ── E A SEGUNDA VERSÃO ATRAVESSAVA PARA A TABELA VIZINHA ──────────────────
 *
 * A janela de 1200 caracteres não parava na consulta seguinte. Em
 * `app/api/v1/whatsapp/bridge/inbound/route.ts` o arquivo faz
 * `from("leads").select(...)` e, 36 linhas depois,
 * `from("conversations").insert({ assigned_to })` — e a janela do `leads`
 * alcançava o insert do `conversations`, acusando meia verdade num arquivo que
 * nunca escreve dono de lead.
 *
 * Conferido no banco vivo em 02/08/2026: `conversations` tem `assigned_to` e
 * NÃO tem `assigned_user_id`; `leads` tem as duas. Ou seja, o que o portão
 * mandava fazer ali derrubaria o insert com PGRST204 — mandar consertar o que
 * não está quebrado é como um portão perde a autoridade dele.
 *
 * A janela agora termina no próximo `from(`, seja qual for a tabela. É mais
 * ESTREITA que a anterior, não mais frouxa: um `update` de `leads` que ficasse
 * depois de outra consulta deixa de ser visto, e é por isso que o limite de
 * 1200 continua valendo como teto para o caso de não haver `from(` seguinte.
 */
function escritasEmLeads(fonte) {
  const limpo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const achados = { [A]: false, [B]: false };
  for (const m of limpo.matchAll(/from\(\s*["'`]leads["'`]\s*\)/g)) {
    /* Janela generosa: entre `from("leads")` e o `.update(`/`.insert(` pode
       haver quebras de linha e encadeamento — mas ela PARA na consulta
       seguinte, senão a escrita da tabela vizinha é contada como de `leads`. */
    const resto = limpo.slice(m.index + m[0].length);
    const proximaConsulta = resto.search(/from\(\s*["'`]/);
    const fim = proximaConsulta === -1 ? 1200 : Math.min(1200, m[0].length + proximaConsulta);
    const janela = limpo.slice(m.index, m.index + fim);
    const escrita = janela.match(/\.(?:update|insert|upsert)\s*\(/);
    if (!escrita) continue;
    const corpo = janela.slice(escrita.index, escrita.index + 900);
    if (new RegExp(`\\b${A}\\s*:`).test(corpo)) achados[A] = true;
    if (new RegExp(`\\b${B}\\s*:`).test(corpo)) achados[B] = true;
  }
  return achados;
}

const falhas = [];
const ok = [];

for (const arquivo of arquivos("app/api")) {
  const fonte = fs.readFileSync(arquivo, "utf8");
  const { [A]: a, [B]: b } = escritasEmLeads(fonte);
  if (!a && !b) continue;
  if (a && b) { ok.push(arquivo); continue; }
  falhas.push(
    `${arquivo}\n` +
      `        grava \`${a ? A : B}\` e NÃO grava \`${a ? B : A}\`.\n` +
      `        As duas colunas guardam o mesmo dono e telas diferentes leem colunas diferentes —\n` +
      `        a lead ficaria com dono numa e SEM DONO na outra, sem erro nenhum.`,
  );
}

if (ok.length === 0 && falhas.length === 0) {
  console.error("✗ dono-da-lead: nenhum arquivo grava dono de lead — o portão perdeu o alvo, verifique o caminho.");
  process.exit(1);
}

for (const o of ok) console.log(`  ok   ${o} grava as duas colunas`);
for (const f of falhas) console.error(`  FALHA ${f}`);

if (falhas.length) {
  console.error(`\n✗ dono-da-lead: ${falhas.length} arquivo(s) gravam meia verdade sobre o dono.`);
  process.exit(1);
}
console.log(`\n✓ dono-da-lead: ${ok.length} arquivo(s) gravam dono, todos nas duas colunas.`);
