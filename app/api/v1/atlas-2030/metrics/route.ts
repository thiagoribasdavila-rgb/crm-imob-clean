import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const metricTables = {
  entities: "atlas_entities",
  relationships: "atlas_relationships",
  memories: "atlas_memories",
  recommendations: "atlas_recommendations",
  simulations: "atlas_simulations",
  launchRooms: "atlas_launch_rooms",
  reservations: "atlas_inventory_reservations",
  dataProducts: "atlas_data_products",
} as const;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    scope: "atlas-2030.metrics",
  });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, {
    accessRoles: ["admin", "director_decisor"],
  });
  if (!access.ok) return access.response;

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();
  const entries = Object.entries(metricTables) as Array<
    [keyof typeof metricTables, (typeof metricTables)[keyof typeof metricTables]]
  >;
  const results = await Promise.all(
    entries.map(async ([key, table]) => {
      const { count, error } = await admin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);
      return { key, table, count: count ?? 0, error };
    }),
  );

  const failed = results.filter((result) => result.error);
  if (failed.length) {
    structuredApiLog("error", "atlas-2030.metrics_failed", request, access.meta, {
      organizationId,
      tables: failed.map((result) => result.table),
      messages: failed.map((result) => result.error?.message),
    });
    return apiError(
      "ATLAS_2030_METRICS_UNAVAILABLE",
      "Os indicadores avançados ainda não estão disponíveis neste ambiente.",
      access.meta,
      { status: 503, headers: rate.headers },
    );
  }

  const metrics = Object.fromEntries(
    results.map((result) => [result.key, result.count]),
  ) as Record<keyof typeof metricTables, number>;

  return apiSuccess(
    {
      metrics,
      scope: {
        organizationId,
        tenantFiltered: true,
      },
    },
    access.meta,
    { headers: rate.headers },
  );
}
