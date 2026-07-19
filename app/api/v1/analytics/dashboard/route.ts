import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { LIVE_LEAD_SELECT, mapLegacyLead, type CompatRow } from "@/lib/compat/legacy-v2";
import { LIVE_PROFILE_SELECT, descendantsFromLiveProfiles, resolveLiveHierarchy } from "@/lib/compat/live-hierarchy";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["ganho", "perdido", "arquivado", "comprou_outro", "won", "lost", "closed"]);
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const time = (value: unknown) => { const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; };

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "superintendent-dashboard" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { roles: ["superintendent"] });
  if (!identity.ok) return identity.response;
  const actorRole = identity.access.profile.commercialRole || identity.access.profile.role;
  if (actorRole !== "superintendent") return apiError("FORBIDDEN", "Este painel comparativo é exclusivo da superintendência.", identity.meta, { status: 403 });

  const organizationId = identity.access.organization.id;
  const [profileResult, leadResult] = await Promise.all([
    identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).limit(1000),
    identity.supabase.from("leads").select(LIVE_LEAD_SELECT).eq("organization_id", organizationId).limit(10000),
  ]);
  if (profileResult.error || leadResult.error) return apiError("TEAM_SUMMARY_FAILED", "Não foi possível consolidar os números das equipes.", identity.meta, { status: 503 });

  const profiles = resolveLiveHierarchy((profileResult.data ?? []) as unknown as CompatRow[]);
  const leads = ((leadResult.data ?? []) as unknown as CompatRow[]).map(mapLegacyLead);
  const visibleIds = descendantsFromLiveProfiles(profiles, identity.access.profile.id);
  const managers = profiles.filter((profile) => profile.commercial_role === "manager" && visibleIds.has(text(profile.id)));
  const brokers = profiles.filter((profile) => profile.commercial_role === "broker" && visibleIds.has(text(profile.id)));
  const now = Date.now();

  const rows = managers.map((manager) => {
    const teamIds = descendantsFromLiveProfiles(profiles, text(manager.id));
    const teamBrokers = brokers.filter((broker) => teamIds.has(text(broker.id)));
    const portfolio = leads.filter((lead) => teamIds.has(text(lead.assigned_to)));
    const activeLeads = portfolio.filter((lead) => !TERMINAL.has(normalize(lead.status)));
    const won = portfolio.filter((lead) => normalize(lead.status) === "ganho").length;
    const firstContactOverdue = activeLeads.filter((lead) => normalize(lead.status) === "novo" && (time(lead.created_at) ?? now) < now - 15 * 60_000).length;
    const followUpOverdue = activeLeads.filter((lead) => (time(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
    const withoutNextAction = activeLeads.filter((lead) => !lead.next_action_at).length;
    const online = teamBrokers.filter((broker) => ["online", "available", "disponivel"].includes(normalize(broker.availability_status))).length;
    const available = teamBrokers.filter((broker) => ["available", "disponivel"].includes(normalize(broker.availability_status))).length;
    return {
      managerId: text(manager.id), managerName: text(manager.full_name) || "Gerente", brokers: teamBrokers.length, online, available,
      leads: portfolio.length, activeLeads: activeLeads.length, hotLeads: activeLeads.filter((lead) => normalize(lead.temperature) === "quente" || number(lead.score) >= 70).length,
      firstContactOverdue, followUpOverdue, withoutNextAction, overdueLeads: firstContactOverdue + followUpOverdue, won,
      conversionRate: portfolio.length ? Math.round(won / portfolio.length * 1000) / 10 : 0,
      conversionSampleSufficient: portfolio.length >= 30,
      averageActivePerBroker: teamBrokers.length ? Math.round(activeLeads.length / teamBrokers.length * 10) / 10 : activeLeads.length,
      recentAssignments: portfolio.filter((lead) => (time(lead.created_at) ?? 0) >= now - 7 * 86_400_000).length,
      potentialVgv: activeLeads.reduce((sum, lead) => sum + number(lead.budget_max), 0),
    };
  });

  const comparable = rows.filter((row) => row.conversionSampleSufficient);
  const benchmark = comparable.length ? Math.round(comparable.reduce((sum, row) => sum + row.conversionRate, 0) / comparable.length * 10) / 10 : null;
  const averageLoad = rows.length ? rows.reduce((sum, row) => sum + row.averageActivePerBroker, 0) / rows.length : 0;
  const loadSpread = rows.length ? Math.round((Math.max(...rows.map((row) => row.averageActivePerBroker)) - Math.min(...rows.map((row) => row.averageActivePerBroker))) * 10) / 10 : 0;
  const enrichedRows = rows.map((row) => ({ ...row, comparison: !row.conversionSampleSufficient || benchmark === null ? "insufficient_sample" : row.conversionRate >= benchmark ? "at_or_above_benchmark" : "below_benchmark" }));
  const interventions = enrichedRows.flatMap((row) => [
    row.firstContactOverdue ? { managerId: row.managerId, managerName: row.managerName, severity: "critical", reason: `${row.firstContactOverdue} leads sem primeiro contato no prazo`, action: "Alinhar recuperação com o gerente hoje", href: `/brokers?manager=${row.managerId}` } : null,
    row.followUpOverdue >= 3 ? { managerId: row.managerId, managerName: row.managerName, severity: "attention", reason: `${row.followUpOverdue} follow-ups vencidos`, action: "Revisar capacidade e disciplina da equipe", href: `/brokers?manager=${row.managerId}` } : null,
    row.withoutNextAction >= 5 ? { managerId: row.managerId, managerName: row.managerName, severity: "attention", reason: `${row.withoutNextAction} leads sem próxima ação`, action: "Sanear a carteira com o gerente", href: `/brokers?manager=${row.managerId}` } : null,
  ]).filter(Boolean).slice(0, 12);
  const totals = enrichedRows.reduce((sum, row) => ({ managers: sum.managers + 1, brokers: sum.brokers + row.brokers, online: sum.online + row.online, available: sum.available + row.available, leads: sum.leads + row.leads, activeLeads: sum.activeLeads + row.activeLeads, hotLeads: sum.hotLeads + row.hotLeads, firstContactOverdue: sum.firstContactOverdue + row.firstContactOverdue, followUpOverdue: sum.followUpOverdue + row.followUpOverdue, withoutNextAction: sum.withoutNextAction + row.withoutNextAction, overdueLeads: sum.overdueLeads + row.overdueLeads, won: sum.won + row.won, potentialVgv: sum.potentialVgv + row.potentialVgv }), { managers: 0, brokers: 0, online: 0, available: 0, leads: 0, activeLeads: 0, hotLeads: 0, firstContactOverdue: 0, followUpOverdue: 0, withoutNextAction: 0, overdueLeads: 0, won: 0, potentialVgv: 0 });
  const scopedLeadCount = leads.filter((lead) => visibleIds.has(text(lead.assigned_to))).length;

  return apiSuccess({
    scope: { role: "superintendent", actorId: identity.access.profile.id, directManagersOnly: true, directBrokersPerManagerOnly: true, parallelStructuresExcluded: true, unassignedExcluded: true },
    totals,
    benchmark: { conversionRate: benchmark, minimumLeadsPerTeam: 30, comparableManagers: comparable.length },
    distribution: { averageActivePerBroker: Math.round(averageLoad * 10) / 10, spread: loadSpread, imbalanced: loadSpread >= Math.max(5, Math.ceil(averageLoad * 0.4)), metric: "active_leads_per_broker_by_direct_manager" },
    managers: enrichedRows.sort((left, right) => right.firstContactOverdue - left.firstContactOverdue || right.followUpOverdue - left.followUpOverdue || right.activeLeads - left.activeLeads),
    interventions,
    reconciliation: { managerLeadSum: enrichedRows.reduce((sum, row) => sum + row.leads, 0), scopedLeadCount, matches: enrichedRows.reduce((sum, row) => sum + row.leads, 0) === scopedLeadCount },
    governance: { readOnly: true, humanDecisionRequired: true, automaticTransfer: false },
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: rate.headers });
}
