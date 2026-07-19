import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  LIVE_LEAD_SELECT,
  mapLegacyLead,
  mapLegacyTask,
  type CompatRow,
} from "@/lib/compat/legacy-v2";

export const dynamic = "force-dynamic";

const CLOSED = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const DONE = new Set([
  "done",
  "concluido",
  "concluida",
  "completed",
  "cancelado",
  "cancelada",
]);
const DAY = 86_400_000;
const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const timestamp = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    scope: "broker.daily-dashboard",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, { roles: ["broker"] });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const brokerId = identity.access.profile.id;
  const now = Date.now();
  const [leadResult, taskResult] = await Promise.all([
    identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT)
      .eq("organization_id", organizationId)
      .eq("assigned_user_id", brokerId)
      .limit(1000),
    identity.supabase
      .from("tasks")
      .select(
        "id,title,description,status,user_id,lead_id,created_at,organization_id,priority,due_date",
      )
      .eq("organization_id", organizationId)
      .eq("user_id", brokerId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1000),
  ]);

  if (leadResult.error || taskResult.error) {
    return apiError(
      "BROKER_DAILY_LOAD_FAILED",
      "Não foi possível preparar sua operação diária.",
      identity.meta,
      { status: 503 },
    );
  }

  const activeLeads = ((leadResult.data ?? []) as unknown as CompatRow[])
    .map(mapLegacyLead)
    .filter((lead) => !CLOSED.has(normalize(lead.status)));
  const activeIds = new Set(activeLeads.map((lead) => String(lead.id)));
  const openTasks = ((taskResult.data ?? []) as unknown as CompatRow[])
    .map(mapLegacyTask)
    .filter(
      (task) =>
        !DONE.has(normalize(task.status)) &&
        (!task.lead_id || activeIds.has(String(task.lead_id))),
    );
  const overdueByLead = new Set(
    openTasks
      .filter(
        (task) =>
          task.lead_id &&
          (timestamp(task.due_at) ?? Number.MAX_SAFE_INTEGER) < now,
      )
      .map((task) => String(task.lead_id)),
  );

  const priorities = activeLeads
    .map((lead) => {
      const score = Number(lead.score || 0);
      const hot = normalize(lead.temperature) === "quente" || score >= 70;
      const createdAt = timestamp(lead.created_at);
      const nextActionAt = timestamp(lead.next_action_at);
      const firstContactOverdue =
        normalize(lead.status) === "novo" &&
        createdAt !== null &&
        createdAt < now - 15 * 60_000;
      const followUpOverdue = nextActionAt !== null && nextActionAt < now;
      const taskOverdue = overdueByLead.has(String(lead.id));
      const noNextAction = nextActionAt === null;
      const priorityScore =
        score +
        (firstContactOverdue ? 120 : 0) +
        (followUpOverdue ? 90 : 0) +
        (taskOverdue ? 50 : 0) +
        (hot ? 30 : 0) +
        (noNextAction ? 15 : 0);
      const reason = firstContactOverdue
        ? "Lead novo aguardando primeiro contato"
        : followUpOverdue
          ? "Follow-up vencido"
          : taskOverdue
            ? "Tarefa vinculada atrasada"
            : hot
              ? "Lead quente com alta intenção"
              : noNextAction
                ? "Sem próxima ação definida"
                : "Maior potencial da carteira";
      const nextBestAction = firstContactOverdue
        ? "Entrar em contato agora e registrar o resultado"
        : followUpOverdue
          ? "Retomar a conversa e combinar uma nova data"
          : taskOverdue
            ? "Concluir a tarefa pendente antes de avançar"
            : hot
              ? "Confirmar interesse, projeto e próximo compromisso"
              : noNextAction
                ? "Definir uma próxima ação com data"
                : "Revisar o histórico e executar a ação programada";
      return {
        leadId: String(lead.id),
        leadName: String(lead.name || "Lead sem nome"),
        status: String(lead.status || "novo"),
        score,
        priorityScore,
        reason,
        nextBestAction,
        dueAt: lead.next_action_at ? String(lead.next_action_at) : null,
        hot,
        source: lead.source ? String(lead.source) : null,
        developmentId: lead.development_id
          ? String(lead.development_id)
          : null,
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 7);

  const agenda = openTasks
    .filter((task) => {
      const due = timestamp(task.due_at);
      return due !== null && due <= now + 7 * DAY;
    })
    .slice(0, 8)
    .map((task) => ({
      id: String(task.id),
      title: String(task.title || "Tarefa"),
      dueAt: String(task.due_at),
      priority: String(task.priority || "normal"),
      leadId: task.lead_id ? String(task.lead_id) : null,
      overdue: (timestamp(task.due_at) ?? now) < now,
    }));
  const firstContactOverdue = activeLeads.filter((lead) => {
    const createdAt = timestamp(lead.created_at);
    return (
      normalize(lead.status) === "novo" &&
      createdAt !== null &&
      createdAt < now - 15 * 60_000
    );
  }).length;
  const followUpOverdue = activeLeads.filter(
    (lead) =>
      (timestamp(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now,
  ).length;

  return apiSuccess(
    {
      scope: { role: "broker", ownPortfolioOnly: true, brokerId },
      summary: {
        activeLeads: activeLeads.length,
        hotLeads: activeLeads.filter(
          (lead) =>
            normalize(lead.temperature) === "quente" || Number(lead.score || 0) >= 70,
        ).length,
        openTasks: openTasks.length,
        overdueTasks: openTasks.filter(
          (task) =>
            (timestamp(task.due_at) ?? Number.MAX_SAFE_INTEGER) < now,
        ).length,
        firstContactOverdue,
        followUpOverdue,
        agendaNext7Days: agenda.length,
      },
      priorities,
      agenda,
      ranking: {
        explainable: true,
        signals: [
          "score_ia",
          "new_lead_age",
          "next_contact",
          "overdue_task",
          "temperature",
          "missing_next_action",
        ],
        humanApprovalRequired: true,
      },
      compatibility: "live-schema-safe",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: rate.headers },
  );
}
