#!/usr/bin/env node
/**
 * PORTÃO DA LINGUAGEM VISUAL v3 — o eixo tipográfico.
 *
 * ── Por que ele existe ──────────────────────────────────────────────────────
 *
 * O eixo COR já tinha guarda (`check-contraste.mjs`, `check-cor-cravada.mjs`).
 * O eixo TIPOGRÁFICO estava a zero: uma auditoria de 28 agentes mediu, em
 * 01/08/2026, `font-size` aparecendo 446 vezes em `globals.css` com UMA única
 * asserção em todo o repositório — e essa asserção era um `includes` que nem
 * provava a qual regra o valor pertencia.
 *
 * O resultado desse vácuo eram 809 tamanhos arbitrários em `.tsx`, com 17
 * valores distintos, incluindo meio-pixel (11.5, 12.5, 13.5, 10.5) e texto de
 * 8px. Meio-pixel é a assinatura do problema: alguém ajustou no olho porque não
 * havia degrau para consultar.
 *
 * ── O que este portão mede, e o que ele NÃO mede ───────────────────────────
 *
 * Ele NÃO julga se um tamanho é bonito. Ele mede três propriedades que ou são
 * verdadeiras ou não são:
 *
 *   1. os degraus do v3 existem e valem o que dizem valer;
 *   2. o legado de arbitrários só encolhe (catraca, no molde do cor-cravada);
 *   3. as duas classes de tamanho que a operação já provou serem defeito —
 *      meio-pixel e texto abaixo de 10px — não voltam. Estas são ZERO, não
 *      catraca: elas foram eliminadas, e voltar é regressão, não dívida.
 *
 * Rodar: node scripts/check-linguagem-visual.mjs
 */
import fs from "node:fs";
import path from "node:path";

const CSS = "app/globals.css";

/* ── AS CATRACAS ──────────────────────────────────────────────────────────
   Medidas em 01/08/2026, depois de 757 conversões. Só podem CAIR.
   Quem baixar o número, baixe também a catraca — é o que transforma a
   limpeza em progresso irreversível. */
const TETO_ARBITRARIOS_TSX = 52;
const TETO_FONT_SIZE_CSS = 355;

/** Os degraus, nomeados pelo PAPEL. Nome de tamanho convidaria a inventar o 11.5 de novo. */
const DEGRAUS = {
  "--text-micro": "10px",
  "--text-rotulo": "11px",
  "--text-corpo": "13px",
  "--text-numero": "20px",
  "--text-heroi": "34px",
};

const falhas = [];
const ok = [];

function arquivosDeCodigo(raiz) {
  const saida = [];
  const pilha = [raiz];
  while (pilha.length) {
    const atual = pilha.pop();
    let itens;
    try { itens = fs.readdirSync(atual, { withFileTypes: true }); } catch { continue; }
    for (const item of itens) {
      const caminho = path.join(atual, item.name);
      if (item.isDirectory()) {
        if (item.name === "node_modules" || item.name === ".next") continue;
        pilha.push(caminho);
      } else if (/\.(tsx|ts)$/.test(item.name)) {
        saida.push(caminho);
      }
    }
  }
  return saida;
}

const css = fs.readFileSync(CSS, "utf8");
const fontes = arquivosDeCodigo("app").concat(arquivosDeCodigo("components"));

// ── 1. OS DEGRAUS EXISTEM E VALEM O QUE DIZEM ───────────────────────────────
for (const [nome, valor] of Object.entries(DEGRAUS)) {
  const achado = css.match(new RegExp(`${nome}\\s*:\\s*([^;]+);`))?.[1]?.trim();
  if (!achado) {
    falhas.push(`o degrau \`${nome}\` sumiu de ${CSS} — sem ele as classes que o usam viram font-size nenhum`);
  } else if (achado !== valor) {
    falhas.push(`\`${nome}\` mudou de ${valor} para ${achado}. Se foi de propósito, atualize este portão junto e diga por quê`);
  }
}
if (falhas.length === 0) ok.push(`os ${Object.keys(DEGRAUS).length} degraus da escala existem e batem`);

// ── 2. AS DUAS CLASSES DE DEFEITO NÃO VOLTAM ────────────────────────────────
const meioPixel = [];
const microscopico = [];
const arbitrarios = [];

for (const arquivo of fontes) {
  const texto = fs.readFileSync(arquivo, "utf8");
  for (const m of texto.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    const valor = Number(m[1]);
    arbitrarios.push({ arquivo, valor });
    if (!Number.isInteger(valor)) meioPixel.push({ arquivo, valor });
    if (valor < 10) microscopico.push({ arquivo, valor });
  }
}

if (meioPixel.length) {
  const amostra = meioPixel.slice(0, 3).map((x) => `${x.arquivo} (${x.valor}px)`).join(", ");
  falhas.push(
    `${meioPixel.length} tamanho(s) de meio-pixel voltaram em .tsx: ${amostra}. ` +
      `Meio-pixel é a assinatura de ajuste no olho — o degrau certo existe, use-o`,
  );
} else {
  ok.push("nenhum meio-pixel em .tsx");
}

if (microscopico.length) {
  const amostra = microscopico.slice(0, 3).map((x) => `${x.arquivo} (${x.valor}px)`).join(", ");
  falhas.push(
    `${microscopico.length} texto(s) abaixo de 10px voltaram em .tsx: ${amostra}. ` +
      `Foram eliminados em 01/08/2026 — 8px e 9px não são legíveis na tela de trabalho de ninguém`,
  );
} else {
  ok.push("nenhum texto abaixo de 10px em .tsx");
}

