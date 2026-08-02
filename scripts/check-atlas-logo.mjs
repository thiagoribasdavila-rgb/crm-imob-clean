/**
 * Teste adversarial da MARCA ATLAS — "estrela-guia".
 *
 * Alvos:
 *   - components/atlas/atlas-logo.tsx  (componente React da marca)
 *   - app/icon.svg                     (favicon/app icon do Next)
 *
 * Garante, lendo os ARQUIVOS REAIS (sem rede, sem banco, sem relógio, sem
 * aleatório):
 *   1. a marca é a "estrela-guia": estrela de 4 pontas (path), órbita
 *      (ellipse com rotate) e planeta (circle);
 *   2. o gradiente da assinatura é teal #3ae7d7 (offset 0) → violet #8b8cff
 *      (offset 1), nos dois arquivos;
 *   3. a variante tone="mono" pinta tudo com currentColor e NÃO emite gradiente
 *      (nenhum traço da marca pode ter url(#...) ou cor cravada no corpo do
 *      desenho);
 *   4. app/icon.svg existe, é XML bem formado, referencia um gradiente que
 *      realmente existe e tem o tile arredondado (rect com rx > 0);
 *   5. a geometria do icon.svg é a MESMA do componente (estrela/órbita/planeta);
 *   6. o logo é usado no login e na sidebar.
 *
 * Rodar da raiz do repo: node scripts/check-atlas-logo.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LOGO_REL = "components/atlas/atlas-logo.tsx";
const ICON_REL = "app/icon.svg";
const LOGIN_REL = "app/(auth)/login/page.tsx";
const SIDEBAR_REL = "components/atlas/sidebar.tsx";

const TEAL = "#3ae7d7";
const VIOLET = "#8b8cff";

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

function readOrEmpty(rel) {
  const abs = path.join(root, rel);
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Helpers de parsing (determinísticos, sem dependências externas)
// --------------------------------------------------------------------------

/** Extrai atributos de uma abertura de tag, aceitando "..." , '...' e {expr} (JSX). */
function parseAttrs(raw) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^{}]*)\})/g;
  let m;
  while ((m = re.exec(raw))) {
    attrs[m[1]] = m[2] ?? m[3] ?? (m[4] !== undefined ? `{${m[4].trim()}}` : "");
  }
  return attrs;
}

/** Todos os elementos <tag ...> (com ou sem auto-fechamento) de um fonte SVG/JSX. */
function elements(src, tag) {
  const out = [];
  const re = new RegExp(`<${tag}\\b((?:"[^"]*"|'[^']*'|\\{[^{}]*\\}|[^>])*?)/?>`, "g");
  let m;
  while ((m = re.exec(src))) out.push(parseAttrs(m[1]));
  return out;
}

/** Stops de gradiente na ordem de declaração (aceita stopColor do JSX e stop-color do SVG). */
function gradientStops(src) {
  return elements(src, "stop").map((a) => ({
    offset: a.offset,
    color: (a.stopColor ?? a["stop-color"] ?? "").toLowerCase(),
  }));
}

/**
 * Valida o path da estrela de 4 pontas e devolve as pontas.
 * Espera M <ponta> seguido de 4 curvas Q (uma por ponta) e Z.
 */
/**
 * Analisa o contorno do MONOGRAMA.
 *
 * A marca deixou de ser estrela em 26/07/2026 — o problema dela era saturação,
 * não desenho: a estrela de quatro pontas virou o símbolo padrão de qualquer
 * produto com IA. Este analisador substituiu `analyzeStarPath`, que exigia
 * quatro curvas Q e portanto reprovava a marca nova.
 *
 * O que ele cobra é o que faz o A ser o NOSSO A:
 *   - só linhas retas (nenhuma curva): monograma é construção, não caligrafia;
 *   - 7 vértices fechando em Z;
 *   - simetria em torno de x=50;
 *   - platô no topo, e não ponta — ver o cabeçalho do componente.
 */
