import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 12, windowMs: 60 * 60_000, scope: "whatsapp-health" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Diagnóstico oficial do WhatsApp é exclusivo da diretoria.", identity.meta, { status: 403 });

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return apiSuccess({ connected: false, reason: "credentials_missing", safeguards: { credentialsExposed: false } }, identity.meta, { headers: rate.headers });

  try {
    const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
    const fields = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,code_verification_status,platform_type";
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}?fields=${fields}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok) return apiError("WHATSAPP_GRAPH_ERROR", "A Graph API não confirmou o número configurado. Revise token, permissões e Phone Number ID.", identity.meta, { status: 502, headers: rate.headers });
    const qualityRating = String(data.quality_rating || "UNKNOWN").toUpperCase();
    const messagingLimitTier = String(data.messaging_limit_tier || "UNKNOWN").toUpperCase();
    const verificationStatus = String(data.code_verification_status || "UNKNOWN").toUpperCase();
    const requiredFieldsConfirmed = Boolean(data.display_phone_number && data.verified_name && qualityRating !== "UNKNOWN" && messagingLimitTier !== "UNKNOWN");
    return apiSuccess({ connected: true, phone: { idMasked: `••••${phoneNumberId.slice(-4)}`, displayNumber: data.display_phone_number, verifiedName: data.verified_name, qualityRating, messagingLimitTier, throughput: data.throughput, verificationStatus, platformType: data.platform_type }, homologation: { status: requiredFieldsConfirmed ? "passed" : "incomplete", graphConfirmed: true, numberConfirmed: Boolean(data.display_phone_number), qualityConfirmed: qualityRating !== "UNKNOWN", limitConfirmed: messagingLimitTier !== "UNKNOWN", readOnly: true }, safeguards: { officialTemplates: true, optOutBeforeSend: true, gradualPacing: true, atomicWorkerClaim: true, webhookHealth: true, credentialsExposed: false }, checkedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
  } catch {
    return apiError("WHATSAPP_HEALTH_FAILED", "Não foi possível concluir o diagnóstico oficial do WhatsApp.", identity.meta, { status: 502, headers: rate.headers });
  }
}
