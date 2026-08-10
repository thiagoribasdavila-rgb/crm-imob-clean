import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext, resolveCommercialRole } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { compareOperationalUx } from "@/lib/analytics/operational-ux-measurement";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "operational-ux-measurement" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const role = String(resolveCommercialRole({ role: access.access.profile.role, commercialRole: access.access.profile.commercialRole }));
  if (!["director", "superintendent", "manager"].includes(role) && access.access.profile.role !== "admin") return apiError("FORBIDDEN", "Medição consolidada disponível para a gestão.", access.meta, { status: 403 });
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const result = await getSupabaseAdmin().from("atlas_events").select("payload").eq("organization_id", access.access.organization.id).eq("event_type", "atlas.route_session_completed").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(10000);
  if (result.error) return apiError("UX_MEASUREMENT_UNAVAILABLE", "A medição operacional ainda não está disponível.", access.meta, { status: 503 });
  return apiSuccess({ ...compareOperationalUx(result.data ?? []), windowDays: 90, generatedAt: new Date().toISOString() }, access.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
