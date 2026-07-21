/**
 * Gerador determinístico da PROPOSTA de conjunto de anúncios do Arvo (Kallas).
 *
 * Não toca a Meta: monta, com o CÓDIGO REAL do pipeline governado, a proposta
 * completa (copy flexível → asset_feed_spec → esqueleto CBO/HOUSING a R$ 100/dia
 * → passos de publicação, TODOS PAUSED) e a calibragem de verba (tamanho de
 * conjunto × verba). Emite docs/campaigns/arvo/campaign-spec.json — o spec que a
 * Caixa de Aprovações revisa e que fica pronto para subir assim que a conta Meta
 * estiver conectada (Página + formulário + mídia).
 *
 * Carrega os libs com type-stripping nativo do Node (mesmo padrão do
 * check-publication-plan.mjs): reescreve os imports relativos para .mjs num tmp.
 *
 * Rodar da raiz: node scripts/build-arvo-proposal.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arvo-proposal-"));

/** Emite um lib .ts como .mjs stripado no tmp, reescrevendo imports relativos. */
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
const { planFullPublication, validatePublication, publicationSummary } = await load("publication-plan");
const { productBrief } = await load("developer-portfolio");

// ---------------------------------------------------------------------------
// Entrada: brief REAL do Arvo, direto do rol (prova que a calibragem flui).
// ---------------------------------------------------------------------------
const brief = productBrief("Arvo");
if (!brief || brief.developer !== "Kallas Incorporações") {
  console.error("❌ brief do Arvo não resolveu pelo rol — abortando.");
  process.exit(1);
}

const DAILY_BRL = 100;
const weeklyBudgetBrl = DAILY_BRL * 7; // 700 → o esqueleto deriva R$ 100/dia (CBO)

// Placeholders preenchidos na publicação (quando a conta Meta estiver conectada).
const PAGE = "<<PAGE_ID>>";
const LEAD_FORM = "<<LEAD_FORM_ID>>";
const ACCOUNT = "<<AD_ACCOUNT_ID>>";

// ---------------------------------------------------------------------------
// 1) Copy flexível (uma variação por ângulo conceitual) + validação de política.
// ---------------------------------------------------------------------------
const copy = buildAdCopy(brief);
const copyViolations = validateCopy(copy);

// ---------------------------------------------------------------------------
// 2) asset_feed_spec + esqueleto CBO/HOUSING a R$ 100/dia + targeting HOUSING.
// ---------------------------------------------------------------------------
const targeting = housingTargetingSpec({ countries: ["BR"], cities: ["São Paulo"] });
const skeleton = leadCampaignSkeleton(brief, weeklyBudgetBrl, targeting);
const assetFeedSpec = toAssetFeedSpec(copy, { linkUrl: "http://fb.me/", pageId: PAGE });

// ---------------------------------------------------------------------------
// 3) Publicação completa (campanha → ad set → creative → 1 ad por ângulo). PAUSED.
// ---------------------------------------------------------------------------
const steps = planFullPublication({
  accountId: ACCOUNT,
  pageId: PAGE,
  leadFormId: LEAD_FORM,
  product: brief.product,
  skeleton,
  assetFeedSpec,
  adAngles: copy.angles,
});
const summary = publicationSummary(steps);
const blockersToPublish = validatePublication({
  accountId: ACCOUNT,
  pageId: PAGE,
  leadFormId: LEAD_FORM,
  product: brief.product,
  skeleton,
  assetFeedSpec,
  adAngles: copy.angles,
});

// ---------------------------------------------------------------------------
// 4) Calibragem tamanho de conjunto × verba — R$ 100/dia em cenários de CPL.
//    Break-even p/ 1 conjunto sair do aprendizado: CPL = verba_semanal / 50.
// ---------------------------------------------------------------------------
const breakEvenCpl = Math.round((weeklyBudgetBrl / 50) * 100) / 100; // 700/50 = 14
const cplScenarios = [
  { label: "otimista (default do pipeline)", cpl: 8 },
  { label: "break-even (1 conjunto sai do aprendizado)", cpl: breakEvenCpl },
  { label: "realista Paulista/Paraíso", cpl: 25 },
  { label: "premium", cpl: 40 },
];
const sizing = cplScenarios.map(({ label, cpl }) => ({
  scenario: label,
  cplBrl: cpl,
  result: recommendAdSetSizing(
    { weeklyBudgetBrl, expectedCplBrl: cpl, audienceSplits: 1 },
    { learningEventsPerWeek: 50, maxAdSets: 3, fallbackCplBrl: 8 },
  ),
}));

