/**
 * Teste adversarial do painel de APROVAÇÃO 1-clique das campanhas Meta
 * (components/atlas/CampaignApprovalsPanel.tsx) e da sua montagem na Sala de
 * Comando (app/(crm)/command-center/page.tsx).
 *
 * A garantia que este check protege é o elo de governança:
 *   consumir GET /api/v1/marketing/ready-campaigns + GET /api/v1/marketing/proposals,
 *   submeter POST /api/v1/marketing/proposals com kind "create" e payload
 *   { accountId, steps }, mostrar honestamente o que FALTA para ATIVAR
 *   (missingToActivate), degradar sem inventar dado, linkar a Caixa (/approvals)
 *   e aparecer SOMENTE para liderança (bloco !isBroker) no command-center.
 *
 * 100% determinístico: só lê arquivos do repo e importa o núcleo PURO
 * lib/marketing/campaign-proposals.ts (strip de tipos nativo do Node — o módulo
 * só tem `import type`). Sem rede, sem banco, sem relógio, sem aleatório.
 *
 * Rodar da raiz do repo: node scripts/check-campaign-approvals-panel.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PANEL_PATH = path.join(root, "components", "atlas", "CampaignApprovalsPanel.tsx");
const PAGE_PATH = path.join(root, "app", "(crm)", "command-center", "page.tsx");
const READY_ROUTE_PATH = path.join(root, "app", "api", "v1", "marketing", "ready-campaigns", "route.ts");
const PROPOSALS_ROUTE_PATH = path.join(root, "app", "api", "v1", "marketing", "proposals", "route.ts");

const READY_URL = "/api/v1/marketing/ready-campaigns";
const PROPOSALS_URL = "/api/v1/marketing/proposals";

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

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

/**
 * Fatia balanceada a partir do delimitador `open` na posição `from` (inclusive).
 * Contagem simples de delimitadores — suficiente e estável para TSX deste repo.
 */
