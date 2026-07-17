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
    integrations: {
      hostinger: process.env.ATLAS_HOSTING_PROVIDER === "hostinger", publicUrl: Boolean(process.env.ATLAS_BASE_URL), cron: Boolean(process.env.ATLAS_CRON_SECRET),
      openai: Boolean(process.env.OPENAI_API_KEY), perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
      metaLeads: Boolean(process.env.META_APP_SECRET && process.env.META_LEAD_ACCESS_TOKEN), metaConversions: Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN),
      metaInsights: Boolean(process.env.META_ADS_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID), whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      nightlyTemplate: Boolean(process.env.WHATSAPP_NIGHTLY_APPROACH_TEMPLATE),
    },
  };

  structuredApiLog(ready ? "info" : "warn", "api.readiness.checked", request, meta, {
    ready,
    latencyMs: data.latencyMs,
  });

  return apiSuccess(data, meta, { status: ready ? 200 : 503 });
}
