/**
 * CONTRASTE — e a classe "o fundo vira, o texto não".
 *
 * ── O QUE FOI MEDIDO EM 2026-07-31 ─────────────────────────────────────────
 *
 * A auditoria de contraste nunca tinha sido feita (acessibilidade 80 no
 * scorecard, com a frase "sem auditoria de contraste"). Feita, ela achou dois
 * casos — e os dois são a MESMA doença: o `background` é token e vira entre os
 * temas, o `color` é cravado e fica parado.
 *
 *   .atlas-user-avatar ... 13,27 no escuro  →  **1,00 no claro**
 *                          1,00 quer dizer invisível: as iniciais da pessoa
 *                          simplesmente sumiam no tema claro.
 *   .atlas-rail-badge .... 7,01 no escuro   →  3,27 no claro
 *                          10,5px é texto pequeno; o piso AA é 4,5. O número de
 *                          leads esperando reprovava no tema de dia.
 *
 * ── POR QUE ESTE PORTÃO NÃO CRUZA TODOS OS TOKENS ──────────────────────────
 *
 * A primeira versão desta auditoria cruzou 6 cores de texto × 6 de fundo e
 * "achou" 11 reprovações. Era ruído: pares que o produto nunca desenha juntos,
 * e `text-disabled` com contraste baixo é DESENHO, não defeito.
 *
 * Aqui só entram pares que uma MESMA regra declara — `color` e `background` no
 * mesmo bloco. É o que a tela realmente pinta.
 *
 * ── E POR QUE COMPARA OS DOIS TEMAS SEPARADAMENTE ──────────────────────────
 *
 * A segunda versão mesclou os dois mapas de token e resolveu tudo com os
 * valores do tema CLARO, comparando-os contra textos cravados do tema ESCURO.
 * Achou 4 reprovações, das quais 2 não existiam. Cada tema tem o seu mapa, e a
 * pergunta é feita duas vezes.
 */
import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const glob = semComentarios(fs.readFileSync(path.join(raiz, "app", "globals.css"), "utf8"));
const base = semComentarios(fs.readFileSync(path.join(raiz, "styles", "atlas-tokens.css"), "utf8"));

const colher = (texto) => {
  const mapa = {};
  for (const m of texto.matchAll(/(--atlas-[a-z0-9-]+)\s*:\s*([^;]+);/g)) mapa[m[1]] = m[2].trim();
  return mapa;
};
/** Escuro é a base. Claro é a base com as sobrescritas de globals.css por cima. */
const ESCURO = colher(base);
const CLARO = { ...ESCURO, ...colher(glob) };

const resolvedor = (tokens) => {
  const f = (valor, prof = 0) => {
    const v = String(valor ?? "").trim();
    if (prof > 6) return null;
    const vm = /^var\((--atlas-[a-z0-9-]+)(?:,\s*([^)]+))?\)$/.exec(v);
    if (vm) return f(tokens[vm[1]] ?? vm[2], prof + 1);
    let m = /^#([0-9a-fA-F]{3})\b/.exec(v);
    if (m) return m[1].split("").map((c) => parseInt(c + c, 16));
    m = /^#([0-9a-fA-F]{6})/.exec(v);
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(v);
    // Translúcido não dá para medir sem saber o que está atrás: sai da conta em
    // vez de virar um número inventado.
    if (m) return m[4] !== undefined && Number(m[4]) < 0.9 ? null : [+m[1], +m[2], +m[3]];
    return null;
  };
  return f;
};

const luminancia = ([r, g, b]) => {
  const c = (x) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const razao = (a, b) => {
  const A = luminancia(a);
  const B = luminancia(b);
  return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
};

/** Pares que uma mesma regra pinta. */
const paresReais = [];
for (const m of glob.matchAll(/([^{}\n][^{}]*)\{([^}]*)\}/g)) {
  const corpo = m[2];
  const cor = /(?:^|[;\s])color:\s*([^;]+);/.exec(corpo);
  const fundo = /(?:^|[;\s])background(?:-color)?:\s*([^;]+);/.exec(corpo);
  if (!cor || !fundo) continue;
  const tamanho = /font-size:\s*([\d.]+)px/.exec(corpo);
  const negrito = /font-weight:\s*(?:bold|[7-9]00)/.test(corpo);
  // WCAG: "texto grande" (≥24px, ou ≥18,66px em negrito) tem piso 3,0.
  const px = tamanho ? Number(tamanho[1]) : 14;
  const grande = px >= 24 || (negrito && px >= 18.66);
  paresReais.push({
    seletor: m[1].trim().replace(/\s+/g, " ").slice(0, 60),
    cor: cor[1].trim(),
    fundo: fundo[1].trim(),
    piso: grande ? 3.0 : 4.5,
  });
}

const falhas = [];
for (const [tema, tokens] of [["escuro", ESCURO], ["claro", CLARO]]) {
  const r = resolvedor(tokens);
  for (const par of paresReais) {
    const c = r(par.cor);
    const f = r(par.fundo);
    if (!c || !f) continue;
    const razaoMedida = razao(c, f);
    if (razaoMedida < par.piso) falhas.push({ tema, ...par, razao: razaoMedida });
  }
}

console.log("\nCONTRASTE — só os pares que uma mesma regra pinta\n");
console.log(`  ${paresReais.length} regras declaram texto e fundo juntas.`);
console.log("  Medidas duas vezes: uma com os tokens do tema escuro, outra com os do claro.\n");

if (falhas.length > 0) {
  for (const f of falhas.sort((a, b) => a.razao - b.razao)) {
    console.log(`  ✗ [${f.tema}] ${f.razao.toFixed(2)} (piso ${f.piso}) — ${f.seletor}`);
  }
  console.log(`\n✗ ${falhas.length} par(es) abaixo do piso WCAG AA.\n`);
  process.exit(1);
}

console.log("✅ Nenhum par abaixo do piso, nos dois temas.\n");
