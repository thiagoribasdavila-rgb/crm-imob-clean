#!/usr/bin/env node
/**
 * ONDE O TEMA CLARO NÃO ALCANÇA.
 *
 * ── O problema ──────────────────────────────────────────────────────────────
 *
 * O tema claro é opt-in por `:root[data-theme="light"]` e sobrescreve classes
 * `.atlas-*` — 125 delas, uma fundação de verdade. Só que boa parte das telas
 * usa utilitário do Tailwind com cor ESCURA fixa: `text-white`,
 * `text-slate-500`, `bg-slate-950`, `border-white/10`. Nenhum seletor de tema
 * alcança esses, porque a cor está na classe, não numa variável.
 *
 * Resultado: no tema claro, esses trechos continuam escuros — texto branco em
 * fundo branco, borda invisível, painel preto no meio de uma tela clara. É o
 * "ainda tem partes sem a cor" que o dono relatou.
 *
 * ── Por que uma LISTA e não uma correção automática ─────────────────────────
 *
 * A correção de verdade é redefinir esses utilitários dentro do escopo claro,
 * em CSS — poucas regras cobrindo centenas de pontos. Mas nem toda ocorrência
 * quer virar clara: `text-white` num botão colorido continua branco nos dois
 * temas. Distinguir "superfície neutra" de "texto sobre cor" exige VER a tela.
 *
 * Este script não adivinha: ele diz ONDE olhar, ordenado por densidade, para
 * quem tiver a tela na frente atacar o que mais aparece primeiro.
 *
 *   npm run tema:cobertura
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Utilitários com cor escura fixa que nenhum seletor de tema alcança. */
const FIXOS = [
  /\btext-white\b/g, /\btext-slate-[45]00\b/g, /\btext-slate-[23]00\b/g,
  /\bbg-slate-9\d0\b/g, /\bbg-black\b/g,
  /\bborder-white\/[\d.[\]]+/g, /\bbg-white\/\[?[\d.]+\]?/g,
  /rgba\(148,\s*163,\s*184/g, /rgba\(255,\s*255,\s*255/g,
];

function telas(dir, achados = []) {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) telas(p, achados);
    else if (nome.endsWith(".tsx")) achados.push(p);
  }
  return achados;
}

const arquivos = [...telas("app"), ...telas("components")];
const porArquivo = arquivos.map((arquivo) => {
  const fonte = readFileSync(arquivo, "utf8");
  const total = FIXOS.reduce((soma, re) => soma + (fonte.match(re)?.length ?? 0), 0);
  // Uma tela que já usa `.atlas-*` tem fundação; o que falta ali é pontual.
  const temFundacao = /className="[^"]*\batlas-/.test(fonte);
  return { arquivo, total, temFundacao };
}).filter((a) => a.total > 0).sort((a, b) => b.total - a.total);

const totalGeral = porArquivo.reduce((s, a) => s + a.total, 0);

console.log(`\nCOBERTURA DO TEMA CLARO`);
console.log(`  ${totalGeral} utilitários com cor escura fixa em ${porArquivo.length} arquivos.`);
console.log(`  Nenhum seletor de tema alcança esses: a cor está na classe, não numa variável.\n`);
console.log(`${"OCORR.".padStart(6)}  ${"FUNDAÇÃO".padEnd(9)} ARQUIVO`);
console.log("─".repeat(74));
for (const a of porArquivo.slice(0, 20)) {
  console.log(`${String(a.total).padStart(6)}  ${(a.temFundacao ? "atlas-*" : "—").padEnd(9)} ${a.arquivo}`);
}
if (porArquivo.length > 20) console.log(`         … e mais ${porArquivo.length - 20} arquivos`);

console.log(`\nCOMO ATACAR:`);
console.log(`  1. Comece pelos de cima: é onde o corretor mais vê o problema.`);
console.log(`  2. Para superfície neutra (fundo, borda, texto secundário), troque o`);
console.log(`     utilitário por uma classe .atlas-* — o tema claro já sabe pintá-la.`);
console.log(`  3. Para texto SOBRE cor (branco em botão colorido), deixe como está:`);
console.log(`     ele deve continuar branco nos dois temas.`);
console.log(`  4. A distinção entre (2) e (3) exige VER a tela. Este script não adivinha.\n`);
