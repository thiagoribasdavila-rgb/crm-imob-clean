/**
 * Teste adversarial do CONTRATO Localizador de Público ⇄ tela de Marketing.
 *
 * Este check existe por um motivo específico: a rota /api/v1/marketing/andromeda
 * já calculava `audience` (placements/geo/demo), `prescriptions` (policy-engine) e
 * `forecast.weeks` (série semanal REAL) — e a tela DESCARTAVA os três. O check
 * trava esse regresso: se a rota parar de devolver, ou se a página parar de
 * declarar no type / renderizar no JSX, ele falha.
 *
 * Garante também as duas regras de honestidade do painel:
 *  - demografia SEMPRE acompanhada do policyNote (sob HOUSING é observação de
 *    entrega, nunca alvo de segmentação);
 *  - gráfico preditivo só desenha com >= 2 semanas REAIS (degrade honesto,
 *    nunca curva inventada).
 *
 * 100% determinístico: lê os arquivos-alvo e importa os núcleos puros
 * (audience-finder / forecast) com type-stripping nativo. Sem rede, sem banco,
 * sem relógio, sem aleatório.
 *
 * Rodar da raiz do repo: node scripts/check-audience-ui.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROUTE_REL = "app/api/v1/marketing/andromeda/route.ts";
const PAGE_REL = "app/(crm)/marketing/page.tsx";

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

function readOrDie(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`check-audience-ui: arquivo-alvo ausente: ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

const route = readOrDie(ROUTE_REL);
const page = readOrDie(PAGE_REL);

// ---------------------------------------------------------------------------
// Helpers de leitura estrutural (sem regex frágil onde dá para casar chaves)
// ---------------------------------------------------------------------------

/** Fatia balanceada a partir de um `{`, `[` ou `(`, ignorando strings e comentários. */
function sliceBalanced(src, openIdx) {
  const open = src[openIdx];
  const close = open === "{" ? "}" : open === "[" ? "]" : ")";
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i += 1;
      while (i < src.length) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === q) break;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i += 1; continue; }
    if (c === "/" && src[i + 1] === "*") { const end = src.indexOf("*/", i); i = end === -1 ? src.length : end + 2; continue; }
    if (c === open) depth += 1;
    else if (c === close) { depth -= 1; if (depth === 0) return src.slice(openIdx, i + 1); }
    i += 1;
  }
  return null;
}

/** Objeto literal que começa no primeiro `{` depois do marcador. */
function objectAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at === -1) return null;
  const open = src.indexOf("{", at);
  if (open === -1) return null;
  return sliceBalanced(src, open);
}

/** Chaves de PRIMEIRO nível de um objeto literal (inclui shorthand `weeks,`). */
function topLevelKeys(objSrc) {
  const keys = new Set();
  if (!objSrc) return keys;
  let depth = 0;
  let prev = "";
  let i = 0;
  const isIdStart = (c) => /[A-Za-z_$]/.test(c);
  while (i < objSrc.length) {
    const c = objSrc[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i += 1;
      while (i < objSrc.length) {
        if (objSrc[i] === "\\") { i += 2; continue; }
        if (objSrc[i] === q) break;
        i += 1;
      }
      i += 1;
      prev = "s";
      continue;
    }
    if (c === "/" && objSrc[i + 1] === "/") { while (i < objSrc.length && objSrc[i] !== "\n") i += 1; continue; }
    if (c === "/" && objSrc[i + 1] === "*") { const end = objSrc.indexOf("*/", i); i = end === -1 ? objSrc.length : end + 2; continue; }
    if (c === "{" || c === "[" || c === "(") { depth += 1; prev = c; i += 1; continue; }
    if (c === "}" || c === "]" || c === ")") { depth -= 1; prev = c; i += 1; continue; }
    if (/\s/.test(c)) { i += 1; continue; }
    if (depth === 1 && (prev === "{" || prev === ",") && isIdStart(c)) {
      let j = i;
      while (j < objSrc.length && /[\w$]/.test(objSrc[j])) j += 1;
      const name = objSrc.slice(i, j);
      let k = j;
      while (k < objSrc.length && /\s/.test(objSrc[k])) k += 1;
      if (objSrc[k] === ":" || objSrc[k] === "," || objSrc[k] === "}") keys.add(name);
      prev = "x";
      i = j;
      continue;
    }
    prev = c;
    i += 1;
  }
  return keys;
}

/** Corpo do type alias `type Nome = { ... }`. */
function typeBody(src, name) {
  const re = new RegExp(`type\\s+${name}\\s*=`);
  const m = re.exec(src);
  if (!m) return null;
  const open = src.indexOf("{", m.index);
  if (open === -1) return null;
  return sliceBalanced(src, open);
}

