import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "system-health" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Diagnóstico do ambiente é exclusivo da diretoria.", identity.meta, { status: 403 });
  const started = Date.now(); const dbStarted = Date.now();
  const { error: databaseError } = await identity.supabase.from("organizations").select("id", { head: true }).eq("id", identity.access.organization.id);
  const required = {
    application: true, authentication: true, database: !databaseError,
    hostinger: process.env.ATLAS_HOSTING_PROVIDER === "hostinger",
    publicHttps: /^https:\/\//i.test(process.env.ATLAS_BASE_URL || ""),
    workerSecret: Boolean(process.env.ATLAS_CRON_SECRET),
  };
  const optional = {
    openai: Boolean(process.env.OPENAI_API_KEY), perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
    meta: Boolean(process.env.META_APP_SECRET && process.env.META_LEAD_ACCESS_TOKEN),
    whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  };
  return apiSuccess({ status: Object.values(required).every(Boolean) ? "ready" : "not_ready", required, optional, metrics: { databaseLatencyMs: Date.now() - dbStarted, totalLatencyMs: Date.now() - started, uptimeSeconds: Math.floor(process.uptime()) }, runtime: { node: process.version, environment: process.env.ATLAS_ENV || "unknown", version: process.env.npm_package_version || "unknown" }, publicEndpoints: ["/api/v1/health", "/api/v1/ready"], valuesReturned: false }, identity.meta, { status: 200, headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
