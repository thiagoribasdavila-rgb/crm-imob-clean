import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

const rollbackSteps = [
  "Confirmar snapshot restaurado e evidência aprovada",
  "Congelar novas entradas no V3 durante a janela",
  "Apontar o tráfego público para o V2 preservado",
  "Validar login, leads, pipeline e integrações essenciais no V2",
  "Manter V3 online no subdomínio interno para diagnóstico",
  "Registrar tempo, resposta HTTP, responsável e evidência",
];

function isDirector(role: string, commercialRole: string | null) {
  return role === "admin" || commercialRole === "director";
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "rollback-read" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity.access.profile.role, identity.access.profile.commercialRole)) return apiError("FORBIDDEN", "Rollback é exclusivo da diretoria.", identity.meta, { status: 403 });
  const [drills, backups] = await Promise.all([
    identity.supabase.from("v2_rollback_drills").select("*").order("created_at", { ascending: false }).limit(50),
    identity.supabase.from("homologation_backup_evidence").select("id,provider,snapshot_reference,snapshot_created_at").eq("restore_status", "passed").order("snapshot_created_at", { ascending: false }),
  ]);
  if (drills.error || backups.error) return apiError("ROLLBACK_UNAVAILABLE", "Aplique a migração da Fase 17.", identity.meta, { status: 503 });
  return apiSuccess({ drills: drills.data ?? [], eligibleBackups: backups.data ?? [], plan: rollbackSteps }, identity.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 10, scope: "rollback-write" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity.access.profile.role, identity.access.profile.commercialRole)) return apiError("FORBIDDEN", "Somente a diretoria registra ensaios.", identity.meta, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const backupId = String(body?.backupEvidenceId || "");
  const targetUrl = String(body?.targetV2Url || "").trim().slice(0, 500);
  const startedAt = String(body?.startedAt || "");
  const completedAt = String(body?.completedAt || "");
  const status = String(body?.status || "");
  const evidence = String(body?.evidenceReference || "").trim().slice(0, 500);
  const healthStatus = Number(body?.healthCheckStatus);
  if (!/^[0-9a-f-]{36}$/i.test(backupId) || !/^https:\/\//i.test(targetUrl)) return apiError("INVALID_ROLLBACK_TARGET", "Selecione o backup e informe a URL HTTPS preservada do V2.", identity.meta, { status: 400 });
  if (!["passed", "failed"].includes(status) || !startedAt || !completedAt || Number.isNaN(Date.parse(startedAt)) || Number.isNaN(Date.parse(completedAt)) || evidence.length < 4) return apiError("INVALID_ROLLBACK_EVIDENCE", "Informe resultado, período e evidência do ensaio.", identity.meta, { status: 400 });
  const duration = Math.ceil((Date.parse(completedAt) - Date.parse(startedAt)) / 60_000);
  if (duration < 0 || duration > 1440 || !Number.isInteger(healthStatus) || healthStatus < 100 || healthStatus > 599) return apiError("INVALID_ROLLBACK_METRICS", "Tempo ou resposta HTTP inválidos.", identity.meta, { status: 400 });
  const { data, error } = await identity.supabase.from("v2_rollback_drills").insert({ organization_id: identity.access.organization.id, backup_evidence_id: backupId, target_v2_url: targetUrl, status, started_at: new Date(startedAt).toISOString(), completed_at: new Date(completedAt).toISOString(), duration_minutes: duration, v3_preserved: true, health_check_status: healthStatus, evidence_reference: evidence, notes: String(body?.notes || "").trim().slice(0, 2000) || null, responsible_id: identity.access.profile.id }).select("*").single();
  if (error) return apiError("ROLLBACK_DRILL_FAILED", "O ensaio exige backup restaurado da mesma empresa.", identity.meta, { status: 400 });
  return apiSuccess({ drill: data }, identity.meta, { status: 201, headers: rate.headers });
}