/** Corpo do IIFE `(() => { ... })()` que contém o marcador. */
function blockContaining(src, marker) {
  const at = src.indexOf(marker);
  if (at === -1) return null;
  const arrowAt = src.lastIndexOf("(() =>", at);
  if (arrowAt === -1) return null;
  const open = src.indexOf("{", arrowAt);
  if (open === -1 || open > at) return null;
  return sliceBalanced(src, open);
}

// ---------------------------------------------------------------------------
// ROTA — o que a IA calcula tem de sair na resposta
// ---------------------------------------------------------------------------
const payload = objectAfter(route, "return apiSuccess(");
const payloadKeys = topLevelKeys(payload);
const audienceObj = payload ? objectAfter(payload, "audience:") : null;
const audienceKeys = topLevelKeys(audienceObj);
const prescriptionsObj = payload ? objectAfter(payload, "prescriptions:") : null;
const prescriptionsKeys = topLevelKeys(prescriptionsObj);
const forecastObj = objectAfter(route, "const forecast =");
const forecastKeys = topLevelKeys(forecastObj);

// caso 1
check(
  "caso 1: a rota devolve `audience` com placements/geo/demo/angles",
  payloadKeys.has("audience") &&
    audienceKeys.has("placements") &&
    audienceKeys.has("geo") &&
    audienceKeys.has("demo") &&
    audienceKeys.has("angles"),
  `payload=${[...payloadKeys].join(",") || "(não encontrei o objeto do apiSuccess)"} | audience=${[...audienceKeys].join(",") || "(ausente)"}`,
);

