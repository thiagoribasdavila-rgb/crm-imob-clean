/**
 * Pré-voo de disparo Meta — valida se a conta está pronta para criar campanha
 * de leads pelo Atlas, sem criar campanha, sem mudar verba e sem ativar nada.
 *
 * O fluxo real permanece governado:
 * - campaign-intake gera prévia e cria estruturas PAUSED após aprovação;
 * - marketing/execute ativa/pausa/ajusta verba com alçada humana.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { runMetaCampaignDispatchPreflight } from "@/lib/meta/marketing/campaign-dispatch-preflight";

export const dynamic = "force-dynamic";

const LEADERSHIP = new Set(["director", "superintendent", "manager"]);

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

function readQuery(request: NextRequest, key: string): string | null {
  const value = request.nextUrl.searchParams.get(key)?.trim();
  return value || null;
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 12, windowMs: 60 * 60_000, scope: "meta-campaign-dispatch-test" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  if (!LEADERSHIP.has(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Teste de disparo Meta pertence à liderança comercial.", identity.meta, {
      status: 403,
      headers: limited.headers,
    });
  }

  const pageId = readQuery(request, "pageId") ?? process.env.META_PAGE_ID;
  const leadFormId = readQuery(request, "leadFormId") ?? process.env.META_LEAD_FORM_ID;

  const result = await runMetaCampaignDispatchPreflight({
    adsToken: process.env.META_ADS_ACCESS_TOKEN,
    leadToken: process.env.META_LEAD_ACCESS_TOKEN,
    adAccountId: process.env.META_AD_ACCOUNT_ID,
    pageId,
    leadFormId,
    graphVersion: process.env.META_GRAPH_API_VERSION,
  });

  if (result.status === "blocked") {
    return apiError("META_CAMPAIGN_DISPATCH_BLOCKED", "O disparo Meta ainda não está pronto. Revise os itens do pré-voo.", identity.meta, {
      status: 503,
      details: result,
      headers: limited.headers,
    });
  }

  return apiSuccess(result, identity.meta, { headers: limited.headers });
}
