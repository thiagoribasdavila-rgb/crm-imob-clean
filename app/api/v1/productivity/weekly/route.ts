import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  readCompatibleLeads,
  readCompatibleTasks,
} from "@/lib/atlas/core-v2/live-repositories";

export const dynamic = "force-dynamic";

const DONE = new Set(["done", "concluido", "concluida", "completed"]);
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

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 30,
    scope: "weekly-productivity",
  });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const actorId = identity.access.profile.id;
  const minimumSample = 5;
  const maximumPlanItems = 5;
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86_400_000);
  const [taskResult, leadResult, visitResult, activityResult, eventResult] =
    await Promise.all([
    readCompatibleTasks(identity.supabase, {
      organizationId,
      limit: 1_000,
    }),
    readCompatibleLeads(identity.supabase, {
      organizationId,
      limit: 1_000,
    }),
    identity.supabase
      .from("lead_visits")
      .select("id,broker_id,status,scheduled_at,completed_at,no_show_at")
      .eq("organization_id", organizationId)
      .eq("broker_id", actorId)
      .gte("scheduled_at", start.toISOString())
      .lt("scheduled_at", end.toISOString())
      .limit(1000),
    identity.supabase
      .from("activities")
      .select("id,user_id,occurred_at")
      .eq("organization_id", organizationId)
      .eq("user_id", actorId)
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString())
      .limit(2000),
    identity.supabase
      .from("lead_events")
      .select("id,created_at")
      .eq("organization_id", organizationId)
      .eq("created_by", actorId)
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .limit(2000),
  ]);

  if (!taskResult.ok || !leadResult.ok) {
    return apiError(
      "WEEKLY_PRODUCTIVITY_LOAD_FAILED",
      "Não foi possível preparar sua revisão semanal.",
      identity.meta,
      { status: 503 },
    );
  }

  const tasks = taskResult.rows.filter(
    (task) => String(task.assigned_to || "") === actorId,
  );
  const leads = leadResult.rows.filter(
    (lead) => String(lead.assigned_to || "") === actorId,
  );
  const visits = visitResult.error ? [] : visitResult.data ?? [];
  const now = end.getTime();
  const completed = tasks.filter((task) => DONE.has(normalize(task.status)));
  const open = tasks.filter((task) => !DONE.has(normalize(task.status)));
  const overdue = open.filter(
    (task) => (time(task.due_at) ?? Number.MAX_SAFE_INTEGER) < now,
  );
  const active = leads.filter((lead) => !CLOSED.has(normalize(lead.status)));
  const newLeads = active.filter(
    (lead) => (time(lead.created_at) ?? 0) >= start.getTime(),
  );
  const withoutNext = active.filter((lead) => !lead.next_action_at);
  const hotWithoutNext = withoutNext.filter(
    (lead) => normalize(lead.temperature) === "quente" || Number(lead.score || 0) >= 70,
  );
  const interactions = activityResult.error
    ? eventResult.error
      ? 0
      : eventResult.data?.length ?? 0
    : activityResult.data?.length ?? 0;
  const completedVisits = visits.filter(
    (visit) => normalize(visit.status) === "completed",
  ).length;
  const noShows = visits.filter(
    (visit) => normalize(visit.status) === "no_show",
  ).length;
  const measured = completed.length + open.length;
  const completionRate =
    measured >= minimumSample
      ? Math.round((completed.length / measured) * 100)
      : null;
  const plan: Array<{
    key: string;
    title: string;
    evidence: string;
    action: string;
    href: string;
  }> = [];

  if (overdue.length) {
    plan.push({
      key: "recover_overdue",
      title: "Recuperar tarefas vencidas",
      evidence: `${overdue.length} tarefa(s) fora do prazo`,
      action: "Revisar, concluir ou reagendar com contexto",
      href: "/tasks",
    });
  }
  if (hotWithoutNext.length) {
    plan.push({
      key: "hot_without_next",
      title: "Agendar leads quentes",
      evidence: `${hotWithoutNext.length} lead(s) quente(s) sem próxima ação`,
      action: "Definir compromisso com data",
      href: "/leads?temperature=quente",
    });
  }
  if (withoutNext.length > hotWithoutNext.length) {
    plan.push({
      key: "portfolio_without_next",
      title: "Completar a agenda da carteira",
      evidence: `${withoutNext.length} lead(s) sem próxima ação`,
      action: "Planejar follow-ups prioritários",
      href: "/leads?quick=no_next_action",
    });
  }
  if (open.length) {
    plan.push({
      key: "plan_open_tasks",
      title: "Organizar tarefas abertas",
      evidence: `${open.length} tarefa(s) ainda aberta(s)`,
      action: "Priorizar a próxima semana",
      href: "/tasks",
    });
  }
  if (!plan.length) {
    plan.push({
      key: "maintain_cadence",
      title: "Manter a cadência",
      evidence: "Nenhuma pendência crítica detectada",
      action: "Revisar agenda e carteira quente",
      href: "/calendar",
    });
  }

  return apiSuccess(
    {
      scope: { personalOnly: true, actorId, hierarchicalRls: true },
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        days: 7,
      },
      outcomes: {
        completedTasks: completed.length,
        completedVisits,
        interactions,
        newLeads: newLeads.length,
      },
      backlog: {
        openTasks: open.length,
        overdueTasks: overdue.length,
        leadsWithoutNextAction: withoutNext.length,
        hotLeadsWithoutNextAction: hotWithoutNext.length,
        noShows,
      },
      quality: {
        completionRate,
        sampleSize: measured,
        minimumSample,
        sufficientSample: measured >= minimumSample,
      },
      plan: plan.slice(0, maximumPlanItems),
      method: {
        llmCost: 0,
        explainable: true,
        personalOnly: true,
        peopleRanking: false,
        humanDecisionRequired: true,
        visitMetricsAvailable: !visitResult.error,
      },
      sources: {
        tasks: taskResult.source,
        leads: leadResult.source,
        visits: visitResult.error ? "awaiting-ddl" : "public.lead_visits",
        interactions: activityResult.error
          ? eventResult.error
            ? "unavailable"
            : "public.lead_events"
          : "public.activities",
      },
      compatibility: "v2-v3-live-schema-safe",
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
