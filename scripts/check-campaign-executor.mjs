/**
 * Teste adversarial do executor governado de campanha Meta.
 *
 * Standalone, sem framework: executa o CÓDIGO REAL de
 * lib/meta/marketing/campaign-executor.ts (strip de tipos nativo do Node —
 * o módulo não tem imports de valor) com fetcher MOCK e valida:
 * plano forçando PAUSED, special_ad_categories, placeholders encadeados,
 * dry-run que não toca a rede, recusa de ACTIVE, parada na primeira falha
 * com reporte dos órfãos, idempotencyKey em todo POST e token nunca vazado.
 *
 * Rodar da raiz do repo: node scripts/check-campaign-executor.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "lib", "meta", "marketing", "campaign-executor.ts");
const stripped = stripTypeScriptTypes(fs.readFileSync(sourcePath, "utf8"));
const { planCampaignCreation, validateExecutionPlan, executeSteps } = await import(
  `data:text/javascript;base64,${Buffer.from(stripped, "utf8").toString("base64")}`
);

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

// --------------------------------------------------------------------------
// Fixtures: esqueleto no shape do leadCampaignSkeleton + asset feed do
// toAssetFeedSpec (com object_story_spec embutido, como o estrategista gera)
// --------------------------------------------------------------------------
const TOKEN = "EAAB-super-secreto-token-meta-123";

function skeleton(over = {}) {
  return {
    campaign: {
      name: "[Atlas] Leads — Vertice Perdizes — São Paulo",
      objective: "OUTCOME_LEADS",
      status: "PAUSED",
      special_ad_categories: ["HOUSING"],
      special_ad_category_country: ["BR"],
      buying_type: "AUCTION",
      daily_budget: 30000,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      ...over,
    },
    adSets: [
      {
        name: "Broad — Perdizes",
        optimization_goal: "LEAD_GENERATION",
        billing_event: "IMPRESSIONS",
        destination_type: "ON_AD",
        targeting: { geo_locations: { cities: [{ key: "296875" }] } },
        targetingNotes: { geo: "nota humana que NÃO vai à API" },
      },
    ],
  };
}

const assetFeed = {
  images: [{ hash: "abc123" }],
  videos: [],
  bodies: [{ text: "corpo 1" }],
  titles: [{ text: "título 1" }],
  descriptions: [{ text: "desc 1" }],
  ad_formats: ["SINGLE_IMAGE"],
  call_to_action_types: ["SIGN_UP"],
  link_urls: [{ website_url: "https://exemplo.com" }],
  object_story_spec: { page_id: "111" },
};

function makePlan(over = {}) {
  return planCampaignCreation({
    accountId: "123456",
    skeleton: skeleton(),
    assetFeedSpec: assetFeed,
    pageId: "999",
    leadFormId: "form_77",
    ...over,
  });
}

/** Fetcher mock: grava chamadas e responde da fila (default: ids sequenciais). */
function mockFetcher(queue = null) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (queue && queue.length) {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return { ok: next.ok !== false, status: next.status ?? 200, json: async () => next.json };
    }
    return { ok: true, status: 200, json: async () => ({ id: `real_${calls.length - 1}` }) };
  };
  fn.calls = calls;
  return fn;
}

// --------------------------------------------------------------------------
// 1-6: planCampaignCreation
// --------------------------------------------------------------------------

// 1. sequência campanha → ad set → creative → ad, paths com act_ normalizado
{
  const plan = makePlan();
  const plan2 = makePlan({ accountId: "act_123456" });
  check(
    "caso 1: plano na ordem campanha→adset→creative→ad com paths act_",
    plan.length === 4 &&
      plan.map((s) => s.kind).join(",") === "create_campaign,create_adset,create_creative,create_ad" &&
      plan[0].path === "act_123456/campaigns" &&
      plan[1].path === "act_123456/adsets" &&
      plan[2].path === "act_123456/adcreatives" &&
      plan[3].path === "act_123456/ads" &&
      plan2[0].path === "act_123456/campaigns",
    JSON.stringify(plan.map((s) => [s.kind, s.path])),
  );
}

