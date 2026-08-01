import {
  canonicalPipelineStage,
  DEFAULT_PIPELINE_STAGES,
  type PipelineStageKey,
} from "@/lib/atlas/pipeline-stages";

export type DailyQueueSeverity = "critical" | "attention" | "opportunity";
export type DailyQueueKind = "overdue-task" | "due-today-task" | "unscheduled-task" | "lead-opportunity";

export type DailyQueueTaskInput = {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueAt: string | null;
  leadId: string | null;
  leadName: string | null;
};

export type DailyQueueLeadInput = {
  id: string;
  name: string;
  status: string;
  score: number;
  temperature: string | null;
  nextActionAt: string | null;
  nextActionLabel: string | null;
};

export type CopilotDailyQueueItem = {
  id: string;
  kind: DailyQueueKind;
  severity: DailyQueueSeverity;
  title: string;
  evidence: string;
  recommendedAction: string;
  href: string;
  priorityScore: number;
  reasonCodes: string[];
  taskId: string | null;
  taskStatus: string | null;
  leadId: string | null;
  leadName: string | null;
  dueAt: string | null;
  currentStage: PipelineStageKey | null;
  suggestedStage: PipelineStageKey | null;
};

const completedStatuses = new Set([
  "done",
  "concluido",
  "concluida",
  "completed",
  "cancelado",
  "cancelled",
]);

const highPriorities = new Set(["alta", "high", "critical", "critica"]);
const mediumPriorities = new Set(["media", "medium"]);

function timestamp(value: string | null) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalized(value: string | null | undefined) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function stageAfter(stage: PipelineStageKey | null) {
  if (!stage) return null;
  const openStages = DEFAULT_PIPELINE_STAGES.filter((item) => item.visible && item.outcome === "open");
  const index = openStages.findIndex((item) => item.key === stage);
  return openStages[index + 1]?.key ?? null;
}

function priorityBoost(priority: string) {
  const value = normalized(priority);
  if (highPriorities.has(value)) return 90;
  if (mediumPriorities.has(value)) return 35;
  return 0;
}

function dueWindow(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.getTime(), end: end.getTime() };
}

