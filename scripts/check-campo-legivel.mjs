#!/usr/bin/env node
/**
 * PORTÃO: o campo de formulário é legível NO TEMA CLARO.
 *
 * ── O que foi medido em 01/08/2026, na produção ────────────────────────────
 *
 * O usuário relatou "não está conseguindo criar lead nova". A rota funcionava:
 * dois leads criados pelo navegador, um com empreendimento, ambos 200 e
 * redirecionando para a ficha. Nenhum erro em lugar nenhum.
 *
 * O defeito era que o corretor NÃO ENXERGAVA o que digitava. Em `/leads/new`,
 * tema claro, os onze campos devolviam contraste **1,06** — texto quase preto
 * sobre fundo quase preto. O piso legível é 4,5.
 *
 * A causa: `.atlas-app-shell input, select, textarea` pintava fundo e borda com
 * cor CRAVADA e não tinha contraparte no tema claro. A classe utilitária que o
 * formulário aplicava nem chegava a valer — regra unlayered de `globals.css`
 * vence utilitário do Tailwind.
 *
 * Alcance na época: 63 páginas do CRM e 11 componentes têm campo de formulário.
 * Existiam remendos só para `.atlas-pipeline-page` e `.atlas-kanban-move-row`.
 *
 * ── Por que este portão não é mais um `includes` ───────────────────────────
 *
 * Procurar a string `data-theme="light"` perto de `input` provaria nada: o
 * arquivo tem 111 blocos de tema claro, e qualquer um deles satisfaria a busca.
 * É a asserção que concorda consigo mesma.
 *
 * Aqui o cálculo é o do navegador: percorre as regras NA ORDEM DO ARQUIVO,
 * guarda a última que pinta o controle no tema claro, resolve o token contra o
 * bloco `:root[data-theme="light"]` e mede a LUMINÂNCIA do que sobrou. Fundo
 * escuro no tema claro reprova, venha de onde vier.
 *
 * Rodar: node scripts/check-campo-legivel.mjs
 */
import fs from "node:fs";
import { semComentarios } from "./lib/css-propriedade.mjs";

const CSS = fs.readFileSync("app/globals.css", "utf8");
const LIMPO = semComentarios(CSS);

/* Os controles que o corretor usa para digitar. `thead th` entra porque é o
   mesmo bloco de chrome do shell e adoeceu junto. */
const CONTROLES = ["input", "select", "textarea", "thead th"];

/** Tokens do tema claro, para resolver `var(--x)` como o navegador resolve. */
function tokensDoTemaClaro() {
  const mapa = new Map();
  const bloco = LIMPO.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/);
  if (!bloco) return mapa;
  for (const m of bloco[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    mapa.set(m[1], m[2].trim());
  }
  return mapa;
}

/** Resolve `var(--x, fallback)` até chegar numa cor literal. */
function resolver(valor, tokens, profundidade = 0) {
  if (profundidade > 6) return valor;
  const m = valor.match(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/i);
  if (!m) return valor.trim();
  const substituto = tokens.get(m[1]) ?? m[2] ?? "";
  return resolver(valor.replace(m[0], substituto.trim()), tokens, profundidade + 1);
}