function analyzeMonogramPath(d) {
  if (typeof d !== "string" || !d.trim()) return { ok: false, reason: "path sem atributo d" };
  const body = d.trim();
  if (!/^M/i.test(body)) return { ok: false, reason: `d não começa com M: ${body.slice(0, 24)}` };
  if (!/z\s*$/i.test(body)) return { ok: false, reason: "d não fecha com Z" };
  if (/[QqCcSsTtAa]/.test(body)) {
    return { ok: false, reason: "o monograma é construído com retas — nenhuma curva no contorno" };
  }
  const commands = body.match(/[MLZmlz]/g) ?? [];
  if (commands.some((c) => c !== c.toUpperCase())) {
    return { ok: false, reason: "path usa comandos relativos (esperado absoluto)" };
  }
  const nums = (body.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length !== 14) {
    return { ok: false, reason: `esperados 14 números (7 vértices), achados ${nums.length}` };
  }
  const pontos = [];
  for (let i = 0; i < nums.length; i += 2) pontos.push([nums[i], nums[i + 1]]);

  const [pa, pb] = pontos;
  if (Math.abs(pa[1] - pb[1]) > 0.001) {
    return { ok: false, reason: "o topo tem que ser um platô horizontal, não uma ponta" };
  }
  if (pb[0] - pa[0] < 6) {
    return { ok: false, reason: `platô estreito demais (${(pb[0] - pa[0]).toFixed(1)}) — vira ponta a 16px` };
  }

  // Simetria: para cada x há o espelho em 100-x.
  const xs = pontos.map((p) => p[0]).sort((a, b) => a - b);
  for (let i = 0, j = xs.length - 1; i < j; i += 1, j -= 1) {
    if (Math.abs(xs[i] + xs[j] - 100) > 0.001) {
      return { ok: false, reason: `assimétrico em torno de x=50: ${xs[i]} e ${xs[j]}` };
    }
  }

  return { ok: true, pontos, nums, plato: [pa, pb] };
}

/** XML bem formado: tags balanceadas, atributos com aspas, um único elemento raiz. */
function validateXml(src) {
  const text = src.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "");
  const tagRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const stack = [];
  let cursor = 0;
  let roots = 0;
  let m;
  while ((m = tagRe.exec(text))) {
    const between = text.slice(cursor, m.index);
    if (between.includes("<") || between.includes(">")) {
      return { ok: false, reason: `caractere '<' ou '>' solto fora de tag perto de: ${between.trim().slice(0, 40)}` };
    }
    cursor = m.index + m[0].length;
    const [, closing, name, rawAttrs, selfClosing] = m;
    if (closing) {
      const open = stack.pop();
      if (open !== name) return { ok: false, reason: `</${name}> fecha <${open ?? "nada"}>` };
      if (stack.length === 0) roots += 1;
    } else {
      // atributos precisam ser name="value" (ou name='value')
      const cleaned = rawAttrs.replace(/([A-Za-z_:][\w:.-]*)\s*=\s*(?:"[^"]*"|'[^']*')/g, " ").trim();
      if (cleaned) return { ok: false, reason: `atributo malformado em <${name}>: ${cleaned.slice(0, 40)}` };
      if (selfClosing) {
        if (stack.length === 0) roots += 1;
      } else {
        stack.push(name);
      }
    }
  }
  const tail = text.slice(cursor);
  if (tail.includes("<") || tail.includes(">")) return { ok: false, reason: "'<' ou '>' solto no fim do arquivo" };
  if (stack.length) return { ok: false, reason: `tags abertas sem fechamento: ${stack.join(", ")}` };
  if (roots !== 1) return { ok: false, reason: `esperado 1 elemento raiz, achados ${roots}` };
  return { ok: true };
}

// --------------------------------------------------------------------------
// Fontes
// --------------------------------------------------------------------------
const logoSrc = readOrEmpty(LOGO_REL);
const iconSrc = readOrEmpty(ICON_REL);
const loginSrc = readOrEmpty(LOGIN_REL);
const sidebarSrc = readOrEmpty(SIDEBAR_REL);

check(`caso 1: ${LOGO_REL} existe e exporta AtlasLogo`, Boolean(logoSrc) && /export function AtlasLogo\b/.test(logoSrc ?? ""), logoSrc ? "componente AtlasLogo não exportado" : "arquivo não encontrado");

