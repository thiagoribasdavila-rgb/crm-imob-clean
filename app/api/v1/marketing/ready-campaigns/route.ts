/**
 * GET /api/v1/marketing/ready-campaigns — as campanhas PRONTAS para aprovação
 * (Arvo e Spin), regeneradas pelo pipeline governado no servidor (mesma saída
 * determinística dos scripts build-*-proposal.mjs). Cada uma volta com o plano
 * de publicação (steps, todos PAUSED) pronto para virar proposta em
 * /api/v1/marketing/proposals (kind: "create"), sem tocar a Meta.
 *
 * Só liderança comercial vê (propor campanha é decisão da liderança). Nada aqui
 * cria nada; page_id/lead_form/mídia continuam sendo exigidos apenas na ATIVAÇÃO.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { productBrief } from "@/lib/atlas/developer-portfolio";
import { buildAdCopy, toAssetFeedSpec, leadCampaignSkeleton, type CreativeAngle } from "@/lib/ai/creative-strategist";
import { housingTargetingSpec } from "@/lib/meta/marketing/housing-audience";
import { planFullPublication } from "@/lib/meta/marketing/publication-plan";
import type { ExecutionStep } from "@/lib/meta/marketing/campaign-executor";

export const dynamic = "force-dynamic";

const LEADERSHIP = new Set(["director", "superintendent", "manager"]);
const PAGE = "<<PAGE_ID>>";
const LEAD_FORM = "<<LEAD_FORM_ID>>";

type ReadyCampaign = {
  id: string;
  product: string;
  title: string;
  persona: string;
  dailyBrl: number;
  adCount: number;
  angles: string[];
  accountId: string;
  steps: ExecutionStep[];
  pageId: string | null;
  leadFormId: string | null;
  missingToActivate: string[];
};

/** Regenera o plano de publicação de uma campanha (mesma lógica dos geradores). */
function buildReady(
  id: string,
  productName: string,
  persona: string,
  angles: CreativeAngle[],
  dailyBrl: number,
  accountId: string,
  pageId: string | null,
  leadFormId: string | null,
): ReadyCampaign | null {
  const brief = productBrief(productName);
  if (!brief) return null;
  const copy = buildAdCopy(brief, angles);
  const targeting = housingTargetingSpec({ countries: ["BR"], cities: ["São Paulo"] });
  const skeleton = leadCampaignSkeleton(brief, dailyBrl * 7, targeting);
  const assetFeedSpec = toAssetFeedSpec(copy, { linkUrl: "http://fb.me/", pageId: pageId ?? PAGE });
  const steps = planFullPublication({
    accountId,
    pageId: pageId ?? PAGE,
    leadFormId: leadFormId ?? LEAD_FORM,
    product: brief.product,
    skeleton,
    assetFeedSpec,
    adAngles: copy.angles,
  });
  const missing: string[] = [];
  if (!pageId) missing.push("META_PAGE_ID (Página do Facebook/Instagram)");
  if (!leadFormId) missing.push("META_LEAD_FORM_ID (formulário instantâneo)");
  missing.push("upload da mídia (hashes de imagem / video_ids)");
  return {
    id,
    product: brief.product,
    title: `[Atlas] Leads — ${brief.product}${brief.city ? ` — ${brief.city}` : ""}`,
    persona,
    dailyBrl,
    adCount: steps.filter((s) => s.kind === "create_ad").length,
    angles: copy.angles,
    accountId,
    steps,
    pageId,
    leadFormId,
    missingToActivate: missing,
  };
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 30, scope: "ready-campaigns" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const { access, meta } = identity;
  const role = access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
  if (!LEADERSHIP.has(role)) {
    return apiError("FORBIDDEN", "Propor campanha é decisão da liderança comercial.", meta, { status: 403, headers: limited.headers });
  }

  const accountId = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!accountId) {
    return apiError("META_NOT_CONFIGURED", "META_AD_ACCOUNT_ID ausente — configure a conta de anúncios antes de propor campanhas.", meta, { status: 503, headers: limited.headers });
  }
  const pageId = process.env.META_PAGE_ID?.trim() || null;
  const leadFormId = process.env.META_LEAD_FORM_ID?.trim() || null;

  const campaigns = [
    buildReady("arvo", "Arvo", "investidor", ["investimento", "localizacao", "estilo_de_vida"], 100, accountId, pageId, leadFormId),
    buildReady("spin", "Spin Mood", "morador / primeiro imóvel", ["sair_do_aluguel", "entrega_imediata", "localizacao", "estilo_de_vida"], 60, accountId, pageId, leadFormId),
  ].filter((c): c is ReadyCampaign => c !== null);

  return apiSuccess({ campaigns, readyToActivate: Boolean(pageId && leadFormId) }, meta, { headers: limited.headers });
}