// 2. status ACTIVE no input é sobrescrito para PAUSED, com anotação
{
  const plan = planCampaignCreation({ accountId: "1", skeleton: skeleton({ status: "ACTIVE" }) });
  const notes = plan[0].payload.__atlas_notes ?? [];
  check(
    "caso 2: ACTIVE vira PAUSED com anotação",
    plan[0].payload.status === "PAUSED" && notes.some((n) => n.includes("ACTIVE")),
    JSON.stringify({ status: plan[0].payload.status, notes }),
  );
}

// 3. special_ad_categories ausente é forçado para ["HOUSING"] com anotação
{
  const sk = skeleton();
  delete sk.campaign.special_ad_categories;
  const plan = planCampaignCreation({ accountId: "1", skeleton: sk });
  const cats = plan[0].payload.special_ad_categories;
  const notes = plan[0].payload.__atlas_notes ?? [];
  check(
    "caso 3: special_ad_categories forçado HOUSING",
    Array.isArray(cats) && cats[0] === "HOUSING" && notes.some((n) => n.includes("special_ad_categories")),
  );
}

// 4. placeholders encadeados: adset→step0, ad→adset e creative; targetingNotes não vai à API
{
  const plan = makePlan();
  check(
    "caso 4: placeholders encadeados e targetingNotes removido",
    plan[1].payload.campaign_id === "{{step0.id}}" &&
      plan[3].payload.adset_id === "{{step1.id}}" &&
      plan[3].payload.creative.creative_id === "{{step2.id}}" &&
      !("targetingNotes" in plan[1].payload) &&
      plan[3].payload.status === "PAUSED" &&
      plan[1].payload.status === "PAUSED",
    JSON.stringify(plan[3].payload),
  );
}

// 5. creative separa object_story_spec do asset_feed_spec e liga o lead form com o CTA do feed
{
  const plan = makePlan();
  const creative = plan[2].payload;
  const oss = creative.object_story_spec ?? {};
  check(
    "caso 5: creative com object_story_spec irmão + lead form + CTA do feed",
    oss.page_id === "999" &&
      oss.link_data?.call_to_action?.type === "SIGN_UP" &&
      oss.link_data?.call_to_action?.value?.lead_gen_form_id === "form_77" &&
      !("object_story_spec" in (creative.asset_feed_spec ?? {})) &&
      creative.asset_feed_spec?.bodies?.[0]?.text === "corpo 1",
    JSON.stringify(creative),
  );
}

// 6. skeleton sem adSets ainda gera 1 trio adset/creative/ad (plano completo)
{
  const plan = planCampaignCreation({ accountId: "1", skeleton: { campaign: skeleton().campaign } });
  check("caso 6: sem adSets ainda monta o trio", plan.length === 4 && plan[1].kind === "create_adset");
}

// --------------------------------------------------------------------------
// 7-10: validateExecutionPlan
// --------------------------------------------------------------------------

// 7. plano gerado pelo próprio planejador é limpo
{
  const problems = validateExecutionPlan(makePlan());
  check("caso 7: plano do planejador valida limpo", problems.length === 0, JSON.stringify(problems));
}

// 8. status !== PAUSED (inclusive aninhado) é acusado
{
  const plan = makePlan();
  plan[1].payload.status = "ACTIVE";
  plan[3].payload.creative = { creative_id: "{{step2.id}}", status: "ARCHIVED" };
  const problems = validateExecutionPlan(plan);
  check(
    "caso 8: status ACTIVE e aninhado não-PAUSED acusados",
    problems.some((p) => p.includes('status "ACTIVE"')) && problems.some((p) => p.includes('status "ARCHIVED"')),
    JSON.stringify(problems),
  );
}

// 9. special_ad_categories ausente e placeholder órfão acusados
{
  const plan = makePlan();
  delete plan[0].payload.special_ad_categories;
  plan[1].payload.campaign_id = "{{step9.id}}"; // step inexistente
  plan[2].payload.name = "usa {{step3.id}}"; // referência a step futuro
  const problems = validateExecutionPlan(plan);
  check(
    "caso 9: special_ad_categories ausente + placeholders órfãos",
    problems.some((p) => p.includes("special_ad_categories")) &&
      problems.some((p) => p.includes("{{step9.id}}")) &&
      problems.some((p) => p.includes("{{step3.id}}")),
    JSON.stringify(problems),
  );
}