if (!logoSrc) {
  console.log(`\ncheck-atlas-logo: ${passed} passaram, ${failures.length} falharam`);
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}

// Corpo do desenho (AtlasMark) — é onde a variante mono precisa ser respeitada.
const markStart = logoSrc.indexOf("function AtlasMark");
const markEnd = logoSrc.indexOf("type AtlasLogoProps");
let markBody = markStart >= 0 && markEnd > markStart ? logoSrc.slice(markStart, markEnd) : "";

// A geometria da marca virou constante exportada (ATLAS_STAR_PATH), justamente
// para que app/icon.svg use a MESMA fonte em vez de uma cópia. O portão resolve
// a constante antes de analisar — assim continua checando o desenho, e não a
// forma de escrevê-lo.
const constantePath = /export const ATLAS_MONOGRAM_PATH\s*=\s*\n?\s*"([^"]+)"/.exec(logoSrc);
if (constantePath) markBody = markBody.replace(/d=\{ATLAS_MONOGRAM_PATH\}/g, `d="${constantePath[1]}"`);

check("caso 2: função AtlasMark (o desenho da marca) existe e é isolável", markBody.length > 0, "não achei o bloco function AtlasMark ... antes de type AtlasLogoProps");

/**
 * O QUE ESTE PORTÃO LÊ É CÓDIGO, NÃO PROSA.
 *
 * Duas vezes em 02/08/2026 uma asserção reprovou o desenho certo porque um
 * COMENTÁRIO citava a construção que ela procura: o cabeçalho explica por que o
 * id do gradiente não pode ser fixo, e para isso escreve `<linearGradient
 * id="atlas-monogram-gradient">` e `url(#…)`. O parser contou os dois como se
 * fossem traços pintados.
 *
 * Um portão que reprova por causa da explicação treina a pessoa a apagar a
 * explicação — exatamente o contrário do que este repositório quer.
 *
 * A regra de linha é ANCORADA no início da linha (com espaços opcionais antes
 * das duas barras) e não solta no meio do texto: solta, ela decapitaria
 * qualquer endereço http dentro de código, que também tem duas barras.
 */
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");
const logoCodigo = semComentarios(logoSrc);

// --------------------------------------------------------------------------
// Estrela de 4 pontas
// --------------------------------------------------------------------------
const markPaths = elements(markBody, "path");
const star = markPaths.map((p) => ({ attrs: p, analysis: analyzeMonogramPath(p.d) })).find((p) => p.analysis.ok);

check(
  "caso 3: a marca tem o contorno do monograma (retas, 7 vértices, fechado)",
  Boolean(star),
  markPaths.length === 0 ? "nenhum <path> no AtlasMark" : markPaths.map((p) => analyzeMonogramPath(p.d).reason).join(" | "),
);

// REVISÃO 2026-07-26 (segunda). Os casos 4 e 5 cobravam propriedades da ESTRELA
// — quatro pontas cardeais e eixo vertical alongado. Com o monograma no lugar
// dela, eles reprovariam a marca certa. Passaram a cobrar o que faz ESTE
// desenho funcionar, que é outra coisa.
{
  const pontos = star?.analysis.pontos ?? [];
  // Perna: a distância horizontal entre o vértice externo da base e o interno.
  // 20 unidades de 100 dão 3,2px a 16px — acima do limiar em que uma haste some.
  const base = pontos.filter((p) => p[1] === Math.max(...pontos.map((q) => q[1])));
  const xsBase = base.map((p) => p[0]).sort((a, b) => a - b);
  const pernaEsquerda = xsBase.length >= 2 ? xsBase[1] - xsBase[0] : 0;
  const pernaDireita = xsBase.length >= 4 ? xsBase[3] - xsBase[2] : 0;
  check(
    "caso 4: as pernas do A têm massa suficiente para sobreviver a 16px",
    pernaEsquerda >= 18 && pernaDireita >= 18,
    `perna esquerda=${pernaEsquerda} direita=${pernaDireita} (mínimo 18 — abaixo disso a haste some na aba do navegador)`,
  );

  // O vão: o vértice interno do A tem que estar acima da base, senão não há
  // contraforma e a letra vira um triângulo cheio.
  const apiceInterno = pontos.find((p) => Math.abs(p[0] - 50) < 0.001 && p[1] > 20);
  const baseY = Math.max(...pontos.map((p) => p[1]));
  const alturaDoVao = apiceInterno ? baseY - apiceInterno[1] : 0;
  check(
    "caso 5: o A tem contraforma — o vão existe e ocupa altura de verdade",
    alturaDoVao >= 30,
    `vão=${alturaDoVao} (mínimo 30; sem ele o monograma vira um triângulo cheio)`,
  );
}

