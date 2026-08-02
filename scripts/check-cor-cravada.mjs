#!/usr/bin/env node
/**
 * COR CRAVADA NÃO PODE VOLTAR A CRESCER.
 *
 * ── O que este portão guarda ────────────────────────────────────────────────
 *
 * Em 2026-07-31 havia **1.360** cores em hex dentro de `.tsx`, em 80 dos 289
 * arquivos. Seis valores respondiam por 82,6% — todos de texto ou de estado.
 *
 * O defeito que isso causa é específico: o tema claro sobrescreve as classes de
 * texto do Tailwind, mas **não tem como sobrescrever um hex cravado no
 * arquivo**. `text-[#e8eef8]` — quase branco — continua quase branco sobre fundo
 * claro, e o texto desaparece.
 *
 * A migração levou o número a **338**. Este portão existe para que ele não volte
 * a subir: o teto é o número medido, e cada cor nova precisa ou virar token, ou
 * mover o teto de propósito, com justificativa no commit.
 *
 * ── Por que um teto, e não zero ─────────────────────────────────────────────
 *
 * As 338 restantes não são todas erro. Há série de gráfico, `<svg>` decorativo e
 * canvas, onde o hex É o dado — trocar por token mudaria o significado, não a
 * apresentação. Exigir zero forçaria a próxima pessoa a "resolver" isso da forma
 * errada, ou a desligar o portão.
 *
 * uso: node scripts/check-cor-cravada.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Teto medido em 2026-07-31, depois da migração de 1.022 ocorrências.
 *
 * ── O NÚMERO CERTO É 369, E O 338 QUE EU ANUNCIEI ERA ERRO DE INSTRUMENTO ──
 *
 * A primeira contagem usou `git ls-files 'app/**\/*.tsx'`, e esse glob **não
 * alcança arquivos direto em `app/`** nem alguns caminhos com parênteses de
 * grupo de rota. Ele devolveu 338; o portão, que lista `app` e `components`
 * inteiros e filtra por extensão, encontra 369.
 *
 * O portão é o instrumento correto — é por isso que o teto é o número DELE.
 */
/* 369 → 367 → 365 em 01/08/2026: `components/ui/AtlasCard.tsx` parou de repintar a
   receita do `.cc6-panel` com utilitários `!`, e as duas cores literais que ele
   carregava (o gradiente #0f1830→#0b1224 e a hairline rgba(148,163,184,.12))
   saíram junto. A catraca desce quando o ganho é real — é isso que transforma
   limpeza em progresso irreversível. */
const TETO = 330;

const arquivos = execFileSync("git", ["ls-files", "app", "components"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => f.endsWith(".tsx"));

let total = 0;
const porArquivo = [];
for (const f of arquivos) {
  const n = (readFileSync(f, "utf8").match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
  if (n > 0) { total += n; porArquivo.push([n, f]); }
}
porArquivo.sort((a, b) => b[0] - a[0]);

console.log(`cor cravada em .tsx: ${total} (teto ${TETO}) em ${porArquivo.length} arquivo(s)`);

if (total > TETO) {
  console.error(`\n✘ SUBIU: ${total - TETO} cor(es) a mais que o teto.\n`);
  console.error("  Os arquivos com mais ocorrências:");
  for (const [n, f] of porArquivo.slice(0, 5)) console.error(`    ${String(n).padStart(4)}  ${f}`);
  console.error("\n  Use um token semântico de app/globals.css:");
  console.error("    text-[var(--atlas-texto-forte)]   texto principal");
  console.error("    text-[var(--atlas-texto-medio)]   texto secundário");
  console.error("    text-[var(--atlas-texto-fraco)]   texto de apoio");
  console.error("    …-[var(--atlas-estado-perigo|atencao|sucesso)]  estado");
  console.error("\n  Hex cravado NÃO é sobrescrito pelo tema claro: o texto some sobre fundo claro.");
  console.error("  Se a cor for DADO (série de gráfico, svg), mova o teto e explique no commit.\n");
  process.exit(1);
}

if (total < TETO) {
  console.log(`✔ ${TETO - total} abaixo do teto. Baixe o teto para ${total} e trave o ganho.`);
}
console.log("✔ nenhuma cor cravada nova.");
