import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

function clampLimit(raw: string | null) {
  const parsed = Number(raw ?? "120");
  if (!Number.isFinite(parsed)) return 120;
  return Math.min(500, Math.max(1, Math.trunc(parsed)));
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 90,
    windowMs: 60_000,
    scope: "properties.list",
  });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker", "viewer"],
  });
  if (!access.ok) return access.response;

  const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
  const { data, error, count } = await access.supabase
    .from("properties")
    .select(
      "id,title,location,city,price,bedrooms,area,status,development_id,updated_at",
      { count: "exact" },
    )
    .eq("organization_id", access.access.organization.id)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    structuredApiLog("error", "properties.list_failed", request, access.meta, {
      organizationId: access.access.organization.id,
      message: error.message,
    });
    return apiError(
      "PROPERTIES_QUERY_FAILED",
      "Não foi possível carregar o portfólio agora.",
      access.meta,
      { status: 500, headers: rate.headers },
    );
  }

  return apiSuccess(
    {
      items: data ?? [],
      total: count ?? 0,
      scope: {
        organizationId: access.access.organization.id,
        tenantFiltered: true,
      },
    },
    access.meta,
    { headers: rate.headers },
  );
}
