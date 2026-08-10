import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  LIVE_LEAD_SELECT,
  isMissingColumn,
  mapLegacyLead,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import {
  LIVE_PROFILE_SELECT,
  descendantsFromLiveProfiles,
  resolveLiveHierarchy,
} from "@/lib/compat/live-hierarchy";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const DAY = 86_400_000;
const MANAGER_PROFILE_SELECT =
  "id,full_name,role,access_role,commercial_role,reports_to,active,organization_id,team,max_active_leads,availability_status";
const MANAGER_LEAD_SELECT =
  "id,name,source,status,score,temperature,assigned_to,created_at,organization_id,next_action_at,development_id";
const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const text = (value: unknown) => (typeof value === "string" ? value : "");
const number = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const time = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    scope: "manager.daily-dashboard",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, { roles: ["manager"] });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const managerId = identity.access.profile.id;
  const canonicalProfileResult = await identity.supabase
    .from("profiles")
    .select(MANAGER_PROFILE_SELECT)
    .eq("organization_id", organizationId)
    .eq("active", true)
    .eq("commercial_role", "broker")
    .eq("reports_to", managerId)
    .limit(1000);
  let profileRows = (canonicalProfileResult.data ?? []) as unknown as CompatRow[];
  let profileError = canonicalProfileResult.error;
  let directHierarchyResolved = !canonicalProfileResult.error;
  if (isMissingColumn(canonicalProfileResult.error)) {
    const legacyProfileResult = await identity.supabase
      .from("profiles")
      .select(LIVE_PROFILE_SELECT)
      .eq("organization_id", organizationId)
      .eq("active", true)
      .limit(1000);
    profileRows = (legacyProfileResult.data ?? []) as unknown as CompatRow[];
    profileError = legacyProfileResult.error;
    directHierarchyResolved = false;
  }

  const canonicalLeadResult = await identity.supabase
    .from("leads")
    .select(MANAGER_LEAD_SELECT)
    .eq("organization_id", organizationId)
    .limit(10000);
  let leadRows = (canonicalLeadResult.data ?? []) as unknown as CompatRow[];
  let leadError = canonicalLeadResult.error;
  if (isMissingColumn(canonicalLeadResult.error)) {
    const legacyLeadResult = await identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT)
      .eq("organization_id", organizationId)
      .limit(10000);
    leadRows = (legacyLeadResult.data ?? []) as unknown as CompatRow[];
    leadError = legacyLeadResult.error;
  }

  if (profileError || leadError) {
    return apiError(
      "MANAGER_OPERATION_FAILED",
      "Não foi possível consolidar a operação do time.",
      identity.meta,
      { status: 503 },
    );
  }

  const profiles = resolveLiveHierarchy(profileRows);
  const visibleIds = directHierarchyResolved
    ? new Set(profiles.map((profile) => text(profile.id)))
    : descendantsFromLiveProfiles(profiles, managerId);
  const brokers = profiles.filter(
    (profile) =>
      profile.commercial_role === "broker" &&
      visibleIds.has(text(profile.id)) &&
      (!directHierarchyResolved || text(profile.reports_to) === managerId),
  );
  const brokerIds = new Set(brokers.map((broker) => text(broker.id)));
  const leads = leadRows
    .map(mapLegacyLead)
    .filter((lead) => brokerIds.has(text(lead.assigned_to)));
  const now = Date.now();

  const rows = brokers.map((broker) => {
    const brokerId = text(broker.id);
    const portfolio = leads.filter((lead) => text(lead.assigned_to) === brokerId);
    const active = portfolio.filter(
      (lead) => !TERMINAL.has(normalize(lead.status)),
    );
    const won = portfolio.filter((lead) => normalize(lead.status) === "ganho").length;
    const firstContactOverdue = active.filter(
      (lead) =>
        normalize(lead.status) === "novo" &&
        (time(lead.created_at) ?? now) < now - 15 * 60_000,
    ).length;
    const followUpOverdue = active.filter(
      (lead) => (time(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now,
    ).length;
    const withoutNextAction = active.filter((lead) => !lead.next_action_at).length;
    const hot = active.filter(
      (lead) => normalize(lead.temperature) === "quente" || number(lead.score) >= 70,
    ).length;
    const recentAssignments = portfolio.filter(
      (lead) => (time(lead.created_at) ?? 0) >= now - DAY,
    ).length;
    const availability = normalize(broker.availability_status) || "offline";
    const online = ["online", "available", "disponivel"].includes(availability);

    return {
      brokerId,
      brokerName: text(broker.full_name) || "Corretor",
      availability: online ? availability : "offline",
      online,
      leads: portfolio.length,
      activeLeads: active.length,
      hotLeads: hot,
      won,
      conversionRate: portfolio.length
        ? Math.round((won / portfolio.length) * 1000) / 10
        : 0,
      conversionSampleSufficient: portfolio.length >= 20,
      firstContactOverdue,
      followUpOverdue,
      withoutNextAction,
      recentAssignments,
    };
  });

  const average = rows.length
    ? rows.reduce((sum, row) => sum + row.activeLeads, 0) / rows.length
    : 0;
  const spread = rows.length
    ? Math.max(...rows.map((row) => row.activeLeads)) -
      Math.min(...rows.map((row) => row.activeLeads))
    : 0;
  const interventions = rows
    .flatMap((row) => {
      const actions: Array<{
        severity: "critical" | "attention" | "opportunity";
        reason: string;
        action: string;
      }> = [];
      if (row.firstContactOverdue) {
        actions.push({
          severity: "critical",
          reason: `${row.firstContactOverdue} leads novos aguardando contato`,
          action: "Definir recuperação de atendimento ainda hoje",
        });
      }
      if (row.followUpOverdue) {
        actions.push({
          severity: "attention",
          reason: `${row.followUpOverdue} follow-ups vencidos`,
          action: "Revisar a fila e confirmar próximas datas",
        });
      }
      if (row.withoutNextAction >= 3) {
        actions.push({
          severity: "attention",
          reason: `${row.withoutNextAction} leads sem próxima ação`,
          action: "Organizar a carteira com o corretor",
        });
      }
      if (
        average > 0 &&
        row.activeLeads > average * 1.4 &&
        row.activeLeads - average >= 3
      ) {
        actions.push({
          severity: "opportunity",
          reason: `Carga ${Math.round(row.activeLeads - average)} acima da média`,
          action: "Avaliar redistribuição sem romper atendimentos ativos",
        });
      }
      return actions.map((item) => ({
        brokerId: row.brokerId,
        brokerName: row.brokerName,
        ...item,
        href: `/brokers?broker=${row.brokerId}`,
      }));
    })
    .sort((left, right) => {
      const weight = { critical: 0, attention: 1, opportunity: 2 } as const;
      return weight[left.severity] - weight[right.severity];
    })
    .slice(0, 12);

  const totals = rows.reduce(
    (sum, row) => ({
      brokers: sum.brokers + 1,
      online: sum.online + Number(row.online),
      available:
        sum.available +
        Number(["available", "disponivel"].includes(row.availability)),
      activeLeads: sum.activeLeads + row.activeLeads,
      hotLeads: sum.hotLeads + row.hotLeads,
      won: sum.won + row.won,
      firstContactOverdue:
        sum.firstContactOverdue + row.firstContactOverdue,
      followUpOverdue: sum.followUpOverdue + row.followUpOverdue,
      withoutNextAction: sum.withoutNextAction + row.withoutNextAction,
    }),
    {
      brokers: 0,
      online: 0,
      available: 0,
      activeLeads: 0,
      hotLeads: 0,
      won: 0,
      firstContactOverdue: 0,
      followUpOverdue: 0,
      withoutNextAction: 0,
    },
  );

  return apiSuccess(
    {
      scope: {
        role: "manager",
        directBrokersOnly: true,
        managerId,
        organizationId,
        parallelTeamsExcluded: true,
      },
      totals,
      distribution: {
        averageActiveLeads: Math.round(average * 10) / 10,
        spread,
        imbalanced: spread >= Math.max(5, Math.ceil(average * 0.4)),
        metric: "active_leads_per_direct_broker",
      },
      brokers: rows.sort(
        (left, right) =>
          right.firstContactOverdue - left.firstContactOverdue ||
          right.followUpOverdue - left.followUpOverdue ||
          right.activeLeads - left.activeLeads,
      ),
      interventions,
      compatibility: "live-schema-safe",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: rate.headers },
  );
}
