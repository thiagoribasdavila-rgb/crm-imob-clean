import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    scope: "settings.profile.read",
  });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const result = await access.supabase
    .from("profiles")
    .select("id,name,full_name,role,commercial_role,availability_status")
    .eq("id", access.access.profile.id)
    .eq("organization_id", access.access.organization.id)
    .maybeSingle();
  if (result.error || !result.data) {
    structuredApiLog("error", "settings.profile_read_failed", request, access.meta, {
      userId: access.access.profile.id,
      organizationId: access.access.organization.id,
      message: result.error?.message,
    });
    return apiError(
      "PROFILE_LOAD_FAILED",
      "Não foi possível carregar seu perfil agora.",
      access.meta,
      { status: 503, headers: rate.headers },
    );
  }

  return apiSuccess({
    profile: {
      id: result.data.id,
      name: result.data.full_name || result.data.name || access.access.profile.name,
      role: result.data.commercial_role || result.data.role,
      availabilityStatus: result.data.availability_status || "OFFLINE",
    },
    user: {
      email: access.user.email,
    },
  }, access.meta, { headers: rate.headers });
}

export async function PATCH(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 10,
    windowMs: 60_000,
    scope: "settings.profile.write",
  });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const body = await request.json().catch(() => null) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 120) {
    return apiError(
      "INVALID_PROFILE_NAME",
      "Informe um nome entre 2 e 120 caracteres.",
      access.meta,
      { status: 400, headers: rate.headers },
    );
  }
  if (name === access.access.profile.name) {
    return apiSuccess({
      profile: { id: access.access.profile.id, name },
      audited: true,
      unchanged: true,
    }, access.meta, { headers: rate.headers });
  }

  const admin = getSupabaseAdmin();
  const profileId = access.access.profile.id;
  const organizationId = access.access.organization.id;
  const previousName = access.access.profile.name;
  const update = await admin
    .from("profiles")
    .update({ name, full_name: name })
    .eq("id", profileId)
    .eq("organization_id", organizationId)
    .select("id,name,full_name")
    .single();
  if (update.error || !update.data) {
    structuredApiLog("error", "settings.profile_update_failed", request, access.meta, {
      userId: profileId,
      organizationId,
      message: update.error?.message,
    });
    return apiError(
      "PROFILE_SAVE_FAILED",
      "Não foi possível salvar seu perfil.",
      access.meta,
      { status: 503, headers: rate.headers },
    );
  }

  const audit = await admin.from("atlas_events").insert({
    organization_id: organizationId,
    event_type: "profile.settings_updated",
    source: "atlas-settings",
    aggregate_type: "profile",
    aggregate_id: profileId,
    payload: {
      actorId: profileId,
      changedFields: ["name"],
    },
    correlation_id: access.meta.correlationId,
  });
  if (audit.error) {
    const rollback = await admin
      .from("profiles")
      .update({ name: previousName, full_name: previousName })
      .eq("id", profileId)
      .eq("organization_id", organizationId);
    structuredApiLog("error", "settings.profile_audit_failed", request, access.meta, {
      userId: profileId,
      organizationId,
      auditMessage: audit.error.message,
      rollbackSucceeded: !rollback.error,
      rollbackMessage: rollback.error?.message,
    });
    return apiError(
      "PROFILE_AUDIT_FAILED",
      rollback.error
        ? "A alteração requer revisão administrativa antes de novo uso."
        : "A alteração foi desfeita porque a auditoria não estava disponível.",
      access.meta,
      { status: 503, headers: rate.headers },
    );
  }

  return apiSuccess({
    profile: {
      id: update.data.id,
      name: update.data.full_name || update.data.name,
    },
    audited: true,
  }, access.meta, { headers: rate.headers });
}
