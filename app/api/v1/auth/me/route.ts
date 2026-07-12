import type { NextRequest } from "next/server";
import { apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "auth.me" });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  structuredApiLog("info", "auth.me.success", request, access.meta, {
    userId: access.user.id,
    organizationId: access.access.organization.id,
    role: access.access.profile.role,
  });

  return apiSuccess(
    {
      user: {
        id: access.user.id,
        email: access.user.email ?? null,
        emailConfirmed: Boolean(access.user.email_confirmed_at),
      },
      profile: access.access.profile,
      organization: access.access.organization,
    },
    access.meta,
    { headers: rate.headers },
  );
}