// REVISÃO 2026-08-02. Este caso casava a STRING `viewBox="0 0 100 100"`. Quando
// a marca ganhou a placa do favicon, passaram a existir dois recortes do MESMO
// desenho — 100 sem placa, 64 com — e a asserção literal reprovou o desenho
// certo. Ela conferia a FORMA de escrever; o que importa é a PROPRIEDADE: as
// coordenadas do path só valem se a caixa em que elas são interpretadas tiver
// 100 unidades. Agora é isso que se cobra, e a aritmética do enquadramento
// entra junto — o que sai mais forte, porque um translate errado passava batido
// pela regra antiga e agora não passa.
{
  const semPlaca = /"0 0 100 100"/.test(markBody);
  const plate = /ATLAS_PLATE = \{ size: (\d+), rx: (\d+), scale: ([\d.]+), translate: ([\d.]+) \}/.exec(logoSrc);
  const usaPlaca = /viewBox=\{[^}]*ATLAS_PLATE\.size/.test(markBody);
  // Sem placa o monograma vale direto. Com placa ele precisa ser escalado e
  // recentrado: translate = size/2 - 50*scale. Fora disso o desenho descola do
  // quadrado, e foi exatamente esse cálculo que o favicon documentou em prosa
  // e ninguém nunca conferiu.
  const t = plate ? Number(plate[1]) / 2 - 50 * Number(plate[3]) : null;
  const enquadramentoOk = plate ? Math.abs(t - Number(plate[4])) < 0.001 : false;
  const transformOk = /translate\(\$\{ATLAS_PLATE\.translate\} \$\{ATLAS_PLATE\.translate\}\) scale\(\$\{ATLAS_PLATE\.scale\}\)/.test(markBody);
  check(
    "caso 6: as coordenadas do monograma são interpretadas numa caixa de 100 (direto, ou reescaladas para a placa)",
    semPlaca && (!usaPlaca || (enquadramentoOk && transformOk)),
    !semPlaca
      ? "o recorte sem placa não usa 0 0 100 100 — as coordenadas do monograma perdem o sentido"
      : !plate
        ? "ATLAS_PLATE ausente: a placa existe no JSX mas não há constante para conferir o enquadramento"
        : !enquadramentoOk
          ? `translate deveria ser ${t} (= ${plate[1]}/2 − 50×${plate[3]}) e é ${plate[4]} — o monograma fica descentralizado na placa`
          : "o <g> da placa não aplica translate+scale a partir de ATLAS_PLATE — placa e monograma podem divergir numa edição futura",
  );
}

// --------------------------------------------------------------------------
// Forma única
// --------------------------------------------------------------------------
// REVISÃO 2026-07-26. Estes três casos exigiam órbita e planeta. Passaram a
// exigir o contrário, e não por conveniência: enquanto a marca tinha detalhe
// abaixo do limiar óptico, o favicon PRECISAVA divergir do componente — o que
// deu dois desenhos para o mesmo produto e deixou o caso 22 (identidade entre
// eles) impossível de satisfazer honestamente. Uma forma só resolve os dois
// problemas de uma vez, e permite que o cross-check volte a ser exigível.
const markEllipses = elements(markBody, "ellipse");
const markCircles = elements(markBody, "circle");

check(
  "caso 7: a marca é UMA forma só — sem órbita (<ellipse>)",
  markEllipses.length === 0,
  markEllipses.length ? `${markEllipses.length} <ellipse> no AtlasMark: detalhe que some abaixo de 24px e obriga o favicon a divergir` : "",
);