/** Luminância relativa de `#rgb`, `#rrggbb` ou `rgb()/rgba()`. Null se não for cor. */
function luminancia(cor) {
  let rgb = null;
  const hex = cor.match(/#([0-9a-f]{3,8})\b/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length >= 6) rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const f = cor.match(/rgba?\(([^)]+)\)/i);
    if (f) rgb = f[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map(Number);
  }
  if (!rgb || rgb.some((v) => !Number.isFinite(v))) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Todas as regras do arquivo, na ordem, com seletor e corpo. */
function regras() {
  const saida = [];
  for (const m of LIMPO.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    saida.push({ seletor: m[1].trim().replace(/\s+/g, " "), corpo: m[2] });
  }
  return saida;
}

/** A regra alcança este controle dentro do shell? Devolve a parte que alcança. */
function alcanca(seletor, controle) {
  return (
    seletor
      .split(",")
      .map((p) => p.trim())
      .find((parte) => parte.includes(".atlas-app-shell") && new RegExp(`\\b${controle.replace(" ", "\\s+")}\\s*(?:$|::|:)`).test(parte)) || null
  );
}

/**
 * Especificidade `[ids, classes+atributos+pseudoclasses, elementos]`.
 *
 * ── A PRIMEIRA VERSÃO DESTE PORTÃO ESTAVA ERRADA, e ele mesmo me mostrou ───
 *
 * Eu escolhia a última regra que casava NA ORDEM DO ARQUIVO. A cascata não é
 * isso: ordem só desempata entre especificidades IGUAIS. O portão reprovou
 * `thead th` alegando fundo escuro, quando a regra clara — escrita 25 linhas
 * ANTES da base — vence por especificidade (0,3,2 contra 0,1,2) e o navegador
 * pinta claro.
 *
 * Um portão que ignora especificidade reprova CSS correto e, pior, aprovaria
 * CSS quebrado sempre que o remendo estivesse depois. Ele não saberia.
 */
function especificidade(parte) {
  const semPseudoElemento = parte.replace(/::[a-z-]+/gi, "");
  const ids = (semPseudoElemento.match(/#[\w-]+/g) || []).length;
  const classes = (semPseudoElemento.match(/\.[\w-]+|\[[^\]]+\]|:[a-z-]+(?:\([^)]*\))?/gi) || []).length;
  const elementos = (semPseudoElemento.match(/(?:^|[\s>+~])([a-z][\w-]*)/gi) || []).length;
  return [ids, classes, elementos];
}

/** a vence b? Compara especificidade; empate cai para a ordem do arquivo. */
function venceu(a, b) {
  if (!b) return true;
  for (let i = 0; i < 3; i++) {
    if (a.peso[i] !== b.peso[i]) return a.peso[i] > b.peso[i];
  }
  return a.ordem >= b.ordem;
}

const tokens = tokensDoTemaClaro();
if (tokens.size === 0) {
  console.error("✗ campo-legivel: não achei o bloco :root[data-theme=\"light\"] — o instrumento quebrou, não o produto.");
  process.exit(1);
}

const todas = regras();
const falhas = [];
const ok = [];

for (const controle of CONTROLES) {
  /* No tema claro valem as regras base (sem tema) E as do tema claro. A que
     pinta é a de maior ESPECIFICIDADE; ordem do arquivo só desempata. */
  let vencedora = null;
  todas.forEach((r, ordem) => {
    if (r.seletor.includes('data-theme="dark"')) return;
    const parte = alcanca(r.seletor, controle);
    if (!parte) return;
    const bg = r.corpo.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/);
    if (!bg) return;
    const candidata = { seletor: r.seletor, valor: bg[1].trim(), peso: especificidade(parte), ordem };
    if (venceu(candidata, vencedora)) vencedora = candidata;
  });

  if (!vencedora) {
    ok.push(`${controle}: nenhuma regra do shell pinta fundo — herda a superfície da página`);
    continue;
  }

  const resolvido = resolver(vencedora.valor, tokens);
  const L = luminancia(resolvido);
  if (L === null) {
    falhas.push(`${controle}: fundo "${vencedora.valor}" não resolveu para cor mensurável (regra: ${vencedora.seletor.slice(0, 70)})`);
    continue;
  }
  if (L < 0.5) {
    falhas.push(
      `${controle}: no tema CLARO o fundo é escuro (luminância ${L.toFixed(3)}, precisa > 0.5).\n` +
        `        Vence: ${vencedora.seletor.slice(0, 90)}\n` +
        `        Valor: ${vencedora.valor} → ${resolvido}\n` +
        `        Foi assim que os 11 campos de /leads/new ficaram com contraste 1,06 e o\n` +
        `        corretor digitou sem ver. Dê contraparte clara à regra, não um remendo por página.`,
    );
  } else {
    ok.push(`${controle}: fundo claro no tema claro (luminância ${L.toFixed(3)}) por "${vencedora.seletor.slice(0, 60)}"`);
  }
}

for (const o of ok) console.log(`  ok   ${o}`);
for (const f of falhas) console.error(`  FALHA ${f}`);

if (falhas.length) {
  console.error(`\n✗ campo-legivel: ${falhas.length} de ${falhas.length + ok.length} asserções reprovaram.`);
  process.exit(1);
}
console.log(`\n✓ campo-legivel: ${ok.length} asserções, todas verdes.`);
