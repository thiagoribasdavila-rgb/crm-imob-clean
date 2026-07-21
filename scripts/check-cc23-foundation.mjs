/**
 * Teste adversarial da FUNDAÇÃO CC23 (tipografia + tokens semânticos + camada .cc23-*).
 *
 * Três regressões silenciosas motivam este check — todas já aconteceram neste repo:
 *
 *  (a) TIPOGRAFIA FANTASMA. O globals.css consumia var(--font-geist-sans) e o @theme
 *      listava a família literal "Geist", mas nada era carregado: a interface inteira
 *      caía em system-ui sem erro nenhum. Se alguém remover o next/font do layout, o
 *      produto volta a perder a fonte e NADA quebra — só fica pior. Aqui quebra.
 *
 *  (b) TOKEN CLARO EM PRODUTO ESCURO. Os semânticos do shadcn (--foreground, --card,
 *      --popover…) vinham do preset CLARO e conviviam no mesmo :root da paleta escura,
 *      sem bloco .dark. O caso pior era verificável: em components/ui/button.tsx a
 *      variante `outline` usa bg-background + hover:text-foreground — quase preto sobre
 *      quase preto, o rótulo sumia no hover. Este check calcula o CONTRASTE REAL.
 *
 *  (c) GLOW DE VOLTA. O princípio 3 do CC23 é profundidade por geometria, com zero glow
 *      e movimento atrás de portão duplo. É fácil alguém colar um `box-shadow: 0 0 20px`
 *      e desfazer a linguagem inteira sem perceber.
 *
 * 100% determinístico: só lê arquivos e faz aritmética de cor. Sem rede, sem navegador,
 * sem servidor, sem relógio, sem aleatório.
 *
 * Rodar da raiz do repo: node scripts/check-cc23-foundation.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
    console.log(`❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const read = (rel) => {
  const abs = path.join(root, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
};

const css = read("app/globals.css");
const tokens = read("styles/atlas-tokens.css") || "";
const layout = read("app/layout.tsx");
const pkg = JSON.parse(read("package.json") || "{}");

check("caso 1: app/globals.css existe", css !== null);
check("caso 2: app/layout.tsx existe", layout !== null);
if (!css || !layout) {
  console.log(`\ncheck-cc23-foundation: ${passed} passaram, ${failures.length} falharam`);
  process.exit(1);
}

// --------------------------------------------------------------------------
// Bloco 1 — a tipografia existe de fato
// --------------------------------------------------------------------------
check(
  "caso 3: o pacote geist é dependência de produção",
  Boolean(pkg.dependencies?.geist),
  "sem ele o next/font não tem o que servir",
);

check("caso 4: o layout importa GeistSans", /from\s+["']geist\/font\/sans["']/.test(layout));
check("caso 5: o layout importa GeistMono", /from\s+["']geist\/font\/mono["']/.test(layout));

// O import sozinho não aplica nada: a variável só existe se a className entrar no <html>.
const htmlTag = layout.match(/<html[\s\S]*?>/)?.[0] || "";
check(
  "caso 6: as variáveis de fonte são publicadas no <html> (import não basta)",
  /GeistSans\.variable/.test(htmlTag) && /GeistMono\.variable/.test(htmlTag),
  "sem a className no <html>, --font-geist-* nunca é definida e tudo cai em system-ui",
);

// A cadeia do @theme não pode voltar a apontar para o nome literal, que nunca resolve
// porque o next/font gera um family name com hash.
const temaBloco = css.match(/@theme inline\s*\{[\s\S]*?\n\}/)?.[0] || "";
for (const [nome, variavel] of [["--font-sans", "--font-geist-sans"], ["--font-mono", "--font-geist-mono"]]) {
  const linha = temaBloco.match(new RegExp(`${nome}:([^;]+);`))?.[1] || "";
  check(
    `caso 7.${nome}: aponta para var(${variavel}), não para o nome literal`,
    linha.includes(`var(${variavel})`),
    linha.trim() ? `hoje: ${linha.trim().slice(0, 60)}` : "declaração não encontrada",
  );
}

check(
  "caso 8: nenhuma família literal \"Geist\" sobrou como primeira opção",
  /font-family:\s*["']Geist/.test(css) === false,
  "nome literal nunca resolve com next/font",
);

// --------------------------------------------------------------------------
// Bloco 2 — contraste real dos tokens semânticos (o bug do botão)
// --------------------------------------------------------------------------
const rootBlocos = [...css.matchAll(/:root\s*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join("\n");
const declaracoes = new Map();
for (const m of `${tokens}\n${rootBlocos}`.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)) {
  declaracoes.set(m[1], m[2].trim());
}

/** Resolve var(--x, fallback) recursivamente até chegar num valor de cor literal. */
function resolver(valor, profundidade = 0) {
  if (profundidade > 12 || !valor) return valor;
  const m = valor.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/i);
  if (!m) return valor.trim();
  const alvo = declaracoes.get(m[1]);
  if (alvo) return resolver(alvo, profundidade + 1);
  return m[2] ? resolver(m[2].trim(), profundidade + 1) : valor;
}