// caso 2
check(
  "caso 2: a rota devolve `prescriptions` (proposals + summary) do policy-engine",
  payloadKeys.has("prescriptions") &&
    prescriptionsKeys.has("proposals") &&
    prescriptionsKeys.has("summary") &&
    /proposePolicies\s*\(/.test(route) &&
    /policySummary\s*\(/.test(route),
  `prescriptions=${[...prescriptionsKeys].join(",") || "(ausente)"}`,
);

// caso 3
check(
  "caso 3: a rota devolve `forecast` incluindo a série semanal REAL (`weeks` agregada de rows)",
  payloadKeys.has("forecast") &&
    forecastKeys.has("weeks") &&
    /const\s+weeks\s*:/.test(route) &&
    /weekMap/.test(route) &&
    /for\s*\(\s*const\s+r\s+of\s+rows\s*\)/.test(route),
  `forecast=${[...forecastKeys].join(",") || "(objeto `const forecast` não encontrado)"}`,
);

// caso 4
check(
  "caso 4: demografia da rota vem de breakdown age+gender via demoReport (leitura, não segmentação)",
  /breakdowns\s*:\s*\[\s*"age"\s*,\s*"gender"\s*\]/.test(route) &&
    /demoReport\s*\(\s*demoRows\s*\)/.test(route) &&
    /from\s+"@\/lib\/meta\/marketing\/audience-finder"/.test(route),
  "esperava fetchBreakdownInsights com breakdowns [age, gender] alimentando demoReport(demoRows)",
);

// ---------------------------------------------------------------------------
// PÁGINA — o type declara e o JSX renderiza (senão a UI volta a descartar)
// ---------------------------------------------------------------------------
const tForecast = typeBody(page, "Forecast");
const tAudience = typeBody(page, "Audience");
const tAndromeda = typeBody(page, "Andromeda");

// caso 5
check(
  "caso 5: o type Forecast da página declara `weeks` (weekStart/spend/leads)",
  !!tForecast &&
    /weeks\??\s*:/.test(tForecast) &&
    /weekStart\s*:/.test(tForecast) &&
    /leads\s*:/.test(tForecast),
  tForecast ? "type Forecast sem `weeks` — a série real volta a ser descartada pelo TypeScript" : "type Forecast não encontrado na página",
);

// caso 6
check(
  "caso 6: o type Audience declara placements/geo/demo com policyNote",
  !!tAudience &&
    /placements\s*:/.test(tAudience) &&
    /geo\s*:/.test(tAudience) &&
    /demo\s*:/.test(tAudience) &&
    /policyNote\s*:\s*string/.test(tAudience),
  tAudience ?? "type Audience não encontrado na página",
);

// caso 7
check(
  "caso 7: o type Andromeda declara `audience` e `prescriptions`",
  !!tAndromeda &&
    /audience\??\s*:\s*Audience/.test(tAndromeda) &&
    /prescriptions\??\s*:/.test(tAndromeda) &&
    /proposals\s*:\s*Prescription\[\]/.test(tAndromeda),
  tAndromeda ? "type Andromeda sem audience/prescriptions" : "type Andromeda não encontrado na página",
);

// caso 8 — JSX do Localizador de Público
const audienceBlock = blockContaining(page, "andromeda.data.audience");
check(
  "caso 8: o JSX consome andromeda.data.audience e renderiza placements, geo e demo",
  !!audienceBlock &&
    /a\.placements\s*\.?/.test(audienceBlock) &&
    /a\.placements[\s\S]*\.map\s*\(/.test(audienceBlock) &&
    /a\.geo/.test(audienceBlock) &&
    /a\.demo/.test(audienceBlock) &&
    /<section/.test(audienceBlock),
  audienceBlock
    ? "bloco de audience existe mas não renderiza placements/geo/demo"
    : "a página NÃO lê andromeda.data.audience — a UI voltou a descartar o Localizador de Público",
);

// caso 9 — demografia nunca sozinha: policyNote junto e antes do fallback
{
  const b = audienceBlock ?? "";
  const iGuard = b.indexOf("a.demo && a.demo.lines.length");
  const iLines = b.indexOf("a.demo.lines.slice");
  const iNote = b.indexOf("a.demo.policyNote");
  const iFallback = b.search(/Sem quebra demogr/);
  check(
    "caso 9: demografia renderizada SEMPRE com o policyNote (observação sob HOUSING, não alvo)",
    iGuard !== -1 && iLines !== -1 && iNote !== -1 && iFallback !== -1 && iGuard < iLines && iLines < iNote && iNote < iFallback,
    `posições no bloco: guard=${iGuard} lines=${iLines} policyNote=${iNote} fallback=${iFallback} (policyNote precisa estar no mesmo ramo, depois das linhas e antes do fallback)`,
  );
}

// caso 10 — prescrições
const prescBlock = blockContaining(page, "andromeda.data.prescriptions");
check(
  "caso 10: o JSX consome andromeda.data.prescriptions e renderiza as propostas",
  !!prescBlock &&
    /pres\.proposals[\s\S]*\.map\s*\(/.test(prescBlock) &&
    /p\.kind/.test(prescBlock) &&
    /p\.target/.test(prescBlock) &&
    /p\.reason/.test(prescBlock),
  prescBlock
    ? "bloco de prescriptions existe mas não mapeia proposals (kind/target/reason)"
    : "a página NÃO lê andromeda.data.prescriptions — as prescrições da IA voltaram a morrer na rota",
);

// caso 11 — gráfico preditivo existe e bebe de forecast.weeks
const chartBlock = (() => {
  const marks = ["f.weeks", "andromeda.data.forecast;"];
  for (const m of marks) {
    const b = blockContaining(page, m);
    if (b && /<svg/.test(b)) return b;
  }
  return null;
})();
check(
  "caso 11: o gráfico preditivo é desenhado a partir de forecast.weeks (série real)",
  !!chartBlock && /const\s+hist\s*=\s*f\.weeks/.test(chartBlock) && /hist\.map\s*\(/.test(chartBlock) && /<path/.test(chartBlock),
  chartBlock
    ? "bloco do gráfico não deriva o histórico de f.weeks"
    : "não achei o bloco do gráfico preditivo consumindo f.weeks — a série semanal voltou a ser descartada",
);

// caso 12 — degrade honesto: >= 2 semanas reais ou nada
{
  const b = chartBlock ?? "";
  const lines = b.split("\n");
  const guardLine = lines.find((l) => /weeks\??\.length\s*(<\s*2|>=\s*2|<\s*=\s*1|>\s*1)/.test(l));
  const returnsNull = !!guardLine && /(return\s+null|\?\s*null|:\s*null)/.test(guardLine);
  const guardsAbsence = !!guardLine && /(!\s*f\??\.?weeks|f\?\.weeks|weeks\?\.length|weeks\s*\?\?)/.test(guardLine);
  check(
    "caso 12: gráfico só renderiza com >= 2 semanas reais (degrade, nunca curva inventada)",
    !!guardLine && returnsNull && guardsAbsence,
    guardLine ? `guarda encontrada mas incompleta: ${guardLine.trim()}` : "nenhuma guarda de mínimo de semanas (`weeks.length < 2 → null`) no bloco do gráfico",
  );
}

// caso 13 — nada de curva fabricada
{
  const b = chartBlock ?? "";
  const fabrication = /Math\.random|Array\.from\s*\(\s*\{\s*length|new Array\s*\(|faker|placeholder(Weeks|Series)|mockWeeks/i;
  const pointsFromHist = /pts\s*=\s*hist\.map/.test(b) && /vals\s*=\s*\[\s*\.\.\.hist\.map/.test(b);
  check(
    "caso 13: o histórico do gráfico não é fabricado (pontos vêm 1:1 das semanas reais)",
    !!b && !fabrication.test(b) && pointsFromHist,
    !b ? "sem bloco do gráfico" : fabrication.test(b) ? "o bloco do gráfico contém geração sintética de série" : "os pontos do gráfico não são derivados diretamente de hist (f.weeks)",
  );
}

// caso 14 — projeção separada do histórico e vinda da API
{
  const b = chartBlock ?? "";
  check(
    "caso 14: a projeção é tracejada e vem de projectedWeeklyLeads da API (a UI não extrapola sozinha)",
    !!b && /strokeDasharray/.test(b) && /projectedWeeklyLeads/.test(b) && /p\.esperado/.test(b),
    !b ? "sem bloco do gráfico" : "esperava strokeDasharray na projeção e p.esperado vindo de f.account.projectedWeeklyLeads",
  );
}

// caso 15 — cross-check: tudo que a página lê existe na rota, e os três alvos são lidos
{
  const read = new Set([...page.matchAll(/andromeda\.data\.(\w+)/g)].map((m) => m[1]));
  const orphans = [...read].filter((k) => !payloadKeys.has(k));
  const required = ["audience", "prescriptions", "forecast"];
  const missing = required.filter((k) => !read.has(k));
  check(
    "caso 15: a página lê audience/prescriptions/forecast e nenhuma chave órfã (contrato rota⇄tela)",
    orphans.length === 0 && missing.length === 0,
    `lidas=${[...read].join(",")} | órfãs (não existem na rota)=${orphans.join(",") || "nenhuma"} | não consumidas=${missing.join(",") || "nenhuma"}`,
  );
}

// ---------------------------------------------------------------------------
// NÚCLEOS PUROS — o texto e o degrade que a tela promete existem de verdade
// ---------------------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "audience-ui-"));
function emit(relTs, outName) {
  const src = stripTypeScriptTypes(fs.readFileSync(path.join(root, relTs), "utf8"));
  fs.writeFileSync(path.join(tmp, outName), src, "utf8");
  return pathToFileURL(path.join(tmp, outName)).href;
}
const { demoReport } = await import(emit("lib/meta/marketing/audience-finder.ts", "audience-finder.mjs"));
const { forecastCampaign } = await import(emit("lib/meta/marketing/forecast.ts", "forecast.mjs"));

// caso 16
{
  const rows = [
    { keys: { age: "25-34", gender: "female" }, campaignId: "c1", campaignName: "C1", spend: 300, impressions: 1000, clicks: 40, leads: 6, dateStart: "2026-01-05", dateStop: "2026-01-11" },
    { keys: { age: "35-44", gender: "male" }, campaignId: "c1", campaignName: "C1", spend: 200, impressions: 900, clicks: 20, leads: 2, dateStart: "2026-01-05", dateStop: "2026-01-11" },
  ];
  const demo = demoReport(rows);
  check(
    "caso 16: demoReport entrega linhas + policyNote dizendo que sob HOUSING é observação, não segmentação",
    Array.isArray(demo.lines) &&
      demo.lines.length === 2 &&
      demo.lines[0].age === "25-34" &&
      typeof demo.policyNote === "string" &&
      demo.policyNote.includes("HOUSING") &&
      /PROIBIDO|proibido/.test(demo.policyNote) &&
      /Segmentar|segmentar/.test(demo.policyNote),
    JSON.stringify(demo.policyNote),
  );
}

// caso 17
{
  const zero = forecastCampaign([]);
  const one = forecastCampaign([{ weekStart: "2026-01-05", spend: 1000, leads: 10 }]);
  check(
    "caso 17: sem histórico (ou com 1 semana) a previsão não inventa tendência — coerente com o degrade do gráfico",
    zero.projectedWeeklyLeads.esperado === 0 &&
      zero.projectedCpl === null &&
      zero.confidence === "baixa" &&
      zero.trendPct === 0 &&
      one.trendPct === 0 &&
      one.pace === "estavel" &&
      one.confidence === "baixa" &&
      one.assumptions.length > 0,
    JSON.stringify({ zero: { esperado: zero.projectedWeeklyLeads.esperado, conf: zero.confidence }, one: { trendPct: one.trendPct, pace: one.pace, conf: one.confidence } }),
  );
}

// ---------------------------------------------------------------------------
console.log(`check-audience-ui: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
