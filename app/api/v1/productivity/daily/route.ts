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
  const now = Date.now();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const [taskResult, leadResult] = await Promise.all([
    identity.supabase
      .from("tasks")
      .select(
        "id,title,description,status,user_id,lead_id,created_at,organization_id,priority,due_date",
      )
      .eq("organization_id", organizationId)
      .eq("user_id", actorId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500),
    identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT)
      .eq("organization_id", organizationId)
      .eq("assigned_user_id", actorId)
      .limit(500),
  ]);

  if (taskResult.error || leadResult.error) {
    return apiError(
      "PRODUCTIVITY_LOAD_FAILED",
      "Não foi possível preparar seu dia.",
      identity.meta,
      { status: 503 },
    );
  }

  const tasks = ((taskResult.data ?? []) as unknown as CompatRow[]).map(
    mapLegacyTask,
  );
  const leads = ((leadResult.data ?? []) as unknown as CompatRow[]).map(
    mapLegacyLead,
  );
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

  const sequence = steps
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        (time(left.dueAt) ?? Number.MAX_SAFE_INTEGER) -
          (time(right.dueAt) ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 7)
    .map((step, index) => ({
      id: step.id,
      kind: step.kind,
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
          "new_lead_age",
          "next_contact",
          "due_date",
          "priority",
          "temperature",
          "score_ia",
        ],
        humanDecisionRequired: true,
        peopleRanking: false,
      },
      compatibility: "live-schema-safe",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