// 10. path sem act_/edge inválida é acusado; payload sem status idem
{
  const plan = makePlan();
  plan[0].path = "campaigns";
  plan[3].path = "act_123456/whatever";
  delete plan[1].payload.status;
  const problems = validateExecutionPlan(plan);
  check(
    "caso 10: paths fora do padrão e status ausente acusados",
    problems.some((p) => p.includes('"campaigns"')) &&
      problems.some((p) => p.includes('"act_123456/whatever"')) &&
      problems.some((p) => p.includes("sem status")),
    JSON.stringify(problems),
  );
}

// --------------------------------------------------------------------------
// 11-19: executeSteps
// --------------------------------------------------------------------------

// 11. dry-run é o DEFAULT: fetcher nunca é chamado, payloads resolvidos com ids sintéticos
{
  const fetcher = mockFetcher();
  const results = await executeSteps(makePlan(), { token: TOKEN, idempotencyKey: "exec-1", fetcher });
  check(
    "caso 11: dry-run default não toca a rede e resolve a cadeia",
    fetcher.calls.length === 0 &&
      results.length === 4 &&
      results.every((r) => r.ok && r.dryRun) &&
      results[1].payload.campaign_id === "DRYRUN_STEP0_ID" &&
      results[3].payload.adset_id === "DRYRUN_STEP1_ID" &&
      results[3].payload.creative.creative_id === "DRYRUN_STEP2_ID",
    JSON.stringify(results.map((r) => ({ ok: r.ok, dryRun: r.dryRun })), null, 0),
  );
}

// 12. dry-run já remove as chaves internas __atlas_notes do payload resolvido
{
  const plan = planCampaignCreation({ accountId: "1", skeleton: skeleton({ status: "ACTIVE" }) });
  const results = await executeSteps(plan, { token: TOKEN, idempotencyKey: "exec-2", fetcher: mockFetcher() });
  check("caso 12: __atlas_notes não aparece no payload resolvido", !("__atlas_notes" in results[0].payload));
}

// 13. GOVERNANÇA: payload com status ACTIVE (mesmo aninhado) = throw, sem nenhum POST
{
  const plan = makePlan();
  plan[3].payload.creative = { creative_id: "{{step2.id}}", status: "ACTIVE" };
  const fetcher = mockFetcher();
  let threw = null;
  try {
    await executeSteps(plan, { token: TOKEN, idempotencyKey: "exec-3", dryRun: false, fetcher });
  } catch (err) {
    threw = err;
  }
  check(
    "caso 13: ACTIVE recusado com throw explicativo e zero POSTs",
    threw instanceof Error && /ACTIVE/.test(threw.message) && /decisão humana/.test(threw.message) && fetcher.calls.length === 0,
    threw ? threw.message : "não lançou",
  );
}

// 14. idempotencyKey vazia = throw (execução real precisa ser rastreável)
{
  let threw = false;
  try {
    await executeSteps(makePlan(), { token: TOKEN, idempotencyKey: "  ", fetcher: mockFetcher() });
  } catch {
    threw = true;
  }
  check("caso 14: idempotencyKey vazia recusada", threw);
}

// 15. execução real encadeada: ids reais resolvidos nos payloads POSTados
{
  const fetcher = mockFetcher([
    { json: { id: "camp_1" } },
    { json: { id: "adset_1" } },
    { json: { id: "creat_1" } },
    { json: { id: "ad_1" } },
  ]);
  const results = await executeSteps(makePlan(), { token: TOKEN, idempotencyKey: "exec-5", dryRun: false, fetcher });
  check(
    "caso 15: cadeia real resolve ids nos POSTs",
    results.length === 4 &&
      results.every((r) => r.ok && !r.dryRun) &&
      results.map((r) => r.id).join(",") === "camp_1,adset_1,creat_1,ad_1" &&
      fetcher.calls[1].body.campaign_id === "camp_1" &&
      fetcher.calls[3].body.adset_id === "adset_1" &&
      fetcher.calls[3].body.creative.creative_id === "creat_1" &&
      fetcher.calls[0].url.includes("act_123456/campaigns"),
    JSON.stringify(results),
  );
}

