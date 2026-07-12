import type { NextRequest } from "next/server";
import { apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAuthenticatedUser } from "@/lib/api/security";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "auth.me" });
  if (!rate.ok) return rate.response;

  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id, organization_id, role, active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) {
    structuredApiLog("error", "auth.me.profile_failed", request, auth.meta, {
      message: profileError.message,
    });
  }

  structuredApiLog("info", "auth.me.success", request, auth.meta, {
    userId: auth.user.id,
    organizationId: profile?.organization_id ?? null,
  });

  return apiSuccess(
    {
      user: {
        id: auth.user.id,
        email: auth.user.email ?? null,
        emailConfirmed: Boolean(auth.user.email_confirmed_at),
      },
      profile: profile ?? null,
    },
    auth.meta,
    { headers: rate.headers },
  );
}
