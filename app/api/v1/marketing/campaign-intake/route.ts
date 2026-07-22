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
import { uploadImageFromUrl, uploadVideoFromUrl, waitVideoReady } from "@/lib/meta/marketing/media-upload";
import { findPriorExecution, recordExecution, tryReserve, releaseReservation } from "@/lib/meta/marketing/idempotency";
import { planFullPublication, validatePublication, publicationSummary } from "@/lib/meta/marketing/publication-plan";
import { validateExecutionPlan, executeSteps } from "@/lib/meta/marketing/campaign-executor";
import { fetchCampaignInsights, insightsToCostRows } from "@/lib/meta/marketing/campaign-read";
import { cachedMetaRead, invalidateMetaReads } from "@/lib/meta/marketing/insights-cache";
import { recommendAdSetSizing } from "@/lib/meta/marketing/budget-sizing";
import { aggregate } from "@/lib/marketing/cost-report";
import { loadOrgCalibration } from "@/lib/ai/calibration-server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeIntent, intentToken, missingForCommit, assembleMediaRefs } from "@/lib/marketing/campaign-intake";
import { canDecideMetaCampaign, isMetaCampaignApproval, META_CAMPAIGN_AUTHORITY_MESSAGE } from "@/lib/meta/marketing/approval-authority";

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

  // PORTÃO DE APROVAÇÃO — esta rota criava campanha, conjunto, criativo e anúncios na
  // Meta com dryRun:false e NÃO consultava aprovação em ponto nenhum: a palavra
  // "approval" não aparecia neste arquivo. Era o caminho que funcionava contornando o
  // caminho governado, e gastava dinheiro real com autorização de gerente.
  //
  // O portão é o MESMO de /api/v1/marketing/execute, de propósito: um segundo mecanismo
  // paralelo seria só mais uma superfície para divergir. E ele FALHA FECHADO — sem
  // approval_requests disponível, a execução real é bloqueada em vez de seguir adiante.
  // Gastar verba é exatamente o tipo de operação que não pode degradar graciosamente.
  const admin = getSupabaseAdmin();

  if (!canDecideMetaCampaign({ role: identity.access.profile.role, commercialRole: identity.access.profile.commercialRole })) {
    return apiError("FORBIDDEN", META_CAMPAIGN_AUTHORITY_MESSAGE, identity.meta, { status: 403 });
  }

  const approvalId = String((body as Record<string, unknown> | null)?.approvalId ?? "").trim();
  if (!approvalId) {
    return apiError(
      "APPROVAL_REQUIRED",
      "Criar campanha na Meta exige uma aprovação registrada. Envie approvalId de um pedido aprovado.",
      identity.meta,
      { status: 428 },
    );
  }

  const { data: approval, error: approvalError } = await admin
    .from("approval_requests")
    .select("id,status,entity_type,request_type,organization_id,expires_at")
    .eq("id", approvalId)
    .maybeSingle();

  if (approvalError) {
    return apiError(
      "APPROVAL_UNAVAILABLE",
      "Aprovação não verificável (approval_requests indisponível) — criação real bloqueada.",
      identity.meta,
      { status: 503 },
    );
  }
  if (
    !approval ||
    approval.organization_id !== identity.access.organization.id ||
    approval.status !== "approved" ||
    !isMetaCampaignApproval({ entityType: approval.entity_type, requestType: approval.request_type })
  ) {
    return apiError("APPROVAL_INVALID", "Aprovação inexistente, de outra organização, não aprovada ou de outro tipo.", identity.meta, { status: 403 });
  }
  if (approval.expires_at && new Date(approval.expires_at).getTime() < Date.now()) {
    return apiError("APPROVAL_EXPIRED", "Esta aprovação expirou — peça uma nova antes de criar.", identity.meta, { status: 403 });
  }

  // IDEMPOTÊNCIA: reenviar o mesmo confirmToken NÃO recria a campanha.
  const idemKey = `${identity.access.organization.id}:intake:${confirmToken}`;
  const prior = await findPriorExecution(admin, idemKey);
  if (prior) {
    return apiSuccess({ mode: "ja_criada", created: prior, product: intent.product, governance: "esta campanha já foi criada (idempotência) — não recriamos. PAUSADA." }, identity.meta, { headers: limited.headers });
  }
  if (!tryReserve(idemKey)) {
    return apiError("IN_PROGRESS", "Esta criação já está em andamento — aguarde o resultado.", identity.meta, { status: 409 });
  }

  // a partir daqui, QUALQUER saída sem sucesso libera a reserva de idempotência
  const fail = (code: string, message: string, status: number, details?: unknown) => {
    releaseReservation(idemKey);
    return apiError(code, message, identity.meta, { status, details });
  };

  // sobe a mídia de verdade (imagens em paralelo; vídeos em paralelo)
  const [imgResults, vidResults] = await Promise.all([
    Promise.all(intent.imageUrls.map(async (url) => ({ url, res: await uploadImageFromUrl(account, token, url, { dryRun: false }) }))),
    Promise.all(intent.videoUrls.map(async (url) => ({ url, res: await uploadVideoFromUrl(account, token, url, { dryRun: false }) }))),
  ]);
  const imgFail = imgResults.find((r) => "ok" in r.res && r.res.ok === false);
  const vidFail = vidResults.find((r) => "ok" in r.res && r.res.ok === false);
  if (imgFail || vidFail) {
    const err = (imgFail?.res ?? vidFail?.res) as { message?: string };
    return fail("MEDIA_UPLOAD_FAILED", `Falha ao subir a mídia: ${err.message ?? "erro"}`, 502);
  }
  const media = assembleMediaRefs(
    imgResults.map((r) => ({ url: r.url, hash: (r.res as { hash: string }).hash })),
    vidResults.map((r) => ({ url: r.url, videoId: (r.res as { videoId: string }).videoId })),
    intent,
  );

  // AGUARDA o encode assíncrono dos vídeos antes de montar o creative —
  // usar vídeo ainda "processing" cria creative quebrado e deixa órfãos.
  for (const videoId of media.videoIds) {
    const ready = await waitVideoReady(videoId, token);
    if (ready !== true) {
      return fail("VIDEO_NOT_READY", `Vídeo não ficou pronto: ${ready.message}`, 502);
    }
  }

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
  if (pubProblems.length) return fail("PLAN_INVALID", `Plano recusado: ${pubProblems.join("; ")}`, 422);
  const steps = planFullPublication(pubInput);
  const execProblems = validateExecutionPlan(steps);
  if (execProblems.length) return fail("PLAN_INVALID", `Plano recusado: ${execProblems.join("; ")}`, 422);

  try {
    const results = await executeSteps(steps, { token, dryRun: false, idempotencyKey: idemKey });
    const failed = results.find((r) => !r.ok);
    if (failed) {
      // órfãos possíveis (ids já criados PAUSED vêm em results) — não grava
      // idempotência de sucesso, mas devolve o que foi criado para rastro.
      return fail("CREATE_FAILED", `A Meta recusou a criação: ${failed.error ?? "erro"}`, 502, results);
    }
    await recordExecution(admin, idemKey, identity.access.organization.id, results);
    invalidateMetaReads();
    return apiSuccess({
      mode: "criada",
      created: results,
      product: intent.product,
      governance: "campanha criada na Meta — PAUSADA (não gasta). Ative em Marketing → Executar quando quiser começar.",
    }, identity.meta, { headers: limited.headers });
  } catch (err) {
    return fail("CREATE_FAILED", err instanceof Error ? err.message : "Falha na criação.", 502);
  }
}
