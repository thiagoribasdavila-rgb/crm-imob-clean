import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

function isDirector(role: string, commercialRole: string | null) {
  return role === "admin" || commercialRole === "director";
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "governance-backups-read" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity.access.profile.role, identity.access.profile.commercialRole)) {
    return apiError("FORBIDDEN", "Evidências de backup são exclusivas da diretoria.", identity.meta, { status: 403 });
  }

  const { data, error } = await identity.supabase
    .from("homologation_backup_evidence")
    .select("id,environment,provider,snapshot_reference,snapshot_created_at,restore_status,restore_tested_at,restore_duration_minutes,evidence_reference,notes,responsible_id,created_at")
    .order("snapshot_created_at", { ascending: false })
    .limit(50);
  if (error) return apiError("BACKUP_EVIDENCE_UNAVAILABLE", "Aplique a migração da Fase 16.", identity.meta, { status: 503 });
  return apiSuccess({ records: data ?? [] }, identity.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 20, scope: "governance-backups-write" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity.access.profile.role, identity.access.profile.commercialRole)) {
    return apiError("FORBIDDEN", "Somente a diretoria registra evidências de backup.", identity.meta, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const provider = String(body?.provider || "").trim().slice(0, 80);
  const snapshotReference = String(body?.snapshotReference || "").trim().slice(0, 240);
  const snapshotCreatedAt = String(body?.snapshotCreatedAt || "");
  const restoreStatus = String(body?.restoreStatus || "pending");
  const evidenceReference = String(body?.evidenceReference || "").trim().slice(0, 500) || null;
  const restoreTestedAt = body?.restoreTestedAt ? String(body.restoreTestedAt) : null;
  const restoreDuration = body?.restoreDurationMinutes === "" || body?.restoreDurationMinutes == null
    ? null
    : Number(body.restoreDurationMinutes);

  if (provider.length < 2 || snapshotReference.length < 4 || !snapshotCreatedAt || Number.isNaN(Date.parse(snapshotCreatedAt))) {
    return apiError("INVALID_BACKUP", "Informe provedor, referência e data válida do snapshot.", identity.meta, { status: 400 });
  }
  if (!["pending", "passed", "failed"].includes(restoreStatus)) {
    return apiError("INVALID_RESTORE_STATUS", "Situação de restauração inválida.", identity.meta, { status: 400 });
  }
  if (restoreStatus !== "pending" && (!restoreTestedAt || Number.isNaN(Date.parse(restoreTestedAt)) || !evidenceReference)) {
    return apiError("RESTORE_EVIDENCE_REQUIRED", "Teste concluído exige data e referência da evidência.", identity.meta, { status: 400 });
  }
  if (restoreDuration !== null && (!Number.isInteger(restoreDuration) || restoreDuration < 0 || restoreDuration > 10080)) {
    return apiError("INVALID_RESTORE_DURATION", "Duração de restauração inválida.", identity.meta, { status: 400 });
  }

  const { data, error } = await identity.supabase.from("homologation_backup_evidence").insert({
    organization_id: identity.access.organization.id,
    environment: "homologation",
    provider,
    snapshot_reference: snapshotReference,
    snapshot_created_at: new Date(snapshotCreatedAt).toISOString(),
    restore_status: restoreStatus,
    restore_tested_at: restoreTestedAt ? new Date(restoreTestedAt).toISOString() : null,
    restore_duration_minutes: restoreDuration,
    evidence_reference: evidenceReference,
    notes: String(body?.notes || "").trim().slice(0, 2000) || null,
    responsible_id: identity.access.profile.id,
  }).select("id,environment,provider,snapshot_reference,snapshot_created_at,restore_status,restore_tested_at,restore_duration_minutes,evidence_reference,notes,responsible_id,created_at").single();
  if (error) return apiError("BACKUP_EVIDENCE_FAILED", "Não foi possível registrar a evidência.", identity.meta, { status: 400 });
  return apiSuccess({ record: data }, identity.meta, { status: 201, headers: rate.headers });
}
