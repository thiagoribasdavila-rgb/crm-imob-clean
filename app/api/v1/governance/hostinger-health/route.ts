import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";
const runtime = globalThis as typeof globalThis & { __atlasBootId?: string; __atlasBootedAt?: string };
runtime.__atlasBootId ??= crypto.randomUUID();
runtime.__atlasBootedAt ??= new Date().toISOString();

function isDirector(role: string, commercialRole: string | null) { return role === "admin" || commercialRole === "director"; }

async function snapshot(identity: Awaited<ReturnType<typeof requireAccessContext>>) {
  if (!identity.ok) throw new Error("Identidade inválida.");
  const startedAt = Date.now();
  const { error } = await identity.supabase.from("organizations").select("id", { head: true }).eq("id", identity.access.organization.id);
  const memory = process.memoryUsage();
  return {
    status: error ? "degraded" : "healthy",
    bootId: runtime.__atlasBootId,
    bootedAt: runtime.__atlasBootedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memoryMb: { rss: Math.round(memory.rss / 1_048_576), heapUsed: Math.round(memory.heapUsed / 1_048_576) },
    database: { ok: !error, latencyMs: Date.now() - startedAt },
    hostinger: process.env.ATLAS_HOSTING_PROVIDER === "hostinger",
    environment: process.env.ATLAS_ENV || "unknown",
    pm2: { detected: process.env.pm_id !== undefined, instance: process.env.NODE_APP_INSTANCE ?? null },
    operations: { cronConfigured: Boolean(process.env.ATLAS_CRON_SECRET), logsConfigured: Boolean(process.env.pm_out_log_path && process.env.pm_err_log_path) },
  };
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "hostinger-health-read" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  if (!isDirector(identity.access.profile.role, identity.access.profile.commercialRole)) return apiError("FORBIDDEN", "Saúde da infraestrutura é exclusiva da diretoria.", identity.meta, { status: 403 });
  const current = await snapshot(identity);
  const { data, error } = await identity.supabase.from("hostinger_restart_drills").select("*").order("created_at", { ascending: false }).limit(20);
  if (error) return apiError("HOSTINGER_DRILLS_UNAVAILABLE", "Aplique a migração da Fase 18.", identity.meta, { status: 503 });
  return apiSuccess({ current, drills: data ?? [] }, identity.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 10, scope: "hostinger-health-write" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  if (!isDirector(identity.access.profile.role, identity.access.profile.commercialRole)) return apiError("FORBIDDEN", "Somente a diretoria executa ensaios de reinício.", identity.meta, { status: 403 });
  const current = await snapshot(identity); const body = await request.json().catch(() => null) as Record<string, unknown> | null; const action = String(body?.action || "");
  if (!current.hostinger) return apiError("HOSTINGER_REQUIRED", "O ensaio deve ocorrer no ambiente Hostinger.", identity.meta, { status: 409 });
  if (action === "start") {
    const { data, error } = await identity.supabase.from("hostinger_restart_drills").insert({ organization_id: identity.access.organization.id, before_boot_id: current.bootId, responsible_id: identity.access.profile.id }).select("*").single();
    if (error) return apiError("RESTART_DRILL_START_FAILED", "Não foi possível iniciar o ensaio.", identity.meta, { status: 400 });
    return apiSuccess({ drill: data, instruction: "Execute pm2 restart atlas-v3-homolog e volte para comprovar a recuperação." }, identity.meta, { status: 201, headers: rate.headers });
  }
  if (action === "complete") {
    const id = String(body?.id || ""); const evidence = String(body?.logEvidenceReference || "").trim().slice(0, 500); const requestedStatus = body?.status === "failed" ? "failed" : "passed";
    const { data: drill } = await identity.supabase.from("hostinger_restart_drills").select("id,before_boot_id,started_at,status").eq("id", id).eq("status", "waiting_restart").maybeSingle();
    if (!drill || evidence.length < 4) return apiError("RESTART_EVIDENCE_REQUIRED", "Ensaio pendente e evidência de log são obrigatórios.", identity.meta, { status: 400 });
    const changed = drill.before_boot_id !== current.bootId; const status = requestedStatus === "passed" && changed && current.status === "healthy" ? "passed" : "failed"; const completedAt = new Date();
    const { data, error } = await identity.supabase.from("hostinger_restart_drills").update({ status, after_boot_id: current.bootId, completed_at: completedAt.toISOString(), recovery_seconds: Math.max(0, Math.round((completedAt.getTime() - Date.parse(drill.started_at)) / 1000)), ready_after_restart: current.status === "healthy", log_evidence_reference: evidence, notes: String(body?.notes || "").trim().slice(0, 2000) || null, updated_at: completedAt.toISOString() }).eq("id", drill.id).select("*").single();
    if (error) return apiError("RESTART_DRILL_COMPLETE_FAILED", "Não foi possível concluir o ensaio.", identity.meta, { status: 400 });
    return apiSuccess({ drill: data, current }, identity.meta, { headers: rate.headers });
  }
  return apiError("INVALID_ACTION", "Ação inválida.", identity.meta, { status: 400 });
}
