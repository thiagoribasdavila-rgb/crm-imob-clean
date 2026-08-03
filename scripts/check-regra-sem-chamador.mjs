/**
 * A REGRA PRONTA COM O FIO NO CHÃO.
 *
 * ── A classe de defeito que este portão existe para pegar ───────────────────
 *
 * Quatro vezes numa única entrega (03/08/2026), o mesmo defeito:
 *
 *   · `resolveLeadOwner(…, escopo)` — o 4º argumento existia, era testado, e
 *     NENHUM dos três chamadores passava. O elenco por projeto/campanha era
 *     decorativo havia semanas.
 *   · `aggregate(rows)` sabia dividir o CPL pelo que a campanha GEROU, com 19
 *     contratos verdes; a rota nunca preenchia `leadsNaOrigem`. R$ 1.088,96 por
 *     lead na tela, contra R$ 36,60 reais.
 *   · `marketing_spend.leads_count` — a coluna existia, o select não a pedia.
 *   · `cabeNaJanelaDaCapi` — escrita quando o 2804003 foi diagnosticado, ligada
 *     só no enfileiramento. O envio seguiu retentando 67 eventos vencidos.
 *
 * Nenhum deles ficava vermelho. Os testes passavam (a regra está certa), as
 * rotas respondiam 200, as telas desenhavam. Só o resultado era errado.
 *
 * ── O QUE ESTE PORTÃO MEDE ──────────────────────────────────────────────────
 *
 * Função exportada de `lib/` que TEM contrato e NÃO é chamada por nenhum código
 * de produção (`app/`, `workers/`, `scripts/`) nem por outro módulo de `lib/`.
 *
 * Ter contrato é o filtro que separa esta classe de "código morto comum":
 * ninguém escreve dez asserções para uma função que não pretendia usar. Contrato
 * verde + zero chamadores = alguém construiu a regra e esqueceu o fio.
 *
 * ── POR QUE UMA LINHA DE BASE, E NÃO ZERO ───────────────────────────────────
 *
 * Há casos legítimos: utilitário exportado para o próprio teste, função nova
 * cujo chamador vem na entrega seguinte. Zerar na marra faria alguém apagar o
 * portão. A linha de base congela o que existe hoje e falha quando o número
 * SOBE — que é o momento em que a quinta ocorrência nasceria.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const BASE = "config/regras-sem-chamador.json";

const sh = (cmd) => { try { return execSync(cmd, { encoding: "utf8" }); } catch { return ""; } };

// Módulos de lib/ que TÊM contrato: é o filtro que separa desta classe o código
// morto comum.
const comContrato = new Set(
  sh(`grep -rhoE 'from "\\.\\./\\.\\./lib/[a-zA-Z0-9/_-]+\\.ts"' tests/contracts 2>/dev/null`)
    .split("\n").map((l) => l.replace(/^from "\.\.\/\.\.\//, "").replace(/"$/, "")).filter(Boolean),
);

/**
 * Granularidade de MÓDULO, não de função.
 *
 * A primeira versão media função a função e devolveu 124 achados — a maioria
 * ajudante exportado só para o próprio contrato (`digestaoFnv1a`,
 * `esquecerCacheEm…`). Ruído desse tamanho faz alguém apagar o portão, e aí ele
 * não pega nem o caso que importa.
 *
 * O sinal nítido é o módulo em que NENHUM export é chamado da produção: isso não
 * é ajudante solto, é regra inteira construída e nunca ligada. Foi exatamente a
 * forma dos quatro defeitos de 03/08.
 */
const achados = [];
for (const modulo of comContrato) {
  if (!existsSync(modulo)) continue;
  const fonte = readFileSync(modulo, "utf8");
  const exportados = [
    ...[...fonte.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1]),
    ...[...fonte.matchAll(/^export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:\(|async)/gm)].map((m) => m[1]),
  ];
  if (!exportados.length) continue;
  const ligados = exportados.filter((nome) => {
    const usos = sh(`grep -rlE '\\b${nome}\\b' app lib components workers 2>/dev/null`)
      .split("\n").filter(Boolean).filter((f) => f !== modulo && !f.startsWith("tests/"));
    return usos.length > 0;
  });
  if (ligados.length === 0) achados.push({ modulo, exportados: exportados.length });
}

achados.sort((a, b) => a.modulo.localeCompare(b.modulo));
const atual = achados.map((a) => a.modulo);

if (process.argv.includes("--gravar-base")) {
  writeFileSync(BASE, `${JSON.stringify({
    $comentario: "Regras com contrato e SEM chamador de produção. O portão falha quando esta lista CRESCE — é o momento em que a quinta ocorrência de 'fio no chão' nasceria. Ao ligar o fio, remova a linha daqui.",
    congeladoEm: "2026-08-03",
    regras: atual,
  }, null, 2)}\n`);
  console.log(`linha de base gravada: ${atual.length} modulos sem chamador.`);
  process.exit(0);
}

const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")).regras ?? [] : [];
const conhecidas = new Set(base);
const novas = atual.filter((x) => !conhecidas.has(x));
const ligadas = base.filter((x) => !atual.includes(x));

for (const l of ligadas) console.log(`  ✔ fio ligado desde a última passagem: ${l}`);

if (novas.length) {
  console.log(`\n✘ ${novas.length} regra(s) com contrato e SEM chamador de produção:\n`);
  for (const n of novas) console.log(`    ${n}`);
  console.log(`\n  Contrato verde e zero chamadores é o padrão que custou quatro defeitos em`);
  console.log(`  03/08/2026 — a regra certa, e o caminho quente sem consultá-la.`);
  console.log(`  Ligue o fio, ou registre a exceção com \`node scripts/check-regra-sem-chamador.mjs --gravar-base\`.`);
  process.exit(1);
}

console.log(`check-regra-sem-chamador: ${atual.length} conhecidas, 0 novas.`);