// 16. idempotencyKey presente em TODOS os POSTs; __atlas_notes nunca vai no body
{
  const plan = planCampaignCreation({ accountId: "9", skeleton: skeleton({ status: "ACTIVE" }), assetFeedSpec: assetFeed });
  const fetcher = mockFetcher();
  await executeSteps(plan, { token: TOKEN, idempotencyKey: "exec-6", dryRun: false, fetcher });
  check(
    "caso 16: idempotencyKey em todo POST e sem chaves internas no body",
    fetcher.calls.length === 4 &&
      fetcher.calls.every((c) => String(c.init.headers["X-Atlas-Idempotency-Key"]).startsWith("exec-6:step")) &&
      fetcher.calls.every((c) => !JSON.stringify(c.body).includes("__atlas_notes")),
    JSON.stringify(fetcher.calls.map((c) => c.init.headers["X-Atlas-Idempotency-Key"])),
  );
}

// 17. falha no meio (erro estruturado da Graph): PARA, reporta code/subcode/fbtrace e os órfãos criados
{
  const fetcher = mockFetcher([
    { json: { id: "camp_1" } },
    { ok: false, status: 400, json: { error: { code: 100, error_subcode: 33, message: "Invalid parameter", fbtrace_id: "AbCdE" } } },
  ]);
  const results = await executeSteps(makePlan(), { token: TOKEN, idempotencyKey: "exec-7", dryRun: false, fetcher });
  const last = results[results.length - 1];
  check(
    "caso 17: falha no meio para a execução e reporta órfãos",
    results.length === 2 &&
      fetcher.calls.length === 2 &&
      results[0].ok &&
      !last.ok &&
      /code=100/.test(last.error) &&
      /subcode=33/.test(last.error) &&
      /AbCdE/.test(last.error) &&
      /step0=camp_1/.test(last.error),
    JSON.stringify(results),
  );
}

// 18. erro de rede contendo o token: mensagem sanitizada, token NUNCA aparece nos resultados
{
  const fetcher = mockFetcher([
    { json: { id: "camp_1" } },
    new Error(`ECONNRESET ao chamar com Bearer ${TOKEN}`),
  ]);
  const results = await executeSteps(makePlan(), { token: TOKEN, idempotencyKey: "exec-8", dryRun: false, fetcher });
  const serialized = JSON.stringify(results);
  check(
    "caso 18: token nunca vaza em erro/resultado",
    results.length === 2 && !results[1].ok && /network:/.test(results[1].error) && !serialized.includes(TOKEN) && serialized.includes("[token]"),
    serialized,
  );
}

// 19. onAudit é chamado uma vez por step, em ordem, inclusive na falha
{
  const audited = [];
  const fetcher = mockFetcher([{ json: { id: "camp_1" } }, { ok: false, status: 500, json: {} }]);
  await executeSteps(makePlan(), {
    token: TOKEN,
    idempotencyKey: "exec-9",
    dryRun: false,
    fetcher,
    onAudit: (r) => audited.push(`${r.index}:${r.ok}`),
  });
  check("caso 19: onAudit em ordem incluindo a falha", audited.join(",") === "0:true,1:false", JSON.stringify(audited));
}

// 20. placeholder órfão em runtime (plano adulterado): falha estruturada, sem POST do step quebrado
{
  const plan = makePlan();
  plan[1].payload.campaign_id = "{{step7.id}}";
  const fetcher = mockFetcher([{ json: { id: "camp_1" } }]);
  const results = await executeSteps(plan, { token: TOKEN, idempotencyKey: "exec-10", dryRun: false, fetcher });
  check(
    "caso 20: placeholder órfão em runtime para com erro claro",
    results.length === 2 && !results[1].ok && /\{\{step7\.id\}\}/.test(results[1].error) && fetcher.calls.length === 1,
    JSON.stringify(results),
  );
}

// --------------------------------------------------------------------------
console.log(`check-campaign-executor: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
