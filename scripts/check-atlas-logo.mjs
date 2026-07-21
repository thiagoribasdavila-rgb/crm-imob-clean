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
function analyzeStarPath(d) {
  if (typeof d !== "string" || !d.trim()) return { ok: false, reason: "path sem atributo d" };
  const body = d.trim();
  if (!/^M/i.test(body)) return { ok: false, reason: `d não começa com M: ${body.slice(0, 24)}` };
  if (!/z\s*$/i.test(body)) return { ok: false, reason: "d não fecha com Z" };
  const commands = body.match(/[MQZmqz]/g) ?? [];
  const qCount = commands.filter((c) => c.toLowerCase() === "q").length;
  if (commands.some((c) => c !== c.toUpperCase())) {
    return { ok: false, reason: "path usa comandos relativos (esperado absoluto)" };
  }
  if (qCount !== 4) return { ok: false, reason: `esperadas 4 curvas Q (4 pontas), achadas ${qCount}` };

  const nums = (body.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  // M(2) + 4 * Q(4) = 18 números
  if (nums.length !== 18) return { ok: false, reason: `esperados 18 números no path, achados ${nums.length}` };
  const start = [nums[0], nums[1]];
  const tips = [start];
  for (let i = 0; i < 4; i += 1) {
    const base = 2 + i * 4;
    tips.push([nums[base + 2], nums[base + 3]]);
  }
  const last = tips.pop(); // a 4ª curva volta ao ponto inicial
  if (Math.abs(last[0] - start[0]) > 0.001 || Math.abs(last[1] - start[1]) > 0.001) {
    return { ok: false, reason: `a última curva não retorna à ponta inicial (${last} vs ${start})` };
  }
  return { ok: true, tips, nums };
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
const markBody = markStart >= 0 && markEnd > markStart ? logoSrc.slice(markStart, markEnd) : "";

check("caso 2: função AtlasMark (o desenho da marca) existe e é isolável", markBody.length > 0, "não achei o bloco function AtlasMark ... antes de type AtlasLogoProps");

// --------------------------------------------------------------------------
// Estrela de 4 pontas
// --------------------------------------------------------------------------
const markPaths = elements(markBody, "path");
const star = markPaths.map((p) => ({ attrs: p, analysis: analyzeStarPath(p.d) })).find((p) => p.analysis.ok);

check(
  "caso 3: a marca tem o path da estrela de 4 pontas (M + 4 curvas Q + Z)",
  Boolean(star),
  markPaths.length === 0 ? "nenhum <path> no AtlasMark" : markPaths.map((p) => analyzeStarPath(p.d).reason).join(" | "),
);

{
  const tips = star?.analysis.tips ?? [];
  const cx = 50;
  const cy = 50;
  const up = tips.find((t) => t[1] < cy && Math.abs(t[0] - cx) < 5);
  const down = tips.find((t) => t[1] > cy && Math.abs(t[0] - cx) < 5);
  const left = tips.find((t) => t[0] < cx && Math.abs(t[1] - cy) < 5);
  const right = tips.find((t) => t[0] > cx && Math.abs(t[1] - cy) < 5);
  check(
    "caso 4: as 4 pontas apontam para cima/baixo/esquerda/direita (viewBox 0 0 100 100)",
    tips.length === 4 && Boolean(up && down && left && right),
    `pontas: ${JSON.stringify(tips)}`,
  );

  const vertical = up && down ? down[1] - up[1] : 0;
  const horizontal = left && right ? right[0] - left[0] : 0;
  check(
    "caso 5: o eixo vertical é alongado (north-star: altura > largura)",
    vertical > horizontal && horizontal > 0,
    `vertical=${vertical} horizontal=${horizontal}`,
  );
}

check(
  "caso 6: o SVG da marca usa viewBox 0 0 100 100 (a geometria do path pressupõe isso)",
  /viewBox="0 0 100 100"/.test(markBody),
  "viewBox diferente invalida as coordenadas da estrela",
);

// --------------------------------------------------------------------------
// Órbita e planeta
// --------------------------------------------------------------------------
const markEllipses = elements(markBody, "ellipse");
const orbit = markEllipses.find((e) => /rotate\(\s*-?\d/.test(e.transform ?? "") && e.rx && e.ry);
check(
  "caso 7: a órbita existe (<ellipse> com transform rotate e rx/ry)",
  Boolean(orbit),
  markEllipses.length === 0 ? "nenhum <ellipse> no AtlasMark" : JSON.stringify(markEllipses),
);

check(
  "caso 8: a órbita é elíptica (rx != ry) e traçada, não preenchida",
  Boolean(orbit) && Number(orbit.rx) !== Number(orbit.ry) && (orbit.fill ?? "") === "none" && Boolean(orbit.stroke),
  orbit ? JSON.stringify(orbit) : "sem órbita",
);

const markCircles = elements(markBody, "circle");
const planet = markCircles.find((c) => Number(c.r) > 0);
check(
  "caso 9: o planeta existe (<circle> com raio > 0) e fica sobre a órbita",
  Boolean(planet) && Number(planet.cx) > 50,
  markCircles.length === 0 ? "nenhum <circle> no AtlasMark" : JSON.stringify(markCircles),
);

// --------------------------------------------------------------------------
// Gradiente da assinatura
// --------------------------------------------------------------------------
check(
  `caso 10: as cores da assinatura são teal ${TEAL} → violet ${VIOLET}`,
  new RegExp(`GRAD_FROM\\s*=\\s*"${TEAL}"`, "i").test(logoSrc) && new RegExp(`GRAD_TO\\s*=\\s*"${VIOLET}"`, "i").test(logoSrc),
  "GRAD_FROM/GRAD_TO não são exatamente as cores da marca",
);

{
  const grads = elements(logoSrc, "linearGradient");
  const stops = gradientStops(logoSrc);
  const from = stops.find((s) => s.offset === "0");
  const to = stops.find((s) => s.offset === "1");
  check(
    "caso 11: <linearGradient> com id estável e stops offset 0 = teal e offset 1 = violet",
    grads.length === 1 &&
      (grads[0].id ?? "").includes("GRAD_ID") &&
      stops.length === 2 &&
      from?.color === "{grad_from}" &&
      to?.color === "{grad_to}",
    JSON.stringify({ grads, stops }),
  );

  const gradIdLine = logoSrc.match(/const GRAD_ID\s*=\s*"([^"]+)"/);
  check(
    "caso 12: o fill da assinatura referencia o MESMO id do gradiente declarado",
    Boolean(gradIdLine) && /url\(#\$\{GRAD_ID\}\)/.test(markBody),
    gradIdLine ? "o fill não usa url(#${GRAD_ID})" : "const GRAD_ID ausente",
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
  const urlHits = markBody.match(/url\(#/g) ?? [];
  const hexHits = markBody.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  const painted = [orbit?.stroke, planet?.fill, star?.attrs.fill];
  check(
    "caso 15: órbita, planeta e estrela usam o pincel resolvido ({fill}) — sem cor cravada",
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
    Boolean(gradId) && refs.length >= 3 && refs.every((r) => r === gradId),
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
  const iconStar = iconSrc ? elements(iconSrc, "path").map((p) => ({ d: p.d, a: analyzeStarPath(p.d) })).find((p) => p.a.ok) : undefined;
  const iconOrbit = iconSrc ? elements(iconSrc, "ellipse").find((e) => /rotate\(/.test(e.transform ?? "")) : undefined;
  const iconPlanet = iconSrc ? elements(iconSrc, "circle").find((c) => Number(c.r) > 0) : undefined;
  const sameStar = Boolean(iconStar && star) && JSON.stringify(iconStar.a.nums) === JSON.stringify(star.analysis.nums);
  const sameOrbit =
    Boolean(iconOrbit && orbit) &&
    ["cx", "cy", "rx", "ry", "transform"].every((k) => String(iconOrbit[k]) === String(orbit[k]));
  const samePlanet =
    Boolean(iconPlanet && planet) && ["cx", "cy", "r"].every((k) => String(iconPlanet[k]) === String(planet[k]));
  check(
    `caso 22: a geometria de ${ICON_REL} é idêntica à do componente (estrela, órbita e planeta)`,
    sameStar && sameOrbit && samePlanet,
    JSON.stringify({ sameStar, sameOrbit, samePlanet, iconStar: iconStar?.d, iconOrbit, iconPlanet }),
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