// ---------------------------------------------------------------------------
// Monta o spec (mesma família do docs/campaigns/spin-mood/campaign-spec.json).
// ---------------------------------------------------------------------------
const spec = {
  $schema: "./campaign-spec.schema (proposta governada — gerada por scripts/build-arvo-proposal.mjs)",
  id: "arvo-teixeira-da-silva-paraiso-2026-07",
  status: "draft",
  note:
    "PROPOSTA de conjunto de anúncios do Arvo (Kallas). NADA vai ao ar sem aprovação humana + Página/formulário/mídia + teto de verba. Gerado pelo pipeline real (creative-strategist + housing-audience + publication-plan + budget-sizing) — copy e estrutura são SAÍDA determinística, não texto avulso. Regenerar: node scripts/build-arvo-proposal.mjs.",
  generatedBy: "scripts/build-arvo-proposal.mjs",
  buildDate: "2026-07-21",

  product: {
    name: "Arvo Teixeira da Silva",
    developer: "Kallas Incorporadora",
    coDeveloper: "Paladin Realty",
    status: "lancamento",
    delivered: false,
    address: "Rua Mário Amaral, 267 — Paraíso, São Paulo/SP",
    faces: "Rua Teixeira da Silva (esquina com Rua Mário Amaral)",
    neighborhood: ["Paraíso"],
    transit: "400 m da Av. Paulista · 800 m do Metrô Brigadeiro · 10 min do Parque Ibirapuera",
    building: { towers: 1, units_total: 262, floors: "Térreo + 1º (lazer) + 2º ao 21º (tipo) + ático", parking: "1 vaga utilitário" },
    architects: { arquitetura: "Marcos Gavião Arquitetos", paisagismo: "Núcleo Arquitetura e Paisagismo", interiores: "DP Barros Interiores", colaboracao: "PSA / Pablo Slemenson" },
    amenities: [
      "piscina", "solário", "pool bar", "sauna", "sala de massagem", "fitness", "espaço wellness",
      "coworking", "lavanderia", "sport bar", "salão de festas", "lounge externo",
      "pet care", "pet place", "minimercado", "delivery", "bicicletário", "churrasqueira (vista Av. Paulista)",
    ],
    building_features: [
      "infra de ar-condicionado nas áreas comuns", "previsão para gerador de conforto",
      "wi-fi nas áreas comuns", "previsão para placas solares / usina fotovoltaica",
      "aproveitamento de águas pluviais", "lâmpadas LED", "3 bicicletas elétricas", "portaria multilaminada",
    ],
  },

  inventory_summary: {
    source: "book oficial Arvo Teixeira da Silva (Kallas, 2026-07) — ficha técnica + plantas",
    typologies: [
      { type: "1_dorm_29m2_com_terraco", area_m2: 29, finais: "01 e 06 a 14", units: 182, note: "Tipologia A (100% R2V)" },
      { type: "1_dorm_24m2_com_terraco", area_m2: 24, finais: "02 a 05", units: 80, note: "Tipologia B (36 HMP · 37 HIS-2 · 07 R2V)" },
    ],
    price_hook: "Unidades a partir de R$ 399 mil (peça aprovada)",
    price_from_brl: 399000,
    reminder: "Confirmar disponibilidade e tabela vigente antes de publicar; faixa de renda (SM) não consta do book — não inventar no criativo.",
  },

  objective: "OUTCOME_LEADS",
  conversion_location: "INSTANT_FORM",
  budget: { daily_brl: DAILY_BRL, weekly_brl: weeklyBudgetBrl, currency: "BRL", mode: "CBO (Advantage+ campaign budget)", schedule: "contínuo com revisão em 4–7 dias" },

  generated: {
    copy,
    copyPolicyViolations: copyViolations,
    targeting,
    skeleton,
    assetFeedSpec,
    publicationSteps: steps,
    publicationSummary: summary,
    blockersToPublish,
  },

  sizing_calibration: {
    daily_brl: DAILY_BRL,
    weekly_brl: weeklyBudgetBrl,
    break_even_cpl_brl: breakEvenCpl,
    doctrine:
      "50 conversões/conjunto em 7 dias p/ sair do aprendizado ⇒ verba mínima/conjunto = 50 × CPL. Sob HOUSING não se micro-segmenta público — o padrão honesto é 1 conjunto broad concentrando a verba. R$ 100/dia sustenta 1 conjunto que sai do aprendizado SE o CPL real ficar ≤ R$ 14; acima disso, manter 1 conjunto (nunca fragmentar) e esperar aprendizado mais lento/caro.",
    scenarios: sizing,
  },

  governance: {
    human_approval_before_publish: true,
    born_paused: true,
    budget_cap_required: true,
    audit: "toda ação (criar/pausar/orçamento) gravada com quem/quando/o-quê",
    kill_switch: "por organização",
  },

  materials: {
    note: "Binários fora do git — ficam na origem do dono; o módulo faz upload ao Meta na publicação.",
    creatives: [
      { type: "image", role: "feed 4:5", file: "ARVO LEGENDA / peça estática (a partir de R$ 399 mil)" },
      { type: "video", role: "reels/stories 9:16", file: "arvo-reels-A.mp4" },
      { type: "video", role: "reels/stories 9:16", file: "arvo-reels-B.mp4" },
      { type: "video", role: "legendado", file: "ARVO LEGENDA (1).mp4" },
      { type: "video", role: "complementar", file: "WhatsApp Video 2026-07-07 at 10.22.08.mp4" },
      { type: "book", file: "Arvo Teixeira da Silva (1).pdf" },
    ],
  },

  missing_before_publish: [
    "conta Meta conectada (Windsor sem conta OU META_ADS_ACCESS_TOKEN + META_AD_ACCOUNT_ID no CRM)",
    "page_id (Página do Facebook/Instagram do anunciante)",
    "lead_gen_form_id (formulário instantâneo publicado)",
    "hashes de imagem / video_ids (upload da mídia ao Meta)",
    "confirmação da tabela/estoque vigente",
  ],

  andromeda_loop: {
    ingest: "app/api/webhooks/meta (lead instantâneo → outbox → lead)",
    score: "lib/ai/conversion-predictor",
    distribute: "lib/distribution/hierarchical-cascade",
    next_best_action: "lib/ai/next-best-action",
    capi_feedback: "lib/meta/conversions",
    learning: "lib/ai/learning-loop + lib/ai/andromeda-learning",
  },
};

