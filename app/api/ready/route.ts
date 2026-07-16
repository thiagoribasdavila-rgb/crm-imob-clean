import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { featureSnapshot } from "@/lib/platform/feature-flags";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};

  try {
    const dbStartedAt = Date.now();
    const supabase = getSupabase();
    const { error } = await supabase.from("organizations").select("id", { head: true, count: "exact" }).limit(1);
    checks.database = {
      ok: !error,
      latencyMs: Date.now() - dbStartedAt,
      detail: error?.message,
    };
  } catch (error) {
    checks.database = {
      ok: false,
      detail: error instanceof Error ? error.message : "Falha desconhecida",
    };
  }

  const ready = Object.values(checks).every((check) => check.ok);
  const body = {
    status: ready ? "ready" : "not_ready",
    service: "atlas-ai-os",
    version: process.env.npm_package_version || "unknown",
    environment: process.env.ATLAS_ENV || process.env.NODE_ENV || "unknown",
    latencyMs: Date.now() - startedAt,
    checks,
    features: featureSnapshot(),
    timestamp: new Date().toISOString(),
  };

  if (!ready) logger.warn("readiness.failed", body);
  return NextResponse.json(body, { status: ready ? 200 : 503 });
}
