import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  LIVE_LEAD_SELECT,
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
const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const text = (value: unknown) => (typeof value === "string" ? value : "");
const time = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const FIRST_CONTACT_SLA_SELECT =
  "id,first_contact_due_at,first_contacted_at,first_contact_sla_minutes,first_response_minutes,first_contact_sla_met";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, {
    limit: 60,
    scope: "manager-team-sla",
  });
  if (!limited.ok) return limited.response;

  const identity = await requireAccessContext(request, { roles: ["manager"] });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const managerId = identity.access.profile.id;
  const [profileResult, leadResult, slaResult] = await Promise.all([
    identity.supabase
      .from("profiles")
      .select(LIVE_PROFILE_SELECT)
      .eq("organization_id", organizationId)
      .eq("active", true)
      .limit(1000),
    identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT)
      .eq("organization_id", organizationId)
      .limit(10000),
    identity.supabase
      .from("leads")
      .select(FIRST_CONTACT_SLA_SELECT)
      .eq("organization_id", organizationId)
      .limit(10000),
  ]);

  if (profileResult.error || leadResult.error) {
    return apiError(
      "TEAM_SLA_LOAD_FAILED",
      "Não foi possível consolidar a fila de atendimento do time.",
      identity.meta,
      { status: 503 },
    );
  }

  const profiles = resolveLiveHierarchy(
    (profileResult.data ?? []) as unknown as CompatRow[],
  );
  const visibleIds = descendantsFromLiveProfiles(profiles, managerId);
  const brokers = profiles.filter(
    (profile) =>
      profile.commercial_role === "broker" &&
      visibleIds.has(text(profile.id)),
  );
  const brokerIds = new Set(brokers.map((broker) => text(broker.id)));
  const slaByLead = new Map(
    (slaResult.error ? [] : slaResult.data ?? []).map((row) => [
      text(row.id),
      row as unknown as CompatRow,
    ]),
  );
  const leads = ((leadResult.data ?? []) as unknown as CompatRow[])
    .map((row) => mapLegacyLead({ ...row, ...(slaByLead.get(text(row.id)) ?? {}) }))
    .filter((lead) => brokerIds.has(text(lead.assigned_to)));
  const brokerMap = new Map(
    brokers.map((broker) => [text(broker.id), text(broker.full_name) || "Corretor"]),
  );
  const now = Date.now();

  const alerts = leads
    .flatMap((lead) => {
      if (TERMINAL.has(normalize(lead.status))) return [];
      const owner = text(lead.assigned_to);
      const createdAt = time(lead.created_at);
      const nextAt = time(lead.next_action_at);
      const firstContactedAt = time(lead.first_contacted_at);
      const measuredDueAt = time(lead.first_contact_due_at);
      const configuredMinutes = number(lead.first_contact_sla_minutes) ?? 15;
      const rows: Array<{
        kind: "first_contact" | "follow_up";
        dueAt: string;
        overdueMinutes: number;
      }> = [];
      if (
        normalize(lead.status) === "novo" &&
        firstContactedAt === null &&
        createdAt !== null &&
        (measuredDueAt ?? createdAt + configuredMinutes * 60_000) < now
      ) {
        const dueAt = measuredDueAt ?? createdAt + configuredMinutes * 60_000;
        rows.push({
          kind: "first_contact",
          dueAt: new Date(dueAt).toISOString(),
          overdueMinutes: Math.max(1, Math.floor((now - dueAt) / 60_000)),
        });
      }
      if (nextAt !== null && nextAt < now) {
        rows.push({
          kind: "follow_up",
          dueAt: new Date(nextAt).toISOString(),
          overdueMinutes: Math.max(1, Math.floor((now - nextAt) / 60_000)),
        });
      }
      return rows.map((row) => ({
        ...row,
        leadId: text(lead.id),
        leadName: text(lead.name) || "Lead",
        brokerId: owner,
        brokerName: brokerMap.get(owner) || "Corretor",
      }));
    })
    .sort((left, right) => right.overdueMinutes - left.overdueMinutes)
    .slice(0, 100);

  const byBroker = brokers
    .map((broker) => {
      const brokerId = text(broker.id);
      const brokerLeads = leads.filter(
        (lead) => text(lead.assigned_to) === brokerId,
      );
      const measuredLeads = brokerLeads.filter(
        (lead) => number(lead.first_response_minutes) !== null,
      );
      const metLeads = measuredLeads.filter(
        (lead) => lead.first_contact_sla_met === true,
      );
      const responseMinutes = measuredLeads
        .map((lead) => number(lead.first_response_minutes))
        .filter((value): value is number => value !== null);
      return {
        brokerId,
        brokerName: text(broker.full_name) || "Corretor",
        firstContactOverdue: alerts.filter(
          (alert) =>
            alert.brokerId === brokerId && alert.kind === "first_contact",
        ).length,
        followUpOverdue: alerts.filter(
          (alert) =>
            alert.brokerId === brokerId && alert.kind === "follow_up",
        ).length,
        measured: measuredLeads.length,
        met: metLeads.length,
        complianceRate:
          measuredLeads.length > 0
            ? Math.round((metLeads.length / measuredLeads.length) * 1000) / 10
            : null,
        averageResponseMinutes:
          responseMinutes.length > 0
            ? Math.round(
                responseMinutes.reduce((sum, value) => sum + value, 0) /
                  responseMinutes.length,
              )
            : null,
        followUpsMeasured: 0,
        followUpComplianceRate: null,
        recoveredFollowUps: 0,
      };
    })
    .sort(
      (left, right) =>
        right.firstContactOverdue - left.firstContactOverdue ||
        right.followUpOverdue - left.followUpOverdue,
    );

  const measuredLeads = leads.filter(
    (lead) => number(lead.first_response_minutes) !== null,
  );
  const metLeads = measuredLeads.filter(
    (lead) => lead.first_contact_sla_met === true,
  );
  const responseMinutes = measuredLeads
    .map((lead) => number(lead.first_response_minutes))
    .filter((value): value is number => value !== null);

  return apiSuccess(
    {
      scope: {
        role: "manager",
        directBrokersOnly: true,
        organizationId,
      },
      totals: {
        alerts: alerts.length,
        firstContactOverdue: alerts.filter(
          (alert) => alert.kind === "first_contact",
        ).length,
        followUpOverdue: alerts.filter((alert) => alert.kind === "follow_up")
          .length,
        brokersWithAlerts: byBroker.filter(
          (broker) =>
            broker.firstContactOverdue + broker.followUpOverdue > 0,
        ).length,
        measured: measuredLeads.length,
        met: metLeads.length,
        complianceRate:
          measuredLeads.length > 0
            ? Math.round((metLeads.length / measuredLeads.length) * 1000) / 10
            : null,
        averageResponseMinutes:
          responseMinutes.length > 0
            ? Math.round(
                responseMinutes.reduce((sum, value) => sum + value, 0) /
                  responseMinutes.length,
              )
            : null,
        followUpsMeasured: 0,
        followUpComplianceRate: null,
        recoveredFollowUps: 0,
        averageFollowUpMinutes: null,
      },
      alerts,
      byBroker,
      measurement: {
        status: slaResult.error ? "awaiting-ddl" : "live",
        fields: ["first_response_minutes", "first_contact_sla_met"],
        reason: slaResult.error
          ? "A operação segue ativa; a medição real será habilitada após a migration de SLA."
          : "Tempo e cumprimento calculados pelos eventos reais de primeiro contato.",
      },
      compatibility: "live-schema-safe",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: limited.headers },
  );
}
