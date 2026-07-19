import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { LIVE_PROFILE_SELECT, descendantsFromLiveProfiles, liveStorageRole, resolveLiveHierarchy } from "@/lib/compat/live-hierarchy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CommercialRole = "director" | "superintendent" | "manager" | "broker";
type TeamPayload = { email?: string; fullName?: string; commercialRole?: CommercialRole; reportsTo?: string | null };
type UpdatePayload = { profileId?: string; commercialRole?: CommercialRole; reportsTo?: string | null; active?: boolean };
const roles = new Set<CommercialRole>(["director", "superintendent", "manager", "broker"]);

function resolvedRole(profile: { role: string; commercialRole: CommercialRole | null }): CommercialRole | null {
  if (profile.commercialRole) return profile.commercialRole;
  return profile.role === "admin" ? "director" : roles.has(profile.role as CommercialRole) ? profile.role as CommercialRole : null;
}

function allowedNewRoles(actor: CommercialRole | null): CommercialRole[] {
  if (actor === "director") return ["superintendent", "manager", "broker"];
  if (actor === "superintendent") return ["manager", "broker"];
  if (actor === "manager") return ["broker"];
  return [];
}

function publicProfile(profile: Record<string, unknown>) {
  return {
    ...profile,
    full_name: profile.full_name || profile.name || "Usuário Atlas",
    avatar_url: null,
    phone: null,
    creci: null,
  };
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "team.list" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const actorRole = resolvedRole(identity.access.profile);
  if (!actorRole || actorRole === "broker") return apiError("FORBIDDEN", "Gestão de equipe disponível somente para a liderança.", identity.meta, { status: 403 });

  const { data, error } = await identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", identity.access.organization.id).order("name").limit(1000);
  if (error) return apiError("TEAM_LOOKUP_FAILED", "Não foi possível carregar a equipe.", identity.meta, { status: 500 });
  const hierarchy = resolveLiveHierarchy(data ?? []);
  const visible = actorRole === "director" ? hierarchy : hierarchy.filter((profile) => descendantsFromLiveProfiles(hierarchy, identity.access.profile.id).has(String(profile.id)));
  return apiSuccess({ viewer: { id: identity.access.profile.id, role: actorRole, allowedNewRoles: allowedNewRoles(actorRole) }, profiles: visible.map((profile) => publicProfile(profile)) }, identity.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 10, windowMs: 15 * 60_000, scope: "team.invite" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const actorRole = resolvedRole(identity.access.profile);
  const body = await request.json().catch(() => null) as TeamPayload | null;
  const email = body?.email?.trim().toLowerCase();
  const fullName = body?.fullName?.trim();
  const commercialRole = body?.commercialRole;
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !fullName || fullName.length > 120 || !commercialRole || !roles.has(commercialRole)) return apiError("INVALID_TEAM_MEMBER", "Revise nome, e-mail e função comercial.", identity.meta, { status: 400 });
  if (!allowedNewRoles(actorRole).includes(commercialRole)) return apiError("FORBIDDEN", "Você não pode criar este nível hierárquico.", identity.meta, { status: 403 });
  if (actorRole === "manager" && body?.reportsTo !== identity.access.profile.id) return apiError("FORBIDDEN", "O gerente pode adicionar apenas corretores ao próprio time.", identity.meta, { status: 403 });
  const admin = getSupabaseAdmin();
  const baseUrl = (process.env.ATLAS_BASE_URL || process.env.NEXT_PUBLIC_APP_URL)?.replace(/\/$/, "");
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { name: fullName }, ...(baseUrl ? { redirectTo: `${baseUrl}/auth/callback?next=/settings/profile` } : {}) });
  if (inviteError || !invited.user) return apiError("INVITE_FAILED", "Não foi possível enviar o convite. Confirme o e-mail e a configuração SMTP.", identity.meta, { status: inviteError?.status === 422 ? 409 : 502 });

  const userId = invited.user.id;
  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, { app_metadata: { organization_id: identity.access.organization.id, commercial_role: commercialRole } });
  const { error: profileError } = await admin.from("profiles").upsert({ id: userId, organization_id: identity.access.organization.id, name: fullName, email, role: liveStorageRole(commercialRole), active: true, team: null }, { onConflict: "id" });
  if (metadataError || profileError) { await admin.auth.admin.deleteUser(userId); return apiError("PROFILE_CREATE_FAILED", "O convite foi revertido porque a hierarquia não pôde ser criada.", identity.meta, { status: 409 }); }
  structuredApiLog("info", "team.member_invited", request, identity.meta, { actorId: identity.access.profile.id, profileId: userId, commercialRole, emailDomain: email.split("@")[1] });
  return apiSuccess({ id: userId, status: "invited", message: "Convite enviado. O acesso só será ativado após a confirmação do e-mail." }, identity.meta, { status: 201, headers: rate.headers });
}

export async function PATCH(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 20, windowMs: 15 * 60_000, scope: "team.update" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const actorRole = resolvedRole(identity.access.profile);
  const body = await request.json().catch(() => null) as UpdatePayload | null;
  if (!body?.profileId || !body.commercialRole || !roles.has(body.commercialRole) || typeof body.active !== "boolean") return apiError("INVALID_TEAM_UPDATE", "Atualização de equipe inválida.", identity.meta, { status: 400 });
  if (!allowedNewRoles(actorRole).includes(body.commercialRole)) return apiError("FORBIDDEN", "Você não pode administrar este nível hierárquico.", identity.meta, { status: 403 });
  if (actorRole === "manager" && body.reportsTo !== identity.access.profile.id) return apiError("FORBIDDEN", "O gerente administra apenas seu próprio time.", identity.meta, { status: 403 });
  if (body.profileId === identity.access.profile.id && !body.active) return apiError("SELF_DEACTIVATION", "Você não pode desativar o próprio acesso.", identity.meta, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data: target } = await admin.from("profiles").select(LIVE_PROFILE_SELECT).eq("id", body.profileId).eq("organization_id", identity.access.organization.id).maybeSingle();
  if (!target) return apiError("PROFILE_NOT_FOUND", "Usuário não encontrado nesta organização.", identity.meta, { status: 404 });
  if (String(target.role).toUpperCase() === "ADMIN") return apiError("PROTECTED_ADMIN", "O administrador principal é protegido.", identity.meta, { status: 403 });
  const { data, error } = await admin.from("profiles").update({ role: liveStorageRole(body.commercialRole), active: body.active }).eq("id", body.profileId).eq("organization_id", identity.access.organization.id).select(LIVE_PROFILE_SELECT).single();
  if (error) return apiError("TEAM_UPDATE_REJECTED", "A alteração foi recusada pelas regras da hierarquia.", identity.meta, { status: 403 });
  structuredApiLog("info", "team.member_updated", request, identity.meta, { actorId: identity.access.profile.id, profileId: body.profileId, commercialRole: body.commercialRole, active: body.active });
  return apiSuccess({ profile: data }, identity.meta, { headers: rate.headers });
}
