/**
 * Teste adversarial de GET /api/v1/marketing/ready-campaigns
 * (app/api/v1/marketing/ready-campaigns/route.ts).
 *
 * NÃO é grep de marcador: carrega o HANDLER REAL da rota com type-stripping
 * nativo do Node, reescrevendo os especificadores "@/..." para os NÚCLEOS PUROS
 * reais (developer-portfolio, creative-strategist, housing-audience,
 * publication-plan) e apenas os limites de infra (next/server, lib/api/core,
 * lib/api/security) para stubs controláveis. O pipeline de campanha roda de
 * verdade — o número de anúncios por persona sai do plano gerado, não de texto.
 *
 * Valida: guarda de liderança (403 para corretor), 503 honesto sem
 * META_AD_ACCOUNT_ID, montagem de Arvo (persona investidor) e Spin (persona
 * morador) com os ângulos exigidos, TODO passo nascendo PAUSED,
 * special_ad_categories HOUSING, e missingToActivate citando
 * page_id / lead_form / mídia.
 *
 * 100% determinístico: sem rede (fetch é armadilha que explode), sem banco,
 * sem relógio, sem aleatório.
 *
 * Rodar da raiz do repo: node scripts/check-ready-campaigns.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ready-campaigns-"));

// --------------------------------------------------------------------------
// Armadilha de rede: qualquer fetch durante o check é falha dura.
// --------------------------------------------------------------------------
let networkTouched = false;
globalThis.fetch = () => {
  networkTouched = true;
  throw new Error("check-ready-campaigns: a rota tentou tocar a rede");
};

// --------------------------------------------------------------------------
// Núcleos PUROS reais (type-stripped, imports relativos reescritos p/ .mjs)
// --------------------------------------------------------------------------
const REWRITES = [
  ['from "./audience-finder"', 'from "./audience-finder.mjs"'],
  ['from "./housing-audience"', 'from "./housing-audience.mjs"'],
  ['from "./campaign-executor"', 'from "./campaign-executor.mjs"'],
  ['from "next/server"', 'from "./__stub-next-server.mjs"'],
  ['from "@/lib/api/core"', 'from "./__stub-api-core.mjs"'],
  ['from "@/lib/api/security"', 'from "./__stub-api-security.mjs"'],
  ['from "@/lib/atlas/developer-portfolio"', 'from "./developer-portfolio.mjs"'],
  ['from "@/lib/ai/creative-strategist"', 'from "./creative-strategist.mjs"'],
  ['from "@/lib/meta/marketing/housing-audience"', 'from "./housing-audience.mjs"'],
  ['from "@/lib/meta/marketing/publication-plan"', 'from "./publication-plan.mjs"'],
  ['from "@/lib/meta/marketing/campaign-executor"', 'from "./campaign-executor.mjs"'],
  ['from "@/lib/meta/marketing/campaign-read"', 'from "./__stub-empty.mjs"'],
];

function emit(outName, sourceRelPath) {
  const abs = path.join(root, sourceRelPath);
  if (!fs.existsSync(abs)) {
    console.error(`❌ arquivo-alvo ausente: ${sourceRelPath}`);
    process.exit(1);
  }
  let src = stripTypeScriptTypes(fs.readFileSync(abs, "utf8"));
  for (const [from, to] of REWRITES) src = src.replaceAll(from, to);
  const leftover = src.match(/from ["']@\/[^"']+["']/g);
  if (leftover) {
    console.error(`❌ ${sourceRelPath} tem import de alias não mapeado: ${leftover.join(", ")}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(tmp, `${outName}.mjs`), src, "utf8");
}

// Stubs de fronteira (infra) — pequenos e explícitos.
fs.writeFileSync(path.join(tmp, "__stub-empty.mjs"), "export {};\n", "utf8");
fs.writeFileSync(path.join(tmp, "__stub-next-server.mjs"), "export class NextRequest {}\nexport class NextResponse {}\n", "utf8");
fs.writeFileSync(
  path.join(tmp, "__stub-api-core.mjs"),
  `export function apiSuccess(data, meta, options = {}) {
  return { __kind: "success", status: options.status ?? 200, headers: options.headers ?? null, data, meta };
}
export function apiError(code, message, meta, options = {}) {
  return { __kind: "error", status: options.status ?? 400, headers: options.headers ?? null, code, message, meta };
}
`,
  "utf8",
);
fs.writeFileSync(
  path.join(tmp, "__stub-api-security.mjs"),
  `export const __ctl = { role: "director", commercialRole: null, rateLimited: false, calls: [] };
export function enforceRateLimit(request, options = {}) {
  __ctl.calls.push({ kind: "rateLimit", options });
  const headers = { "RateLimit-Limit": String(options.limit ?? 60) };
  if (__ctl.rateLimited) return { ok: false, response: { __kind: "error", status: 429, code: "RATE_LIMITED" } };
  return { ok: true, headers };
}
export async function requireAccessContext(request, options = {}) {
  __ctl.calls.push({ kind: "accessContext", options });
  return {
    ok: true,
    access: { profile: { role: __ctl.role, commercialRole: __ctl.commercialRole } },
    meta: { requestId: "req-fixo", correlationId: "corr-fixo", version: "v1", timestamp: "2026-01-01T00:00:00.000Z" },
  };
}
`,
  "utf8",
);

emit("creative-strategist", "lib/ai/creative-strategist.ts");
emit("developer-portfolio", "lib/atlas/developer-portfolio.ts");
emit("housing-audience", "lib/meta/marketing/housing-audience.ts");
emit("audience-finder", "lib/meta/marketing/audience-finder.ts");
emit("campaign-executor", "lib/meta/marketing/campaign-executor.ts");
emit("publication-plan", "lib/meta/marketing/publication-plan.ts");
emit("route", "app/api/v1/marketing/ready-campaigns/route.ts");

const route = await import(pathToFileURL(path.join(tmp, "route.mjs")).href);
const { __ctl } = await import(pathToFileURL(path.join(tmp, "__stub-api-security.mjs")).href);
const { validateExecutionPlan } = await import(pathToFileURL(path.join(tmp, "campaign-executor.mjs")).href);

// --------------------------------------------------------------------------
// Harness
// --------------------------------------------------------------------------
let pass = 0;
const failures = [];
function t(name, ok, extra = "") {
  if (ok) {
    pass += 1;
    console.log(`✅ ${name}`);
  } else {
    failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
    console.log(`❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const fakeRequest = { headers: { get: () => null }, nextUrl: { pathname: "/api/v1/marketing/ready-campaigns" } };

/** Executa o GET real com env e papel controlados (env restaurado ao final). */
async function callGET({ role = "director", commercialRole = null, env = {} } = {}) {
  const keys = ["META_AD_ACCOUNT_ID", "META_PAGE_ID", "META_LEAD_FORM_ID"];
  const saved = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  __ctl.role = role;
  __ctl.commercialRole = commercialRole;
  __ctl.rateLimited = false;
  try {
    return await route.GET(fakeRequest);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const ACCOUNT = "act_9999999";
const FULL_ENV = { META_AD_ACCOUNT_ID: ACCOUNT };

// --------------------------------------------------------------------------
// 1: guarda de liderança — corretor leva 403 FORBIDDEN e NÃO recebe campanhas
// --------------------------------------------------------------------------
{
  const broker = await callGET({ role: "broker", commercialRole: "broker", env: FULL_ENV });
  const brokerLegacy = await callGET({ role: "user", commercialRole: "broker", env: FULL_ENV });
  t(
    "caso 1: corretor recebe 403 FORBIDDEN e nenhuma campanha vaza",
    broker.__kind === "error" &&
      broker.status === 403 &&
      broker.code === "FORBIDDEN" &&
      broker.data === undefined &&
      brokerLegacy.status === 403,
    JSON.stringify({ status: broker.status, code: broker.code }),
  );
}

// --------------------------------------------------------------------------
// 2: liderança (director/superintendent/manager) e admin→director passam
// --------------------------------------------------------------------------
{
  const results = await Promise.all([
    callGET({ role: "director", commercialRole: "director", env: FULL_ENV }),
    callGET({ role: "user", commercialRole: "superintendent", env: FULL_ENV }),
    callGET({ role: "user", commercialRole: "manager", env: FULL_ENV }),
    callGET({ role: "admin", commercialRole: null, env: FULL_ENV }),
  ]);
  const outros = await Promise.all([
    callGET({ role: "user", commercialRole: "assistant", env: FULL_ENV }),
    callGET({ role: "user", commercialRole: null, env: FULL_ENV }),
  ]);
  t(
    "caso 2: director/superintendent/manager/admin passam; papéis fora da liderança não",
    results.every((r) => r.__kind === "success" && r.status === 200) &&
      outros.every((r) => r.__kind === "error" && r.status === 403),
    JSON.stringify(results.map((r) => `${r.__kind}:${r.status}`) + " | fora=" + outros.map((r) => r.status).join(",")),
  );
}

// --------------------------------------------------------------------------
// 3: 503 honesto sem META_AD_ACCOUNT_ID (e não inventa conta nem campanha)
// --------------------------------------------------------------------------
{
  const semConta = await callGET({ env: {} });
  const contaEmBranco = await callGET({ env: { META_AD_ACCOUNT_ID: "   " } });
  t(
    "caso 3: sem META_AD_ACCOUNT_ID → 503 META_NOT_CONFIGURED citando a variável, sem campanhas",
    semConta.__kind === "error" &&
      semConta.status === 503 &&
      semConta.code === "META_NOT_CONFIGURED" &&
      semConta.message.includes("META_AD_ACCOUNT_ID") &&
      semConta.data === undefined &&
      contaEmBranco.status === 503,
    JSON.stringify({ status: semConta.status, code: semConta.code, msg: semConta.message }),
  );
}

// --------------------------------------------------------------------------
// A partir daqui: resposta feliz (liderança + conta configurada, sem page/form)
// --------------------------------------------------------------------------
const ok = await callGET({ env: FULL_ENV });
const campaigns = ok.__kind === "success" ? ok.data.campaigns : [];
const arvo = campaigns.find((c) => c.id === "arvo");
const spin = campaigns.find((c) => c.id === "spin");

// --------------------------------------------------------------------------
// 4: as DUAS campanhas prontas existem e apontam para os produtos certos
// --------------------------------------------------------------------------
{
  t(
    "caso 4: devolve exatamente as campanhas Arvo e Spin Mood na conta configurada",
    campaigns.length === 2 &&
      arvo?.product === "Arvo" &&
      spin?.product === "Spin Mood" &&
      arvo?.accountId === ACCOUNT &&
      spin?.accountId === ACCOUNT,
    JSON.stringify(campaigns.map((c) => ({ id: c.id, product: c.product, accountId: c.accountId }))),
  );
}

// --------------------------------------------------------------------------
// 5: Arvo = persona investidor com os 3 ângulos exigidos
// --------------------------------------------------------------------------
{
  t(
    "caso 5: Arvo é persona investidor com ângulos investimento+localizacao+estilo_de_vida",
    Boolean(arvo) &&
      /investidor/i.test(arvo.persona) &&
      JSON.stringify(arvo.angles) === JSON.stringify(["investimento", "localizacao", "estilo_de_vida"]),
    JSON.stringify({ persona: arvo?.persona, angles: arvo?.angles }),
  );
}

// --------------------------------------------------------------------------
// 6: Spin = persona morador com os 4 ângulos exigidos
// --------------------------------------------------------------------------
{
  t(
    "caso 6: Spin é persona morador com ângulos sair_do_aluguel+entrega_imediata+localizacao+estilo_de_vida",
    Boolean(spin) &&
      /morador/i.test(spin.persona) &&
      JSON.stringify(spin.angles) ===
        JSON.stringify(["sair_do_aluguel", "entrega_imediata", "localizacao", "estilo_de_vida"]),
    JSON.stringify({ persona: spin?.persona, angles: spin?.angles }),
  );
}

// --------------------------------------------------------------------------
// 7: FUNCIONAL — nº de anúncios por persona sai do PLANO gerado, não de texto
//    (3 ads Arvo, 4 ads Spin; adCount bate com os steps create_ad e com os
//     ângulos; 1 campanha + 1 ad set + 1 criativo em cada)
// --------------------------------------------------------------------------
{
  const adsArvo = (arvo?.steps ?? []).filter((s) => s.kind === "create_ad");
  const adsSpin = (spin?.steps ?? []).filter((s) => s.kind === "create_ad");
  const kindsArvo = (arvo?.steps ?? []).map((s) => s.kind).join(",");
  const kindsSpin = (spin?.steps ?? []).map((s) => s.kind).join(",");
  t(
    "caso 7: pipeline gera 3 anúncios (Arvo) e 4 anúncios (Spin), com adCount fiel ao plano",
    adsArvo.length === 3 &&
      adsSpin.length === 4 &&
      arvo.adCount === adsArvo.length &&
      spin.adCount === adsSpin.length &&
      arvo.adCount === arvo.angles.length &&
      spin.adCount === spin.angles.length &&
      arvo.steps.length === 6 &&
      spin.steps.length === 7 &&
      kindsArvo === "create_campaign,create_adset,create_creative,create_ad,create_ad,create_ad" &&
      kindsSpin === "create_campaign,create_adset,create_creative,create_ad,create_ad,create_ad,create_ad",
    JSON.stringify({ arvo: kindsArvo, spin: kindsSpin, adCount: [arvo?.adCount, spin?.adCount] }),
  );
}

// --------------------------------------------------------------------------
// 8: FUNCIONAL — cada anúncio carrega o ângulo da persona no nome
// --------------------------------------------------------------------------
{
  const nomesArvo = (arvo?.steps ?? []).filter((s) => s.kind === "create_ad").map((s) => s.payload.name);
  const nomesSpin = (spin?.steps ?? []).filter((s) => s.kind === "create_ad").map((s) => s.payload.name);
  t(
    "caso 8: nomes dos anúncios refletem 1:1 os ângulos de cada persona",
    arvo?.angles.every((a, i) => nomesArvo[i]?.includes("Arvo") && nomesArvo[i]?.includes(a)) &&
      spin?.angles.every((a, i) => nomesSpin[i]?.includes("Spin Mood") && nomesSpin[i]?.includes(a)),
    JSON.stringify({ arvo: nomesArvo, spin: nomesSpin }),
  );
}

// --------------------------------------------------------------------------
// 9: TODO passo nasce PAUSED — nenhum ACTIVE em lugar nenhum do plano
// --------------------------------------------------------------------------
{
  const todos = campaigns.flatMap((c) => c.steps);
  const comStatus = todos.filter((s) => s.payload && "status" in s.payload);
  const naoPausados = comStatus.filter((s) => s.payload.status !== "PAUSED").map((s) => `${s.kind}:${s.payload.status}`);
  const kindsComStatus = new Set(comStatus.map((s) => s.kind));
  t(
    "caso 9: todo passo com status nasce PAUSED (campanha, ad set e anúncios) e nada fica ACTIVE",
    naoPausados.length === 0 &&
      kindsComStatus.has("create_campaign") &&
      kindsComStatus.has("create_adset") &&
      kindsComStatus.has("create_ad") &&
      !JSON.stringify(todos).includes('"ACTIVE"'),
    naoPausados.length ? `passos não pausados: ${naoPausados.join(", ")}` : "nenhum passo com status encontrado",
  );
}

// --------------------------------------------------------------------------
// 10: special_ad_categories HOUSING (obrigatório em imobiliário) nas duas
// --------------------------------------------------------------------------
{
  const camps = campaigns.map((c) => c.steps.find((s) => s.kind === "create_campaign")?.payload);
  t(
    "caso 10: as duas campanhas sobem com special_ad_categories HOUSING (país BR)",
    camps.length === 2 &&
      camps.every(
        (p) =>
          Array.isArray(p?.special_ad_categories) &&
          p.special_ad_categories.includes("HOUSING") &&
          JSON.stringify(p.special_ad_category_country) === JSON.stringify(["BR"]),
      ),
    JSON.stringify(camps.map((p) => p?.special_ad_categories)),
  );
}

// --------------------------------------------------------------------------
// 11: targeting travado pela política HOUSING (18-65+, sem gênero)
// --------------------------------------------------------------------------
{
  const adsets = campaigns.map((c) => c.steps.find((s) => s.kind === "create_adset")?.payload);
  t(
    "caso 11: ad sets com targeting travado pela política HOUSING (18-65+, sem gênero)",
    adsets.length === 2 &&
      adsets.every(
        (p) =>
          p?.targeting?.age_min === 18 &&
          p?.targeting?.age_max === 65 &&
          Array.isArray(p?.targeting?.genders) &&
          p.targeting.genders.length === 0,
      ),
    JSON.stringify(adsets.map((p) => ({ age: [p?.targeting?.age_min, p?.targeting?.age_max], g: p?.targeting?.genders }))),
  );
}

// --------------------------------------------------------------------------
// 12: missingToActivate cita page_id, lead_form e mídia; readyToActivate false
// --------------------------------------------------------------------------
{
  const faltas = campaigns.map((c) => c.missingToActivate.join(" | "));
  t(
    "caso 12: sem page/form, missingToActivate cita page_id, lead_form e mídia; readyToActivate=false",
    ok.data.readyToActivate === false &&
      campaigns.every((c) => c.pageId === null && c.leadFormId === null) &&
      faltas.every(
        (f) =>
          /META_PAGE_ID/i.test(f) &&
          /META_LEAD_FORM_ID/i.test(f) &&
          /(mídia|midia)/i.test(f),
      ),
    JSON.stringify(faltas),
  );
}

// --------------------------------------------------------------------------
// 13: sem page/form o plano usa PLACEHOLDER (não inventa id real)
// --------------------------------------------------------------------------
{
  const criativo = arvo?.steps.find((s) => s.kind === "create_creative")?.payload;
  const adset = arvo?.steps.find((s) => s.kind === "create_adset")?.payload;
  t(
    "caso 13: sem page/form o plano carrega placeholders, nunca id inventado",
    criativo?.object_story_spec?.page_id === "<<PAGE_ID>>" &&
      criativo?.object_story_spec?.link_data?.call_to_action?.value?.lead_gen_form_id === "<<LEAD_FORM_ID>>" &&
      adset?.promoted_object?.page_id === "<<PAGE_ID>>",
    JSON.stringify({ page: criativo?.object_story_spec?.page_id, adset: adset?.promoted_object?.page_id }),
  );
}

// --------------------------------------------------------------------------
// 14: com page/form no ambiente, sobra só a mídia e os ids reais se propagam
// --------------------------------------------------------------------------
{
  const comIds = await callGET({
    env: { META_AD_ACCOUNT_ID: ACCOUNT, META_PAGE_ID: "PAGE_777", META_LEAD_FORM_ID: "FORM_888" },
  });
  const c = comIds.data.campaigns[0];
  const criativo = c.steps.find((s) => s.kind === "create_creative")?.payload;
  const adset = c.steps.find((s) => s.kind === "create_adset")?.payload;
  t(
    "caso 14: com META_PAGE_ID/META_LEAD_FORM_ID sobra só a mídia e os ids reais entram no plano",
    comIds.data.readyToActivate === true &&
      c.pageId === "PAGE_777" &&
      c.leadFormId === "FORM_888" &&
      c.missingToActivate.length === 1 &&
      /(mídia|midia)/i.test(c.missingToActivate[0]) &&
      criativo?.object_story_spec?.page_id === "PAGE_777" &&
      criativo?.object_story_spec?.link_data?.call_to_action?.value?.lead_gen_form_id === "FORM_888" &&
      adset?.promoted_object?.page_id === "PAGE_777",
    JSON.stringify({ ready: comIds.data.readyToActivate, missing: c.missingToActivate }),
  );
}

// --------------------------------------------------------------------------
// 15: mídia NUNCA é inventada — o criativo sai sem imagem/vídeo (por isso
//     "upload da mídia" é sempre pendência, mesmo com page/form)
// --------------------------------------------------------------------------
{
  const comIds = await callGET({
    env: { META_AD_ACCOUNT_ID: ACCOUNT, META_PAGE_ID: "PAGE_777", META_LEAD_FORM_ID: "FORM_888" },
  });
  const feed = comIds.data.campaigns[0].steps.find((s) => s.kind === "create_creative")?.payload?.asset_feed_spec;
  t(
    "caso 15: criativo não inventa mídia (images/videos vazios) e a pendência de mídia persiste",
    Array.isArray(feed?.images) &&
      feed.images.length === 0 &&
      Array.isArray(feed?.videos) &&
      feed.videos.length === 0 &&
      comIds.data.campaigns.every((c) => c.missingToActivate.some((m) => /(mídia|midia)/i.test(m))),
    JSON.stringify({ images: feed?.images, videos: feed?.videos }),
  );
}

// --------------------------------------------------------------------------
// 16: cross-check — os planos gerados passam no validador do executor
// --------------------------------------------------------------------------
{
  const problemas = campaigns.map((c) => ({ id: c.id, p: validateExecutionPlan(c.steps) }));
  t(
    "caso 16: planos das duas campanhas validam limpo no executor (dependências/paths)",
    problemas.every((x) => x.p.length === 0),
    JSON.stringify(problemas),
  );
}

// --------------------------------------------------------------------------
// 17: orçamento diário coerente (CBO na campanha, ad set sem budget próprio)
// --------------------------------------------------------------------------
{
  const campArvo = arvo?.steps.find((s) => s.kind === "create_campaign")?.payload;
  const campSpin = spin?.steps.find((s) => s.kind === "create_campaign")?.payload;
  const adsetArvo = arvo?.steps.find((s) => s.kind === "create_adset")?.payload;
  t(
    "caso 17: CBO na campanha em centavos (Arvo R$100/dia, Spin R$60/dia) e ad set sem budget",
    arvo?.dailyBrl === 100 &&
      spin?.dailyBrl === 60 &&
      campArvo?.daily_budget === 10000 &&
      campSpin?.daily_budget === 6000 &&
      !("daily_budget" in (adsetArvo ?? {})) &&
      !("lifetime_budget" in (adsetArvo ?? {})),
    JSON.stringify({ arvo: campArvo?.daily_budget, spin: campSpin?.daily_budget }),
  );
}

// --------------------------------------------------------------------------
// 18: a rota é proposta pura — passa pelo rate limit e não toca a rede/Meta
// --------------------------------------------------------------------------
{
  const rate = __ctl.calls.filter((c) => c.kind === "rateLimit");
  t(
    "caso 18: rate limit aplicado no escopo ready-campaigns e nenhuma chamada de rede",
    !networkTouched && rate.length > 0 && rate.every((c) => c.options.scope === "ready-campaigns" && c.options.limit === 30),
    JSON.stringify({ networkTouched, escopo: rate[0]?.options }),
  );
}

// --------------------------------------------------------------------------
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ncheck-ready-campaigns: ${pass} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
