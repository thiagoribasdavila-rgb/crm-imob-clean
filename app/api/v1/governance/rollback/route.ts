import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildV3ReleaseRollbackNotes,
  isDifferentHttpsReleaseTarget,
  V3_RELEASE_ROLLBACK_MARKER,
  v3ReleaseRollbackSteps,
} from "@/lib/governance/recovery-contract";

export const dynamic = "force-dynamic";

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
    identity.supabase
      .from("v2_rollback_drills")
      .select("*")
      .like("notes", `${V3_RELEASE_ROLLBACK_MARKER}%`)
      .order("created_at", { ascending: false })
      .limit(50),
    identity.supabase.from("homologation_backup_evidence").select("id,provider,snapshot_reference,snapshot_created_at").eq("restore_status", "passed").order("snapshot_created_at", { ascending: false }),
  ]);
  if (drills.error || backups.error) return apiError("ROLLBACK_UNAVAILABLE", "A estrutura de recuperação ainda não está disponível.", identity.meta, { status: 503 });
  return apiSuccess({
    drills: (drills.data ?? []).map((drill) => ({
      ...drill,
      target_release_url: drill.target_v2_url,
    })),
    eligibleBackups: backups.data ?? [],
    plan: v3ReleaseRollbackSteps,
    policy: {
      strategy: "previous_v3_release",
      databaseRestoreRequired: true,
      storageEvidenceRequired: true,
      immutableArtifactRequired: true,
      legacyV2Accepted: false,
    },
  }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 10, scope: "rollback-write" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(identity.access.profile.role, identity.access.profile.commercialRole)) return apiError("FORBIDDEN", "Somente a diretoria registra ensaios.", identity.meta, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const backupId = String(body?.backupEvidenceId || "");
  const targetUrl = String(body?.targetReleaseUrl || "").trim().slice(0, 500);
  const releaseVersion = String(body?.releaseVersion || "").trim().slice(0, 80);
  const artifactReference = String(body?.artifactReference || "").trim().slice(0, 300);
  const storageEvidenceReference = String(body?.storageEvidenceReference || "").trim().slice(0, 300);
  const startedAt = String(body?.startedAt || "");
  const completedAt = String(body?.completedAt || "");
  const status = String(body?.status || "");
  const evidence = String(body?.evidenceReference || "").trim().slice(0, 500);
  const healthStatus = Number(body?.healthCheckStatus);
  if (
    !/^[0-9a-f-]{36}$/i.test(backupId) ||
    !isDifferentHttpsReleaseTarget(targetUrl, process.env.ATLAS_BASE_URL)
  ) {
    return apiError(
      "INVALID_ROLLBACK_TARGET",
      "Selecione o backup e informe uma URL HTTPS da versão anterior do V3, diferente da versão atual.",
      identity.meta,
      { status: 400 },
    );
  }
  if (
    releaseVersion.length < 2 ||
    artifactReference.length < 4 ||
    storageEvidenceReference.length < 4
  ) {
    return apiError(
      "RECOVERY_EVIDENCE_REQUIRED",
      "Informe versão, pacote imutável e evidência separada dos arquivos.",
      identity.meta,
      { status: 400 },
    );
  }
  if (!["passed", "failed"].includes(status) || !startedAt || !completedAt || Number.isNaN(Date.parse(startedAt)) || Number.isNaN(Date.parse(completedAt)) || evidence.length < 4) return apiError("INVALID_ROLLBACK_EVIDENCE", "Informe resultado, período e evidência do ensaio.", identity.meta, { status: 400 });
  const duration = Math.ceil((Date.parse(completedAt) - Date.parse(startedAt)) / 60_000);
  if (duration < 0 || duration > 1440 || !Number.isInteger(healthStatus) || healthStatus < 100 || healthStatus > 599) return apiError("INVALID_ROLLBACK_METRICS", "Tempo ou resposta HTTP inválidos.", identity.meta, { status: 400 });
  if (status === "passed" && (healthStatus < 200 || healthStatus > 399)) {
    return apiError(
      "ROLLBACK_HEALTHCHECK_FAILED",
      "Um ensaio aprovado exige resposta HTTP entre 200 e 399.",
      identity.meta,
      { status: 400 },
    );
  }
  const { data, error } = await identity.supabase.from("v2_rollback_drills").insert({
    organization_id: identity.access.organization.id,
    backup_evidence_id: backupId,
    target_v2_url: targetUrl,
    status,
    started_at: new Date(startedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
    duration_minutes: duration,
    v3_preserved: true,
    health_check_status: healthStatus,
    evidence_reference: evidence,
    notes: buildV3ReleaseRollbackNotes({
      releaseVersion,
      artifactReference,
      storageEvidenceReference,
      notes: String(body?.notes || ""),
    }),
    responsible_id: identity.access.profile.id,
  }).select("*").single();
  if (error) return apiError("ROLLBACK_DRILL_FAILED", "O ensaio exige backup restaurado da mesma empresa.", identity.meta, { status: 400 });
  return apiSuccess({
    drill: {
      ...data,
      target_release_url: data.target_v2_url,
    },
  }, identity.meta, { status: 201, headers: rate.headers });
}
