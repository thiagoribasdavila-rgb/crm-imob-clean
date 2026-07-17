import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const DAY = 86_400_000;
const normalized = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const time = (value: unknown) => { const parsed = typeof value === "string" ? new Date(value).getTime() : Number.NaN; return Number.isFinite(parsed) ? parsed : null; };

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "manager.daily-dashboard" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { roles: ["manager"] });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const managerId = identity.access.profile.id;
  const { data: brokers, error: brokersError } = await admin.from("profiles").select("id,full_name").eq("organization_id", organizationId).eq("reports_to", managerId).eq("active", true).or("commercial_role.eq.broker,and(commercial_role.is.null,role.eq.broker)").limit(300);
  if (brokersError) return apiError("MANAGER_TEAM_FAILED", "Não foi possível carregar sua equipe direta.", identity.meta, { status: 500 });
  const brokerIds = (brokers ?? []).map((broker) => broker.id);
  if (!brokerIds.length) return apiSuccess({ scope: { role: "manager", directBrokersOnly: true, managerId, organizationId }, totals: { brokers: 0, online: 0, available: 0, activeLeads: 0, hotLeads: 0, won: 0, firstContactOverdue: 0, followUpOverdue: 0, withoutNextAction: 0 }, distribution: { averageActiveLeads: 0, spread: 0, imbalanced: false }, brokers: [], interventions: [], generatedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });

  const [{ data: leads, error: leadsError }, { data: presence, error: presenceError }] = await Promise.all([
    admin.from("leads").select("id,name,assigned_to,status,score,temperature,created_at,first_contact_due_at,first_contacted_at,next_action_at").eq("organization_id", organizationId).in("assigned_to", brokerIds).limit(10000),
    admin.from("commercial_presence").select("profile_id,availability,last_seen_at").eq("organization_id", organizationId).in("profile_id", brokerIds),
  ]);
  if (leadsError || presenceError) return apiError("MANAGER_OPERATION_FAILED", "Não foi possível consolidar a operação do time.", identity.meta, { status: 500 });

  const now = Date.now();
  const presenceMap = new Map((presence ?? []).map((item) => [item.profile_id, item]));
  const rows = (brokers ?? []).map((broker) => {
    const portfolio = (leads ?? []).filter((lead) => lead.assigned_to === broker.id);
    const active = portfolio.filter((lead) => !TERMINAL.has(normalized(lead.status)));
    const won = portfolio.filter((lead) => normalized(lead.status) === "ganho").length;
    const firstContactOverdue = active.filter((lead) => !lead.first_contacted_at && (time(lead.first_contact_due_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
    const followUpOverdue = active.filter((lead) => (time(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
    const withoutNextAction = active.filter((lead) => !lead.next_action_at).length;
    const hot = active.filter((lead) => normalized(lead.temperature) === "quente" || Number(lead.score || 0) >= 70).length;
    const recentAssignments = portfolio.filter((lead) => (time(lead.created_at) ?? 0) >= now - DAY).length;
    const currentPresence = presenceMap.get(broker.id);
    const online = Boolean(currentPresence && currentPresence.availability !== "offline" && (time(currentPresence.last_seen_at) ?? 0) >= now - 15 * 60_000);
    return { brokerId: broker.id, brokerName: broker.full_name || "Corretor", availability: online ? currentPresence?.availability || "available" : "offline", online, leads: portfolio.length, activeLeads: active.length, hotLeads: hot, won, conversionRate: portfolio.length ? Math.round(won / portfolio.length * 1000) / 10 : 0, conversionSampleSufficient: portfolio.length >= 20, firstContactOverdue, followUpOverdue, withoutNextAction, recentAssignments };
  });

  const average = rows.length ? rows.reduce((sum, row) => sum + row.activeLeads, 0) / rows.length : 0;
  const spread = rows.length ? Math.max(...rows.map((row) => row.activeLeads)) - Math.min(...rows.map((row) => row.activeLeads)) : 0;
  const interventions = rows.flatMap((row) => {
    const actions = [];
    if (row.firstContactOverdue) actions.push({ severity: "critical", reason: `${row.firstContactOverdue} leads sem primeiro contato`, action: "Definir recuperação de SLA com prazo hoje" });
    if (row.followUpOverdue) actions.push({ severity: "attention", reason: `${row.followUpOverdue} follow-ups vencidos`, action: "Revisar a fila e confirmar próximas datas" });
    if (row.withoutNextAction >= 3) actions.push({ severity: "attention", reason: `${row.withoutNextAction} leads sem próxima ação`, action: "Fazer coaching de higiene da carteira" });
    if (average > 0 && row.activeLeads > average * 1.4 && row.activeLeads - average >= 3) actions.push({ severity: "opportunity", reason: `Carga ${Math.round(row.activeLeads - average)} acima da média`, action: "Avaliar redistribuição sem romper atendimentos ativos" });
    return actions.map((item) => ({ brokerId: row.brokerId, brokerName: row.brokerName, ...item, href: `/brokers?broker=${row.brokerId}` }));
  });
  const severityWeight: Record<string, number> = { critical: 0, attention: 1, opportunity: 2 };
  interventions.sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity]);
  interventions.splice(12);

  const totals = rows.reduce((sum, row) => ({ brokers: sum.brokers + 1, online: sum.online + Number(row.online), available: sum.available + Number(row.availability === "available"), activeLeads: sum.activeLeads + row.activeLeads, hotLeads: sum.hotLeads + row.hotLeads, won: sum.won + row.won, firstContactOverdue: sum.firstContactOverdue + row.firstContactOverdue, followUpOverdue: sum.followUpOverdue + row.followUpOverdue, withoutNextAction: sum.withoutNextAction + row.withoutNextAction }), { brokers: 0, online: 0, available: 0, activeLeads: 0, hotLeads: 0, won: 0, firstContactOverdue: 0, followUpOverdue: 0, withoutNextAction: 0 });
  return apiSuccess({ scope: { role: "manager", directBrokersOnly: true, managerId, organizationId, parallelTeamsExcluded: true }, totals, distribution: { averageActiveLeads: Math.round(average * 10) / 10, spread, imbalanced: spread >= Math.max(5, Math.ceil(average * 0.4)), metric: "active_leads_per_direct_broker" }, brokers: rows.sort((a, b) => b.firstContactOverdue - a.firstContactOverdue || b.followUpOverdue - a.followUpOverdue || b.activeLeads - a.activeLeads), interventions, generatedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
}
