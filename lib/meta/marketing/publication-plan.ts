/**
 * Plano de PUBLICAÇÃO COMPLETA — a sequência ponta-a-ponta (campanha → ad set →
 * creative → 1..N ads) que a Caixa de Aprovações revisa antes de o executor
 * governado tocar a Marketing API da Meta.
 *
 * Este módulo ESTENDE lib/meta/marketing/campaign-executor.ts (não o reescreve):
 * reusa o TIPO ExecutionStep e os placeholders {{stepN.id}} que executeSteps já
 * resolve. A diferença para planCampaignCreation é o escopo:
 * - planCampaignCreation monta um trio ad set→creative→ad por ad set do esqueleto;
 * - planFullPublication monta a publicação canônica de LEAD ADS imobiliário:
 *   1 campanha CBO/HOUSING, 1 ad set broad, 1 creative Advantage+ e UM anúncio
 *   por ÂNGULO criativo (a diversidade que "acha público" na era Andromeda),
 *   com o vínculo do lead form no lugar EXATO que a doc da Meta manda.
 *
 * Núcleo 100% PURO e determinístico: nada aqui toca a rede. Tudo nasce PAUSED —
 * ativar é decisão humana posterior, feita fora deste módulo pelo executor.
 *
 * Regras de doc materializadas (fonte: Marketing API / Lead Ads / Special Ad
 * Category):
 * - Lead form: object_story_spec.link_data.call_to_action.value.lead_gen_form_id
 *   (NUNCA no ad set, NUNCA dentro do asset_feed_spec).
 * - link do lead ad = "http://fb.me/" (obrigatório).
 * - Ad set: promoted_object.page_id, destination_type ON_AD, optimization_goal
 *   LEAD_GENERATION, billing_event IMPRESSIONS.
 * - CBO ligado na campanha ⇒ o ad set NÃO carrega orçamento próprio.
 * - object_story_spec e asset_feed_spec são IRMÃOS no creative — o story spec
 *   provê identidade (page_id/instagram_actor_id) + CTA/lead form; o feed provê
 *   as variações de mídia/copy.
 */

import type { ExecutionStep } from "./campaign-executor";
import { adNameFor } from "./audience-finder";
import { validateHousingTargeting } from "./housing-audience";

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export type PublicationInput = {
  accountId: string;
  pageId: string;
  instagramActorId?: string;
  leadFormId: string;
  product: string;
  /** Esqueleto vindo de leadCampaignSkeleton (campaign + adSets). */
  skeleton: Record<string, unknown>;
  /** Saída de toAssetFeedSpec (o object_story_spec embutido é separado aqui). */
  assetFeedSpec: Record<string, unknown>;
  /** Sobrepõe as imagens do asset_feed_spec quando fornecido. */
  imageHashes?: string[];
  /** Sobrepõe os vídeos do asset_feed_spec quando fornecido. */
  videoIds?: string[];
  /** Um anúncio por ângulo (convenção de nome "[Atlas] {produto} · {ângulo}"). */
  adAngles?: string[];
};

/** link obrigatório dos lead ads (a Meta usa fb.me como destino simbólico). */
const LEAD_AD_LINK = "http://fb.me/";

/** CTAs aceitos em lead ad (doc). Qualquer outro cai no default SIGN_UP. */
const VALID_LEAD_CTAS = new Set(["APPLY_NOW", "DOWNLOAD", "GET_QUOTE", "LEARN_MORE", "SIGN_UP", "SUBSCRIBE"]);

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function accPath(accountId: string): string {
  return `act_${String(accountId).replace(/^act_/, "")}`;
}

/** Todos os valores string sob chaves `key` (varredura profunda) — p/ status. */
function collectValues(value: unknown, key: string, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectValues(item, key, out);
    return out;
  }
  const rec = asRecord(value);
  if (!rec) return out;
  for (const [k, v] of Object.entries(rec)) {
    if (k === key && typeof v === "string") out.push(v);
    collectValues(v, key, out);
  }
  return out;
}

