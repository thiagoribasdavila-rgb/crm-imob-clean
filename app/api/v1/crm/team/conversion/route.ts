import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { LIVE_LEAD_SELECT, mapLegacyLead, type CompatRow } from "@/lib/compat/legacy-v2";
import { LIVE_PROFILE_SELECT, descendantsFromLiveProfiles, resolveLiveHierarchy } from "@/lib/compat/live-hierarchy";

const closed = new Set(["ganho", "perdido", "arquivado", "comprou_outro", "closed", "won", "lost"]);
const hotTemperatures = new Set(["quente", "hot"]);
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
function omitAttention<T extends { attentionWeight: number }>(member: T): Omit<T, "attentionWeight"> {
  const { attentionWeight, ...publicMember } = member;
  void attentionWeight;
  return publicMember;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 45, scope: "team.conversion.read" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;

  const profiles = await identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).order("created_at").limit(1000);
  const leads = await identity.supabase.from("leads").select(LIVE_LEAD_SELECT).eq("organization_id", organizationId).neq("status", "arquivado").limit(5000);
  if (profiles.error || leads.error) return apiError("TEAM_CONVERSION_UNAVAILABLE", "A visão de conversão da equipe não pôde ser atualizada.", identity.meta, { status: 503 });

  const now = Date.now();
  const hierarchy = resolveLiveHierarchy((profiles.data ?? []) as unknown as CompatRow[]);
  const actor = hierarchy.find((profile) => profile.id === identity.access.profile.id);
  const visibleIds = actor?.commercial_role === "director"
    ? new Set(hierarchy.map((profile) => text(profile.id)))
    : descendantsFromLiveProfiles(hierarchy, identity.access.profile.id);
  const compatibleLeads = ((leads.data ?? []) as unknown as CompatRow[]).map((row) => mapLegacyLead(row));
  const members = hierarchy.filter((profile) => visibleIds.has(text(profile.id))).map((profile) => {
    const memberLeads = compatibleLeads.filter((lead) => text(lead.assigned_to) === text(profile.id));
    const activeLeads = memberLeads.filter((lead) => !closed.has(text(lead.status).toLowerCase()));
    const hotLeads = activeLeads.filter((lead) => number(lead.score) >= 70 || hotTemperatures.has(text(lead.temperature).toLowerCase()));
    const withoutNextAction = activeLeads.filter((lead) => !lead.next_action_at);
    const overdue = activeLeads.filter((lead) => { const due = Date.parse(text(lead.next_action_at)); return Number.isFinite(due) && due < now; });
    const hotWithoutNextAction = hotLeads.filter((lead) => !lead.next_action_at);
    return {
      id: text(profile.id), fullName: text(profile.full_name) || "Usuário Atlas", role: text(profile.commercial_role) || text(profile.role), reportsTo: text(profile.reports_to) || null, active: profile.active !== false,
      portfolio: activeLeads.length, hotLeads: hotLeads.length, overdue: overdue.length, withoutNextAction: withoutNextAction.length, hotWithoutNextAction: hotWithoutNextAction.length,
      won: memberLeads.filter((lead) => ["ganho", "won"].includes(text(lead.status).toLowerCase())).length,
      attentionWeight: overdue.length * 4 + hotWithoutNextAction.length * 3 + withoutNextAction.length,
    };
  });

  const supportQueue = members.filter((member) => member.active && member.attentionWeight > 0).sort((a, b) => b.attentionWeight - a.attentionWeight).slice(0, 3).map(omitAttention);
  return apiSuccess({
    members: members.map(omitAttention), supportQueue,
    summary: { activePeople: members.filter((member) => member.active).length, brokers: members.filter((member) => member.active && member.role === "broker").length, portfolio: members.reduce((total, member) => total + member.portfolio, 0), overdue: members.reduce((total, member) => total + member.overdue, 0) },
    method: { source: "rls-visible-profiles-and-leads", peopleRanking: false, explainableWorkloadSignals: true, humanDecisionRequired: true, directContactDataReturned: false },
  }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
