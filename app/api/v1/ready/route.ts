import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiSuccess, createRequestContext, structuredApiLog } from "@/lib/api/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const meta = createRequestContext(request);
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number }> = {};

  try {
    const dbStartedAt = Date.now();
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    checks.database = {
      ok: !error,
      latencyMs: Date.now() - dbStartedAt,
    };
  } catch {
    checks.database = { ok: false };
  }

  const ready = Object.values(checks).every((check) => check.ok);
  const data = {
    service: "atlas-api-platform",
    status: ready ? "ready" : "not_ready",
    latencyMs: Date.now() - startedAt,
    checks,
  };

  structuredApiLog(ready ? "info" : "warn", "api.readiness.checked", request, meta, {
    ready,
    latencyMs: data.latencyMs,
  });

  return apiSuccess(data, meta, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
