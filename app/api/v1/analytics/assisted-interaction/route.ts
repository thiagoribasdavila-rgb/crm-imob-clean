import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  assistedInteractionMetricTypes,
  buildAssistedInteractionMeasurement,
  type AssistedInteractionMetricRow,
} from "@/lib/ai/assisted-interaction-measurement";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

const managementRoles = new Set(["director", "superintendent"]);

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "assisted-interaction-measurement" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const commercialRole = String(identity.access.profile.commercialRole ?? identity.access.profile.role);
  if (identity.access.profile.accessRole !== "admin" && !managementRoles.has(commercialRole)) {
    return apiError("FORBIDDEN", "Medição disponível para a diretoria e superintendência.", identity.meta, { status: 403 });
  }

  const days = Math.min(180, Math.max(7, Number(request.nextUrl.searchParams.get("days") ?? 30)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const organizationId = identity.access.organization.id;
  const admin = getSupabaseAdmin();
  const metricTypes = Object.values(assistedInteractionMetricTypes);
  const [metricResult, confirmationResult] = await Promise.all([
    admin
      .from("atlas_events")
      .select("event_type,aggregate_id,payload,occurred_at")
      .eq("organization_id", organizationId)
      .in("event_type", metricTypes)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(10_000),
    admin
      .from("lead_events")
      .select("lead_id,created_at")
      .eq("organization_id", organizationId)
      .eq("event_type", "assisted_interaction_confirmed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10_000),
  ]);

  if (metricResult.error || confirmationResult.error) {
    logger.warn("analytics.assisted_interaction_measurement_failed", {
      organizationId,
      metrics: metricResult.error?.code,
      confirmations: confirmationResult.error?.code,
    });
    return apiError("ASSISTED_INTERACTION_MEASUREMENT_UNAVAILABLE", "A medição da captura assistida está temporariamente indisponível.", identity.meta, { status: 503 });
  }

  const leadIds = [...new Set((confirmationResult.data ?? []).map((row) => row.lead_id).filter((id): id is string => Boolean(id)))];
  const activities = leadIds.length
    ? await admin
      .from("lead_events")
      .select("lead_id,created_at")
      .eq("organization_id", organizationId)
      .in("lead_id", leadIds)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(30_000)
    : { data: [], error: null };
  if (activities.error) {
    logger.warn("analytics.assisted_interaction_followup_measurement_failed", { organizationId, code: activities.error.code });
  }

  return apiSuccess(
    {
      period: { days, since, until: new Date().toISOString() },
      ...buildAssistedInteractionMeasurement(
        (metricResult.data ?? []) as AssistedInteractionMetricRow[],
        confirmationResult.data ?? [],
        activities.data ?? [],
      ),
      scope: { organizationId, aggregateOnly: true, managementOnly: true },
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
