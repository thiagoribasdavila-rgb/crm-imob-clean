import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

const CLOSED = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const DONE = new Set(["done", "concluido", "concluida", "completed", "cancelado"]);
const DAY = 86_400_000;

function timestamp(value: unknown) {
  const parsed = typeof value === "string" ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "broker.daily-dashboard" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { roles: ["broker"] });
  if (!identity.ok) return identity.response;

  const now = Date.now();
  const { data: leads, error: leadsError } = await identity.supabase
    .from("leads")
    .select("id,name,status,score,temperature,development_id,source,created_at,last_interaction_at,next_action_at,first_contact_due_at,first_contacted_at")
    .eq("organization_id", identity.access.organization.id)
    .eq("assigned_to", identity.access.profile.id)
    .order("score", { ascending: false })
    .limit(300);
  if (leadsError) return apiError("BROKER_DAILY_LEADS_FAILED", "Não foi possível preparar sua carteira diária.", identity.meta, { status: 500 });

  const activeLeads = (leads ?? []).filter((lead) => !CLOSED.has(String(lead.status || "").toLowerCase()));
  const leadIds = activeLeads.map((lead) => lead.id);
  const taskQuery = identity.supabase
    .from("tasks")
    .select("id,title,status,priority,due_at,lead_id")
    .eq("organization_id", identity.access.organization.id)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(300);
  const { data: rawTasks, error: tasksError } = leadIds.length ? await taskQuery.in("lead_id", leadIds) : { data: [], error: null };
  if (tasksError) return apiError("BROKER_DAILY_TASKS_FAILED", "Não foi possível preparar suas tarefas diárias.", identity.meta, { status: 500 });

  const openTasks = (rawTasks ?? []).filter((task) => !DONE.has(String(task.status || "").toLowerCase()));
  const overdueByLead = new Set(openTasks.filter((task) => (timestamp(task.due_at) ?? Number.MAX_SAFE_INTEGER) < now).map((task) => task.lead_id));
  const priorities = activeLeads.map((lead) => {
    const score = Number(lead.score || 0);
    const hot = String(lead.temperature || "").toLowerCase() === "quente" || score >= 70;
    const firstContactDue = timestamp(lead.first_contact_due_at);
    const nextActionAt = timestamp(lead.next_action_at);
    const firstContactOverdue = !lead.first_contacted_at && firstContactDue !== null && firstContactDue < now;
    const followUpOverdue = nextActionAt !== null && nextActionAt < now;
    const taskOverdue = overdueByLead.has(lead.id);
    const noNextAction = nextActionAt === null;
    const priorityScore = score + (firstContactOverdue ? 120 : 0) + (followUpOverdue ? 90 : 0) + (taskOverdue ? 50 : 0) + (hot ? 30 : 0) + (noNextAction ? 15 : 0);
    const reason = firstContactOverdue ? "Primeiro contato fora do SLA" : followUpOverdue ? "Follow-up vencido" : taskOverdue ? "Tarefa vinculada atrasada" : hot ? "Lead quente com alta intenção" : noNextAction ? "Sem próxima ação definida" : "Maior potencial da carteira";
    const nextBestAction = firstContactOverdue ? "Entrar em contato agora e registrar o resultado" : followUpOverdue ? "Retomar a conversa e combinar uma nova data" : taskOverdue ? "Concluir a tarefa pendente antes de avançar" : hot ? "Confirmar interesse, projeto e próximo compromisso" : noNextAction ? "Definir uma próxima ação com data" : "Revisar o histórico e executar a ação programada";
    return { leadId: lead.id, leadName: lead.name || "Lead sem nome", status: lead.status || "novo", score, priorityScore, reason, nextBestAction, dueAt: lead.first_contacted_at ? lead.next_action_at : lead.first_contact_due_at || lead.next_action_at, hot, source: lead.source || null, developmentId: lead.development_id || null };
  }).sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 7);

  const agenda = openTasks
    .filter((task) => { const due = timestamp(task.due_at); return due !== null && due <= now + 7 * DAY; })
    .slice(0, 8)
    .map((task) => ({ id: task.id, title: task.title || "Tarefa", dueAt: task.due_at, priority: task.priority || "normal", leadId: task.lead_id, overdue: (timestamp(task.due_at) ?? now) < now }));
  const firstContactOverdue = activeLeads.filter((lead) => !lead.first_contacted_at && (timestamp(lead.first_contact_due_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
  const followUpOverdue = activeLeads.filter((lead) => (timestamp(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now).length;

  return apiSuccess({
    scope: { role: "broker", ownPortfolioOnly: true, brokerId: identity.access.profile.id },
    summary: { activeLeads: activeLeads.length, hotLeads: activeLeads.filter((lead) => String(lead.temperature || "").toLowerCase() === "quente" || Number(lead.score || 0) >= 70).length, openTasks: openTasks.length, overdueTasks: openTasks.filter((task) => (timestamp(task.due_at) ?? Number.MAX_SAFE_INTEGER) < now).length, firstContactOverdue, followUpOverdue, agendaNext7Days: agenda.length },
    priorities,
    agenda,
    ranking: { explainable: true, signals: ["score", "first_contact_sla", "follow_up", "overdue_task", "temperature", "missing_next_action"], humanApprovalRequired: true },
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: rate.headers });
}