/** Ângulos válidos (strings não-vazias). */
function cleanAngles(angles: unknown): string[] {
  if (!Array.isArray(angles)) return [];
  return angles.filter((a): a is string => typeof a === "string" && a.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Planejamento (puro)
// ---------------------------------------------------------------------------

/**
 * Monta a publicação completa em ordem, com dependências corretas e placeholders
 * {{stepN.id}}:
 *   step 0 → campanha (CBO/HOUSING/PAUSED)
 *   step 1 → ad set (promoted_object.page_id, ON_AD, LEAD_GENERATION, IMPRESSIONS,
 *            targeting do skeleton, sem budget próprio se CBO, PAUSED)
 *   step 2 → creative (object_story_spec {page_id, instagram_actor_id?} + lead
 *            form no link_data.call_to_action + asset_feed_spec com a mídia)
 *   step 3..N → um ad por ângulo (nome na convenção) ou 1 ad se não houver ângulo.
 * Nunca emite nada ACTIVE; special_ad_categories ausente vira ["HOUSING"].
 */
export function planFullPublication(input: PublicationInput): ExecutionStep[] {
  const acc = accPath(input.accountId);
  const steps: ExecutionStep[] = [];
  const product = input.product || "produto";

  // --- step 0: campanha (CBO + HOUSING + PAUSED) ----------------------------
  const campaignIn = asRecord(input.skeleton.campaign) ?? {};
  const campaign: Record<string, unknown> = { ...campaignIn };
  const campaignNotes: string[] = [];
  if (campaign.status !== "PAUSED") {
    if (typeof campaign.status === "string" && campaign.status.toUpperCase() === "ACTIVE") {
      campaignNotes.push("status veio ACTIVE no input — sobrescrito para PAUSED (ativar é decisão humana posterior, fora do executor).");
    }
    campaign.status = "PAUSED";
  }
  const cats = campaign.special_ad_categories;
  if (!Array.isArray(cats) || cats.length === 0) {
    campaign.special_ad_categories = ["HOUSING"];
    campaignNotes.push('special_ad_categories ausente — forçado ["HOUSING"] (obrigatório em campanha imobiliária).');
  }
  // CBO: orçamento vive na campanha (daily_budget/lifetime_budget). Detecta p/
  // remover qualquer budget do ad set logo abaixo.
  const cbo = campaign.daily_budget != null || campaign.lifetime_budget != null;
  if (campaignNotes.length) campaign.__atlas_notes = campaignNotes;
  steps.push({ kind: "create_campaign", path: `${acc}/campaigns`, payload: campaign });

  // --- step 1: ad set -------------------------------------------------------
  const adSetsIn = Array.isArray(input.skeleton.adSets) ? input.skeleton.adSets : [];
  const adSetIn = asRecord(adSetsIn[0]) ?? { name: `Broad — ${product}` };
  const adSet: Record<string, unknown> = { ...adSetIn };
  delete adSet.targetingNotes; // documentação humana do esqueleto, não é campo da API
  const adSetNotes: string[] = [];
  // Requisitos de lead ad forçados pela doc (independentes do que veio no skeleton):
  adSet.campaign_id = "{{step0.id}}";
  adSet.promoted_object = { page_id: input.pageId };
  adSet.destination_type = "ON_AD";
  adSet.optimization_goal = "LEAD_GENERATION";
  adSet.billing_event = "IMPRESSIONS";
  if (cbo) {
    if (adSet.daily_budget != null || adSet.lifetime_budget != null) {
      adSetNotes.push("CBO ativo na campanha — orçamento próprio do ad set removido (o budget vive na campanha; enviar os dois é erro na Meta).");
    }
    delete adSet.daily_budget;
    delete adSet.lifetime_budget;
  }
  if (adSet.status !== "PAUSED") {
    if (typeof adSet.status === "string" && adSet.status.toUpperCase() === "ACTIVE") {
      adSetNotes.push("status veio ACTIVE no input — sobrescrito para PAUSED.");
    }
    adSet.status = "PAUSED";
  }
  if (adSetNotes.length) adSet.__atlas_notes = adSetNotes;
  steps.push({ kind: "create_adset", path: `${acc}/adsets`, payload: adSet, dependsOn: [0] });

  // --- step 2: creative -----------------------------------------------------
  // asset_feed_spec e object_story_spec são IRMÃOS: separa o story embutido e
  // liga o lead form no lugar exato (link_data.call_to_action.value).
  const feedIn = asRecord(input.assetFeedSpec) ?? {};
  const feed: Record<string, unknown> = { ...feedIn };
  const embeddedStory = asRecord(feed.object_story_spec) ?? {};
  delete feed.object_story_spec;
  // Mídia: imageHashes/videoIds sobrepõem o que veio no feed quando fornecidos.
  if (input.imageHashes && input.imageHashes.length) {
    feed.images = input.imageHashes.map((hash) => ({ hash }));
  }
  if (input.videoIds && input.videoIds.length) {
    feed.videos = input.videoIds.map((id) => ({ video_id: id }));
  }
  // CTA: usa o do feed se for um CTA de lead ad válido; senão default SIGN_UP.
  const ctas = Array.isArray(feed.call_to_action_types) ? feed.call_to_action_types : [];
  const ctaCandidate = typeof ctas[0] === "string" ? ctas[0] : "";
  const ctaType = VALID_LEAD_CTAS.has(ctaCandidate) ? ctaCandidate : "SIGN_UP";

  const storySpec: Record<string, unknown> = {
    ...embeddedStory,
    page_id: input.pageId,
    ...(input.instagramActorId ? { instagram_actor_id: input.instagramActorId } : {}),
    link_data: {
      ...(asRecord(embeddedStory.link_data) ?? {}),
      link: LEAD_AD_LINK,
      call_to_action: { type: ctaType, value: { lead_gen_form_id: input.leadFormId } },
    },
  };
  const creative: Record<string, unknown> = {
    name: `[Atlas] Creative — ${product}`,
    object_story_spec: storySpec,
    asset_feed_spec: feed,
  };
  steps.push({ kind: "create_creative", path: `${acc}/adcreatives`, payload: creative });

  // --- step 3..N: um ad por ângulo (ou 1 ad) --------------------------------
  const angles = cleanAngles(input.adAngles);
  const adNames = angles.length ? angles.map((angle) => adNameFor(product, angle)) : [`[Atlas] ${product}`];
  for (const name of adNames) {
    steps.push({
      kind: "create_ad",
      path: `${acc}/ads`,
      payload: {
        name,
        adset_id: "{{step1.id}}",
        creative: { creative_id: "{{step2.id}}" },
        status: "PAUSED",
      },
      dependsOn: [1, 2],
    });
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Validação da publicação (pura)
// ---------------------------------------------------------------------------

/**
 * Acusa tudo que impediria uma publicação de lead ad válida sob HOUSING:
 * - leadFormId/pageId ausentes;
 * - mídia vazia (nem image hash nem video id, em nenhuma fonte);
 * - targeting do ad set sem as travas HOUSING (via validateHousingTargeting);
 * - qualquer status !== PAUSED em qualquer ponto do esqueleto.
 * Vazio = publicação pronta para planFullPublication + executeSteps.
 */
export function validatePublication(input: PublicationInput): string[] {
  const problems: string[] = [];

  if (!input.leadFormId || !String(input.leadFormId).trim()) {
    problems.push("leadFormId ausente — anúncio de lead exige um formulário instantâneo publicado.");
  }
  if (!input.pageId || !String(input.pageId).trim()) {
    problems.push("pageId ausente — sem Página não há promoted_object nem identidade do criativo.");
  }

  // Mídia: soma imagens/vídeos do asset_feed_spec + as sobreposições do input.
  const feed = asRecord(input.assetFeedSpec) ?? {};
  const feedImages = Array.isArray(feed.images) ? feed.images.length : 0;
  const feedVideos = Array.isArray(feed.videos) ? feed.videos.length : 0;
  const inHashes = Array.isArray(input.imageHashes) ? input.imageHashes.length : 0;
  const inVideos = Array.isArray(input.videoIds) ? input.videoIds.length : 0;
  if (feedImages + feedVideos + inHashes + inVideos === 0) {
    problems.push("mídia vazia — nenhum image hash nem video id fornecido (nem no asset_feed_spec nem em imageHashes/videoIds).");
  }

  // Targeting HOUSING do primeiro ad set do esqueleto.
  const skeleton = asRecord(input.skeleton) ?? {};
  const adSets = Array.isArray(skeleton.adSets) ? skeleton.adSets : [];
  const firstAdSet = asRecord(adSets[0]) ?? {};
  const targeting = asRecord(firstAdSet.targeting);
  if (!targeting) {
    problems.push("targeting ausente no ad set do skeleton — HOUSING exige geo + travas explícitas (age 18–65, sem gênero).");
  } else {
    for (const v of validateHousingTargeting(targeting)) {
      problems.push(`targeting HOUSING: ${v.field} — ${v.detail}`);
    }
  }

  // Qualquer status não-PAUSED em qualquer lugar do esqueleto.
  for (const status of collectValues(skeleton, "status")) {
    if (status.toUpperCase() !== "PAUSED") {
      problems.push(`status "${status}" no skeleton — publicação só nasce PAUSED; ativação é decisão humana posterior.`);
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Resumo executivo (puro)
// ---------------------------------------------------------------------------

/** Um parágrafo em PT do que a publicação vai criar — para a Caixa de Aprovações. */
export function publicationSummary(steps: ExecutionStep[]): string {
  const campaignStep = steps.find((s) => s.kind === "create_campaign");
  const adSetCount = steps.filter((s) => s.kind === "create_adset").length;
  const creativeCount = steps.filter((s) => s.kind === "create_creative").length;
  const adSteps = steps.filter((s) => s.kind === "create_ad");
  const adNames = adSteps.map((s) => (typeof s.payload.name === "string" ? s.payload.name : "anúncio"));

  const campaignName =
    campaignStep && typeof campaignStep.payload.name === "string" ? campaignStep.payload.name : "campanha";
  const cats = campaignStep ? campaignStep.payload.special_ad_categories : null;
  const isHousing = Array.isArray(cats) && cats.includes("HOUSING");

  const adsLabel = adSteps.length === 1 ? "1 anúncio" : `${adSteps.length} anúncios`;
  const adsList = adNames.length ? ` (${adNames.join(", ")})` : "";

  return (
    `Esta publicação criará a campanha "${campaignName}"` +
    `${isHousing ? " na categoria especial HOUSING (imobiliário)" : ""} com ${adSetCount} ad set, ` +
    `${creativeCount} criativo e ${adsLabel}${adsList}, todos com Advantage+ campaign budget (CBO na campanha, ` +
    `sem orçamento no ad set) e formulário instantâneo de leads. ` +
    `Tudo nasce PAUSADO: nada vai ao ar até uma ativação humana posterior, fora deste fluxo.`
  );
}
