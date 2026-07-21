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
  const body = await request.json().catch(() => null) as { action?: string; availability?: string; developmentId?: string; limit?: number } | null;

  // Presence heartbeat (unchanged behaviour).
  if (body?.action === "heartbeat") {
    const availability = ["available", "busy", "offline"].includes(body.availability || "") ? body.availability! : "available";
    const { error } = await getSupabaseAdmin().from("profiles").update({ availability_status: availability.toUpperCase() }).eq("id", identity.access.profile.id).eq("organization_id", identity.access.organization.id);
    if (error) return apiError("PRESENCE_UPDATE_FAILED", "Não foi possível atualizar sua disponibilidade.", identity.meta, { status: 503 });
    return apiSuccess({ availability, online: availability !== "offline" }, identity.meta, { headers: limited.headers });
  }

  if (body?.action !== "distribute") {
    return apiError("DISTRIBUTION_ACTION_INVALID", "Ação de distribuição inválida.", identity.meta, { status: 400 });
  }

  // Automatic fair distribution over the live (legacy) schema. Writes only real
  // columns/tables: leads.assigned_user_id, lead_distribution_history, lead_events.
  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!managerRoles.has(role)) return apiError("FORBIDDEN", "A distribuição é uma ação da liderança.", identity.meta, { status: 403 });

  const organizationId = identity.access.organization.id;
  const developmentFilter = typeof body.developmentId === "string" && body.developmentId ? body.developmentId : null;
  const batchLimit = Math.min(Math.max(Number(body.limit) || 200, 1), 1000);

  const [profilesResult, leadsResult] = await Promise.all([
    identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true),
    identity.supabase.from("leads").select(LIVE_LEAD_SELECT).eq("organization_id", organizationId).limit(20000),
  ]);
  if (profilesResult.error || leadsResult.error) return apiError("DISTRIBUTION_LOOKUP_FAILED", "Não foi possível carregar a fila comercial.", identity.meta, { status: 503 });

  const hierarchy = resolveLiveHierarchy((profilesResult.data ?? []) as unknown as CompatRow[]);
  const scope = role === "director" ? new Set(hierarchy.map((profile) => text(profile.id))) : descendantsFromLiveProfiles(hierarchy, identity.access.profile.id);
  const leads = ((leadsResult.data ?? []) as unknown as CompatRow[]).map((row) => mapLegacyLead(row)).filter((lead) => !archived.has(text(lead.status).toLowerCase()));

  // Current active load per broker (org-wide — capacity is a personal limit).
  const loadByBroker = new Map<string, number>();
  for (const lead of leads) {
    const owner = text(lead.assigned_to);
    if (owner) loadByBroker.set(owner, (loadByBroker.get(owner) ?? 0) + 1);
  }

  // Eligible brokers: inside the leader's scope, role broker, online, with spare capacity.
  const eligible = hierarchy
    .filter((profile) => profile.commercial_role === "broker" && scope.has(text(profile.id)) && text(profile.availability_status || "").toUpperCase() !== "OFFLINE")
    .map((profile) => {
      const id = text(profile.id);
      return { id, name: text(profile.full_name || profile.name) || "Corretor", capacity: Number(profile.max_active_leads || 100), load: loadByBroker.get(id) ?? 0 };
    })
    .filter((broker) => broker.load < broker.capacity);
  if (!eligible.length) return apiError("DISTRIBUTION_NO_BROKER", "Nenhum corretor disponível com capacidade no seu escopo.", identity.meta, { status: 409 });

  // Unassigned queue, oldest first, optionally scoped to one project.
  const queue = leads
    .filter((lead) => !lead.assigned_to)
    .filter((lead) => !developmentFilter || text(lead.development_id) === developmentFilter)
    .sort((a, b) => Date.parse(text(a.created_at)) - Date.parse(text(b.created_at)))
    .slice(0, batchLimit);

  // Greedy least-load assignment (fair): each lead goes to the least-loaded broker with capacity.
  const planByBroker = new Map<string, string[]>();
  for (const lead of queue) {
    let pick: (typeof eligible)[number] | null = null;
    for (const broker of eligible) {
      if (broker.load >= broker.capacity) continue;
      if (!pick || broker.load < pick.load) pick = broker;
    }
    if (!pick) break; // every eligible broker is at capacity
    pick.load += 1;
    const planned = planByBroker.get(pick.id) ?? [];
    planned.push(text(lead.id));
    planByBroker.set(pick.id, planned);
  }

  // Persist per broker: idempotent update (only still-unassigned rows) + audit trail.
  const admin = getSupabaseAdmin();
  const distribution: Array<{ brokerId: string; brokerName: string; count: number }> = [];
  let assignedTotal = 0;
  for (const broker of eligible) {
    const ids = planByBroker.get(broker.id);
    if (!ids || !ids.length) continue;
    const { data: updated, error: updateError } = await admin
      .from("leads")
      .update({ assigned_user_id: broker.id })
      .eq("organization_id", organizationId)
      .is("assigned_user_id", null)
      .in("id", ids)
      .select("id");
    if (updateError) return apiError("DISTRIBUTION_ASSIGN_FAILED", "Falha ao atribuir os leads selecionados.", identity.meta, { status: 503 });
    const assignedIds = (updated ?? []).map((row) => String(row.id));
    if (!assignedIds.length) continue;
    // Audit trail is best-effort: a logging failure must not undo a valid assignment.
    await admin.from("lead_distribution_history").insert(assignedIds.map((leadId) => ({ organization_id: organizationId, lead_id: leadId, assigned_user_id: broker.id, reason: "auto:least-load" })));
    await admin.from("lead_events").insert(assignedIds.map((leadId) => ({ organization_id: organizationId, lead_id: leadId, event_type: "lead_assigned", type: "distribution", description: `Lead distribuído para ${broker.name}`, created_by: identity.access.profile.id, metadata: { algorithm: "least-load", actorRole: role } })));
    distribution.push({ brokerId: broker.id, brokerName: broker.name, count: assignedIds.length });
    assignedTotal += assignedIds.length;
  }

  return apiSuccess({
    assigned: assignedTotal,
    distribution,
    remainingUnassigned: Math.max(0, leads.filter((lead) => !lead.assigned_to).length - assignedTotal),
    eligibleBrokers: eligible.length,
    rules: { algorithm: "least-load", fair: true, capacityRespected: true, onlineOnly: true, oldestFirst: true, idempotent: true, singleOwner: true, scope: role === "director" ? "organization" : "team" },
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: limited.headers });
}