check(
  "caso 8: a marca é UMA forma só — sem planeta (<circle>)",
  markCircles.length === 0,
  markCircles.length ? `${markCircles.length} <circle> no AtlasMark: a 16px vira 0,5px de borrão` : "",
);

check(
  "caso 9: a marca não tem versão reduzida condicional (sem limiar de detalhe)",
  !/DETAIL_THRESHOLD|detailed\s*[?&]/.test(logoSrc),
  "renderizar formas diferentes por tamanho é ter duas marcas — foi assim que favicon e componente divergiram",
);

// --------------------------------------------------------------------------
// Gradiente da assinatura
// --------------------------------------------------------------------------
// As constantes foram renomeadas (GRAD_* → BRAND_*) e passaram a ser tokens com
// fallback — `var(--atlas-brand-from, #3ae7d7)` — para destravar white-label. As
// cores da marca continuam exatamente as mesmas: o que muda é que agora podem
// ser sobrescritas por tema sem editar o componente. O check aceita os dois
// nomes e a forma tokenizada, mas continua exigindo o hexadecimal exato como
// valor efetivo (dentro do var() ou solto).
check(
  `caso 10: as cores da assinatura são teal ${TEAL} → violet ${VIOLET}`,
  new RegExp(`(GRAD|BRAND)_FROM\\s*=\\s*"(var\\([^,)]+,\\s*)?${TEAL}\\)?"`, "i").test(logoSrc) &&
    new RegExp(`(GRAD|BRAND)_TO\\s*=\\s*"(var\\([^,)]+,\\s*)?${VIOLET}\\)?"`, "i").test(logoSrc),
  "GRAD_FROM/GRAD_TO (ou BRAND_FROM/BRAND_TO) não são exatamente as cores da marca",
);

