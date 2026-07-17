import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Profile = { id: string; full_name: string | null; role: string; commercial_role: string | null; reports_to: string | null };
function roleOf(profile: Profile) { return profile.commercial_role || (profile.role === "admin" ? "director" : profile.role); }
function normalize(value: unknown) { return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "superintendent-dashboard" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const actorRole = identity.access.profile.commercialRole || identity.access.profile.role;
  if (actorRole !== "superintendent") return apiError("FORBIDDEN", "Este painel comparativo é exclusivo da superintendência.", identity.meta, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data: profileRows, error: profileError } = await admin.from("profiles").select("id,full_name,role,commercial_role,reports_to").eq("organization_id", identity.access.organization.id).eq("active", true).limit(1000);
  if (profileError) return apiError("TEAM_LOOKUP_FAILED", "Não foi possível carregar a estrutura subordinada.", identity.meta, { status: 500 });
  const profiles = (profileRows ?? []) as Profile[];
  const managers = profiles.filter((profile) => roleOf(profile) === "manager" && profile.reports_to === identity.access.profile.id);
  const descendants = (rootId: string) => { const result = new Set<string>([rootId]); let changed = true; while (changed) { changed = false; for (const profile of profiles) if (profile.reports_to && result.has(profile.reports_to) && !result.has(profile.id)) { result.add(profile.id); changed = true; } } return result; };
  const visibleOwnerIds = new Set(managers.flatMap((manager) => [...descendants(manager.id)]));
  const { data: leadRows, error: leadError } = visibleOwnerIds.size ? await admin.from("leads").select("id,assigned_to,status,score,temperature,next_action_at,budget_max,created_at").eq("organization_id", identity.access.organization.id).in("assigned_to", [...visibleOwnerIds]).limit(10000) : { data: [], error: null };
  if (leadError) return apiError("LEAD_SUMMARY_FAILED", "Não foi possível consolidar os números das equipes.", identity.meta, { status: 500 });
  const leads = leadRows ?? [];
  const now = Date.now();
  const active = (status: unknown) => !["ganho", "perdido", "arquivado", "comprou_outro"].includes(normalize(status));
  const rows = managers.map((manager) => {
    const ownerIds = descendants(manager.id);
    const portfolio = leads.filter((lead) => lead.assigned_to && ownerIds.has(lead.assigned_to));
    const activeLeads = portfolio.filter((lead) => active(lead.status));
    const won = portfolio.filter((lead) => normalize(lead.status) === "ganho").length;
    return { managerId: manager.id, managerName: manager.full_name || "Gerente", brokers: [...ownerIds].filter((id) => id !== manager.id && roleOf(profiles.find((profile) => profile.id === id)!) === "broker").length, leads: portfolio.length, activeLeads: activeLeads.length, hotLeads: activeLeads.filter((lead) => normalize(lead.temperature) === "quente" || Number(lead.score || 0) >= 70).length, overdueLeads: activeLeads.filter((lead) => lead.next_action_at && new Date(lead.next_action_at).getTime() < now).length, won, conversionRate: portfolio.length ? Math.round(won / portfolio.length * 1000) / 10 : 0, potentialVgv: activeLeads.reduce((sum, lead) => sum + Number(lead.budget_max || 0), 0) };
  }).sort((a, b) => b.won - a.won || b.activeLeads - a.activeLeads);
  const totals = rows.reduce((sum, row) => ({ managers: sum.managers + 1, brokers: sum.brokers + row.brokers, leads: sum.leads + row.leads, activeLeads: sum.activeLeads + row.activeLeads, hotLeads: sum.hotLeads + row.hotLeads, overdueLeads: sum.overdueLeads + row.overdueLeads, won: sum.won + row.won, potentialVgv: sum.potentialVgv + row.potentialVgv }), { managers: 0, brokers: 0, leads: 0, activeLeads: 0, hotLeads: 0, overdueLeads: 0, won: 0, potentialVgv: 0 });
  return apiSuccess({ scope: { role: "superintendent", actorId: identity.access.profile.id, directManagersOnly: true, parallelStructuresExcluded: true, unassignedExcluded: true }, totals, managers: rows, reconciliation: { managerLeadSum: rows.reduce((sum, row) => sum + row.leads, 0), scopedLeadCount: leads.length, matches: rows.reduce((sum, row) => sum + row.leads, 0) === leads.length }, generatedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
}
