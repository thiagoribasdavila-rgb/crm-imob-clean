/**
 * Refaz a campanha do Spin Mood MONTANDO UM CONJUNTO NOVO dentro da campanha já
 * existente (docs/campaigns/spin-mood/campaign-spec.json), sem descartar o que já
 * está lá. Aditivo: preserva o spec original e acrescenta
 *   - `campaign`  : a campanha [Atlas] CBO/HOUSING formalizada (esqueleto real);
 *   - `ad_sets`   : o conjunto ORIGINAL (morador/investidor) + o REFRESH 2026-07;
 *   - `refresh_2026_07`: copy fresco (gerado pelo pipeline), passos de publicação
 *     do novo conjunto (todos PAUSED) e a nota honesta de verba/fragmentação.
 *
 * O Spin Mood tem brief rico (Perdizes, 700 m do metrô, renda 6–10 SM, pronto
 * para morar) → 5 ângulos conceituais distintos = 5 anúncios novos, o refresh que
 * o Andromeda pede a cada 1–3 semanas.
 *
 * Rodar da raiz: node scripts/build-spin-refresh.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spin-refresh-"));

function emit(absTsPath, outName) {
  const src = stripTypeScriptTypes(fs.readFileSync(absTsPath, "utf8"))
    .replaceAll('from "./audience-finder"', 'from "./audience-finder.mjs"')
    .replaceAll('from "./housing-audience"', 'from "./housing-audience.mjs"')
    .replaceAll('from "./campaign-executor"', 'from "./campaign-executor.mjs"');
  fs.writeFileSync(path.join(tmp, `${outName}.mjs`), src, "utf8");
}
const mk = (rel) => path.join(root, rel);
emit(mk("lib/meta/marketing/housing-audience.ts"), "housing-audience");
emit(mk("lib/meta/marketing/audience-finder.ts"), "audience-finder");
emit(mk("lib/meta/marketing/campaign-executor.ts"), "campaign-executor");
emit(mk("lib/meta/marketing/publication-plan.ts"), "publication-plan");
emit(mk("lib/ai/creative-strategist.ts"), "creative-strategist");
emit(mk("lib/meta/marketing/budget-sizing.ts"), "budget-sizing");
emit(mk("lib/atlas/developer-portfolio.ts"), "developer-portfolio");

const load = async (n) => import(pathToFileURL(path.join(tmp, `${n}.mjs`)).href);
const { buildAdCopy, toAssetFeedSpec, leadCampaignSkeleton, validateCopy } = await load("creative-strategist");
const { recommendAdSetSizing } = await load("budget-sizing");
const { housingTargetingSpec } = await load("housing-audience");
const { planFullPublication, publicationSummary } = await load("publication-plan");
const { productBrief } = await load("developer-portfolio");

const brief = productBrief("Spin Mood");
if (!brief || brief.developer !== "SPIN Empreendimentos") {
  console.error("❌ brief do Spin Mood não resolveu pelo rol — abortando.");
  process.exit(1);
}

// Lê o spec existente (fonte da verdade a preservar).
const specPath = mk("docs/campaigns/spin-mood/campaign-spec.json");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const dailyBrl = spec?.budget?.daily_brl ?? 60;
const weeklyBudgetBrl = dailyBrl * 7;

// Placeholders preenchidos na publicação.
const PAGE = "<<PAGE_ID>>";
const LEAD_FORM = "<<LEAD_FORM_ID>>";
const ACCOUNT = "<<AD_ACCOUNT_ID>>";
const EXISTING_CAMPAIGN = "<<SPIN_CAMPAIGN_ID (id real se a campanha já estiver no Meta; senão criada junto)>>";

// --- Conjunto NOVO (refresh) gerado pelo pipeline ---------------------------
// Persona MORADOR / primeiro imóvel — pronto para morar na Vila Madalena/Perdizes.
// NÃO usa renda_alvo: nomear faixa de renda no criativo é risco sob HOUSING.
const SPIN_ANGLES = ["sair_do_aluguel", "entrega_imediata", "localizacao", "estilo_de_vida"];
const copy = buildAdCopy(brief, SPIN_ANGLES);
const copyViolations = validateCopy(copy);
const targeting = housingTargetingSpec({ countries: ["BR"], cities: ["São Paulo"] });
const skeleton = leadCampaignSkeleton(brief, weeklyBudgetBrl, targeting);
const assetFeedSpec = toAssetFeedSpec(copy, { linkUrl: "http://fb.me/", pageId: PAGE });
const fullSteps = planFullPublication({
  accountId: ACCOUNT, pageId: PAGE, leadFormId: LEAD_FORM, product: brief.product,
  skeleton, assetFeedSpec, adAngles: copy.angles,
});
// "Montar DENTRO do já existente": só o conjunto (ad set→creative→ads), sem criar
// campanha nova — o ad set aponta para a campanha Spin existente.
// Ao remover o create_campaign (step0 do full), os índices caem 1: ad set vira
// step0 e creative step1 — RENUMERAMOS os placeholders dos anúncios (senão eles
// apontariam adset_id p/ o creative e creative_id p/ um anúncio — quebra na Meta).
const mountSteps = fullSteps
  .filter((s) => s.kind !== "create_campaign")
  .map((s) => {
    if (s.kind === "create_adset") {
      return { ...s, payload: { ...s.payload, campaign_id: EXISTING_CAMPAIGN }, dependsOn: [] };
    }
    if (s.kind === "create_ad") {
      return {
        ...s,
        payload: { ...s.payload, adset_id: "{{step0.id}}", creative: { creative_id: "{{step1.id}}" } },
        dependsOn: [0, 1],
      };
    }
    return s; // create_creative: sem placeholders/dependsOn
  });

// --- Calibragem: 2 conjuntos na MESMA verba fragmentam o sinal? --------------
const sizingTwo = recommendAdSetSizing(
  { weeklyBudgetBrl, expectedCplBrl: 8, audienceSplits: 2 },
  { learningEventsPerWeek: 50, maxAdSets: 3, fallbackCplBrl: 8 },
);
const sizingOne = recommendAdSetSizing(
  { weeklyBudgetBrl, expectedCplBrl: 8, audienceSplits: 1 },
  { learningEventsPerWeek: 50, maxAdSets: 3, fallbackCplBrl: 8 },
);
// Piso honesto p/ 2 conjuntos ativos: 2 × verba mínima de aprendizado / 7 (por dia).
const twoAdsetDailyFloor = Math.ceil((2 * sizingOne.minWeeklyToExitLearningBrl) / 7);

// --- Aditivo: formaliza campanha + ad_sets + bloco de refresh ---------------
spec.campaign = {
  name: `[Atlas] Leads — ${brief.product} — ${brief.city ?? "São Paulo"}`,
  objective: "OUTCOME_LEADS",
  status: "PAUSED",
  special_ad_categories: ["HOUSING"],
  special_ad_category_country: ["BR"],
  buying_type: "AUCTION",
  daily_budget_cents: Math.round((weeklyBudgetBrl / 7) * 100),
  bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  note: "CBO (Advantage+ campaign budget) — a verba vive na campanha; os conjuntos não carregam orçamento próprio.",
};

spec.ad_sets = [
  {
    id: "original",
    name: "Broad — morador/investidor (spec original)",
    status: "PAUSED",
    angles: Object.keys(spec.copy ?? { morador: 1, investidor: 1 }),
    creatives_ref: "creatives[] do spec (3 vídeos 9:16)",
    note: "Conjunto original preservado — copy e vídeos hand-authored do spec inicial.",
  },
  {
    id: "refresh-2026-07",
    name: `Refresh 2026-07 — ${copy.angles.join(", ")}`,
    status: "PAUSED",
    angles: copy.angles,
    creatives_ref: "novos conceitos gerados (asset_feed_spec abaixo) — 1 anúncio por ângulo",
    note: "Conjunto NOVO montado dentro da campanha existente (o refresh que este pedido criou).",
  },
];

spec.refresh_2026_07 = {
  reason:
    "Refazer a campanha do Spin montando um conjunto novo dentro da campanha já existente. Conceitos frescos (o Andromeda pune similaridade e pede refresh a cada 1–3 semanas); gerado pelo pipeline governado a partir do brief real do Spin Mood.",
  generated_by: "scripts/build-spin-refresh.mjs",
  build_date: "2026-07-21",
  copy,
  copy_policy_violations: copyViolations,
  targeting,
  asset_feed_spec: assetFeedSpec,
  mount_into_existing_campaign: {
    campaign_id_ref: EXISTING_CAMPAIGN,
    steps: mountSteps,
    summary: publicationSummary(fullSteps).replace("criará a campanha", "adicionará à campanha existente o conjunto da campanha"),
    note: "Se a campanha Spin já estiver no Meta, rodam só create_adset → create_creative → create_ads apontando para o campaign_id real. Se ainda for draft, sobe junto com a campanha (full_publication_if_not_live).",
  },
  full_publication_if_not_live: fullSteps,
  budget_note: {
    daily_brl: dailyBrl,
    weekly_brl: weeklyBudgetBrl,
    two_adsets_verdict: sizingTwo.verdict,
    one_adset_verdict: sizingOne.verdict,
    two_adset_daily_floor_brl: twoAdsetDailyFloor,
    doctrine:
      `Com R$ ${dailyBrl}/dia (R$ ${weeklyBudgetBrl}/sem), 2 conjuntos ativos AO MESMO TEMPO fragmentam o sinal de aprendizado (cada um abaixo das ~50 conv/sem). Recomendação honesta: rodar o refresh como ROTAÇÃO — ativar o conjunto novo e PAUSAR o original (troca de conceito), mantendo 1 conjunto ativo — OU subir a verba para ~R$ ${twoAdsetDailyFloor}/dia (2× o piso de aprendizado ao CPL de R$ 8; mais se o CPL real for maior) se a diretoria quiser os dois ativos. Decisão vai à aprovação.`,
  },
};

// Persona do conjunto (público diferenciado no criativo — contraparte do Arvo).
spec.persona = {
  focus: "morador / primeiro imóvel",
  audience_note:
    "Público MORADOR — quem quer sair do aluguel e morar pronto na Vila Madalena/Perdizes. NÃO usa renda_alvo (faixa de renda no criativo é risco HOUSING). Contraparte: o conjunto do Arvo usa persona INVESTIDOR — públicos distintos 100% no criativo.",
  angles: SPIN_ANGLES,
};

// Corrige o copy LEGADO hand-authored (2ª pessoa / atributo pessoal) → 3ª pessoa,
// removendo "seu aluguel"/"saia do aluguel"/"seu apê" (vetados sob HOUSING /
// Personal Attributes) e a equivalência categórica parcela=aluguel.
if (spec.copy?.morador) {
  spec.copy.morador = {
    ...spec.copy.morador,
    primary_text:
      "Studios prontos para morar na Vila Madalena, a 700 m do metrô, com varanda — e um rooftop com piscina, academia e espaço gourmet no dia a dia.\n\n✅ 27 m² com varanda e depósito privativo\n✅ Café, parque e cultura por perto\n✅ A partir de R$ 275 mil — condições de financiamento direto com a incorporadora, sujeitas a análise de crédito\n\n👉 Toque em \"Saiba mais\" e receba a tabela de valores.",
    headline: "Studios na Vila Madalena a partir de R$275 mil",
    description: "Pronto para morar · varanda · 700m do metrô",
    _compliance_note:
      "Reescrito em 3ª pessoa (2026-07-21): removidos 'seu aluguel'/'saia do aluguel'/'seu apê' (atributos pessoais) e a equivalência categórica parcela=aluguel.",
  };
}
if (spec.copy?.investidor) {
  spec.copy.investidor = {
    ...spec.copy.investidor,
    headline: "Studio na Vila Madalena a partir de R$275 mil",
    description: "Pronto para morar · rooftop completo · 700m do metrô",
    _compliance_note: "Mantido em 3ª pessoa (descreve o produto).",
  };
}

// Log de revisão + status honesto (idempotente — re-rodar não duplica).
spec.revisions = Array.isArray(spec.revisions) ? spec.revisions : [];
const revNote = "Refaz a campanha: conjunto 'refresh-2026-07' (persona MORADOR, 4 conceitos novos, sem renda_alvo) montado DENTRO da campanha existente (mount sem create_campaign, placeholders renumerados); campanha [Atlas] CBO/HOUSING formalizada; copy legado reescrito em 3ª pessoa. Tudo PAUSED.";
if (!spec.revisions.some((r) => r?.change === revNote)) {
  spec.revisions.push({ date: "2026-07-21", change: revNote });
}

if (copyViolations.length) {
  console.error(`❌ copy do refresh violou política (${copyViolations.length}) — abortando escrita.`);
  process.exit(1);
}

fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

console.log("=== REFRESH SPIN MOOD (conjunto novo dentro da campanha existente) ===\n");
console.log(`Ângulos novos (${copy.angles.length}): ${copy.angles.join(", ")}`);
copy.primaryTexts.forEach((t, i) => console.log(`  • [${copy.angles[i]}] (${t.length}c) ${t}`));
console.log(`\nHeadlines: ${copy.headlines.map((h) => `"${h}"`).join(" · ")}`);
console.log(`\nMontagem no existente: ${mountSteps.map((s) => s.kind).join(" → ")} (sem create_campaign)`);
console.log(`Verba R$ ${dailyBrl}/dia → 2 conjuntos: veredito=${sizingTwo.verdict}; 1 conjunto: ${sizingOne.verdict}`);
console.log(`Copy viola política? ${copyViolations.length === 0 ? "não ✅" : "SIM ❌"}`);
console.log(`\n✅ spec atualizado: ${path.relative(root, specPath)}`);
