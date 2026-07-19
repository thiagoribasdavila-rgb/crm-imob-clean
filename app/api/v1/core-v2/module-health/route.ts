import type { NextRequest } from "next/server";
import { apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { readOperationalModuleHealth } from "@/lib/atlas/core-v2";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 90,
    scope: "atlas-core-v2.module-health",
  });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const result = await readOperationalModuleHealth(access.supabase, {
    organizationId: access.access.organization.id,
    limit: 500,
  });

  if (!result.snapshot.profiles.some((profile) => profile.id === access.access.profile.id)) {
    result.snapshot.profiles.push({
      id: access.access.profile.id,
      name: access.access.profile.name,
      role: access.access.profile.role,
      commercial_role: access.access.profile.commercialRole,
      organization_id: access.access.organization.id,
      active: access.access.profile.active,
    });
  }

  structuredApiLog("info", "atlas_core_v2.module_health_read", request, access.meta, {
    organizationId: access.access.organization.id,
    moduleStates: result.health.modules.map((module) => `${module.id}:${module.state}`),
    writeStates: result.health.modules.map((module) => `${module.id}:${module.write.state}`),
  });

  return apiSuccess(result, access.meta, {
    headers: { ...rate.headers, "Cache-Control": "no-store" },
  });
}
