import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import commandCenterContract from "@/config/command-center.json";

export const dynamic = "force-dynamic";

type QueryResult = { count: number | null; error: { message: string } | null };
function countOf(result: QueryResult) { return result.error ? null : result.count ?? 0; }

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "command-center" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Command Center executivo é exclusivo da diretoria.", identity.meta, { status: 403 });

  const dbStarted = Date.now();
  const [organization, tasks, approvals, queued, failed, backupsPassed, backupsPending, homologPassed, homologFailed, usage] = await Promise.all([
    identity.supabase.from("organizations").select("id", { count: "exact", head: true }).eq("id", identity.access.organization.id),
    identity.supabase.from("tasks").select("id", { count: "exact", head: true }).not("status", "in", "(done,concluida)"),
    identity.supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    identity.supabase.from("integration_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
    identity.supabase.from("integration_outbox").select("id", { count: "exact", head: true }).in("status", ["failed", "dead_letter"]),
    identity.supabase.from("homologation_backup_evidence").select("id", { count: "exact", head: true }).eq("restore_status", "passed"),
    identity.supabase.from("homologation_backup_evidence").select("id", { count: "exact", head: true }).in("restore_status", ["pending", "failed"]),
    identity.supabase.from("homologation_results").select("id", { count: "exact", head: true }).eq("outcome", "passed"),
    identity.supabase.from("homologation_results").select("id", { count: "exact", head: true }).eq("outcome", "failed"),
    identity.supabase.from("ai_usage_events").select("estimated_cost_usd,total_tokens,latency_ms").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(5_000),
  ]);

  const databaseOk = !organization.error;
  const queueFailed = countOf(failed);
  const restorePassed = countOf(backupsPassed);
  const critical = {
    database: databaseOk,
    https: /^https:\/\//i.test(process.env.ATLAS_BASE_URL || ""),
    workerSecret: Boolean(process.env.ATLAS_CRON_SECRET),
    failedOutbox: queueFailed === null ? null : queueFailed === 0,
    restoreEvidence: restorePassed === null ? null : restorePassed > 0,
  };
  const aiUsage = (usage.data ?? []).reduce((total, row) => ({ calls: total.calls + 1, tokens: total.tokens + Number(row.total_tokens || 0), costUsd: total.costUsd + Number(row.estimated_cost_usd || 0), latencyMs: total.latencyMs + Number(row.latency_ms || 0) }), { calls: 0, tokens: 0, costUsd: 0, latencyMs: 0 });
  const integrations = {
    openai: Boolean(process.env.OPENAI_API_KEY),
    perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
    meta: Boolean(process.env.META_APP_SECRET && process.env.META_LEAD_ACCESS_TOKEN),
    whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  };
  const knownCritical = Object.values(critical).filter((value) => value !== null);
  const status = knownCritical.every(Boolean) && knownCritical.length === Object.keys(critical).length ? "ready" : knownCritical.some((value) => value === false) ? "blocked" : "unknown";

  return apiSuccess({
    status,
    generatedAt: new Date().toISOString(),
    refreshSeconds: commandCenterContract.refreshSeconds,
    scope: { role: "director", organizationId: identity.access.organization.id },
    health: { databaseOk, databaseLatencyMs: Date.now() - dbStarted, uptimeSeconds: Math.floor(process.uptime()), environment: process.env.ATLAS_ENV || "unknown", hosting: process.env.ATLAS_HOSTING_PROVIDER === "hostinger" ? "hostinger" : "unconfirmed" },
    security: { publicSecretExposure: 0, valuesReturned: false, governed: true },
    integrations: Object.fromEntries(Object.entries(integrations).map(([key, configured]) => [key, { state: configured ? "configured" : "pending", realTestRequired: true }])),
    queues: { tasks: countOf(tasks), approvals: countOf(approvals), pendingOutbox: countOf(queued), failedOutbox: queueFailed },
    resilience: { restorePassed, restorePendingOrFailed: countOf(backupsPending) },
    homologation: { passed: countOf(homologPassed), failed: countOf(homologFailed) },
    ai: { calls30d: aiUsage.calls, tokens30d: aiUsage.tokens, estimatedCostUsd30d: Number(aiUsage.costUsd.toFixed(6)), averageLatencyMs30d: aiUsage.calls ? Math.round(aiUsage.latencyMs / aiUsage.calls) : 0, measured: !usage.error },
    critical,
    truthPolicy: commandCenterContract.truthPolicy,
  }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
