import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  readCompatibleLeads,
  readCompatibleTasks,
} from "@/lib/atlas/core-v2/live-repositories";

export const dynamic = "force-dynamic";

const DONE = new Set([
  "done",
  "concluido",
  "concluida",
  "completed",
  "cancelado",
  "cancelada",
]);
const CLOSED = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const time = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

type Step = {
  id: string;
  kind: "task" | "lead" | "visit";
  signal:
    | "first_contact_sla"
    | "follow_up_sla"
    | "task_due_at"
    | "visit_time"
    | "priority"
    | "temperature"
    | "score";
  title: string;
  reason: string;
  action: string;
  href: string;
  dueAt: string | null;
  urgency: "now" | "today" | "planned";
  weight: number;
};

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    scope: "daily-productivity",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const actorId = identity.access.profile.id;
  const maximumSteps = 7;
  const now = Date.now();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const [taskResult, leadResult, visitResult] = await Promise.all([
    readCompatibleTasks(identity.supabase, {
      organizationId,
      limit: 500,
    }),
    readCompatibleLeads(identity.supabase, {
      organizationId,
      limit: 500,
    }),
    identity.supabase
      .from("lead_visits")
      .select("id,lead_id,broker_id,scheduled_at,status,format,location")
      .eq("organization_id", organizationId)
      .eq("broker_id", actorId)
      .order("scheduled_at", { ascending: true })
      .limit(500),
  ]);

  if (!taskResult.ok || !leadResult.ok) {
    return apiError(
      "PRODUCTIVITY_LOAD_FAILED",
      "Não foi possível preparar seu dia.",
      identity.meta,
      { status: 503 },
    );
  }

  // RLS already limits visibility. These explicit owner filters make the daily
  // assistant personal even for managers with a broader commercial scope.
  const tasks = taskResult.rows.filter(
    (task) => String(task.assigned_to || "") === actorId,
  );
  const leads = leadResult.rows.filter(
    (lead) => String(lead.assigned_to || "") === actorId,
  );
  // Visits are optional until the corresponding DDL is applied. Their absence
  // must not block tasks, follow-ups or first-contact SLAs.
  const visits = visitResult.error ? [] : visitResult.data ?? [];
  const steps: Step[] = [];

  for (const task of tasks) {
    if (DONE.has(normalize(task.status))) continue;
    const due = time(task.due_at);
    const overdue = due !== null && due < now;
    const isToday = due !== null && due <= today.getTime();
    const high = ["alta", "high", "critical"].includes(normalize(task.priority));
    steps.push({
      id: String(task.id),
      kind: "task",
      signal: high ? "priority" : "task_due_at",
      title: String(task.title || "Tarefa comercial"),
      reason: overdue
        ? "Prazo vencido"
        : isToday
          ? "Compromisso de hoje"
          : high
            ? "Alta prioridade"
            : "Tarefa programada",
      action: overdue
        ? "Resolver ou reagendar com contexto"
        : "Executar e registrar o resultado",
      href: task.lead_id ? `/leads/${task.lead_id}` : "/tasks",
      dueAt: task.due_at ? String(task.due_at) : null,
      urgency: overdue ? "now" : isToday ? "today" : "planned",
      weight:
        (overdue ? 500 : isToday ? 300 : 0) +
        (high ? 100 : 0) +
        (due ? Math.max(0, 72 - Math.floor((due - now) / 3_600_000)) : 10),
    });
  }

  for (const lead of leads) {
    if (CLOSED.has(normalize(lead.status))) continue;
    const createdAt = time(lead.created_at);
    const nextAt = time(lead.next_action_at);
    const firstLate =
      normalize(lead.status) === "novo" &&
      createdAt !== null &&
      createdAt < now - 15 * 60_000;
    const followLate = nextAt !== null && nextAt < now;
    const hot = normalize(lead.temperature) === "quente" || Number(lead.score || 0) >= 70;
    if (!firstLate && !followLate && !hot && nextAt !== null) continue;
    steps.push({
      id: String(lead.id),
      kind: "lead",
      signal: firstLate
        ? "first_contact_sla"
        : followLate
          ? "follow_up_sla"
          : hot
            ? normalize(lead.temperature) === "quente"
              ? "temperature"
              : "score"
            : "follow_up_sla",
      title: String(lead.name || "Lead sem nome"),
      reason: firstLate
        ? "Lead novo aguardando contato"
        : followLate
          ? "Follow-up vencido"
          : hot
            ? "Lead quente"
            : "Lead sem próxima ação",
      action: firstLate
        ? "Fazer o primeiro contato e registrar o resultado"
        : followLate
          ? "Retomar a conversa e combinar nova data"
          : hot
            ? "Confirmar intenção e próximo compromisso"
            : "Definir próxima ação com data",
      href: `/leads/${lead.id}`,
      dueAt: lead.next_action_at ? String(lead.next_action_at) : null,
      urgency: firstLate || followLate ? "now" : "today",
      weight:
        (firstLate ? 650 : followLate ? 550 : hot ? 260 : 180) +
        Math.min(100, Number(lead.score || 0)),
    });
  }

  for (const visit of visits) {
    if (
      ["completed", "cancelled", "no_show"].includes(
        normalize(visit.status),
      )
    ) {
      continue;
    }
    const visitAt = time(visit.scheduled_at);
    if (visitAt === null) continue;
    const overdue = visitAt < now;
    const isToday = visitAt <= today.getTime();
    if (!overdue && !isToday) continue;
    const lead = leads.find(
      (item) => String(item.id) === String(visit.lead_id),
    );
    steps.push({
      id: String(visit.id),
      kind: "visit",
      signal: "visit_time",
      title: `${visit.format === "video" ? "Videochamada" : "Visita"} com ${String(lead?.name || "cliente")}`,
      reason: overdue ? "Visita com horário vencido" : "Visita de hoje",
      action: overdue
        ? "Registrar o resultado ou reagendar"
        : "Preparar materiais e confirmar presença",
      href: visit.lead_id ? `/leads/${visit.lead_id}/schedule` : "/calendar",
      dueAt: String(visit.scheduled_at),
      urgency: overdue ? "now" : "today",
      weight:
        (overdue ? 700 : 420) +
        Math.max(0, 48 - Math.floor((visitAt - now) / 3_600_000)),
    });
  }

  const sequence = steps
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        (time(left.dueAt) ?? Number.MAX_SAFE_INTEGER) -
          (time(right.dueAt) ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, maximumSteps)
    .map((step, index) => ({
      id: step.id,
      kind: step.kind,
      signal: step.signal,
      title: step.title,
      reason: step.reason,
      action: step.action,
      href: step.href,
      dueAt: step.dueAt,
      urgency: step.urgency,
      position: index + 1,
    }));

  return apiSuccess(
    {
      scope: { personalOnly: true, actorId, hierarchicalRls: true },
      summary: {
        steps: sequence.length,
        now: sequence.filter((step) => step.urgency === "now").length,
        today: sequence.filter((step) => step.urgency === "today").length,
        planned: sequence.filter((step) => step.urgency === "planned").length,
      },
      sequence,
      method: {
        llmCost: 0,
        explainable: true,
        signals: [
          "first_contact_sla",
          "follow_up_sla",
          "task_due_at",
          "visit_time",
          "priority",
          "temperature",
          "score",
        ],
        humanDecisionRequired: true,
        peopleRanking: false,
        automaticExecution: false,
      },
      sources: {
        tasks: taskResult.source,
        leads: leadResult.source,
        visits: visitResult.error ? "awaiting-ddl" : "public.lead_visits",
      },
      compatibility: "v2-v3-live-schema-safe",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
