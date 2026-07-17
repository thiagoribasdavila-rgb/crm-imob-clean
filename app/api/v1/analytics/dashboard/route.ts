import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Profile = { id: string; full_name: string | null; role: string; commercial_role: string | null; reports_to: string | null };
const TERMINAL = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const DAY = 86_400_000;
const roleOf = (profile: Profile) => profile.commercial_role || (profile.role === "admin" ? "director" : profile.role);
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const time = (value: unknown) => { const parsed = typeof value === "string" ? new Date(value).getTime() : Number.NaN; return Number.isFinite(parsed) ? parsed : null; };

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "superintendent-dashboard" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { roles: ["superintendent"] });
  if (!identity.ok) return identity.response;
  const actorRole = identity.access.profile.commercialRole || identity.access.profile.role;
  if (actorRole !== "superintendent") return apiError("FORBIDDEN", "Este painel comparativo é exclusivo da superintendência.", identity.meta, { status: 403 });

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const superintendentId = identity.access.profile.id;
  const { data: profileRows, error: profileError } = await admin.from("profiles").select("id,full_name,role,commercial_role,reports_to").eq("organization_id", identity.access.organization.id).eq("active", true).limit(1000);
  if (profileError) return apiError("TEAM_LOOKUP_FAILED", "Não foi possível carregar a estrutura subordinada.", identity.meta, { status: 500 });
  const profiles = (profileRows ?? []) as Profile[];
  const managers = profiles.filter((profile) => roleOf(profile) === "manager" && profile.reports_to === identity.access.profile.id);
  const managerIds = new Set(managers.map((manager) => manager.id));
  const brokers = profiles.filter((profile) => roleOf(profile) === "broker" && profile.reports_to && managerIds.has(profile.reports_to));
  const descendants = (rootId: string) => new Set([rootId, ...brokers.filter((broker) => broker.reports_to === rootId).map((broker) => broker.id)]);
  const visibleOwnerIds = new Set(managers.flatMap((manager) => [...descendants(manager.id)]));

  const [{ data: leadRows, error: leadError }, { data: presenceRows, error: presenceError }] = await Promise.all([
    visibleOwnerIds.size ? admin.from("leads").select("id,assigned_to,status,score,temperature,next_action_at,budget_max,created_at,first_contact_due_at,first_contacted_at").eq("organization_id", identity.access.organization.id).in("assigned_to", [...visibleOwnerIds]).limit(10000) : Promise.resolve({ data: [], error: null }),
    brokers.length ? admin.from("commercial_presence").select("profile_id,availability,last_seen_at").eq("organization_id", organizationId).in("profile_id", brokers.map((broker) => broker.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (leadError || presenceError) return apiError("TEAM_SUMMARY_FAILED", "Não foi possível consolidar os números das equipes.", identity.meta, { status: 500 });

  const leads = leadRows ?? [];
  const now = Date.now();
  const presence = new Map((presenceRows ?? []).map((item) => [item.profile_id, item]));
  const rows = managers.map((manager) => {
    const teamBrokers = brokers.filter((broker) => broker.reports_to === manager.id);
    const ownerIds = descendants(manager.id);
    const portfolio = leads.filter((lead) => lead.assigned_to && ownerIds.has(lead.assigned_to));
    const activeLeads = portfolio.filter((lead) => !TERMINAL.has(normalize(lead.status)));
    const won = portfolio.filter((lead) => normalize(lead.status) === "ganho").length;
    const firstContactOverdue = activeLeads.filter((lead) => !lead.first_contacted_at && (time(lead.first_contact_due_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
    const followUpOverdue = activeLeads.filter((lead) => (time(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
    const withoutNextAction = activeLeads.filter((lead) => !lead.next_action_at).length;
    const online = teamBrokers.filter((broker) => { const current = presence.get(broker.id); return current && current.availability !== "offline" && (time(current.last_seen_at) ?? 0) >= now - 15 * 60_000; }).length;
    const available = teamBrokers.filter((broker) => { const current = presence.get(broker.id); return current?.availability === "available" && (time(current.last_seen_at) ?? 0) >= now - 15 * 60_000; }).length;
    const conversionRate = portfolio.length ? Math.round(won / portfolio.length * 1000) / 10 : 0;
    return { managerId: manager.id, managerName: manager.full_name || "Gerente", brokers: teamBrokers.length, online, available, leads: portfolio.length, activeLeads: activeLeads.length, hotLeads: activeLeads.filter((lead) => normalize(lead.temperature) === "quente" || Number(lead.score || 0) >= 70).length, firstContactOverdue, followUpOverdue, withoutNextAction, overdueLeads: firstContactOverdue + followUpOverdue, won, conversionRate, conversionSampleSufficient: portfolio.length >= 30, averageActivePerBroker: teamBrokers.length ? Math.round(activeLeads.length / teamBrokers.length * 10) / 10 : activeLeads.length, recentAssignments: portfolio.filter((lead) => (time(lead.created_at) ?? 0) >= now - 7 * DAY).length, potentialVgv: activeLeads.reduce((sum, lead) => sum + Number(lead.budget_max || 0), 0) };
  });

  const comparable = rows.filter((row) => row.conversionSampleSufficient);
  const benchmark = comparable.length ? Math.round(comparable.reduce((sum, row) => sum + row.conversionRate, 0) / comparable.length * 10) / 10 : null;
  const averageLoad = rows.length ? rows.reduce((sum, row) => sum + row.averageActivePerBroker, 0) / rows.length : 0;
  const managersWithComparableLoad = rows.filter((row) => row.brokers > 0);
  const loadSpread = managersWithComparableLoad.length ? Math.round((Math.max(...managersWithComparableLoad.map((row) => row.averageActivePerBroker)) - Math.min(...managersWithComparableLoad.map((row) => row.averageActivePerBroker))) * 10) / 10 : 0;
  const enrichedRows = rows.map((row) => ({ ...row, comparison: !row.conversionSampleSufficient || benchmark === null ? "insufficient_sample" : row.conversionRate >= benchmark ? "at_or_above_benchmark" : "below_benchmark" }));
  const severityWeight: Record<string, number> = { critical: 0, attention: 1, opportunity: 2 };
  const interventions = enrichedRows.flatMap((row) => {
    const actions: Array<{ severity: "critical" | "attention" | "opportunity"; reason: string; action: string }> = [];
    if (row.firstContactOverdue) actions.push({ severity: "critical", reason: `${row.firstContactOverdue} leads sem primeiro contato no prazo`, action: "Alinhar plano de recuperação com o gerente hoje" });
    if (row.followUpOverdue >= 3) actions.push({ severity: "attention", reason: `${row.followUpOverdue} follow-ups vencidos`, action: "Revisar capacidade e disciplina de execução da equipe" });
    if (row.withoutNextAction >= 5) actions.push({ severity: "attention", reason: `${row.withoutNextAction} leads sem próxima ação`, action: "Solicitar saneamento da carteira ao gerente" });
    if (averageLoad > 0 && row.averageActivePerBroker > averageLoad * 1.35 && row.averageActivePerBroker - averageLoad >= 3) actions.push({ severity: "opportunity", reason: `Carga média ${Math.round((row.averageActivePerBroker - averageLoad) * 10) / 10} acima das equipes subordinadas`, action: "Avaliar equilíbrio entre equipes sem romper atendimentos" });
    return actions.map((item) => ({ managerId: row.managerId, managerName: row.managerName, ...item, href: `/brokers?manager=${row.managerId}` }));
  }).sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity]).slice(0, 12);

  const totals = enrichedRows.reduce((sum, row) => ({ managers: sum.managers + 1, brokers: sum.brokers + row.brokers, online: sum.online + row.online, available: sum.available + row.available, leads: sum.leads + row.leads, activeLeads: sum.activeLeads + row.activeLeads, hotLeads: sum.hotLeads + row.hotLeads, firstContactOverdue: sum.firstContactOverdue + row.firstContactOverdue, followUpOverdue: sum.followUpOverdue + row.followUpOverdue, withoutNextAction: sum.withoutNextAction + row.withoutNextAction, overdueLeads: sum.overdueLeads + row.overdueLeads, won: sum.won + row.won, potentialVgv: sum.potentialVgv + row.potentialVgv }), { managers: 0, brokers: 0, online: 0, available: 0, leads: 0, activeLeads: 0, hotLeads: 0, firstContactOverdue: 0, followUpOverdue: 0, withoutNextAction: 0, overdueLeads: 0, won: 0, potentialVgv: 0 });
  const managerLeadSum = enrichedRows.reduce((sum, row) => sum + row.leads, 0);
  const scopedLeadCount = leads.length;
  return apiSuccess({ scope: { role: "superintendent", actorId: superintendentId, directManagersOnly: true, directBrokersPerManagerOnly: true, parallelStructuresExcluded: true, unassignedExcluded: true }, totals, benchmark: { conversionRate: benchmark, minimumLeadsPerTeam: 30, comparableManagers: comparable.length }, distribution: { averageActivePerBroker: Math.round(averageLoad * 10) / 10, spread: loadSpread, imbalanced: loadSpread >= Math.max(5, Math.ceil(averageLoad * 0.4)), metric: "active_leads_per_broker_by_direct_manager" }, managers: enrichedRows.sort((a, b) => b.firstContactOverdue - a.firstContactOverdue || b.followUpOverdue - a.followUpOverdue || b.activeLeads - a.activeLeads), interventions, reconciliation: { managerLeadSum, scopedLeadCount, matches: managerLeadSum === scopedLeadCount }, governance: { readOnly: true, humanDecisionRequired: true, automaticTransfer: false }, generatedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
}
