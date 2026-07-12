import type { NextRequest } from "next/server";
import { apiSuccess, createRequestContext, structuredApiLog } from "@/lib/api/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const meta = createRequestContext(request);
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabasePublicKey = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const healthy = hasSupabaseUrl && hasSupabasePublicKey;

  structuredApiLog(healthy ? "info" : "warn", "api.health.checked", request, meta, {
    healthy,
  });

  return apiSuccess(
    {
      service: "atlas-api-platform",
      status: healthy ? "ok" : "degraded",
      checks: {
        application: "ok",
        supabaseConfiguration: healthy ? "ok" : "missing",
      },
    },
    meta,
    { status: healthy ? 200 : 503 },
  );
}
