import type { NextRequest } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { featureSnapshot } from "@/lib/platform/feature-flags";
import { apiSuccess, createRequestContext, structuredApiLog } from "@/lib/api/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const meta = createRequestContext(request);
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};

  try {
    const dbStartedAt = Date.now();
    const supabase = getSupabase();
    const { error } = await supabase
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .limit(1);

    checks.database = {
      ok: !error,
      latencyMs: Date.now() - dbStartedAt,
      ...(error ? { detail: error.message } : {}),
    };
  } catch (error) {
    checks.database = {
      ok: false,
      detail: error instanceof Error ? error.message : "Falha desconhecida",
    };
  }

  const ready = Object.values(checks).every((check) => check.ok);
  const data = {
    service: "atlas-api-platform",
    status: ready ? "ready" : "not_ready",
    environment: process.env.ATLAS_ENV || process.env.NODE_ENV || "unknown",
    latencyMs: Date.now() - startedAt,
    checks,
    features: featureSnapshot(),
  };

  structuredApiLog(ready ? "info" : "warn", "api.readiness.checked", request, meta, {
    ready,
    latencyMs: data.latencyMs,
  });

  return apiSuccess(data, meta, { status: ready ? 200 : 503 });
}
