/**
 * Teste adversarial do plano de PUBLICAÇÃO COMPLETA (lib/meta/marketing/publication-plan.ts).
 *
 * Standalone, sem framework: carrega o CÓDIGO REAL com type-stripping nativo do
 * Node. Como publication-plan tem imports de VALOR (adNameFor de ./audience-finder,
 * validateHousingTargeting de ./housing-audience) e um import de TIPO do executor,
 * escrevemos as versões stripadas num diretório temporário reescrevendo os
 * especificadores para .mjs — assim os imports relativos resolvem por file URL.
 *
 * Valida: ordem/dependências campanha→adset→creative→ad, lead form no campo exato
 * da doc, CBO sem budget no ad set, N ads por ângulo na convenção de nome,
 * validação acusando cada ausência (leadFormId/pageId/mídia/HOUSING/status),
 * e cross-check com validateExecutionPlan do executor.
 *
 * Rodar da raiz do repo: node scripts/check-publication-plan.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libDir = path.join(root, "lib", "meta", "marketing");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pubplan-"));

function emitModule(name) {
  const src = stripTypeScriptTypes(fs.readFileSync(path.join(libDir, `${name}.ts`), "utf8"))
    .replaceAll('from "./audience-finder"', 'from "./audience-finder.mjs"')
    .replaceAll('from "./housing-audience"', 'from "./housing-audience.mjs"')
    .replaceAll('from "./campaign-executor"', 'from "./campaign-executor.mjs"');
  fs.writeFileSync(path.join(tmp, `${name}.mjs`), src, "utf8");
}
for (const name of ["housing-audience", "audience-finder", "campaign-executor", "publication-plan"]) {
  emitModule(name);
}

const { planFullPublication, validatePublication, publicationSummary } = await import(
  pathToFileURL(path.join(tmp, "publication-plan.mjs")).href
);
const { validateExecutionPlan, executeSteps } = await import(
  pathToFileURL(path.join(tmp, "campaign-executor.mjs")).href
);

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

// --------------------------------------------------------------------------
// Fixtures
// --------------------------------------------------------------------------
const TOKEN = "EAAB-super-secreto-token-meta-999";

function housingTargeting(over = {}) {
  return {
    age_min: 18,
    age_max: 65,
    genders: [],
    geo_locations: { cities: [{ key: "296875" }] },
    targeting_automation: { advantage_audience: 1 },
    ...over,
  };
}

function skeleton(over = {}) {
  return {
    campaign: {
      name: "[Atlas] Leads — Vertice Perdizes — São Paulo",
      objective: "OUTCOME_LEADS",
      status: "PAUSED",
      special_ad_categories: ["HOUSING"],
      special_ad_category_country: ["BR"],
      buying_type: "AUCTION",
      daily_budget: 30000, // CBO ligado
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      ...(over.campaign ?? {}),
    },
    adSets: over.adSets ?? [
      {
        name: "Broad — Perdizes",
        optimization_goal: "LEAD_GENERATION",
        billing_event: "IMPRESSIONS",
        destination_type: "ON_AD",
        targeting: housingTargeting(),
        targetingNotes: { geo: "nota humana que NÃO vai à API" },
      },
    ],
  };
}

const assetFeed = {
  images: [{ hash: "hash_a" }],
  videos: [],
  bodies: [{ text: "corpo 1" }],
  titles: [{ text: "título 1" }],
  descriptions: [{ text: "desc 1" }],
  ad_formats: ["SINGLE_IMAGE"],
  call_to_action_types: ["SIGN_UP"],
  link_urls: [{ website_url: "http://fb.me/" }],
  object_story_spec: { page_id: "111" }, // embutido pelo estrategista — deve ser separado
};

function input(over = {}) {
  return {
    accountId: "123456",
    pageId: "999",
    leadFormId: "form_77",
    product: "Vertice Perdizes",
    skeleton: skeleton(),
    assetFeedSpec: assetFeed,
    ...over,
  };
}

// --------------------------------------------------------------------------
// 1: ordem/dependências e paths act_ normalizados
// --------------------------------------------------------------------------
{
  const plan = planFullPublication(input());
  const plan2 = planFullPublication(input({ accountId: "act_123456" }));
  check(
    "caso 1: ordem campanha→adset→creative→ad, paths act_ e dependsOn",
    plan.length === 4 &&
      plan.map((s) => s.kind).join(",") === "create_campaign,create_adset,create_creative,create_ad" &&
      plan[0].path === "act_123456/campaigns" &&
      plan[1].path === "act_123456/adsets" &&
      plan[2].path === "act_123456/adcreatives" &&
      plan[3].path === "act_123456/ads" &&
      plan[1].dependsOn.join(",") === "0" &&
      JSON.stringify(plan[3].dependsOn) === "[1,2]" &&
      plan[1].payload.campaign_id === "{{step0.id}}" &&
      plan[3].payload.adset_id === "{{step1.id}}" &&
      plan[3].payload.creative.creative_id === "{{step2.id}}" &&
      plan2[0].path === "act_123456/campaigns",
    JSON.stringify(plan.map((s) => [s.kind, s.path, s.dependsOn])),
  );
}

// --------------------------------------------------------------------------
// 2: lead form NO CAMPO EXATO (object_story_spec.link_data.call_to_action.value)
//    + link fb.me + page_id no story spec
// --------------------------------------------------------------------------
{
  const plan = planFullPublication(input());
  const oss = plan[2].payload.object_story_spec;
  check(
    "caso 2: lead form no object_story_spec.link_data.call_to_action.value + link fb.me",
    oss.page_id === "999" &&
      oss.link_data.link === "http://fb.me/" &&
      oss.link_data.call_to_action.type === "SIGN_UP" &&
      oss.link_data.call_to_action.value.lead_gen_form_id === "form_77",
    JSON.stringify(oss),
  );
}

// --------------------------------------------------------------------------
// 3: asset_feed_spec NÃO carrega object_story_spec (irmãos separados) e mantém mídia
// --------------------------------------------------------------------------
{
  const plan = planFullPublication(input());
  const creative = plan[2].payload;
  check(
    "caso 3: object_story_spec separado do asset_feed_spec",
    !("object_story_spec" in creative.asset_feed_spec) &&
      creative.asset_feed_spec.images[0].hash === "hash_a" &&
      creative.asset_feed_spec.bodies[0].text === "corpo 1",
    JSON.stringify(creative.asset_feed_spec),
  );
}

// --------------------------------------------------------------------------
// 4: ad set com requisitos de lead ad (promoted_object.page_id, ON_AD, LEAD_GENERATION, IMPRESSIONS)
// --------------------------------------------------------------------------
{
  const plan = planFullPublication(input());
  const adSet = plan[1].payload;
  check(
    "caso 4: ad set com promoted_object.page_id + destinos/otimização/billing corretos",
    adSet.promoted_object.page_id === "999" &&
      adSet.destination_type === "ON_AD" &&
      adSet.optimization_goal === "LEAD_GENERATION" &&
      adSet.billing_event === "IMPRESSIONS" &&
      !("targetingNotes" in adSet) &&
      adSet.status === "PAUSED",
    JSON.stringify(adSet),
  );
}

// --------------------------------------------------------------------------
// 5: CBO ligado na campanha ⇒ ad set SEM budget próprio (removido + anotado)
// --------------------------------------------------------------------------
{
  const sk = skeleton();
  sk.adSets[0].daily_budget = 5000; // budget indevido no ad set com CBO
  const plan = planFullPublication(input({ skeleton: sk }));
  const adSet = plan[1].payload;
  check(
    "caso 5: CBO remove budget do ad set e anota",
    !("daily_budget" in adSet) &&
      !("lifetime_budget" in adSet) &&
      Array.isArray(adSet.__atlas_notes) &&
      adSet.__atlas_notes.some((n) => n.includes("CBO")),
    JSON.stringify(adSet),
  );
}

// --------------------------------------------------------------------------
// 6: N ads por ângulo, nomes na convenção "[Atlas] {produto} · {ângulo}"
// --------------------------------------------------------------------------
{
  const plan = planFullPublication(input({ adAngles: ["Financiamento", "Localizacao", "Lazer"] }));
  const ads = plan.filter((s) => s.kind === "create_ad");
  check(
    "caso 6: um ad por ângulo com nome na convenção",
    ads.length === 3 &&
      ads[0].payload.name === "[Atlas] Vertice Perdizes · Financiamento" &&
      ads[1].payload.name === "[Atlas] Vertice Perdizes · Localizacao" &&
      ads[2].payload.name === "[Atlas] Vertice Perdizes · Lazer" &&
      ads.every((a) => a.payload.adset_id === "{{step1.id}}" && a.payload.creative.creative_id === "{{step2.id}}" && a.payload.status === "PAUSED"),
    JSON.stringify(ads.map((a) => a.payload.name)),
  );
}

// --------------------------------------------------------------------------
// 7: sem ângulos ⇒ exatamente 1 ad com nome fallback
// --------------------------------------------------------------------------
{
  const plan = planFullPublication(input());
  const planEmpty = planFullPublication(input({ adAngles: [] }));
  const planBlank = planFullPublication(input({ adAngles: ["  ", ""] }));
  const ads = plan.filter((s) => s.kind === "create_ad");
  check(
    "caso 7: sem ângulos = 1 ad fallback (ignora ângulos vazios)",
    ads.length === 1 &&
      ads[0].payload.name === "[Atlas] Vertice Perdizes" &&
      planEmpty.filter((s) => s.kind === "create_ad").length === 1 &&
      planBlank.filter((s) => s.kind === "create_ad").length === 1,
    JSON.stringify(ads.map((a) => a.payload.name)),
  );
}

// --------------------------------------------------------------------------
// 8: instagram_actor_id presente só quando fornecido
// --------------------------------------------------------------------------
{
  const withIg = planFullPublication(input({ instagramActorId: "ig_555" }));
  const withoutIg = planFullPublication(input());
  check(
    "caso 8: instagram_actor_id condicional",
    withIg[2].payload.object_story_spec.instagram_actor_id === "ig_555" &&
      !("instagram_actor_id" in withoutIg[2].payload.object_story_spec),
    JSON.stringify({ with: withIg[2].payload.object_story_spec.instagram_actor_id }),
  );
}

// --------------------------------------------------------------------------
// 9: status ACTIVE na campanha/ad set é sobrescrito PAUSED com anotação
// --------------------------------------------------------------------------
{
  const sk = skeleton();
  sk.campaign.status = "ACTIVE";
  sk.adSets[0].status = "ACTIVE";
  const plan = planFullPublication(input({ skeleton: sk }));
  check(
    "caso 9: ACTIVE vira PAUSED com anotação em campanha e ad set",
    plan[0].payload.status === "PAUSED" &&
      plan[1].payload.status === "PAUSED" &&
      plan[0].payload.__atlas_notes.some((n) => n.includes("ACTIVE")) &&
      plan[1].payload.__atlas_notes.some((n) => n.includes("ACTIVE")),
    JSON.stringify([plan[0].payload.__atlas_notes, plan[1].payload.__atlas_notes]),
  );
}

// --------------------------------------------------------------------------
// 10: special_ad_categories ausente é forçado ["HOUSING"] com anotação
// --------------------------------------------------------------------------
{
  const sk = skeleton();
  delete sk.campaign.special_ad_categories;
  const plan = planFullPublication(input({ skeleton: sk }));
  const cats = plan[0].payload.special_ad_categories;
  check(
    "caso 10: special_ad_categories forçado HOUSING",
    Array.isArray(cats) && cats[0] === "HOUSING" && plan[0].payload.__atlas_notes.some((n) => n.includes("special_ad_categories")),
    JSON.stringify(cats),
  );
}

// --------------------------------------------------------------------------
// 11: imageHashes/videoIds sobrepõem a mídia do feed
// --------------------------------------------------------------------------
{
  const plan = planFullPublication(input({ imageHashes: ["h1", "h2"], videoIds: ["v1"] }));
  const feed = plan[2].payload.asset_feed_spec;
  check(
    "caso 11: imageHashes/videoIds sobrepõem a mídia do feed",
    feed.images.length === 2 &&
      feed.images[0].hash === "h1" &&
      feed.images[1].hash === "h2" &&
      feed.videos.length === 1 &&
      feed.videos[0].video_id === "v1",
    JSON.stringify(feed.images) + " | " + JSON.stringify(feed.videos),
  );
}

// --------------------------------------------------------------------------
// 12: CTA inválido/ausente no feed cai no default SIGN_UP; CTA válido é preservado
// --------------------------------------------------------------------------
{
  const badFeed = { ...assetFeed, call_to_action_types: ["MELHOR_INVALIDO"] };
  const noFeedCta = { ...assetFeed };
  delete noFeedCta.call_to_action_types;
  const validFeed = { ...assetFeed, call_to_action_types: ["APPLY_NOW"] };
  const planBad = planFullPublication(input({ assetFeedSpec: badFeed }));
  const planNone = planFullPublication(input({ assetFeedSpec: noFeedCta }));
  const planValid = planFullPublication(input({ assetFeedSpec: validFeed }));
  check(
    "caso 12: CTA inválido/ausente → SIGN_UP; válido preservado",
    planBad[2].payload.object_story_spec.link_data.call_to_action.type === "SIGN_UP" &&
      planNone[2].payload.object_story_spec.link_data.call_to_action.type === "SIGN_UP" &&
      planValid[2].payload.object_story_spec.link_data.call_to_action.type === "APPLY_NOW",
    JSON.stringify([
      planBad[2].payload.object_story_spec.link_data.call_to_action.type,
      planValid[2].payload.object_story_spec.link_data.call_to_action.type,
    ]),
  );
}

// --------------------------------------------------------------------------
// 13: validatePublication limpo em input íntegro
// --------------------------------------------------------------------------
{
  const problems = validatePublication(input());
  check("caso 13: input íntegro valida limpo", problems.length === 0, JSON.stringify(problems));
}

// --------------------------------------------------------------------------
// 14: validatePublication acusa leadFormId e pageId ausentes
// --------------------------------------------------------------------------
{
  const p1 = validatePublication(input({ leadFormId: "" }));
  const p2 = validatePublication(input({ pageId: "   " }));
  check(
    "caso 14: leadFormId/pageId ausentes acusados",
    p1.some((p) => p.includes("leadFormId")) && p2.some((p) => p.includes("pageId")),
    JSON.stringify([p1, p2]),
  );
}

// --------------------------------------------------------------------------
// 15: validatePublication acusa mídia vazia (nem hash nem vídeo em nenhuma fonte)
// --------------------------------------------------------------------------
{
  const emptyFeed = { ...assetFeed, images: [], videos: [] };
  const problems = validatePublication(input({ assetFeedSpec: emptyFeed }));
  // e confirma que uma sobreposição por videoIds SANA a mídia vazia
  const rescued = validatePublication(input({ assetFeedSpec: emptyFeed, videoIds: ["v9"] }));
  check(
    "caso 15: mídia vazia acusada; videoIds sana",
    problems.some((p) => p.includes("mídia vazia")) && !rescued.some((p) => p.includes("mídia vazia")),
    JSON.stringify(problems),
  );
}

// --------------------------------------------------------------------------
// 16: validatePublication acusa targeting sem as travas HOUSING
// --------------------------------------------------------------------------
{
  const sk = skeleton();
  sk.adSets[0].targeting = housingTargeting({ age_min: 25, genders: [1] }); // viola idade e gênero
  const problems = validatePublication(input({ skeleton: sk }));
  check(
    "caso 16: targeting fora do HOUSING acusado (idade + gênero)",
    problems.some((p) => p.includes("age_min")) && problems.some((p) => p.includes("genders")),
    JSON.stringify(problems),
  );
}

// --------------------------------------------------------------------------
// 17: validatePublication acusa targeting ausente
// --------------------------------------------------------------------------
{
  const sk = skeleton();
  delete sk.adSets[0].targeting;
  const problems = validatePublication(input({ skeleton: sk }));
  check("caso 17: targeting ausente acusado", problems.some((p) => p.includes("targeting ausente")), JSON.stringify(problems));
}

// --------------------------------------------------------------------------
// 18: validatePublication acusa qualquer status não-PAUSED no skeleton
// --------------------------------------------------------------------------
{
  const sk = skeleton();
  sk.adSets[0].status = "ACTIVE";
  const problems = validatePublication(input({ skeleton: sk }));
  check(
    "caso 18: status não-PAUSED no skeleton acusado",
    problems.some((p) => p.includes('status "ACTIVE"')),
    JSON.stringify(problems),
  );
}

// --------------------------------------------------------------------------
// 19: cross-check — plano gerado passa no validateExecutionPlan do executor
// --------------------------------------------------------------------------
{
  const planMulti = planFullPublication(input({ adAngles: ["A", "B", "C"] }));
  const problems = validateExecutionPlan(planMulti);
  check(
    "caso 19: plano (multi-ângulo) valida limpo no executor",
    problems.length === 0 && planMulti.length === 6,
    JSON.stringify(problems),
  );
}

// --------------------------------------------------------------------------
// 20: cross-check — executeSteps dry-run resolve toda a cadeia sem tocar a rede
// --------------------------------------------------------------------------
{
  let networkTouched = false;
  const fetcher = async () => {
    networkTouched = true;
    return { ok: true, status: 200, json: async () => ({ id: "x" }) };
  };
  const plan = planFullPublication(input({ adAngles: ["A", "B"] }));
  const results = await executeSteps(plan, { token: TOKEN, idempotencyKey: "pub-1", fetcher });
  const adRes = results.filter((r) => r.kind === "create_ad");
  check(
    "caso 20: dry-run resolve a cadeia inteira sem rede",
    !networkTouched &&
      results.length === 5 &&
      results.every((r) => r.ok && r.dryRun) &&
      adRes.every((r) => r.payload.adset_id === "DRYRUN_STEP1_ID" && r.payload.creative.creative_id === "DRYRUN_STEP2_ID") &&
      !JSON.stringify(results).includes("__atlas_notes"),
    JSON.stringify(results.map((r) => ({ kind: r.kind, ok: r.ok }))),
  );
}

// --------------------------------------------------------------------------
// 21: publicationSummary — parágrafo PT com contagens, nomes e "PAUSADO"
// --------------------------------------------------------------------------
{
  const plan = planFullPublication(input({ adAngles: ["Financiamento", "Lazer"] }));
  const summary = publicationSummary(plan);
  check(
    "caso 21: resumo executivo PT completo",
    typeof summary === "string" &&
      summary.includes("[Atlas] Leads — Vertice Perdizes — São Paulo") &&
      summary.includes("HOUSING") &&
      summary.includes("2 anúncios") &&
      summary.includes("[Atlas] Vertice Perdizes · Financiamento") &&
      summary.includes("PAUSADO"),
    summary,
  );
}

// --------------------------------------------------------------------------
console.log(`check-publication-plan: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
