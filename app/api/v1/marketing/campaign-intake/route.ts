/**
 * Intake de campanha — "mande o material aqui e a IA sobe" (direto com prévia).
 *
 * POST sem confirmToken → PRÉVIA: gera copy pelos ângulos, valida política,
 * monta a estrutura (com mídia simulada) e devolve o que será criado + o que
 * ainda falta + um confirmToken. Nada é escrito na Meta.
 *
 * POST com confirmToken (igual ao da prévia) → CRIA: sobe a mídia de verdade,
 * monta o plano com os hashes reais e cria na Meta — tudo PAUSED. Ativar
 * (gastar) é etapa humana separada (/api/v1/marketing/execute action activate).
 *
 * Liderança comercial. Sem META_ADS_ACCESS_TOKEN/conta → 503 honesto.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { buildAdCopy, validateCopy, toAssetFeedSpec, leadCampaignSkeleton, type CreativeAngle, type ProductBrief } from "@/lib/ai/creative-strategist";
import { productBrief } from "@/lib/atlas/developer-portfolio";
import { housingTargetingSpec } from "@/lib/meta/marketing/housing-audience";
import { uploadImageFromUrl, uploadVideoFromUrl } from "@/lib/meta/marketing/media-upload";
import { planFullPublication, validatePublication, publicationSummary } from "@/lib/meta/marketing/publication-plan";
import { validateExecutionPlan, executeSteps } from "@/lib/meta/marketing/campaign-executor";
import { fetchCampaignInsights, insightsToCostRows } from "@/lib/meta/marketing/campaign-read";
import { cachedMetaRead, invalidateMetaReads } from "@/lib/meta/marketing/insights-cache";
import { recommendAdSetSizing } from "@/lib/meta/marketing/budget-sizing";
import { aggregate } from "@/lib/marketing/cost-report";
import { loadOrgCalibration } from "@/lib/ai/calibration-server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeIntent, intentToken, missingForCommit, assembleMediaRefs } from "@/lib/marketing/campaign-intake";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}
const LEADERSHIP = ["director", "superintendent", "manager"];
const FB_LINK = "http://fb.me/"; // exigido pela Meta em lead ads

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 12, scope: "marketing-campaign-intake" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!LEADERSHIP.includes(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Criar campanha pela IA pertence à liderança.", identity.meta, { status: 403 });
  }

  const token = process.env.META_ADS_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    return apiError("META_NOT_CONFIGURED", "Meta não configurada: defina META_ADS_ACCESS_TOKEN e META_AD_ACCOUNT_ID.", identity.meta, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const intent = normalizeIntent(body);
  if (!intent.product) {
    return apiError("PRODUCT_REQUIRED", "Informe o produto (empreendimento) — é o mínimo para a IA escrever o anúncio.", identity.meta, { status: 422 });
  }

  // brief calibrado pelo rol de incorporadoras (o que o dono mandar tem precedência)
  const fromRol = productBrief(intent.product);
  const brief: ProductBrief = {
    ...(fromRol ?? { product: intent.product }),
    product: intent.product,
    ...(intent.developer ? { developer: intent.developer } : {}),
  };
  const angles = intent.angles.length ? (intent.angles as CreativeAngle[]) : undefined;
  const copy = buildAdCopy(brief, angles);
  const violations = validateCopy(copy);

  const confirmToken = intentToken(intent);
  const missing = missingForCommit(intent);
  const incomingToken = typeof body?.confirmToken === "string" ? body.confirmToken : null;

  // -------- PRÉVIA (sem token) --------
  if (!incomingToken) {
    // recomendação conjunto×verba: a IA estuda a estrutura pela fase de
    // aprendizado usando o CPL REAL da conta (cacheado) e a calibração da org.
    let sizing = null;
    if (intent.weeklyBudgetBrl != null) {
      const cal = await loadOrgCalibration(getSupabaseAdmin(), identity.access.organization.id);
      const insights = await cachedMetaRead(
        `campaign-insights:${account}:last_30d:7`,
        () => fetchCampaignInsights(account, token, { datePreset: "last_30d", timeIncrement: 7 }),
      );
      let accountCpl: number | null = null;
      if (Array.isArray(insights)) {
        const agg = aggregate(insightsToCostRows(insights), "campaign");
        const spend = agg.reduce((s, a) => s + a.spend, 0);
        const leads = agg.reduce((s, a) => s + a.leads, 0);
        accountCpl = leads > 0 ? spend / leads : null;
      }
      sizing = recommendAdSetSizing(
        { weeklyBudgetBrl: intent.weeklyBudgetBrl, expectedCplBrl: accountCpl },
        { learningEventsPerWeek: cal.sizing.learningEventsPerWeek, maxAdSets: cal.sizing.maxAdSets, fallbackCplBrl: cal.sizing.fallbackCplBrl },
      );
    }
    // se já dá para montar a estrutura, mostra o plano simulado (mídia fictícia)
    let planPreview: ReturnType<typeof planFullPublication> | null = null;
    let summary: string | null = null;
    if (missing.length === 0) {
      const assetFeedSpec = toAssetFeedSpec(copy, {
        imageHashes: intent.imageUrls.map(() => "DRYRUN_HASH"),
        videoIds: intent.videoUrls.map(() => "DRYRUN_VIDEO_ID"),
        linkUrl: FB_LINK,
        pageId: intent.pageId ?? undefined,
      });
      const skeleton = leadCampaignSkeleton(brief, intent.weeklyBudgetBrl ?? 0, housingTargetingSpec(brief.city ? { cities: [brief.city] } : {}));
      planPreview = planFullPublication({
        accountId: account, pageId: intent.pageId!, leadFormId: intent.leadFormId!,
        instagramActorId: intent.instagramActorId ?? undefined,
        product: intent.product, skeleton, assetFeedSpec,
        imageHashes: intent.imageUrls.map(() => "DRYRUN_HASH"),
        videoIds: intent.videoUrls.map(() => "DRYRUN_VIDEO_ID"),
        adAngles: copy.angles,
      });
      summary = publicationSummary(planPreview);
    }
    return apiSuccess({
      mode: "previa",
      copy, violations,
      structure: planPreview ? { steps: planPreview.length, summary } : null,
      sizing, // recomendação conjunto×verba (fase de aprendizado, CPL real)
      missing, // o que ainda falta para poder criar
      confirmToken, // reenvie este token para CRIAR (se o material não mudar)
      governance: "prévia — nada foi criado na Meta. Reenvie com confirmToken para criar (pausado).",
    }, identity.meta, { headers: limited.headers });
  }

  // -------- CRIAÇÃO (com token) --------
  if (incomingToken !== confirmToken) {
    return apiError("MATERIAL_CHANGED", "O material mudou desde a prévia — revise e confirme de novo.", identity.meta, { status: 409 });
  }
  if (violations.length) {
    return apiError("COPY_POLICY", "O texto viola a política HOUSING/atributos pessoais — ajuste antes de criar.", identity.meta, { status: 422, details: violations });
  }
  if (missing.length) {
    return apiError("MISSING_MATERIAL", `Faltam itens para criar: ${missing.join("; ")}.`, identity.meta, { status: 422, details: missing });
  }

  // sobe a mídia de verdade (imagens em paralelo; vídeos em paralelo)
  const [imgResults, vidResults] = await Promise.all([
    Promise.all(intent.imageUrls.map(async (url) => ({ url, res: await uploadImageFromUrl(account, token, url, { dryRun: false }) }))),
    Promise.all(intent.videoUrls.map(async (url) => ({ url, res: await uploadVideoFromUrl(account, token, url, { dryRun: false }) }))),
  ]);
  const imgFail = imgResults.find((r) => "ok" in r.res && r.res.ok === false);
  const vidFail = vidResults.find((r) => "ok" in r.res && r.res.ok === false);
  if (imgFail || vidFail) {
    const err = (imgFail?.res ?? vidFail?.res) as { message?: string };
    return apiError("MEDIA_UPLOAD_FAILED", `Falha ao subir a mídia: ${err.message ?? "erro"}`, identity.meta, { status: 502 });
  }
  const media = assembleMediaRefs(
    imgResults.map((r) => ({ url: r.url, hash: (r.res as { hash: string }).hash })),
    vidResults.map((r) => ({ url: r.url, videoId: (r.res as { videoId: string }).videoId })),
    intent,
  );

  // monta o plano real e cria — tudo PAUSED (garantia do executor)
  const assetFeedSpec = toAssetFeedSpec(copy, { imageHashes: media.imageHashes, videoIds: media.videoIds, linkUrl: FB_LINK, pageId: intent.pageId ?? undefined });
  const skeleton = leadCampaignSkeleton(brief, intent.weeklyBudgetBrl ?? 0, housingTargetingSpec(brief.city ? { cities: [brief.city] } : {}));
  const pubInput = {
    accountId: account, pageId: intent.pageId!, leadFormId: intent.leadFormId!,
    instagramActorId: intent.instagramActorId ?? undefined,
    product: intent.product, skeleton, assetFeedSpec,
    imageHashes: media.imageHashes, videoIds: media.videoIds, adAngles: copy.angles,
  };
  const pubProblems = validatePublication(pubInput);
  if (pubProblems.length) {
    return apiError("PLAN_INVALID", `Plano recusado: ${pubProblems.join("; ")}`, identity.meta, { status: 422 });
  }
  const steps = planFullPublication(pubInput);
  const execProblems = validateExecutionPlan(steps);
  if (execProblems.length) {
    return apiError("PLAN_INVALID", `Plano recusado: ${execProblems.join("; ")}`, identity.meta, { status: 422 });
  }

  try {
    const results = await executeSteps(steps, {
      token, dryRun: false, idempotencyKey: `${identity.access.organization.id}:intake:${confirmToken}`,
    });
    const failed = results.find((r) => !r.ok);
    if (failed) {
      return apiError("CREATE_FAILED", `A Meta recusou a criação: ${failed.error ?? "erro"}`, identity.meta, { status: 502, details: results });
    }
    invalidateMetaReads();
    return apiSuccess({
      mode: "criada",
      created: results,
      product: intent.product,
      governance: "campanha criada na Meta — PAUSADA (não gasta). Ative em Marketing → Executar quando quiser começar.",
    }, identity.meta, { headers: limited.headers });
  } catch (err) {
    return apiError("CREATE_FAILED", err instanceof Error ? err.message : "Falha na criação.", identity.meta, { status: 502 });
  }
}
