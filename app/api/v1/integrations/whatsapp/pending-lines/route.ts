import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function isDirector(identity: Awaited<ReturnType<typeof requireAccessContext>>) {
  return identity.ok && (identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director");
}

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * A small, director-only feed used by the global notification center.
 * It reads the pending integration record directly, instead of running a
 * Graph API health check every time the notification panel is opened.
 */
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60 * 60_000, scope: "whatsapp-pending-lines" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity)) {
    return apiError("DIRECTOR_APPROVAL_REQUIRED", "Somente a diretoria pode revisar solicitações de linhas oficiais.", identity.meta, { status: 403, headers: rate.headers });
  }

  const admin = getSupabaseAdmin();
  const { data: lines, error } = await admin
    .from("integrations")
    .select("id,external_account_id,config,updated_at")
    .eq("organization_id", identity.access.organization.id)
    .eq("provider", "whatsapp")
    .eq("status", "pending_approval")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    return apiError("PENDING_WHATSAPP_LINES_LOAD_FAILED", "Não foi possível consultar as solicitações de linhas oficiais.", identity.meta, { status: 502, headers: rate.headers });
  }

  const profileIds = [...new Set((lines ?? []).map((line) => configObject(line.config).brokerProfileId).filter((value): value is string => typeof value === "string"))];
  const { data: profiles, error: profilesError } = profileIds.length
    ? await admin.from("profiles").select("id,full_name").eq("organization_id", identity.access.organization.id).in("id", profileIds)
    : { data: [], error: null };
  if (profilesError) {
    return apiError("PENDING_WHATSAPP_LINES_PROFILES_FAILED", "Não foi possível identificar os corretores das solicitações pendentes.", identity.meta, { status: 502, headers: rate.headers });
  }

  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || "Corretor"]));
  const requests = (lines ?? []).map((line) => {
    const config = configObject(line.config);
    const brokerProfileId = typeof config.brokerProfileId === "string" ? config.brokerProfileId : null;
    return {
      id: line.id,
      brokerProfileId,
      brokerName: brokerProfileId ? names.get(brokerProfileId) || "Corretor" : "Corretor",
      displayPhone: typeof config.displayPhone === "string" ? config.displayPhone : null,
      phoneNumberIdMasked: `••••${String(line.external_account_id || "").slice(-4)}`,
      requestedAt: typeof config.requestedAt === "string" ? config.requestedAt : line.updated_at,
    };
  });

  return apiSuccess({ requests, count: requests.length, scope: "director" }, identity.meta, { headers: rate.headers });
}
