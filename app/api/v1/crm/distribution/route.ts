import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const managerRoles = new Set(["director", "superintendent", "manager"]);

function roleOf(profile: { role?: string | null; commercial_role?: string | null }) {
  return profile.commercial_role || (profile.role === "admin" ? "director" : profile.role) || "broker";
}

function descendants(profiles: Array<{ id: string; reports_to: string | null }>, root: string) {
  const allowed = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const profile of profiles) if (profile.reports_to && allowed.has(profile.reports_to) && !allowed.has(profile.id)) {
      allowed.add(profile.id); changed = true;
    }
  }
  return allowed;
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 90, scope: "crm-distribution-read" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!managerRoles.has(role)) return apiError("FORBIDDEN", "A fila comercial é gerenciada pela liderança.", identity.meta, { status: 403 });

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const [profilesResult, projectsResult, presenceResult, leadsResult, queueResult] = await Promise.all([
    admin.from("profiles").select("id,full_name,role,commercial_role,reports_to,active").eq("organization_id", organizationId).eq("active", true),
    admin.from("developments").select("id,name,developer_name,status").eq("organization_id", organizationId).order("name"),
    admin.from("commercial_presence").select("profile_id,availability,last_seen_at").eq("organization_id", organizationId),
    admin.from("leads").select("id,development_id,assigned_to").eq("organization_id", organizationId),
    admin.from("project_distribution_members").select("development_id,profile_id,enabled,weight,assignments_count,last_assigned_at").eq("organization_id", organizationId),
  ]);
  const failure = [profilesResult, projectsResult, presenceResult, leadsResult, queueResult].find((result) => result.error);
  if (failure?.error) return apiError("DISTRIBUTION_LOOKUP_FAILED", "Não foi possível carregar a fila comercial.", identity.meta, { status: 500, details: failure.error.message });

  const allProfiles = profilesResult.data ?? [];
  const allowed = role === "director" ? new Set(allProfiles.map((profile) => profile.id)) : descendants(allProfiles, identity.access.profile.id);
  const profiles = allProfiles.filter((profile) => allowed.has(profile.id));
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const now = Date.now();
  const presence = (presenceResult.data ?? []).filter((item) => profileIds.has(item.profile_id)).map((item) => ({
    ...item,
    online: item.availability !== "offline" && now - new Date(item.last_seen_at).getTime() <= 90_000,
  }));
  const leads = leadsResult.data ?? [];
  const queue = (queueResult.data ?? []).filter((item) => profileIds.has(item.profile_id));

  return apiSuccess({
    viewer: { id: identity.access.profile.id, role },
    rules: { algorithm: "online_project_load_v1", presenceWindowSeconds: 90, onlineOnly: true, projectScoped: true, weightedLoad: true, atomicLock: true },
    projects: projectsResult.data ?? [],
    profiles: profiles.map((profile) => ({ ...profile, resolved_role: roleOf(profile) })),
    presence,
    queue,
    loads: profiles.map((profile) => ({
      profile_id: profile.id,
      total: leads.filter((lead) => lead.assigned_to === profile.id).length,
      by_project: Object.fromEntries((projectsResult.data ?? []).map((project) => [project.id, leads.filter((lead) => lead.assigned_to === profile.id && lead.development_id === project.id).length])),
    })),
    unassigned: Object.fromEntries((projectsResult.data ?? []).map((project) => [project.id, leads.filter((lead) => !lead.assigned_to && lead.development_id === project.id).length])),
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: limited.headers });
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 120, scope: "crm-distribution-write" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const body = await request.json().catch(() => null) as { action?: string; availability?: string; developmentId?: string; limit?: number; profileId?: string; enabled?: boolean; weight?: number } | null;
  if (!body?.action) return apiError("INVALID_REQUEST", "Ação não informada.", identity.meta, { status: 400 });
  const admin = getSupabaseAdmin();

  if (body.action === "heartbeat") {
    const availability = ["available", "busy", "offline"].includes(body.availability || "") ? body.availability! : "available";
    const { error } = await admin.rpc("touch_commercial_presence", {
      p_actor_id: identity.access.profile.id,
      p_organization_id: identity.access.organization.id,
      p_availability: availability,
    });
    if (error) return apiError("PRESENCE_UPDATE_FAILED", "Não foi possível atualizar sua disponibilidade.", identity.meta, { status: 500, details: error.message });
    return apiSuccess({ availability, online: availability !== "offline" }, identity.meta, { headers: limited.headers });
  }

  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!managerRoles.has(role)) return apiError("FORBIDDEN", "Perfil sem permissão para distribuir leads.", identity.meta, { status: 403 });
  if (body.action === "configure_member" && body.developmentId && body.profileId) {
    const weight = Math.min(10, Math.max(1, Math.floor(body.weight ?? 1)));
    const [{ data: project }, { data: profiles }] = await Promise.all([
      admin.from("developments").select("id").eq("id", body.developmentId).eq("organization_id", identity.access.organization.id).maybeSingle(),
      admin.from("profiles").select("id,role,commercial_role,reports_to").eq("organization_id", identity.access.organization.id).eq("active", true),
    ]);
    if (!project) return apiError("INVALID_PROJECT", "Projeto fora da sua organização.", identity.meta, { status: 400 });
    const target = (profiles ?? []).find((profile) => profile.id === body.profileId);
    const allowed = role === "director" ? new Set((profiles ?? []).map((profile) => profile.id)) : descendants(profiles ?? [], identity.access.profile.id);
    const directManagerScope = role !== "manager" || target?.reports_to === identity.access.profile.id;
    if (!target || roleOf(target) !== "broker" || !allowed.has(target.id) || !directManagerScope) return apiError("BROKER_OUT_OF_SCOPE", "Selecione um corretor direto do seu time.", identity.meta, { status: 403 });
    const { data, error } = await admin.from("project_distribution_members").upsert({ organization_id: identity.access.organization.id, development_id: project.id, profile_id: target.id, enabled: body.enabled !== false, weight, updated_at: new Date().toISOString() }, { onConflict: "development_id,profile_id" }).select("development_id,profile_id,enabled,weight,assignments_count,last_assigned_at").single();
    if (error) return apiError("MEMBER_CONFIG_FAILED", "Não foi possível atualizar a elegibilidade deste projeto.", identity.meta, { status: 500 });
    return apiSuccess({ member: data, projectIsolation: true }, identity.meta, { headers: limited.headers });
  }
  if (body.action !== "distribute" || !body.developmentId) return apiError("INVALID_REQUEST", "Projeto ou ação inválida.", identity.meta, { status: 400 });
  const limit = Math.min(100, Math.max(1, Math.floor(body.limit ?? 1)));
  const { data, error } = await admin.rpc("distribute_project_leads", {
    p_actor_id: identity.access.profile.id,
    p_organization_id: identity.access.organization.id,
    p_development_id: body.developmentId,
    p_limit: limit,
  });
  if (error) return apiError("DISTRIBUTION_FAILED", error.message, identity.meta, { status: 409 });
  return apiSuccess(data, identity.meta, { headers: limited.headers });
}
