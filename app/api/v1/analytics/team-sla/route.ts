import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 60, scope: "manager-team-sla" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = identity.access.profile.commercialRole || identity.access.profile.role;
  if (role !== "manager") return apiError("FORBIDDEN", "A fila operacional de SLA é exclusiva do gerente.", identity.meta, { status: 403 });

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const { data: brokers, error: brokerError } = await admin.from("profiles").select("id,full_name").eq("organization_id", organizationId).eq("reports_to", identity.access.profile.id).eq("active", true).or("commercial_role.eq.broker,and(commercial_role.is.null,role.eq.broker)");
  if (brokerError) return apiError("TEAM_LOOKUP_FAILED", "Não foi possível carregar os corretores diretos.", identity.meta, { status: 500 });
  const brokerIds = (brokers ?? []).map((broker) => broker.id);
  const { data: leads, error: leadError } = brokerIds.length ? await admin.from("leads").select("id,name,assigned_to,status,first_contact_due_at,first_contacted_at,first_response_minutes,first_contact_sla_met,next_action_at").eq("organization_id", organizationId).in("assigned_to", brokerIds).limit(5000) : { data: [], error: null };
  if (leadError) return apiError("SLA_LOOKUP_FAILED", "Não foi possível consolidar os SLAs do time.", identity.meta, { status: 500 });
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: followUpEvents, error: followUpError } = brokerIds.length ? await admin.from("follow_up_sla_events").select("broker_id,status,on_time,response_minutes,delay_minutes,scheduled_at").eq("organization_id", organizationId).in("broker_id", brokerIds).gte("scheduled_at", thirtyDaysAgo).limit(10000) : { data: [], error: null };
  if (followUpError) return apiError("FOLLOW_UP_SLA_LOOKUP_FAILED", "Não foi possível medir a execução dos follow-ups.", identity.meta, { status: 500 });
  const brokerMap = new Map((brokers ?? []).map((broker) => [broker.id, broker.full_name || "Corretor"]));
  const terminal = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
  const now = Date.now();
  const alerts = (leads ?? []).flatMap((lead) => {
    if (terminal.has(String(lead.status || "").toLowerCase())) return [];
    const firstDue = lead.first_contact_due_at ? new Date(lead.first_contact_due_at).getTime() : null;
    const nextDue = lead.next_action_at ? new Date(lead.next_action_at).getTime() : null;
    const rows = [];
    if (firstDue && firstDue < now && !lead.first_contacted_at) rows.push({ kind: "first_contact" as const, dueAt: lead.first_contact_due_at, overdueMinutes: Math.max(1, Math.floor((now - firstDue) / 60_000)) });
    if (nextDue && nextDue < now) rows.push({ kind: "follow_up" as const, dueAt: lead.next_action_at, overdueMinutes: Math.max(1, Math.floor((now - nextDue) / 60_000)) });
    return rows.map((row) => ({ ...row, leadId: lead.id, leadName: lead.name || "Lead", brokerId: lead.assigned_to!, brokerName: brokerMap.get(lead.assigned_to!) || "Corretor" }));
  }).sort((a, b) => b.overdueMinutes - a.overdueMinutes).slice(0, 100);
  const byBroker = (brokers ?? []).map((broker) => {
    const owned = (leads ?? []).filter((lead) => lead.assigned_to === broker.id);
    const measured = owned.filter((lead) => lead.first_contact_sla_met !== null);
    const met = measured.filter((lead) => lead.first_contact_sla_met === true);
    const responseValues = owned.map((lead) => lead.first_response_minutes).filter((value): value is number => typeof value === "number");
    const followUps = (followUpEvents ?? []).filter((event) => event.broker_id === broker.id && ["completed", "recovered"].includes(event.status));
    const followUpsOnTime = followUps.filter((event) => event.on_time === true);
    const recovered = followUps.filter((event) => event.status === "recovered");
    return {
      brokerId: broker.id,
      brokerName: broker.full_name || "Corretor",
      firstContactOverdue: alerts.filter((alert) => alert.brokerId === broker.id && alert.kind === "first_contact").length,
      followUpOverdue: alerts.filter((alert) => alert.brokerId === broker.id && alert.kind === "follow_up").length,
      measured: measured.length,
      met: met.length,
      complianceRate: measured.length ? Math.round((met.length / measured.length) * 100) : null,
      averageResponseMinutes: responseValues.length ? Math.round(responseValues.reduce((sum, value) => sum + value, 0) / responseValues.length) : null,
      followUpsMeasured: followUps.length,
      followUpComplianceRate: followUps.length ? Math.round((followUpsOnTime.length / followUps.length) * 100) : null,
      recoveredFollowUps: recovered.length,
    };
  }).sort((a, b) => b.firstContactOverdue - a.firstContactOverdue || b.measured - a.measured);
  const measured = (leads ?? []).filter((lead) => lead.first_contact_sla_met !== null);
  const met = measured.filter((lead) => lead.first_contact_sla_met === true);
  const responseValues = (leads ?? []).map((lead) => lead.first_response_minutes).filter((value): value is number => typeof value === "number");
  const completedFollowUps = (followUpEvents ?? []).filter((event) => ["completed", "recovered"].includes(event.status));
  const onTimeFollowUps = completedFollowUps.filter((event) => event.on_time === true);
  const recoveredFollowUps = completedFollowUps.filter((event) => event.status === "recovered");
  const followUpResponseValues = completedFollowUps.map((event) => event.response_minutes).filter((value): value is number => typeof value === "number");
  return apiSuccess({
    scope: { role: "manager", directBrokersOnly: true, organizationId },
    totals: {
      alerts: alerts.length,
      firstContactOverdue: alerts.filter((alert) => alert.kind === "first_contact").length,
      followUpOverdue: alerts.filter((alert) => alert.kind === "follow_up").length,
      brokersWithAlerts: byBroker.filter((broker) => broker.firstContactOverdue + broker.followUpOverdue > 0).length,
      measured: measured.length,
      met: met.length,
      complianceRate: measured.length ? Math.round((met.length / measured.length) * 100) : null,
      averageResponseMinutes: responseValues.length ? Math.round(responseValues.reduce((sum, value) => sum + value, 0) / responseValues.length) : null,
      followUpsMeasured: completedFollowUps.length,
      followUpComplianceRate: completedFollowUps.length ? Math.round((onTimeFollowUps.length / completedFollowUps.length) * 100) : null,
      recoveredFollowUps: recoveredFollowUps.length,
      averageFollowUpMinutes: followUpResponseValues.length ? Math.round(followUpResponseValues.reduce((sum, value) => sum + value, 0) / followUpResponseValues.length) : null,
    },
    alerts,
    byBroker,
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: limited.headers });
}