export function buildCopilotDailyQueue(
  tasks: DailyQueueTaskInput[],
  leads: DailyQueueLeadInput[],
  now = new Date(),
  limit = 5,
) {
  const nowMs = now.getTime();
  const today = dueWindow(now);
  const pendingTasks = tasks
    .filter((task) => !completedStatuses.has(normalized(task.status)))
    .map((task) => {
      const due = timestamp(task.dueAt);
      const overdue = due !== null && due < nowMs;
      const dueToday = due !== null && due >= nowMs && due < today.end;
      const highWithoutDate = due === null && highPriorities.has(normalized(task.priority));
      return { ...task, due, overdue, dueToday, highWithoutDate };
    });

  const taskItems: CopilotDailyQueueItem[] = pendingTasks
    .filter((task) => task.overdue || task.dueToday || task.highWithoutDate)
    .map((task) => {
      const overdueHours = task.overdue && task.due !== null
        ? Math.max(1, Math.floor((nowMs - task.due) / 3_600_000))
        : 0;
      const kind: DailyQueueKind = task.overdue
        ? "overdue-task"
        : task.dueToday
          ? "due-today-task"
          : "unscheduled-task";
      const evidence = task.overdue
        ? `Prazo vencido há ${overdueHours} hora(s)${task.leadName ? ` · ${task.leadName}` : ""}.`
        : task.dueToday
          ? `Prazo registrado para hoje${task.leadName ? ` · ${task.leadName}` : ""}.`
          : `Prioridade alta sem prazo registrado${task.leadName ? ` · ${task.leadName}` : ""}.`;
      const reasonCodes = [
        task.overdue ? "task-overdue" : task.dueToday ? "task-due-today" : "task-high-without-due-date",
        highPriorities.has(normalized(task.priority)) ? "high-priority" : "standard-priority",
      ];
      return {
        id: `task:${task.id}`,
        kind,
        severity: task.overdue && overdueHours >= 24 ? "critical" : "attention",
        title: task.title || "Tarefa comercial",
        evidence,
        recommendedAction: task.overdue
          ? "Revisar o contexto e recuperar este compromisso agora."
          : task.dueToday
            ? "Preparar e executar a ação dentro do prazo registrado."
            : "Definir um prazo real antes de iniciar o contato.",
        href: "/tasks",
        priorityScore: (task.overdue ? 1_000 + Math.min(overdueHours, 240) : task.dueToday ? 820 : 700) + priorityBoost(task.priority),
        reasonCodes,
        taskId: task.id,
        taskStatus: task.status,
        leadId: task.leadId,
        leadName: task.leadName,
        dueAt: task.dueAt,
        currentStage: null,
        suggestedStage: null,
      };
    });

  const representedLeadIds = new Set(taskItems.map((item) => item.leadId).filter(Boolean));
  const leadItems: CopilotDailyQueueItem[] = leads.flatMap((lead) => {
    const stage = canonicalPipelineStage(lead.status);
    const stageDefinition = DEFAULT_PIPELINE_STAGES.find((item) => item.key === stage);
    if (!stage || stageDefinition?.outcome !== "open" || representedLeadIds.has(lead.id)) return [];

    const temperature = normalized(lead.temperature);
    const observedScore = Number.isFinite(lead.score) ? Math.max(0, Math.min(100, Math.round(lead.score))) : 0;
    const isHot = ["quente", "hot"].includes(temperature);
    const advancedStage = ["proposta", "contrato"].includes(stage);
    if (observedScore < 70 && !isHot && !advancedStage) return [];

    const nextActionTime = timestamp(lead.nextActionAt);
    const actionOverdue = nextActionTime !== null && nextActionTime < nowMs;
    const actionDueSoon = nextActionTime !== null && nextActionTime <= nowMs + 24 * 3_600_000;
    const withoutNextAction = nextActionTime === null;
    if (!withoutNextAction && !actionDueSoon && !advancedStage) return [];

    const facts = [
      `etapa ${stageDefinition?.label || stage}`,
      observedScore > 0 ? `score observado ${observedScore}` : null,
      isHot ? "temperatura quente" : null,
      withoutNextAction ? "sem próxima ação datada" : actionOverdue ? "próxima ação vencida" : actionDueSoon ? "próxima ação em até 24h" : null,
    ].filter(Boolean);
    const suggestedStage = stageAfter(stage);
    const reasonCodes = [
      advancedStage ? "advanced-open-stage" : "qualified-observed-signal",
      observedScore >= 70 ? "observed-score-70-plus" : null,
      isHot ? "observed-hot-temperature" : null,
      withoutNextAction ? "missing-next-action" : actionOverdue ? "next-action-overdue" : actionDueSoon ? "next-action-due-soon" : null,
    ].filter((value): value is string => Boolean(value));
    return [{
      id: `lead:${lead.id}`,
      kind: "lead-opportunity" as const,
      severity: advancedStage && withoutNextAction ? "attention" as const : "opportunity" as const,
      title: `Oportunidade: ${lead.name || "Lead sem nome"}`,
      evidence: `${facts.join(" · ")}.`,
      recommendedAction: lead.nextActionLabel
        ? `Revisar a ação registrada: ${lead.nextActionLabel}.`
        : "Validar intenção e registrar a próxima ação comercial.",
      href: `/leads/${encodeURIComponent(lead.id)}`,
      priorityScore: 600 + (advancedStage ? 120 : 0) + observedScore + (withoutNextAction ? 60 : actionOverdue ? 75 : 25),
      reasonCodes,
      taskId: null,
      taskStatus: null,
      leadId: lead.id,
      leadName: lead.name,
      dueAt: lead.nextActionAt,
      currentStage: stage,
      suggestedStage,
    }];
  });

  const allItems = [...taskItems, ...leadItems].sort(
    (a, b) => b.priorityScore - a.priorityScore || a.title.localeCompare(b.title, "pt-BR"),
  );
  const requestedLimit = Math.min(8, Math.max(1, Math.round(limit)));

  return {
    summary: {
      overdue: pendingTasks.filter((task) => task.overdue).length,
      dueToday: pendingTasks.filter((task) => task.dueToday).length,
      opportunities: leadItems.length,
      totalCandidates: allItems.length,
      shown: Math.min(requestedLimit, allItems.length),
    },
    items: allItems.slice(0, requestedLimit),
    pendingTasks: pendingTasks
      .sort((a, b) => {
        const aScore = (a.overdue ? 1_000 : a.dueToday ? 800 : a.highWithoutDate ? 700 : 0) + priorityBoost(a.priority);
        const bScore = (b.overdue ? 1_000 : b.dueToday ? 800 : b.highWithoutDate ? 700 : 0) + priorityBoost(b.priority);
        return bScore - aScore || (a.due ?? Number.MAX_SAFE_INTEGER) - (b.due ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, 5)
      .map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        status: task.status,
        due_at: task.dueAt,
      })),
    policy: {
      deterministicPriority: true,
      observedEvidenceOnly: true,
      hierarchyPreserved: true,
      coldBaseExcluded: true,
      externalMessagesDisabled: true,
      silentWritesDisabled: true,
      humanConfirmationRequired: true,
    },
  };
}
