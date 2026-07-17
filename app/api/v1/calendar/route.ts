import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

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

  const [tasks, visits, leads] = await Promise.all([
    identity.supabase.from("tasks").select("id,title,due_at,priority,status,lead_id,lead:leads(id,name)").eq("organization_id", organizationId).not("due_at", "is", null).order("due_at", { ascending: true }).limit(2000),
    identity.supabase.from("lead_visits").select("id,lead_id,scheduled_at,status,format,location,lead:leads(id,name)").eq("organization_id", organizationId).order("scheduled_at", { ascending: true }).limit(2000),
    identity.supabase.from("leads").select("id,name,next_action_at,status").eq("organization_id", organizationId).not("next_action_at", "is", null).order("next_action_at", { ascending: true }).limit(2000),
  ]);
  if (tasks.error || visits.error || leads.error) return apiError("CALENDAR_LOAD_FAILED", "Não foi possível carregar a agenda comercial.", identity.meta, { status: 500 });

  const activeVisitKeys = new Set((visits.data ?? []).filter((visit) => !terminalVisits.has(String(visit.status))).map((visit) => `${visit.lead_id}:${new Date(visit.scheduled_at).toISOString()}`));
  const items: CalendarItem[] = [];
  for (const task of tasks.data ?? []) {
    if (terminalTasks.has(String(task.status)) || !task.due_at) continue;
    const lead = Array.isArray(task.lead) ? task.lead[0] : task.lead;
    items.push({ id: task.id, kind: "task", title: task.title || "Tarefa comercial", at: task.due_at, status: task.status, detail: `${lead?.name || "Sem lead"} · prioridade ${task.priority || "média"}`, href: task.lead_id ? `/leads/${task.lead_id}/tasks` : "/tasks", leadId: task.lead_id, overdue: new Date(task.due_at).getTime() < now });
  }
  for (const visit of visits.data ?? []) {
    if (terminalVisits.has(String(visit.status))) continue;
    const lead = Array.isArray(visit.lead) ? visit.lead[0] : visit.lead;
    items.push({ id: visit.id, kind: "visit", title: visit.format === "video" ? "Videochamada" : "Visita ao projeto", at: visit.scheduled_at, status: visit.status, detail: `${lead?.name || "Cliente"} · ${visit.location || "local a confirmar"}`, href: `/leads/${visit.lead_id}/schedule`, leadId: visit.lead_id, overdue: new Date(visit.scheduled_at).getTime() < now });
  }
  for (const lead of leads.data ?? []) {
    if (!lead.next_action_at || activeVisitKeys.has(`${lead.id}:${new Date(lead.next_action_at).toISOString()}`)) continue;
    items.push({ id: lead.id, kind: "follow_up", title: `Follow-up com ${lead.name || "lead"}`, at: lead.next_action_at, status: "agendado", detail: `Próxima ação · ${lead.status || "em atendimento"}`, href: `/leads/${lead.id}`, leadId: lead.id, overdue: new Date(lead.next_action_at).getTime() < now });
  }
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime() || a.kind.localeCompare(b.kind));
  return apiSuccess({
    scope: { organizationId, actorId: identity.access.profile.id, hierarchicalRls: true },
    summary: { total: items.length, overdue: items.filter((item) => item.overdue).length, tasks: items.filter((item) => item.kind === "task").length, visits: items.filter((item) => item.kind === "visit").length, followUps: items.filter((item) => item.kind === "follow_up").length },
    items,
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
