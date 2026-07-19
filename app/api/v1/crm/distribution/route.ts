import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { LIVE_LEAD_SELECT, mapLegacyLead, type CompatRow } from "@/lib/compat/legacy-v2";
import { LIVE_PROFILE_SELECT, descendantsFromLiveProfiles, resolveLiveHierarchy } from "@/lib/compat/live-hierarchy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const managerRoles = new Set(["director", "superintendent", "manager"]);
const archived = new Set(["arquivado", "archived"]);
const text = (value: unknown) => typeof value === "string" ? value : "";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 90, scope: "crm-distribution-read" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!managerRoles.has(role)) return apiError("FORBIDDEN", "A fila comercial é gerenciada pela liderança.", identity.meta, { status: 403 });

  const organizationId = identity.access.organization.id;
  const [profilesResult, projectsResult, leadsResult] = await Promise.all([
    identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).order("name"),
    identity.supabase.from("crm_projects").select("id,name,developer_name,status").eq("organization_id", organizationId).order("name"),
    identity.supabase.from("leads").select(LIVE_LEAD_SELECT).eq("organization_id", organizationId).limit(5000),
  ]);
  if (profilesResult.error || projectsResult.error || leadsResult.error) return apiError("DISTRIBUTION_LOOKUP_FAILED", "Não foi possível carregar a fila comercial.", identity.meta, { status: 503 });

  const hierarchy = resolveLiveHierarchy((profilesResult.data ?? []) as unknown as CompatRow[]);
  const allowed = role === "director" ? new Set(hierarchy.map((profile) => text(profile.id))) : descendantsFromLiveProfiles(hierarchy, identity.access.profile.id);
  const profiles = hierarchy.filter((profile) => allowed.has(text(profile.id)));
  const profileIds = new Set(profiles.map((profile) => text(profile.id)));
  const projects = projectsResult.data ?? [];
  const leads = ((leadsResult.data ?? []) as unknown as CompatRow[]).map((row) => mapLegacyLead(row)).filter((lead) => !archived.has(text(lead.status).toLowerCase()));
  const presence = profiles.map((profile) => {
    const availability = text(profile.availability_status || "OFFLINE").toLowerCase();
    return { profile_id: profile.id, availability, last_seen_at: profile.created_at, online: availability !== "offline" };
  });
  const queue = profiles.filter((profile) => profile.commercial_role === "broker").flatMap((profile) => projects.map((project) => ({ profile_id: profile.id, development_id: project.id, enabled: true, weight: 1, assignments_count: 0, last_assigned_at: null })));
  const unassignedQueue = leads.filter((lead) => !lead.assigned_to).sort((a, b) => Date.parse(text(a.created_at)) - Date.parse(text(b.created_at))).slice(0, 100).map((lead) => ({
    id: lead.id,
    developmentId: lead.development_id,
    source: lead.source || "não informada",
    status: lead.status || "novo",
    createdAt: lead.created_at,
    waitingMinutes: Math.max(0, Math.floor((Date.now() - Date.parse(text(lead.created_at))) / 60_000)),
  }));

  return apiSuccess({
    viewer: { id: identity.access.profile.id, role }, compatibility: "live-schema-safe",
    rules: { algorithm: "live_manual_queue", presenceWindowSeconds: 90, onlineOnly: true, projectScoped: true, weightedLoad: false, atomicLock: false, singleOwner: true, explainable: true },
    projects,
    profiles: profiles.map((profile) => ({ ...profile, full_name: profile.full_name || profile.name, resolved_role: profile.commercial_role })),
    presence,
    queue,
    capacity: profiles.filter((profile) => profile.commercial_role === "broker").map((profile) => ({ profile_id: profile.id, max_active_leads: Number(profile.max_active_leads || 100), max_project_leads: Number(profile.max_active_leads || 100), warning_percent: 80, updated_at: profile.created_at })),
    priorityRules: [],
    recentAssignments: [],
    leadSources: [...new Set(leads.map((lead) => text(lead.source || "não informada").trim().toLowerCase()))].sort().slice(0, 100),
    portfolioAudit: { events: [], summary: { total: 0, distributions: 0, transfers: 0, reservations: 0, returns: 0, absences: 0, capacityChanges: 0 }, maximum: 100, hierarchicalScope: true, piiExposed: false, immutableSources: true, generatedAt: new Date().toISOString() },
    unassignedQueue,
    unassignedPolicy: { metadataOnly: true, piiExposed: false, automaticAssignment: false, explicitLeadershipAction: true, maximumVisible: 100 },
    loads: profiles.map((profile) => ({ profile_id: profile.id, total: leads.filter((lead) => text(lead.assigned_to) === text(profile.id)).length, by_project: Object.fromEntries(projects.map((project) => [project.id, leads.filter((lead) => text(lead.assigned_to) === text(profile.id) && text(lead.development_id) === project.id).length])) })),
    unassigned: Object.fromEntries(projects.map((project) => [project.id, leads.filter((lead) => !lead.assigned_to && text(lead.development_id) === project.id).length])),
    generatedAt: new Date().toISOString(),
    scopedProfileCount: profileIds.size,
  }, identity.meta, { headers: limited.headers });
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 120, scope: "crm-distribution-write" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const body = await request.json().catch(() => null) as { action?: string; availability?: string } | null;
  if (body?.action !== "heartbeat") return apiError("DISTRIBUTION_ACTION_PENDING", "A fila está visível. As mudanças de distribuição serão liberadas após a validação atômica.", identity.meta, { status: 503 });
  const availability = ["available", "busy", "offline"].includes(body.availability || "") ? body.availability! : "available";
  const { error } = await getSupabaseAdmin().from("profiles").update({ availability_status: availability.toUpperCase() }).eq("id", identity.access.profile.id).eq("organization_id", identity.access.organization.id);
  if (error) return apiError("PRESENCE_UPDATE_FAILED", "Não foi possível atualizar sua disponibilidade.", identity.meta, { status: 503 });
  return apiSuccess({ availability, online: availability !== "offline" }, identity.meta, { headers: limited.headers });
}
