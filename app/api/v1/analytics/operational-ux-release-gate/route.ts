import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext, resolveCommercialRole } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { evaluateOperationalUxRelease, OPERATIONAL_UX_RELEASE_FLAG, type ReleaseGateStatus } from "@/lib/analytics/operational-ux-release-gate";

export const dynamic = "force-dynamic";

type GateRules = {
  status?: ReleaseGateStatus;
  experienceVersion?: string;
  rollbackTarget?: string;
  checklist?: unknown[];
  utilityRating?: number;
  directorReason?: string;
  decidedAt?: string;
  decidedBy?: string;
  rollbackReason?: string;
};

async function loadEvidence(organizationId: string) {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const result = await getSupabaseAdmin().from("atlas_events").select("payload").eq("organization_id", organizationId).eq("event_type", "atlas.route_session_completed").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(10000);
  if (result.error) return { ok: false as const };
  return { ok: true as const, evidence: evaluateOperationalUxRelease(result.data ?? []) };
}

async function loadFlag(organizationId: string) {
  return getSupabaseAdmin().from("feature_flags").select("enabled,rules,updated_at").eq("organization_id", organizationId).eq("key", OPERATIONAL_UX_RELEASE_FLAG).maybeSingle();
}

function isDirector(role: string, accessRole: string) {
  return role === "director" || accessRole === "admin" || accessRole === "director_decisor";
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "operational-ux-release-gate" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const role = String(resolveCommercialRole({ role: access.access.profile.role, commercialRole: access.access.profile.commercialRole }));
  if (!["director", "superintendent", "manager"].includes(role) && access.access.profile.accessRole !== "admin") return apiError("FORBIDDEN", "Gate disponível para a gestão.", access.meta, { status: 403 });
  const [evidence, flag] = await Promise.all([loadEvidence(access.access.organization.id), loadFlag(access.access.organization.id)]);
  if (!evidence.ok) return apiError("RELEASE_EVIDENCE_UNAVAILABLE", "As evidências do gate ainda não estão disponíveis.", access.meta, { status: 503 });
  if (flag.error) return apiError("RELEASE_GATE_UNAVAILABLE", "O gate de liberação ainda não está disponível.", access.meta, { status: 503 });
  const rules = (flag.data?.rules ?? {}) as GateRules;
  const status = rules.status ?? evidence.evidence.recommendedStatus;
  return apiSuccess({ ...evidence.evidence, status, enabled: flag.data?.enabled === true, canDecide: isDirector(role, access.access.profile.accessRole), decision: flag.data ? { utilityRating: rules.utilityRating ?? null, directorReason: rules.directorReason ?? null, decidedAt: rules.decidedAt ?? null, rollbackReason: rules.rollbackReason ?? null, updatedAt: flag.data.updated_at } : null }, access.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 10, scope: "operational-ux-release-gate-decision" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  const role = String(resolveCommercialRole({ role: access.access.profile.role, commercialRole: access.access.profile.commercialRole }));
  if (!isDirector(role, access.access.profile.accessRole)) return apiError("FORBIDDEN", "Somente a Diretoria pode liberar ou reverter o redesign.", access.meta, { status: 403 });
  const body = await request.json().catch(() => null) as { action?: string; reason?: string; utilityRating?: number; checklistAcknowledged?: boolean } | null;
  const action = body?.action;
  const reason = body?.reason?.trim() ?? "";
  if (!['approve', 'rollback'].includes(action ?? "") || reason.length < 12 || reason.length > 1000) return apiError("INVALID_RELEASE_DECISION", "Informe a decisão e uma justificativa entre 12 e 1000 caracteres.", access.meta, { status: 422 });
  const evidence = await loadEvidence(access.access.organization.id);
  if (!evidence.ok) return apiError("RELEASE_EVIDENCE_UNAVAILABLE", "As evidências do gate ainda não estão disponíveis.", access.meta, { status: 503 });
  if (action === "approve") {
    const rating = Number(body?.utilityRating);
    if (!evidence.evidence.evidenceReady || body?.checklistAcknowledged !== true || !Number.isInteger(rating) || rating < 4 || rating > 5) return apiError("RELEASE_GATE_BLOCKED", "A liberação exige checklist aprovado, utilidade 4/5 ou 5/5 e evidências suficientes.", access.meta, { status: 409, details: { checklist: evidence.evidence.checklist } });
  }
  const now = new Date().toISOString();
  const enabled = action === "approve";
  const rules: GateRules = {
    status: enabled ? "approved" : "rolled_back",
    experienceVersion: evidence.evidence.experienceVersion,
    rollbackTarget: evidence.evidence.rollbackTarget,
    checklist: evidence.evidence.checklist,
    utilityRating: enabled ? Number(body?.utilityRating) : undefined,
    directorReason: enabled ? reason : undefined,
    rollbackReason: enabled ? undefined : reason,
    decidedAt: now,
    decidedBy: access.access.user.id,
  };
  const saved = await getSupabaseAdmin().from("feature_flags").upsert({ organization_id: access.access.organization.id, key: OPERATIONAL_UX_RELEASE_FLAG, enabled, rollout_percentage: enabled ? 100 : 0, rules, description: "Gate supervisionado do redesign operacional V30." }, { onConflict: "organization_id,key" }).select("enabled,rules,updated_at").single();
  if (saved.error) return apiError("RELEASE_GATE_SAVE_FAILED", "Não foi possível registrar a decisão de liberação.", access.meta, { status: 409 });
  return apiSuccess({ status: rules.status, enabled, rollbackTarget: evidence.evidence.rollbackTarget, recordedAt: saved.data.updated_at }, access.meta, { headers: rate.headers });
}

