/**
 * Formulários de lead (Lead Ads) de uma Página — leitura ao vivo da Meta.
 *
 * GET (liderança): recebe ?pageId= e devolve { forms } com id/nome/status e a
 * contagem de perguntas de cada formulário. Fonte VIVA obrigatória: usa
 * META_LEAD_ACCESS_TOKEN (fallback META_ADS_ACCESS_TOKEN); sem token, 503
 * honesto. Erro estruturado da Meta vira 502 com a mensagem (nunca o token).
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { fetchLeadForms } from "@/lib/meta/marketing/lead-forms";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 30, scope: "marketing-lead-forms" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = roleOf(identity.access);
  if (!["director", "superintendent", "manager"].includes(role)) {
    return apiError("FORBIDDEN", "Formulários de lead pertencem à liderança.", identity.meta, { status: 403 });
  }

  const pageId = (new URL(request.url).searchParams.get("pageId") ?? "").trim();
  if (!pageId) {
    return apiError("PAGE_ID_REQUIRED", "Informe o pageId da Página (querystring obrigatória).", identity.meta, { status: 422 });
  }

  const token = process.env.META_LEAD_ACCESS_TOKEN || process.env.META_ADS_ACCESS_TOKEN;
  if (!token) {
    return apiError("META_NOT_CONFIGURED", "Meta não configurada: defina META_LEAD_ACCESS_TOKEN.", identity.meta, { status: 503 });
  }

  const forms = await fetchLeadForms(pageId, token);
  if (!Array.isArray(forms)) {
    // MetaReadError estruturado — repassa a mensagem, nunca o token.
    return apiError("META_READ_FAILED", `Meta recusou a leitura: ${forms.message}`, identity.meta, { status: 502 });
  }
  return apiSuccess({ forms }, identity.meta, { headers: limited.headers });
}