function balancedSlice(src, from, open, close) {
  const start = src.indexOf(open, from);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

/** Índice do caractere que fecha o delimitador aberto em `start`. -1 se não fechar. */
function balancedEnd(src, start, open, close) {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Corpo (com parênteses) da chamada `fetch(...)` cujo primeiro argumento é `url`. */
function fetchCall(src, url) {
  const at = src.indexOf(`fetch("${url}"`);
  if (at < 0) return "";
  return balancedSlice(src, at, "(", ")");
}

/** Chaves de primeiro nível de um objeto literal em texto (`{ a: 1, b: { c: 2 } }` → ["a","b"]). */
function topLevelKeys(objectText) {
  const keys = [];
  let depth = 0;
  const re = /[{}[\]()]|([A-Za-z_$][\w$]*)\s*:/g;
  let m;
  while ((m = re.exec(objectText))) {
    const tok = m[0];
    if (m[1] !== undefined && depth === 1) {
      keys.push(m[1]);
      continue;
    }
    if (tok === "{" || tok === "[" || tok === "(") depth += 1;
    else if (tok === "}" || tok === "]" || tok === ")") depth -= 1;
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------
const panel = readIfExists(PANEL_PATH);
const page = readIfExists(PAGE_PATH);
const readyRoute = readIfExists(READY_ROUTE_PATH);
const proposalsRoute = readIfExists(PROPOSALS_ROUTE_PATH);

check(
  "caso 1: arquivos-alvo existem (painel, command-center e as duas rotas consumidas)",
  Boolean(panel && page && readyRoute && proposalsRoute),
  `ausentes: ${[
    [PANEL_PATH, panel],
    [PAGE_PATH, page],
    [READY_ROUTE_PATH, readyRoute],
    [PROPOSALS_ROUTE_PATH, proposalsRoute],
  ]
    .filter(([, v]) => !v)
    .map(([p]) => path.relative(root, p))
    .join(", ") || "nenhum"}`,
);

if (!panel || !page || !readyRoute || !proposalsRoute) {
  console.log(`\ncheck-campaign-approvals-panel: ${passed} passaram, ${failures.length} falharam.`);
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}

// Regiões do painel
const loadRegion = balancedSlice(panel, panel.indexOf("const load = useCallback("), "(", ")");
const submitRegion = balancedSlice(panel, panel.indexOf("const submit = useCallback("), "(", ")");
const jsxAt = panel.indexOf("return (", panel.indexOf("const submit = useCallback("));
const jsx = jsxAt >= 0 ? panel.slice(jsxAt) : "";

// ---------------------------------------------------------------------------
// caso 2 — GET das campanhas prontas
// ---------------------------------------------------------------------------
{
  const call = fetchCall(loadRegion, READY_URL);
  check(
    `caso 2: painel consome GET ${READY_URL} no carregamento`,
    Boolean(loadRegion) && Boolean(call) && !/method\s*:/.test(call),
    !loadRegion
      ? "callback `load` não encontrado no painel"
      : !call
        ? `nenhum fetch("${READY_URL}") dentro do load`
        : `o fetch declara method (deveria ser GET implícito): ${call.replace(/\s+/g, " ")}`,
  );
}

// ---------------------------------------------------------------------------
// caso 3 — GET da fila de propostas
// ---------------------------------------------------------------------------
{
  const call = fetchCall(loadRegion, PROPOSALS_URL);
  check(
    `caso 3: painel consome GET ${PROPOSALS_URL} no carregamento`,
    Boolean(call) && !/method\s*:/.test(call),
    !call ? `nenhum fetch("${PROPOSALS_URL}") dentro do load` : `o fetch declara method (deveria ser GET implícito)`,
  );
}

// ---------------------------------------------------------------------------
// caso 4 — POST da proposta
// ---------------------------------------------------------------------------
const submitCall = fetchCall(submitRegion, PROPOSALS_URL);
{
  check(
    `caso 4: submissão faz POST ${PROPOSALS_URL}`,
    Boolean(submitRegion) && Boolean(submitCall) && /method\s*:\s*"POST"/.test(submitCall),
    !submitRegion
      ? "callback `submit` não encontrado no painel"
      : !submitCall
        ? `nenhum fetch("${PROPOSALS_URL}") dentro do submit`
        : "fetch sem method: \"POST\"",
  );
}

// ---------------------------------------------------------------------------
// caso 5 — kind "create" no corpo enviado
// ---------------------------------------------------------------------------
{
  const bodyText = submitCall ? balancedSlice(submitCall, submitCall.indexOf("JSON.stringify("), "{", "}") : "";
  const keys = topLevelKeys(bodyText);
  check(
    'caso 5: corpo do POST envia kind "create"',
    Boolean(bodyText) && keys.includes("kind") && /kind\s*:\s*"create"/.test(bodyText),
    !bodyText ? "corpo JSON.stringify não encontrado no POST" : `corpo enviado: ${bodyText.replace(/\s+/g, " ").slice(0, 200)}`,
  );
}

// ---------------------------------------------------------------------------
// caso 6 — payload { accountId, steps } vindo da campanha carregada
// ---------------------------------------------------------------------------
const payloadText = submitCall ? balancedSlice(submitCall, submitCall.indexOf("payload:"), "{", "}") : "";
const payloadKeys = topLevelKeys(payloadText);
{
  check(
    "caso 6: payload do POST carrega accountId e steps da campanha carregada",
    payloadKeys.includes("accountId") &&
      payloadKeys.includes("steps") &&
      /accountId\s*:\s*\w+\.accountId/.test(payloadText) &&
      /steps\s*:\s*\w+\.steps/.test(payloadText),
    `payload enviado: ${payloadText.replace(/\s+/g, " ").slice(0, 240) || "(não encontrado)"} · chaves: [${payloadKeys.join(", ")}]`,
  );
}

// ---------------------------------------------------------------------------
// caso 7 — cross-check semântico: o payload REAL do painel passa em
// validateProposal (kind create) do núcleo puro, e sem steps é recusado
// ---------------------------------------------------------------------------
{
  const stripped = stripTypeScriptTypes(fs.readFileSync(path.join(root, "lib", "marketing", "campaign-proposals.ts"), "utf8"));
  const { validateProposal } = await import(`data:text/javascript;base64,${Buffer.from(stripped, "utf8").toString("base64")}`);

  const VALUES = {
    accountId: "act_123456",
    steps: [{ kind: "create_campaign", path: "act_123456/campaigns", payload: { status: "PAUSED" } }],
    pageId: "999",
    leadFormId: "888",
  };
  const sent = {};
  for (const k of payloadKeys) sent[k] = k in VALUES ? VALUES[k] : null;

  const base = { organizationId: "org-1", requestedBy: "user-1", kind: "create", title: "Campanha" };
  const problems = validateProposal({ ...base, payload: sent });

  const withoutSteps = { ...sent };
  delete withoutSteps.steps;
  const controlProblems = validateProposal({ ...base, payload: withoutSteps });

  check(
    "caso 7: payload real do painel é aceito por validateProposal(create) e sem steps é recusado",
    problems.length === 0 && controlProblems.length > 0,
    `problemas do payload real: ${JSON.stringify(problems)} · controle (sem steps) deveria acusar e acusou: ${JSON.stringify(controlProblems)}`,
  );
}

// ---------------------------------------------------------------------------
// caso 8 — missingToActivate exibido (o que falta para ATIVAR)
// ---------------------------------------------------------------------------
{
  const rendered = /\{[^{}]*\.missingToActivate\.join\(/.test(jsx);
  const guarded = /\.missingToActivate\.length/.test(jsx);
  check(
    "caso 8: painel exibe missingToActivate (o que falta para ATIVAR), guardado por length",
    rendered && guarded,
    !rendered
      ? "missingToActivate não é renderizado no JSX (nenhum {…missingToActivate.join(…)})"
      : "falta o guarda .missingToActivate.length antes de exibir",
  );
}

// ---------------------------------------------------------------------------
// caso 9 — o painel usa o MESMO contrato das rotas (campos servidos de verdade)
// ---------------------------------------------------------------------------
{
  const routeServes =
    /missingToActivate\s*:/.test(readyRoute) &&
    /apiSuccess\(\s*\{\s*campaigns/.test(readyRoute) &&
    /export async function GET/.test(readyRoute);
  const proposalsAcceptsPost = /export async function POST/.test(proposalsRoute) && /"create"/.test(proposalsRoute);
  check(
    "caso 9: contrato casa com as rotas (ready-campaigns serve campaigns/missingToActivate; proposals aceita POST create)",
    routeServes && proposalsAcceptsPost,
    !routeServes
      ? "GET /ready-campaigns não serve { campaigns } com missingToActivate"
      : "POST /marketing/proposals não aceita kind create",
  );
}

// ---------------------------------------------------------------------------
// caso 10 — degrade honesto: estado indisponível com motivo, setado em resposta
// não-ok E em exceção, e renderizado
// ---------------------------------------------------------------------------
{
  const hasState = /kind:\s*"unavailable";\s*reason:\s*string/.test(panel);
  const setsOnBadResponse = /if\s*\(![\s\S]{0,120}?\)\s*\{[\s\S]{0,200}?setState\(\{\s*kind:\s*"unavailable"/.test(loadRegion);
  const catchAt = loadRegion.search(/\}\s*catch\s*(?:\([^)]*\))?\s*\{/);
  const catchRegion = catchAt >= 0 ? balancedSlice(loadRegion, catchAt, "{", "}") : "";
  const setsOnThrow = /setState\(\{\s*kind:\s*"unavailable"/.test(catchRegion);
  const renders = /state\.kind === "unavailable"/.test(jsx) && /\{state\.reason\}/.test(jsx);
  check(
    "caso 10: degrade honesto — estado indisponível com motivo em resposta não-ok, em exceção, e exibido",
    hasState && setsOnBadResponse && setsOnThrow && renders,
    `estadoTipado=${hasState} respostaNaoOk=${setsOnBadResponse} excecao=${setsOnThrow} renderizado=${renders}`,
  );
}

// ---------------------------------------------------------------------------
// caso 11 — degrade não inventa dado: nada de campanha fabricada; campanhas só
// saem da resposta da API e o ramo indisponível não mostra números
// ---------------------------------------------------------------------------
{
  const fromApi = /campaigns:\s*\w+(?:\??\.)data(?:\??\.)campaigns/.test(loadRegion);
  const fabricated = /campaigns:\s*\[\s*\{/.test(panel) || /(?:MOCK|FAKE|PLACEHOLDER|SAMPLE)_?CAMPAIGN/i.test(panel);
  const unavailableAt = jsx.indexOf('state.kind === "unavailable"');
  const branch = unavailableAt >= 0 ? balancedSlice(jsx, unavailableAt, "(", ")") : "";
  const branchClean = Boolean(branch) && !/R\$|\.map\(|dailyBrl|adCount/.test(branch) && /\{state\.reason\}/.test(branch);
  check(
    "caso 11: degrade não inventa dado (campanhas só da API; ramo indisponível sem números fabricados)",
    fromApi && !fabricated && branchClean,
    `daApi=${fromApi} fabricado=${fabricated} ramoLimpo=${branchClean} · ramo: ${branch.replace(/\s+/g, " ").slice(0, 160)}`,
  );
}

// ---------------------------------------------------------------------------
// caso 12 — link para a Caixa de Aprovações (/approvals)
// ---------------------------------------------------------------------------
{
  const linked = /<Link[\s\S]{0,240}?href="\/approvals"/.test(jsx);
  const imported = /import\s+Link\s+from\s+"next\/link"/.test(panel);
  check(
    "caso 12: painel linka para /approvals com next/link",
    linked && imported,
    !imported ? "next/link não importado" : "nenhum <Link href=\"/approvals\"> no JSX",
  );
}

// ---------------------------------------------------------------------------
// caso 13 — montado no command-center (import + uso único)
// ---------------------------------------------------------------------------
const usageAt = page.indexOf("<CampaignApprovalsPanel");
{
  const imported = /import\s*\{\s*CampaignApprovalsPanel\s*\}\s*from\s*"@\/components\/atlas\/CampaignApprovalsPanel"/.test(page);
  const usages = (page.match(/<CampaignApprovalsPanel\b/g) ?? []).length;
  check(
    "caso 13: command-center importa e monta o painel exatamente uma vez",
    imported && usages === 1,
    !imported ? "import de CampaignApprovalsPanel ausente em app/(crm)/command-center/page.tsx" : `usos encontrados: ${usages}`,
  );
}

// ---------------------------------------------------------------------------
// caso 14 — montado SOMENTE para liderança: dentro do bloco {!isBroker ? ( … )}
// e nunca dentro de um bloco {isBroker ? ( … )}
// ---------------------------------------------------------------------------
{
  const re = /\{\s*(!?)\s*isBroker\s*\?\s*\(/g;
  let m;
  let innermost = null; // { negated, start, end }
  while ((m = re.exec(page))) {
    const start = m.index;
    const end = balancedEnd(page, start, "{", "}");
    if (end < 0 || usageAt < start || usageAt > end) continue;
    if (!innermost || start > innermost.start) innermost = { negated: m[1] === "!", start, end };
  }
  check(
    "caso 14: painel montado SOMENTE para liderança (dentro de {!isBroker ? …}, nunca em {isBroker ? …})",
    usageAt >= 0 && Boolean(innermost) && innermost.negated,
    usageAt < 0
      ? "painel não está montado no command-center"
      : !innermost
        ? "uso do painel não está dentro de nenhum bloco condicional isBroker — ficaria visível para corretor"
        : `o bloco mais interno que envolve o painel é {isBroker ? …} (linha ~${page.slice(0, innermost.start).split("\n").length}) — corretor veria governança de campanha`,
  );
}

// ---------------------------------------------------------------------------
console.log(`\ncheck-campaign-approvals-panel: ${passed} passaram, ${failures.length} falharam.`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
