import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateReliabilityGate } from "@/lib/governance/reliability-release-gate";

export const dynamic = "force-dynamic";

async function evidence(organizationId: string) {
  const admin = getSupabaseAdmin();
  const started = Date.now();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [organization, failed, pendingCount, oldestPending, deadLetters, usage, restores] = await Promise.all([
    admin.from("organizations").select("id", { head: true }).eq("id", organizationId),
    admin.from("integration_outbox").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["failed", "dead_letter"]),
    admin.from("integration_outbox").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["pending", "processing"]),
    admin.from("integration_outbox").select("created_at").eq("organization_id", organizationId).in("status", ["pending", "processing"]).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    admin.from("dead_letter_events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("resolved", false),
    admin.from("ai_usage_events").select("latency_ms", { count: "exact" }).eq("organization_id", organizationId).gte("created_at", since).not("latency_ms", "is", null).order("created_at", { ascending: false }).limit(5000),
    admin.from("homologation_backup_evidence").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("restore_status", "passed"),
  ]);
  const queryResults = { organization, failed, pendingCount, oldestPending, deadLetters, usage, restores };
  const evidenceErrors = Object.entries(queryResults).filter(([, result]) => result.error).map(([key]) => key);
  const latencies = (usage.data ?? []).map((row) => Number(row.latency_ms)).filter(Number.isFinite).sort((a, b) => a - b);
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : null;
  const oldest = oldestPending.data?.created_at ? Math.max(0, Math.round((Date.now() - new Date(oldestPending.data.created_at).getTime()) / 60_000)) : null;
  const memory = process.memoryUsage();
  return {
    databaseOk: !organization.error,
    evidenceComplete: evidenceErrors.length === 0,
    evidenceErrors,
    databaseLatencyMs: Date.now() - started,
    memoryRssMb: Math.round(memory.rss / 1_048_576),
    failedOutbox: failed.count ?? 0,
    pendingOutbox: pendingCount.count ?? 0,
    oldestPendingMinutes: oldest,
    unresolvedDeadLetters: deadLetters.count ?? 0,
    aiP95LatencyMs: p95,
    aiLatencySampleSize: latencies.length,
    aiLatencyPopulation: usage.count ?? latencies.length,
    backupRestorePassed: (restores.count ?? 0) > 0,
    https: /^https:\/\//.test(process.env.ATLAS_BASE_URL || ""),
    cronConfigured: Boolean(process.env.ATLAS_CRON_SECRET),
    logsConfigured: Boolean(process.env.pm_out_log_path && process.env.pm_err_log_path),
  };
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "reliability-gate.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["director"] });
  if (!access.ok) return access.response;
  const currentEvidence = await evidence(access.access.organization.id);
  const assessment = evaluateReliabilityGate(currentEvidence);
  const { data, error } = await getSupabaseAdmin().from("reliability_release_snapshots").select("id,status,score,blocking,created_at").eq("organization_id", access.access.organization.id).order("created_at", { ascending: false }).limit(20);
  if (error) return apiError("RELIABILITY_GATE_UNAVAILABLE", "Aplique a migration da Fase 98.", access.meta, { status: 503 });
  return apiSuccess({ current: { evidence: currentEvidence, ...assessment }, snapshots: data ?? [], thresholds: { databaseLatencyMs: 500, memoryRssMb: 1024, queueAgeMinutes: 15, unresolvedDeadLetters: 0, aiP95LatencyMs: 15000, aiLatencySampleLimit: 5000 }, policy: { directorOnly: true, missingEvidenceBlocks: true, automaticPublish: false, humanReleaseApprovalRequired: true, rawLogsReturned: false, secretsReturned: false } }, access.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 6, scope: "reliability-gate.snapshot" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["director"] });
  if (!access.ok) return access.response;
  let body: { action?: string };
  try { body = await request.json(); } catch { return apiError("INVALID_JSON", "Envie JSON válido.", access.meta, { status: 400 }); }
  if (body.action !== "snapshot") return apiError("INVALID_ACTION", "Use snapshot.", access.meta, { status: 400 });
  const currentEvidence = await evidence(access.access.organization.id);
  const assessment = evaluateReliabilityGate(currentEvidence);
  const hash = createHash("sha256").update(JSON.stringify({ currentEvidence, assessment })).digest("hex");
  const { data, error } = await getSupabaseAdmin().from("reliability_release_snapshots").upsert({ organization_id: access.access.organization.id, status: assessment.status, score: assessment.score, evidence: currentEvidence, controls: assessment.controls, blocking: assessment.blocking, snapshot_hash: hash, created_by: access.access.profile.id }, { onConflict: "organization_id,snapshot_hash", ignoreDuplicates: true }).select("id,status,score,blocking,created_at").maybeSingle();
  if (error) return apiError("RELIABILITY_SNAPSHOT_FAILED", "Não foi possível registrar o gate.", access.meta, { status: 409 });
  return apiSuccess({ snapshot: data, duplicatePrevented: !data, productionPublished: false }, access.meta, { status: data ? 201 : 200, headers: rate.headers });
}