function paraRgb(cor) {
  const v = String(cor).trim();
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = v.match(/^#([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  // oklch acromático (l 0 0): a luminância é o próprio L, o que basta para
  // detectar "token de tema claro" — que é exatamente o defeito que caçamos.
  m = v.match(/^oklch\(\s*([0-9.]+)\s+0\s+0\s*\)$/i);
  if (m) {
    const c = Math.round(Number(m[1]) * 255);
    return [c, c, c];
  }
  return null;
}

function luminancia([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contraste(corA, corB) {
  const a = paraRgb(resolver(corA));
  const b = paraRgb(resolver(corB));
  if (!a || !b) return null;
  const [hi, lo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pares que a interface REALMENTE produz, cada um citando onde. */
const PARES = [
  { nome: "botão outline no hover", fg: "--foreground", bg: "--background", onde: "components/ui/button.tsx:14" },
  { nome: "texto sobre card", fg: "--card-foreground", bg: "--card", onde: "utilitários bg-card/text-card-foreground" },
  { nome: "texto secundário", fg: "--muted-foreground", bg: "--surface", onde: "utilitário text-muted-foreground" },
  { nome: "rótulo sobre o acento", fg: "--primary-foreground", bg: "--primary", onde: "botão primário" },
  { nome: "popover", fg: "--popover-foreground", bg: "--popover", onde: "utilitário bg-popover" },
  { nome: "texto sobre superfície secundária", fg: "--secondary-foreground", bg: "--secondary", onde: "utilitário bg-secondary" },
];

for (const par of PARES) {
  const r = contraste(`var(${par.fg})`, `var(${par.bg})`);
  check(
    `caso 9.${par.nome}: contraste ≥ 4.5:1 (AA)`,
    r !== null && r >= 4.5,
    r === null
      ? `não consegui resolver ${par.fg} sobre ${par.bg}`
      : `${r.toFixed(2)}:1 em ${par.onde}`,
  );
}

// Contraprova estrutural: nenhum semântico pode ser um cinza-claro cru de tema claro.
const SEMANTICOS = ["--foreground", "--card", "--popover", "--secondary", "--accent", "--muted-foreground", "--input"];
const claros = SEMANTICOS.filter((nome) => {
  const rgb = paraRgb(resolver(`var(${nome})`));
  if (!rgb) return false;
  // Superfícies escuras e textos claros são esperados; o defeito é uma SUPERFÍCIE clara.
  const ehSuperficie = ["--card", "--popover", "--secondary", "--accent", "--input"].includes(nome);
  return ehSuperficie && luminancia(rgb) > 0.4;
});
check(
  "caso 10: nenhuma superfície semântica voltou a ser de tema claro",
  claros.length === 0,
  claros.length ? `claras dentro de UI escura: ${claros.join(", ")}` : `${SEMANTICOS.length} verificados`,
);

check(
  "caso 11: não existe bloco .dark (o produto é dark-only — se surgir, os semânticos precisam ser revistos)",
  /^\.dark\s*\{/m.test(css) === false,
);

// --------------------------------------------------------------------------
// Bloco 3 — a camada CC23: aditiva, sem glow, com portão de movimento
// --------------------------------------------------------------------------
const marca = "CC23 — a geração que fecha o redesenho global";
const inicioCC23 = css.indexOf(marca);
check("caso 12: a camada CC23 existe no globals.css", inicioCC23 !== -1);

const camada = inicioCC23 === -1 ? "" : css.slice(inicioCC23);
// A última DEFINIÇÃO de CC6 (seletor no início da linha). Não vale procurar
// ".cc6-" solto: a própria camada CC23 cita .cc6-panel na regra de densidade
// opt-in, e isso faria o teste medir a si mesmo.
const ultimoCC6 = [...css.matchAll(/^\.cc6-/gm)].reduce((max, m) => Math.max(max, m.index), -1);
check(
  "caso 13: a camada CC23 vem DEPOIS do bloco CC6 (migração aditiva)",
  inicioCC23 !== -1 && ultimoCC6 !== -1 && inicioCC23 > ultimoCC6,
  "se vier antes, o CC6 sobrescreve o CC23 e a camada não tem efeito",
);

if (camada) {
  // Princípio 3: profundidade por geometria. Glow é sombra sem deslocamento.
  const glow = [...camada.matchAll(/box-shadow:\s*0\s+0\s+/g)].length;
  check("caso 14: zero glow (box-shadow sem deslocamento) na camada CC23", glow === 0, `${glow} ocorrência(s)`);
  check("caso 15: zero filter: blur na camada CC23", /filter:\s*blur/.test(camada) === false);
  check("caso 16: zero drop-shadow na camada CC23", /drop-shadow/.test(camada) === false);

  // Portão duplo: todo movimento precisa estar sob pointer:fine + reduced-motion.
  const blocosComMovimento = [...camada.matchAll(/@media[^{]*\{[\s\S]*?\n\}/g)]
    .filter((m) => /transition:|transform:/.test(m[0]));
  const foraDoPortao = /(?:^|\n)\s{2}(?:transition|transform):/.test(
    camada.replace(/@media[^{]*\{[\s\S]*?\n\}/g, ""),
  );
  check(
    "caso 17: todo movimento do CC23 está sob @media, nunca solto",
    foraDoPortao === false,
    "transition/transform fora de media query ignora quem pediu menos movimento",
  );
  check(
    "caso 18: o portão de movimento exige pointer:fine E prefers-reduced-motion",
    blocosComMovimento.length > 0 &&
      blocosComMovimento.every((m) => /pointer:\s*fine/.test(m[0]) && /prefers-reduced-motion/.test(m[0])),
    `${blocosComMovimento.length} bloco(s) com movimento`,
  );

  // Princípio 5: zero hex literal nas CLASSES (tokens no :root podem ter literal).
  const classesCC23 = camada.replace(/:root\s*\{[\s\S]*?\n\}/g, "");
  const hexEmClasse = [...classesCC23.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  check(
    "caso 19: nenhuma classe .cc23-* usa hex literal (destrava white-label)",
    hexEmClasse.length === 0,
    hexEmClasse.length ? `literais: ${[...new Set(hexEmClasse)].join(", ")}` : "",
  );

  // Toda var() usada precisa existir — exceto as de fonte, que o next/font injeta
  // em runtime via className e por isso não aparecem em nenhum arquivo CSS.
  const INJETADAS_EM_RUNTIME = new Set(["--font-geist-sans", "--font-geist-mono"]);
  const usadas = [...new Set([...camada.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]))];
  const semDefinicao = usadas.filter((v) => !declaracoes.has(v) && !INJETADAS_EM_RUNTIME.has(v));
  check(
    "caso 20: toda variável usada pelo CC23 tem definição",
    semDefinicao.length === 0,
    semDefinicao.length ? `indefinidas: ${semDefinicao.join(", ")}` : `${usadas.length} verificadas`,
  );

  // As classes prometidas pelos 5 princípios precisam existir de fato.
  const PROMETIDAS = [
    ".cc23-rows", ".cc23-row", ".cc23-display", ".cc23-unit-label",
    ".cc23-delta", ".cc23-lift", ".cc23-seam", ".cc23-draft", ".cc23-quiet",
  ];
  const ausentes = PROMETIDAS.filter((c) => !camada.includes(`${c} `) && !camada.includes(`${c},`) && !camada.includes(`${c}:`) && !camada.includes(`${c}\n`) && !camada.includes(`${c}::`) && !camada.includes(`${c}{`));
  check("caso 21: todas as classes dos 5 princípios existem", ausentes.length === 0, ausentes.join(", "));

  // A variação é o único número colorido, e o significado não pode depender só da cor.
  check(
    "caso 22: o sentido da variação vem de atributo, não só do matiz",
    /\.cc23-delta\[data-trend="up"\]/.test(camada) && /\.cc23-delta\[data-trend="down"\]/.test(camada),
    "cor sozinha exclui quem não a distingue",
  );

  check(
    "caso 23: a grade de 4px é um token, não número mágico",
    /--cc23-unit:\s*4px/.test(camada),
  );

  check(
    "caso 24: o CC23 não reescreve nenhuma classe .cc6-* (migração aditiva)",
    /^\.cc6-/m.test(camada) === false,
    "o CC6 tem 1706 usos: sobrescrevê-lo quebraria telas que ninguém revisou",
  );
}

// --------------------------------------------------------------------------
console.log("");
console.log(`check-cc23-foundation: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
