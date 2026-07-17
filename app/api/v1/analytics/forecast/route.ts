import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { buildStageForecast } from "@/lib/analytics/stage-forecast";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "stage-forecast" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;
  const [opportunities, settings] = await Promise.all([
    identity.supabase.from("opportunities").select("id,stage,value,expected_close_at,created_at").eq("organization_id", organizationId).limit(10000),
    identity.supabase.from("pipeline_stage_settings").select("stage_key,label,probability,position,visible").eq("organization_id", organizationId),
  ]);
  if (opportunities.error || settings.error) return apiError("FORECAST_LOAD_FAILED", "Não foi possível consolidar o forecast do seu escopo.", identity.meta, { status: 500 });
  return apiSuccess({ scope: { organizationId, hierarchicalRls: true, role: identity.access.profile.commercialRole || identity.access.profile.role }, ...buildStageForecast(opportunities.data ?? [], settings.data ?? []), generatedAt: new Date().toISOString() }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