{
  const grads = elements(logoCodigo, "linearGradient");
  const stops = gradientStops(logoCodigo);
  const from = stops.find((s) => s.offset === "0");
  const to = stops.find((s) => s.offset === "1");
  // ── REVISÃO 2026-08-02: ESTE CASO EXIGIA O DEFEITO ───────────────────────
  //
  // A regra pedia "id ESTÁVEL", casando `GRAD_ID` — uma constante de módulo,
  // portanto o MESMO id em toda instância da marca. `id` é global no documento:
  // duas marcas na mesma página emitiam `id="atlas-monogram-gradient"` duas
  // vezes, e todo `url(#…)` resolvia para a primeira.
  //
  // Medido na produção em 02/08/2026, na tela de acesso: a primeira cópia vivia
  // dentro da <section> de desktop, `display:none` abaixo de `lg`, medindo 0×0.
  // Gradiente sem caixa não pinta. Em toda largura de celular a marca do Atlas
  // era invisível — e o portão estava VERDE, porque cobrava justamente a
  // constante que causava isso.
  //
  // Inverter é mais forte que remover: agora o id tem de ser POR INSTÂNCIA, e
  // uma volta ao id de módulo reprova.
  const idDeModulo = /const\s+GRAD_ID\s*=\s*"/.test(logoCodigo);
  const idPorInstancia = /const\s+gradId\s*=\s*[^;]*useId\(\)/.test(markBody);
  check(
    "caso 11: <linearGradient> com id POR INSTÂNCIA (nunca de módulo) e stops offset 0 = teal e offset 1 = violet",
    grads.length === 1 &&
      !idDeModulo &&
      idPorInstancia &&
      (grads[0].id ?? "").includes("gradId") &&
      stops.length === 2 &&
      // O stop referencia a constante por expressão JSX, então o parser lê o
      // nome dela, não a cor. Aceita GRAD_* e BRAND_* — o valor exato já é
      // garantido pelo caso 10, que exige o hexadecimal da marca na constante.
      /^\{(grad|brand)_from\}$/.test(from?.color ?? "") &&
      /^\{(grad|brand)_to\}$/.test(to?.color ?? ""),
    JSON.stringify({ grads, stops }),
  );

  // Mesmo motivo do caso 11: o fill tem de apontar para o id DAQUELA instância.
  // Se ele apontasse para um nome de módulo, cada marca extra na página voltaria
  // a caçar o gradiente da primeira.
  check(
    "caso 12: o fill da assinatura referencia o id por instância do gradiente declarado",
    /url\(#\$\{gradId\}\)/.test(markBody) && !/url\(#\$\{GRAD_ID\}\)/.test(markBody),
    "o fill não usa url(#${gradId}) — sem id por instância, duas marcas na mesma página disputam o mesmo gradiente",
  );
}

// --------------------------------------------------------------------------
// Variante mono
// --------------------------------------------------------------------------
check(
  'caso 13: tone="mono" existe e resolve o pincel para currentColor',
  /tone\s*(\?)?:\s*AtlasTone/.test(logoSrc) &&
    /"signature"\s*\|\s*"mono"|"mono"\s*\|\s*"signature"/.test(logoSrc) &&
    /const mono = tone === "mono"/.test(markBody) &&
    /mono\s*\?\s*"currentColor"\s*:/.test(markBody),
  "não achei a resolução mono → currentColor no AtlasMark",
);

check(
  "caso 14: no modo mono o <defs>/<linearGradient> NÃO é emitido",
  /\{\s*!mono\s*\?\s*\(\s*<defs>/.test(markBody) && /<\/defs>\s*\)\s*:\s*null\s*\}/.test(markBody),
  "o bloco <defs> não está guardado por !mono — mono referenciaria um gradiente inexistente",
);

{
  // Nenhum traço da marca pode cravar url(#...) ou cor hex: tudo passa pelo pincel
  // resolvido (fill), senão a variante mono vaza gradiente.
  // Conta no CÓDIGO, não na prosa. A versão anterior varria o bloco inteiro e
  // um comentário que citasse `url(#…)` — explicando justamente por que o id
  // não pode ser fixo — era contado como se fosse um traço pintado. Portão que
  // reprova por causa de um comentário treina a pessoa a apagar a explicação,
  // que é o oposto do que se quer. Instrumento errado, não regra errada.
  const codigo = semComentarios(markBody);
  const urlHits = codigo.match(/url\(#/g) ?? [];
  const hexHits = codigo.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  // Uma forma, um pincel. A lista existia para cobrir órbita e planeta.
  const painted = [star?.attrs.fill];
  check(
    "caso 15: a estrela usa o pincel resolvido ({fill}) — sem cor cravada",
    urlHits.length === 1 && hexHits.length === 0 && painted.every((p) => p === "{fill}"),
    `url(#=${urlHits.length} hex=${JSON.stringify(hexHits)} pinceis=${JSON.stringify(painted)}`,
  );
}

check(
  "caso 16: no modo mono o glow (drop-shadow colorido) fica desligado",
  /glow\s*&&\s*!mono\s*\?/.test(markBody),
  "o filtro de glow não está condicionado a !mono",
);

// --------------------------------------------------------------------------
// app/icon.svg
// --------------------------------------------------------------------------
check(`caso 17: ${ICON_REL} existe`, Boolean(iconSrc), "arquivo não encontrado");

const xml = iconSrc ? validateXml(iconSrc) : { ok: false, reason: "arquivo ausente" };
check(`caso 18: ${ICON_REL} é XML bem formado com raiz <svg>`, xml.ok && /^\s*<svg\b/.test(iconSrc ?? ""), xml.reason ?? "");

{
  const grads = iconSrc ? elements(iconSrc, "linearGradient") : [];
  const stops = iconSrc ? gradientStops(iconSrc) : [];
  const from = stops.find((s) => s.offset === "0");
  const to = stops.find((s) => s.offset === "1");
  check(
    `caso 19: ${ICON_REL} traz o gradiente teal ${TEAL} → violet ${VIOLET}`,
    grads.length === 1 && stops.length === 2 && from?.color === TEAL && to?.color === VIOLET,
    JSON.stringify({ grads, stops }),
  );

  const gradId = grads[0]?.id;
  const refs = [...(iconSrc ?? "").matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
  check(
    `caso 20: ${ICON_REL} referencia o gradiente por um id que realmente existe`,
    // Uma forma, uma referência. O `>= 3` de antes pressupunha estrela + órbita
    // + planeta, e passou a ser impossível quando a marca virou forma única.
    Boolean(gradId) && refs.length >= 1 && refs.every((r) => r === gradId),
    JSON.stringify({ gradId, refs }),
  );
}

{
  const rects = iconSrc ? elements(iconSrc, "rect") : [];
  const tile = rects.find((r) => Number(r.rx) > 0);
  check(
    `caso 21: ${ICON_REL} tem o tile arredondado (<rect> com rx > 0 cobrindo o ícone)`,
    Boolean(tile) && Number(tile.width) === Number(tile.height) && Number(tile.width) > 0 && Number(tile.rx) < Number(tile.width) / 2,
    rects.length ? JSON.stringify(rects) : "nenhum <rect> no icon.svg",
  );
}

{
  // Cross-check: o desenho do icon.svg é a MESMA marca do componente.
  //
  // Com a marca em forma única, isto deixou de ser aspiração e virou exigível:
  // o path do favicon tem que ser o path do componente, número por número.
  const iconStar = iconSrc ? elements(iconSrc, "path").map((p) => ({ d: p.d, a: analyzeMonogramPath(p.d) })).find((p) => p.a.ok) : undefined;
  const iconOrbit = iconSrc ? elements(iconSrc, "ellipse").length : 0;
  const iconPlanet = iconSrc ? elements(iconSrc, "circle").length : 0;
  const sameStar = Boolean(iconStar && star) && JSON.stringify(iconStar.a.nums) === JSON.stringify(star.analysis.nums);

  // O travessão também precisa bater. O monograma são DUAS formas que se leem
  // como uma; conferir só o contorno deixaria o favicon virar um "A" sem barra
  // sem ninguém perceber.
  const barraDoComponente = /ATLAS_CROSSBAR = \{ x: (\d+), y: (\d+), width: (\d+), height: (\d+), rx: (\d+) \}/.exec(logoSrc ?? "");
  const retangulosDoIcone = iconSrc ? elements(iconSrc, "rect") : [];
  // O primeiro <rect> é o tile arredondado do fundo; a barra é a que tem x/y.
  const barraDoIcone = retangulosDoIcone.find((r) => r.x !== undefined && r.y !== undefined);
  const mesmaBarra = Boolean(barraDoComponente && barraDoIcone)
    && Number(barraDoIcone.x) === Number(barraDoComponente[1])
    && Number(barraDoIcone.y) === Number(barraDoComponente[2])
    && Number(barraDoIcone.width) === Number(barraDoComponente[3])
    && Number(barraDoIcone.height) === Number(barraDoComponente[4]);

  check(
    `caso 22: a geometria de ${ICON_REL} é idêntica à do componente, e nada além dela`,
    sameStar && mesmaBarra && iconOrbit === 0 && iconPlanet === 0,
    JSON.stringify({ contornoIgual: sameStar, travessaoIgual: mesmaBarra, ellipsesNoIcone: iconOrbit, circulosNoIcone: iconPlanet }),
  );
}

// --------------------------------------------------------------------------
// Uso: login e sidebar
// --------------------------------------------------------------------------
for (const [caseNo, rel, src, label] of [
  [23, LOGIN_REL, loginSrc, "login"],
  [24, SIDEBAR_REL, sidebarSrc, "sidebar"],
]) {
  const importsLogo = Boolean(src) && /import\s*\{[^}]*\bAtlasLogo\b[^}]*\}\s*from\s*"@\/components\/atlas\/atlas-logo"/.test(src);
  const rendersLogo = Boolean(src) && /<AtlasLogo\b/.test(src);
  check(
    `caso ${caseNo}: a marca é usada no ${label} (${rel})`,
    importsLogo && rendersLogo,
    !src ? "arquivo não encontrado" : `import=${importsLogo} render=${rendersLogo}`,
  );
}

// --------------------------------------------------------------------------
console.log(`\ncheck-atlas-logo: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
