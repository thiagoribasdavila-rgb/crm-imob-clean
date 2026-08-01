/**
 * Motor de criativos (proposta) — gera copy diversificada por ângulo
 * conceitual (pós-Andromeda), valida contra a política Housing/Discriminatory
 * Practices da Meta e, opcionalmente, monta o asset_feed_spec e o esqueleto
 * de campanha de leads (OUTCOME_LEADS, special_ad_categories HOUSING) já com
 * o targeting travado pela política (housingTargetingSpec).
 *
 * Governança: tudo aqui é PROPOSTA — nada é enviado à Meta. A execução real
 * (criar campanha/criativo) depende de aprovação humana em outra camada.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildAdCopy,
  validateCopy,
  toAssetFeedSpec,
  leadCampaignSkeleton,
  type ProductBrief,
  type CreativeAngle,
} from "@/lib/ai/creative-strategist";
import { housingTargetingSpec, audienceDoctrine } from "@/lib/meta/marketing/housing-audience";
import { productBrief } from "@/lib/atlas/developer-portfolio";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

// POST — gera a proposta de criativos: copy por ângulo, violações de política,
// asset_feed_spec (se houver linkUrl) e esqueleto de campanha (se houver verba).
// Liderança comercial.
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 20, scope: "marketing-creative" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = roleOf(identity.access);
  if (!["director", "superintendent", "manager"].includes(role)) {
    return apiError("FORBIDDEN", "Geração de criativos pertence à liderança.", identity.meta, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    brief?: ProductBrief;
    angles?: CreativeAngle[];
    weeklyBudgetBrl?: number;
    linkUrl?: string;
  } | null;
  const rawBrief = body?.brief;
  if (!rawBrief || typeof rawBrief.product !== "string" || !rawBrief.product.trim()) {
    return apiError("BRIEF_PRODUCT_REQUIRED", "Informe o produto (empreendimento) no brief.", identity.meta, { status: 422 });
  }
  // calibração pelo rol de incorporadoras: o registro completa os campos que
  // o chamador não informou (o que veio no corpo sempre tem precedência)
  const fromPortfolio = productBrief(rawBrief.product);
  const brief: ProductBrief = fromPortfolio ? { ...fromPortfolio, ...rawBrief } : rawBrief;

  // núcleo determinístico: copy + auditoria de política, tudo em memória
  const copy = buildAdCopy(brief, body?.angles);
  const violations = validateCopy(copy);

  const linkUrl = body?.linkUrl?.trim();
  const weeklyBudgetBrl = Number(body?.weeklyBudgetBrl);
  const hasBudget = Number.isFinite(weeklyBudgetBrl) && weeklyBudgetBrl > 0;
  // targeting calibrado pela política HOUSING — geo da cidade do brief
  const targeting = housingTargetingSpec(brief.city ? { cities: [brief.city] } : {});

  return apiSuccess({
    copy,
    violations,
    // asset_feed_spec só faz sentido com destino (link_urls é obrigatório no spec)
    assetFeedSpec: linkUrl ? toAssetFeedSpec(copy, { linkUrl }) : null,
    campaignSkeleton: hasBudget ? leadCampaignSkeleton(brief, weeklyBudgetBrl, targeting) : null,
    // por que não segmentamos "na mão": a doutrina que a IA explica ao diretor
    audienceDoctrine: audienceDoctrine(brief.product),
    governance: "proposta — nada foi enviado à Meta",
  }, identity.meta, { headers: limited.headers });
}
