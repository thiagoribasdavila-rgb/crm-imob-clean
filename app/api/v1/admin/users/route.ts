import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "admin.users.list" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { accessRoles: ["admin"] });
  if (!identity.ok) return identity.response;

  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("id,full_name,phone,role,access_role,commercial_role,active,created_at")
    .eq("organization_id", identity.access.organization.id)
    .order("full_name")
    .limit(1000);
  if (error) return apiError("USERS_LOOKUP_FAILED", "Não foi possível carregar os acessos.", identity.meta, { status: 500 });
  return apiSuccess({ profiles: data ?? [] }, identity.meta, { headers: rate.headers });
}

export async function PATCH(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 20, windowMs: 15 * 60_000, scope: "admin.users.update" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { accessRoles: ["admin"] });
  if (!identity.ok) return identity.response;
  const body = await request.json().catch(() => null) as { profileId?: string; active?: boolean } | null;
  if (!body?.profileId || typeof body.active !== "boolean" || body.profileId === identity.access.profile.id) {
    return apiError("INVALID_USER_UPDATE", "Alteração de acesso inválida.", identity.meta, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: target, error: lookupError } = await admin.from("profiles").select("id,access_role").eq("id", body.profileId).eq("organization_id", identity.access.organization.id).maybeSingle();
  if (lookupError || !target) return apiError("USER_NOT_FOUND", "Usuário não encontrado nesta organização.", identity.meta, { status: 404 });
  if (target.access_role === "admin") return apiError("ADMIN_PROTECTED", "Outro administrador não pode ser desativado por esta tela.", identity.meta, { status: 409 });

  const { error } = await admin.from("profiles").update({ active: body.active }).eq("id", body.profileId).eq("organization_id", identity.access.organization.id);
  if (error) return apiError("USER_UPDATE_FAILED", "Não foi possível atualizar o acesso.", identity.meta, { status: 409 });
  structuredApiLog("info", "admin.user_access_updated", request, identity.meta, { actorId: identity.access.profile.id, profileId: body.profileId, active: body.active });
  return apiSuccess({ id: body.profileId, active: body.active }, identity.meta, { headers: rate.headers });
}