/* ── O MESMO DEFEITO, DO OUTRO LADO DA FRONTEIRA ────────────────────────────
   A primeira versão deste portão afirmava "nenhum meio-pixel" olhando só
   `.tsx` — e estava tecnicamente certa e praticamente falsa: `globals.css`
   tinha 33 meio-pixels e 87 tamanhos abaixo de 10px. Pior: TRÊS dos
   meio-pixels estavam no painel de referência do próprio v3, escrito na mesma
   sessão que escreveu este portão. Ele aprovou o próprio autor.

   O defeito não tinha sido eliminado; tinha mudado de arquivo. Uma asserção
   que só olha onde a limpeza passou sempre concorda com quem a escreveu.

   Aqui vão como CATRACA, não como zero: 30 e 87 são dívida herdada de anos de
   CSS, e travar em zero fecharia o portão sem ninguém conseguir abri-lo. Só
   podem cair. */
const meioPixelCss = (css.match(/font-size:\s*\d+\.\d+px/g) ?? []).length;
const microCss = (css.match(/font-size:\s*[0-9]px/g) ?? []).length;
const TETO_MEIO_PIXEL_CSS = 30;
const TETO_MICRO_CSS = 87;

if (meioPixelCss > TETO_MEIO_PIXEL_CSS) {
  falhas.push(`meio-pixel em ${CSS} subiu para ${meioPixelCss} (teto ${TETO_MEIO_PIXEL_CSS}) — a escala tem degrau para isso`);
} else {
  ok.push(`meio-pixel em ${CSS}: ${meioPixelCss} (teto ${TETO_MEIO_PIXEL_CSS})`);
}
if (microCss > TETO_MICRO_CSS) {
  falhas.push(`texto abaixo de 10px em ${CSS} subiu para ${microCss} (teto ${TETO_MICRO_CSS})`);
} else {
  ok.push(`abaixo de 10px em ${CSS}: ${microCss} (teto ${TETO_MICRO_CSS})`);
}

/* A superfície de referência do v3 não pode ela mesma violar a escala — é a
   que todo mundo vai copiar. Esta é ZERO, sem catraca. */
const blocoV3 = css.split("FILA DE DECISÕES")[1] ?? "";
const sujeiraNaReferencia = (blocoV3.match(/font-size:\s*(\d+\.\d+|[0-9])px/g) ?? []);
if (sujeiraNaReferencia.length) {
  falhas.push(
    `a superfície de referência do v3 usa tamanho fora da escala: ${sujeiraNaReferencia.join(", ")}. ` +
      `É a que todo mundo vai copiar — ela não pode ser a exceção`,
  );
} else {
  ok.push("a referência do v3 respeita a própria escala");
}

// ── 3. AS CATRACAS ──────────────────────────────────────────────────────────
if (arbitrarios.length > TETO_ARBITRARIOS_TSX) {
  const novos = arbitrarios.length - TETO_ARBITRARIOS_TSX;
  const porTamanho = {};
  for (const a of arbitrarios) porTamanho[a.valor] = (porTamanho[a.valor] || 0) + 1;
  falhas.push(
    `tamanhos arbitrários em .tsx subiram para ${arbitrarios.length} (teto ${TETO_ARBITRARIOS_TSX}, +${novos}). ` +
      `Distribuição: ${Object.entries(porTamanho).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}px×${n}`).join(" ")}. ` +
      `Use text-micro/rotulo/corpo/numero/heroi`,
  );
} else {
  ok.push(`arbitrários em .tsx: ${arbitrarios.length} (teto ${TETO_ARBITRARIOS_TSX})`);
}

const declaracoesCss = (css.match(/^\s*font-size:/gm) ?? []).length;
if (declaracoesCss > TETO_FONT_SIZE_CSS) {
  falhas.push(
    `declarações de font-size em ${CSS} subiram para ${declaracoesCss} (teto ${TETO_FONT_SIZE_CSS}). ` +
      `Regra nova de tamanho pertence à escala, não ao arquivo`,
  );
} else {
  ok.push(`font-size em ${CSS}: ${declaracoesCss} (teto ${TETO_FONT_SIZE_CSS})`);
}

// ── 4. A ESCALA ESTÁ VIVA, NÃO SÓ DECLARADA ────────────────────────────────
// Degrau declarado e nunca usado é documentação, não linguagem.
let usos = 0;
for (const arquivo of fontes) {
  usos += (fs.readFileSync(arquivo, "utf8").match(/text-(micro|rotulo|corpo|numero|heroi)\b/g) ?? []).length;
}
if (usos < 500) {
  falhas.push(`a escala do v3 tem só ${usos} usos — ela precisa ser o caminho dominante, não uma alternativa declarada`);
} else {
  ok.push(`a escala do v3 está viva: ${usos} usos`);
}

// ── SAÍDA ───────────────────────────────────────────────────────────────────
for (const o of ok) console.log(`  ok   ${o}`);
for (const f of falhas) console.error(`  FALHA ${f}`);

if (falhas.length) {
  console.error(
    `\n✗ linguagem-visual: ${falhas.length} de ${falhas.length + ok.length} asserções reprovaram.\n` +
      `\nTrês desfechos legítimos, e só três: consertar o código; reapontar a asserção para a\n` +
      `propriedade (documentando data e causa MEDIDA); ou parar e relatar. Nunca afrouxar a\n` +
      `catraca para passar.`,
  );
  process.exit(1);
}
console.log(`\n✓ linguagem-visual: ${ok.length} asserções, todas verdes.`);