// ---------------------------------------------------------------------------
// Escreve o spec e reporta (adversarial: acusa qualquer violação de política).
// ---------------------------------------------------------------------------
const outDir = path.join(root, "docs", "campaigns", "arvo");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "campaign-spec.json");
fs.writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

console.log("=== PROPOSTA ARVO (gerada pelo pipeline real) ===\n");
console.log(`Produto: ${brief.product} — ${brief.developer} — ${brief.neighborhood}/${brief.city}`);
console.log(`Verba: R$ ${DAILY_BRL}/dia (R$ ${weeklyBudgetBrl}/semana, CBO)\n`);
console.log(`Ângulos (${copy.angles.length}): ${copy.angles.join(", ")}`);
copy.primaryTexts.forEach((t, i) => console.log(`  • [${copy.angles[i]}] (${t.length}c) ${t}`));
console.log(`\nHeadlines: ${copy.headlines.map((h) => `"${h}"`).join(" · ")}`);
console.log(`Descriptions: ${copy.descriptions.map((d) => `"${d}"`).join(" · ")}`);
console.log(`\nResumo publicação: ${summary}`);
console.log(`Passos (todos PAUSED): ${steps.map((s) => s.kind).join(" → ")}`);

console.log("\n=== CALIBRAGEM VERBA (R$ 100/dia) ===");
console.log(`Break-even CPL p/ 1 conjunto sair do aprendizado: R$ ${breakEvenCpl}`);
for (const s of sizing) {
  const r = s.result;
  console.log(`  CPL R$ ${s.cplBrl} [${s.scenario}] → veredito=${r.verdict}, conjuntos=${r.recommendedAdSets}, ~${r.expectedConversionsPerWeek} conv/sem, sai do aprendizado=${r.exitsLearning}`);
}

console.log("\n=== GATES ===");
console.log(`Copy viola política? ${copyViolations.length === 0 ? "não ✅" : `SIM ❌ (${copyViolations.length})`}`);
console.log(`Bloqueios p/ publicar (esperados até conectar a conta): ${blockersToPublish.length}`);
blockersToPublish.forEach((b) => console.log(`  - ${b}`));
console.log(`\nSpec escrito: ${path.relative(root, outPath)}`);

// Falha só se o copy violar política (o resto é bloqueio esperado de publicação).
if (copyViolations.length) {
  console.error("\n❌ copy gerado violou a política — corrigir o gerador/brief.");
  process.exit(1);
}
console.log("\n✅ proposta gerada, copy limpo (HOUSING/Personal Attributes).");
