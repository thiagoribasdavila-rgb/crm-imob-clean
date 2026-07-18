import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { mapLegacyLead, mapLegacyTask } from "@/lib/compat/legacy-v2";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type CalendarItem = {
  id: string;
  kind: "task" | "visit" | "follow_up";
  title: string;
  at: string;
  status: string;
  detail: string;
  href: string;
  leadId: string | null;
  overdue: boolean;
};

const terminalTasks = new Set(["concluida", "cancelada", "completed", "cancelled"]);
const terminalVisits = new Set(["completed", "cancelled", "no_show"]);

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 90, scope: "commercial-calendar-read" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;
  const now = Date.now();
  const admin = getSupabaseAdmin();

  const [tasks, visits, leads] = await Promise.all([
    admin.from("tasks").select("*").eq("organization_id", organizationId).limit(2000),
    admin.from("lead_visits").select("*").eq("organization_id", organizationId).limit(2000),
    admin.from("leads").select("*").eq("organization_id", organizationId).limit(2000),
  ]);
  if (tasks.error || leads.error) return apiError("CALENDAR_LOAD_FAILED", "Não foi possível carregar a agenda comercial.", identity.meta, { status: 500 });
  const leadRows = ((leads.data ?? []) as Record<string, unknown>[]).map(mapLegacyLead);
  const leadMap = new Map(leadRows.map((lead) => [String(lead.id), lead]));
  const taskRows = ((tasks.data ?? []) as Record<string, unknown>[]).map(mapLegacyTask);
  // Visitas são um complemento do calendário. Bases V2 podem não ter esta
  // relação; tarefas e follow-ups continuam disponíveis sem bloquear a agenda.
  const visitRows = visits.error ? [] : (visits.data ?? []);

  const activeVisitKeys = new Set(visitRows.filter((visit) => !terminalVisits.has(String(visit.status))).map((visit) => `${visit.lead_id}:${new Date(visit.scheduled_at).toISOString()}`));
  const items: CalendarItem[] = [];
  for (const task of taskRows) {
    if (terminalTasks.has(String(task.status)) || !task.due_at) continue;
    const lead = task.lead_id ? leadMap.get(String(task.lead_id)) : null;
    items.push({ id: String(task.id), kind: "task", title: String(task.title || "Tarefa comercial"), at: String(task.due_at), status: String(task.status||"pendente"), detail: `${lead?.name || "Sem lead"} · prioridade ${task.priority || "média"}`, href: task.lead_id ? `/leads/${task.lead_id}/tasks` : "/tasks", leadId: task.lead_id ? String(task.lead_id) : null, overdue: new Date(String(task.due_at)).getTime() < now });
  }
  for (const visit of visitRows) {
    if (terminalVisits.has(String(visit.status))) continue;
    const lead = Array.isArray(visit.lead) ? visit.lead[0] : visit.lead;
    items.push({ id: String(visit.id), kind: "visit", title: visit.format === "video" ? "Videochamada" : "Visita ao projeto", at: String(visit.scheduled_at), status: String(visit.status||"agendado"), detail: `${lead?.name || "Cliente"} · ${visit.location || "local a confirmar"}`, href: `/leads/${visit.lead_id}/schedule`, leadId: visit.lead_id ? String(visit.lead_id) : null, overdue: new Date(String(visit.scheduled_at)).getTime() < now });
  }
  for (const lead of leadRows) {
    const nextActionAt=lead.next_action_at?String(lead.next_action_at):"";
    const nextActionTime = Date.parse(nextActionAt);
    if (!nextActionAt || !Number.isFinite(nextActionTime)) continue;
    const normalizedNextActionAt = new Date(nextActionTime).toISOString();
    if (activeVisitKeys.has(`${lead.id}:${normalizedNextActionAt}`)) continue;
    items.push({ id: String(lead.id), kind: "follow_up", title: `Follow-up com ${lead.name || "lead"}`, at: normalizedNextActionAt, status: "agendado", detail: `Próxima ação · ${lead.status || "em atendimento"}`, href: `/leads/${lead.id}`, leadId: String(lead.id), overdue: nextActionTime < now });
  }
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime() || a.kind.localeCompare(b.kind));
  return apiSuccess({
    scope: { organizationId, actorId: identity.access.profile.id, hierarchicalRls: true },
    summary: { total: items.length, overdue: items.filter((item) => item.overdue).length, tasks: items.filter((item) => item.kind === "task").length, visits: items.filter((item) => item.kind === "visit").length, followUps: items.filter((item) => item.kind === "follow_up").length },
    items,
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
