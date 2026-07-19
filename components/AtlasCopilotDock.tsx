"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  canonicalPipelineStage,
  DEFAULT_PIPELINE_STAGES,
  type PipelineStageKey,
} from "@/lib/atlas/pipeline-stages";
import type {
  CommercialOutcomeContextBreakdown,
  CommercialOutcomeContextComparison,
  CommercialOutcomeContextCoverage,
  CommercialOutcomeContextGapQueue,
  CommercialOutcomeContextFreshness,
  CommercialOutcomeCode,
  CommercialOutcomeComparison,
  CommercialOutcomeEvidence,
  CommercialOutcomeFreshness,
  CommercialOutcomeMemoryGap,
  CommercialOutcomeMemoryQuality,
  CommercialOutcomeSampleSufficiency,
  CommercialOutcomeSummary,
} from "@/lib/atlas/commercial-outcome-summary";
import {
  buildCommercialOutcomeContextPreview,
  type CommercialOutcomeContextPreview,
} from "@/lib/atlas/commercial-outcome-context-preview";

type Insight = {
  id: string;
  title: string;
  recommendation: string | null;
  score: number | null;
  confidence: number | null;
};

type BriefingSignal = {
  id: string;
  severity: "critical" | "attention" | "opportunity" | "healthy";
  title: string;
  evidence: string;
  action: string;
};

type BriefingResponse = {
  signals?: BriefingSignal[];
  model?: { generativeReady?: boolean; localIntelligenceReady?: boolean };
};

type Task = {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_at: string | null;
};

type DailyQueueItem = {
  id: string;
  kind: "overdue-task" | "due-today-task" | "unscheduled-task" | "lead-opportunity";
  severity: "critical" | "attention" | "opportunity";
  title: string;
  evidence: string;
  recommendedAction: string;
  href: string;
  reasonCodes: string[];
  taskId: string | null;
  taskStatus: string | null;
  leadId: string | null;
  leadName: string | null;
  dueAt: string | null;
  currentStage: PipelineStageKey | null;
  suggestedStage: PipelineStageKey | null;
  outcomeContextPreview: CommercialOutcomeContextPreview;
};

type DailyQueueSummary = {
  overdue: number;
  dueToday: number;
  opportunities: number;
  totalCandidates: number;
  shown: number;
};

const commercialOutcomePeriodOptions = [7, 30, 90] as const;
const defaultCommercialOutcomePeriodDays = 30;

type CommercialOutcomePeriodDays = (typeof commercialOutcomePeriodOptions)[number];
type TaskOutcome = CommercialOutcomeCode;
type CommercialOutcomeFilter = "all" | TaskOutcome;

function isCommercialOutcomePeriodDays(value: unknown): value is CommercialOutcomePeriodDays {
  return typeof value === "number" && commercialOutcomePeriodOptions.some((option) => option === value);
}

function isCommercialOutcomeFilter(value: unknown): value is CommercialOutcomeFilter {
  return value === "all" || taskOutcomeOptions.some((option) => option.value === value);
}

function dailyQueueUrl(periodDays: CommercialOutcomePeriodDays, outcomeFilter: CommercialOutcomeFilter) {
  const params = new URLSearchParams();
  if (periodDays !== defaultCommercialOutcomePeriodDays) params.set("outcomePeriodDays", String(periodDays));
  if (outcomeFilter !== "all") params.set("outcomeFilter", outcomeFilter);
  const query = params.toString();
  return query ? `/api/ai/daily-queue?${query}` : "/api/ai/daily-queue";
}

const commercialOutcomeEvidenceDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type CommercialOutcomeSnapshot = CommercialOutcomeSummary & {
  available: boolean;
  source: "lead_events";
  comparison?: CommercialOutcomeComparison;
  sampleSufficiency?: CommercialOutcomeSampleSufficiency;
  evidence?: CommercialOutcomeEvidence;
  freshness?: CommercialOutcomeFreshness;
  contextFreshness?: CommercialOutcomeContextFreshness;
  quality?: CommercialOutcomeMemoryQuality;
  context?: CommercialOutcomeContextBreakdown;
  contextComparison?: CommercialOutcomeContextComparison;
  contextCoverage?: CommercialOutcomeContextCoverage;
  contextGapQueue?: CommercialOutcomeContextGapQueue;
  periodControl?: {
    selectedDays: CommercialOutcomePeriodDays;
    options: CommercialOutcomePeriodDays[];
    currentWindowDays: number;
    previousWindowDays: number;
    totalLookbackDays: number;
    supervised: true;
    readOnly: true;
    historyLimit: number;
    historyMayBeTruncated: boolean;
  };
  filterControl?: {
    selected: CommercialOutcomeFilter;
    options: Array<{ value: CommercialOutcomeFilter; label: string }>;
    filtered: boolean;
    matchingObservedTasks: number;
    totalObservedTasks: number;
    appliedTo: Array<"summary" | "comparison" | "evidence" | "freshness" | "contextFreshness" | "context" | "contextComparison" | "contextCoverage">;
    qualityScope: "all-outcomes";
    coverageScope: "all-outcomes";
    contextGapQueueScope: "all-outcomes";
    supervised: true;
    readOnly: true;
  };
};

type DailyQueueResponse = {
  ok?: boolean;
  data?: {
    items?: DailyQueueItem[];
    pendingTasks?: Task[];
    summary?: DailyQueueSummary;
    commercialOutcomeSummary?: CommercialOutcomeSnapshot;
  };
  error?: { message?: string };
};

type OpenCopilotDetail = {
  prompt?: string;
  context?: Record<string, unknown>;
};

type CopilotSource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  verifiedAt: string;
};

type CopilotCalibration = {
  mode?: "generative" | "local-fallback";
  model?: string;
  provider?: string;
  task?: string;
  estimatedCostUsd?: number;
  pricingConfigured?: boolean;
};

type PersistentCopilot = { leadId: string; learningVersion: number; persistent: boolean; exclusive: boolean };

type TaskPriority = "baixa" | "media" | "alta";

const taskOutcomeOptions: Array<{ value: TaskOutcome; label: string }> = [
  { value: "contacted", label: "Contato realizado" },
  { value: "no_response", label: "Cliente não respondeu" },
  { value: "meeting_scheduled", label: "Visita ou reunião agendada" },
  { value: "proposal_sent", label: "Proposta enviada" },
  { value: "follow_up_needed", label: "Novo acompanhamento necessário" },
  { value: "not_interested", label: "Sem interesse neste momento" },
  { value: "other", label: "Outro resultado observado" },
];
const commercialOutcomeFilterOptions: Array<{ value: CommercialOutcomeFilter; label: string }> = [
  { value: "all", label: "Todos" },
  ...taskOutcomeOptions,
];

type TaskCreateResponse = {
  ok?: boolean;
  data?: {
    task?: { id?: string; title?: string; due_at?: string | null; priority?: string; status?: string };
    auditRecorded?: boolean;
  };
  error?: { message?: string };
};

type GovernedPipelineContext = {
  leadName: string;
  currentStage: PipelineStageKey;
};

type GovernedTaskCompletionContext = {
  taskId: string;
  title: string;
  status: string;
  dueAt: string | null;
  leadName: string | null;
  outcomeContextPreview: CommercialOutcomeContextPreview;
};

type TaskCompletionResponse = {
  ok?: boolean;
  data?: {
    task?: { id?: string; status?: string; due_at?: string | null };
    transitionApplied?: boolean;
    alreadyCompleted?: boolean;
    alreadyScheduled?: boolean;
    idempotentReplay?: boolean;
    auditRecorded?: boolean;
    outcomeRecord?: { id?: string };
    outcomeRecorded?: boolean;
    alreadyRecorded?: boolean;
    outcomeContextPreview?: CommercialOutcomeContextPreview;
  };
  error?: {
    message?: string;
    details?: {
      currentStatus?: string | null;
      currentDueAt?: string | null;
      commercialContextPreview?: CommercialOutcomeContextPreview;
    };
  };
};

type PipelineMoveResponse = {
  lead?: { status?: string | null };
  move?: {
    moveId?: string;
    fromStage?: PipelineStageKey;
    toStage?: PipelineStageKey;
    reversalOf?: string | null;
  };
  error?: string;
  code?: string;
  currentStage?: PipelineStageKey;
};

const governedPipelineStages = DEFAULT_PIPELINE_STAGES.filter(
  (stage) => stage.visible && stage.outcome !== "lost" && stage.outcome !== "buyer_profile",
);

const suggestedQuestions = [
  "Quais leads devo priorizar hoje e por quê?",
  "Onde o funil comercial está perdendo velocidade?",
  "Quais projetos precisam de atualização de tabela ou espelho?",
  "Como o cenário de juros afeta os argumentos de venda?",
];

function confidenceLabel(value: number | null) {
  const normalized = Number(value ?? 0);
  const percentage = normalized <= 1 ? normalized * 100 : normalized;
  return `${Math.round(percentage)}%`;
}

function defaultTaskDueInput() {
  const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
  due.setSeconds(0, 0);
  const offset = due.getTimezoneOffset() * 60_000;
  return new Date(due.getTime() - offset).toISOString().slice(0, 16);
}

function taskDueInputFromDate(date: Date) {
  date.setSeconds(0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultTaskRescheduleInput(currentDueAt: string | null) {
  const currentDue = currentDueAt ? new Date(currentDueAt).getTime() : 0;
  return taskDueInputFromDate(new Date(Math.max(Date.now() + 86_400_000, currentDue + 86_400_000)));
}

function pipelineStageLabel(stage: PipelineStageKey) {
  return DEFAULT_PIPELINE_STAGES.find((item) => item.key === stage)?.label || stage;
}

function nextGovernedPipelineStage(currentStage: PipelineStageKey) {
  const currentIndex = governedPipelineStages.findIndex((stage) => stage.key === currentStage);
  return governedPipelineStages[currentIndex + 1]?.key
    || governedPipelineStages.find((stage) => stage.key !== currentStage)?.key
    || currentStage;
}

export default function AtlasCopilotDock() {
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyQueue, setDailyQueue] = useState<DailyQueueItem[]>([]);
  const [dailyQueueSummary, setDailyQueueSummary] = useState<DailyQueueSummary | null>(null);
  const [commercialOutcomeSummary, setCommercialOutcomeSummary] = useState<CommercialOutcomeSnapshot | null>(null);
  const [commercialOutcomePeriodDays, setCommercialOutcomePeriodDays] = useState<CommercialOutcomePeriodDays>(defaultCommercialOutcomePeriodDays);
  const [commercialOutcomePeriodLoading, setCommercialOutcomePeriodLoading] = useState(false);
  const [commercialOutcomePeriodError, setCommercialOutcomePeriodError] = useState("");
  const commercialOutcomePeriodRef = useRef<CommercialOutcomePeriodDays>(defaultCommercialOutcomePeriodDays);
  const [commercialOutcomeFilter, setCommercialOutcomeFilter] = useState<CommercialOutcomeFilter>("all");
  const [commercialOutcomeFilterLoading, setCommercialOutcomeFilterLoading] = useState(false);
  const [commercialOutcomeFilterError, setCommercialOutcomeFilterError] = useState("");
  const commercialOutcomeFilterRef = useRef<CommercialOutcomeFilter>("all");
  const [dailyQueueError, setDailyQueueError] = useState("");
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState("");
  const [copilotSources, setCopilotSources] = useState<CopilotSource[]>([]);
  const [copilotCalibration, setCopilotCalibration] = useState<CopilotCalibration | null>(null);
  const [persistentCopilot, setPersistentCopilot] = useState<PersistentCopilot | null>(null);
  const [externalContext, setExternalContext] = useState<Record<string, unknown>>({});
  const [taskTitle, setTaskTitle] = useState("Revisar próxima ação sugerida pelo Copilot");
  const [taskDueAt, setTaskDueAt] = useState(defaultTaskDueInput);
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("media");
  const [taskReviewed, setTaskReviewed] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [taskResult, setTaskResult] = useState<{ id: string; auditRecorded: boolean } | null>(null);
  const [pipelineContext, setPipelineContext] = useState<GovernedPipelineContext | null>(null);
  const [pipelineTarget, setPipelineTarget] = useState<PipelineStageKey>("contato");
  const [pipelineReviewed, setPipelineReviewed] = useState(false);
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [pipelineError, setPipelineError] = useState("");
  const [pipelineResult, setPipelineResult] = useState<{
    moveId: string;
    fromStage: PipelineStageKey;
    toStage: PipelineStageKey;
    undone: boolean;
  } | null>(null);
  const [taskCompletionContext, setTaskCompletionContext] = useState<GovernedTaskCompletionContext | null>(null);
  const [taskCompletionReviewed, setTaskCompletionReviewed] = useState(false);
  const [taskCompletionSaving, setTaskCompletionSaving] = useState(false);
  const [taskCompletionError, setTaskCompletionError] = useState("");
  const [taskCompletionResult, setTaskCompletionResult] = useState<{ auditRecorded: boolean; alreadyCompleted: boolean } | null>(null);
  const taskCompletionIdempotencyRef = useRef<string | null>(null);
  const [taskRescheduleDueAt, setTaskRescheduleDueAt] = useState(defaultTaskDueInput);
  const [taskRescheduleReviewed, setTaskRescheduleReviewed] = useState(false);
  const [taskRescheduleSaving, setTaskRescheduleSaving] = useState(false);
  const [taskRescheduleError, setTaskRescheduleError] = useState("");
  const [taskRescheduleResult, setTaskRescheduleResult] = useState<{ auditRecorded: boolean; alreadyScheduled: boolean; dueAt: string } | null>(null);
  const taskRescheduleIdempotencyRef = useRef<string | null>(null);
  const [taskOutcome, setTaskOutcome] = useState<TaskOutcome | "">("");
  const [taskOutcomeNote, setTaskOutcomeNote] = useState("");
  const [taskOutcomeReviewed, setTaskOutcomeReviewed] = useState(false);
  const [taskOutcomeSaving, setTaskOutcomeSaving] = useState(false);
  const [taskOutcomeError, setTaskOutcomeError] = useState("");
  const [taskOutcomeResult, setTaskOutcomeResult] = useState<{ eventId: string | null; alreadyRecorded: boolean } | null>(null);
  const taskOutcomeIdempotencyRef = useRef<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenCopilotDetail>).detail;
      if (detail?.prompt) setPrompt(detail.prompt);
      setCopilotError("");
      setCopilotAnswer("");
      setCopilotSources([]);
      setCopilotCalibration(null);
      setPersistentCopilot(null);
      setTaskTitle("Revisar próxima ação sugerida pelo Copilot");
      setTaskDueAt(defaultTaskDueInput());
      setTaskPriority("media");
      setTaskReviewed(false);
      setTaskSaving(false);
      setTaskError("");
      setTaskResult(null);
      setPipelineContext(null);
      setPipelineTarget("contato");
      setPipelineReviewed(false);
      setPipelineSaving(false);
      setPipelineError("");
      setPipelineResult(null);
      setTaskCompletionContext(null);
      setTaskCompletionReviewed(false);
      setTaskCompletionSaving(false);
      setTaskCompletionError("");
      setTaskCompletionResult(null);
      taskCompletionIdempotencyRef.current = null;
      setTaskRescheduleDueAt(defaultTaskDueInput());
      setTaskRescheduleReviewed(false);
      setTaskRescheduleSaving(false);
      setTaskRescheduleError("");
      setTaskRescheduleResult(null);
      taskRescheduleIdempotencyRef.current = null;
      setTaskOutcome("");
      setTaskOutcomeNote("");
      setTaskOutcomeReviewed(false);
      setTaskOutcomeSaving(false);
      setTaskOutcomeError("");
      setTaskOutcomeResult(null);
      taskOutcomeIdempotencyRef.current = null;
      setExternalContext(detail?.context ?? {});
      setOpen(true);
    };
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener("atlas:open-copilot", handleOpen);
    window.addEventListener("keydown", handleShortcut);
    return () => {
      window.removeEventListener("atlas:open-copilot", handleOpen);
      window.removeEventListener("keydown", handleShortcut);
    };
  }, []);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function load() {
      setLoading(true);
      setDailyQueueError("");
      setDailyQueue([]);
      setDailyQueueSummary(null);
      setCommercialOutcomeSummary(null);
      setTasks([]);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const [briefingResponse, dailyQueueResponse] = await Promise.all([
          token
            ? fetch("/api/ai/briefing", {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              }).catch(() => null)
            : Promise.resolve(null),
          token
            ? (commercialOutcomePeriodRef.current === defaultCommercialOutcomePeriodDays && commercialOutcomeFilterRef.current === "all"
              ? fetch("/api/ai/daily-queue", {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              })
              : fetch(dailyQueueUrl(commercialOutcomePeriodRef.current, commercialOutcomeFilterRef.current), {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              })).catch(() => null)
            : Promise.resolve(null),
        ]);

        const briefing = briefingResponse?.ok
          ? ((await briefingResponse.json()) as BriefingResponse)
          : null;
        const queuePayload = dailyQueueResponse
          ? ((await dailyQueueResponse.json()) as DailyQueueResponse)
          : null;
        const confidence = briefing?.model?.generativeReady ? 0.9 : 0.74;
        const scoreBySeverity = { critical: 96, attention: 84, opportunity: 76, healthy: 60 };

        if (!active) return;
        setInsights(
          (briefing?.signals ?? []).slice(0, 5).map((signal) => ({
            id: signal.id,
            title: signal.title,
            recommendation: `${signal.evidence} ${signal.action}`,
            score: scoreBySeverity[signal.severity],
            confidence,
          })),
        );
        setDailyQueue(queuePayload?.data?.items ?? []);
        setDailyQueueSummary(queuePayload?.data?.summary ?? null);
        setCommercialOutcomeSummary(queuePayload?.data?.commercialOutcomeSummary ?? null);
        const selectedOutcomePeriod = queuePayload?.data?.commercialOutcomeSummary?.periodControl?.selectedDays;
        if (isCommercialOutcomePeriodDays(selectedOutcomePeriod)) {
          commercialOutcomePeriodRef.current = selectedOutcomePeriod;
          setCommercialOutcomePeriodDays(selectedOutcomePeriod);
        }
        const selectedOutcomeFilter = queuePayload?.data?.commercialOutcomeSummary?.filterControl?.selected;
        if (isCommercialOutcomeFilter(selectedOutcomeFilter)) {
          commercialOutcomeFilterRef.current = selectedOutcomeFilter;
          setCommercialOutcomeFilter(selectedOutcomeFilter);
        }
        setTasks(queuePayload?.data?.pendingTasks ?? []);
        if (token && !dailyQueueResponse) {
          setDailyQueueError("A fila de hoje não respondeu agora. Tente atualizar em instantes.");
        } else if (dailyQueueResponse && !dailyQueueResponse.ok) {
          setDailyQueueError(queuePayload?.error?.message || "A fila diária será atualizada em instantes.");
        }
      } catch {
        if (active) {
          setDailyQueue([]);
          setDailyQueueSummary(null);
          setCommercialOutcomeSummary(null);
          setTasks([]);
          setDailyQueueError("O Copilot não conseguiu atualizar a fila agora. Tente novamente em instantes.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [open]);

  async function selectCommercialOutcomePeriod(periodDays: CommercialOutcomePeriodDays) {
    if (periodDays === commercialOutcomePeriodRef.current || commercialOutcomePeriodLoading || commercialOutcomeFilterLoading) return;
    setCommercialOutcomePeriodLoading(true);
    setCommercialOutcomePeriodError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para consultar outro período.");
      const response = await fetch(dailyQueueUrl(periodDays, commercialOutcomeFilterRef.current), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as DailyQueueResponse;
      if (!response.ok || !payload.data?.commercialOutcomeSummary) {
        throw new Error(payload.error?.message || "Não foi possível consultar esse período agora.");
      }
      const selectedOutcomePeriod = payload.data.commercialOutcomeSummary.periodControl?.selectedDays;
      if (!isCommercialOutcomePeriodDays(selectedOutcomePeriod)) {
        throw new Error("O período retornado não pôde ser confirmado.");
      }
      commercialOutcomePeriodRef.current = selectedOutcomePeriod;
      setCommercialOutcomePeriodDays(selectedOutcomePeriod);
      setCommercialOutcomeSummary(payload.data.commercialOutcomeSummary);
    } catch (error) {
      setCommercialOutcomePeriodError(error instanceof Error ? error.message : "Não foi possível consultar esse período agora.");
    } finally {
      setCommercialOutcomePeriodLoading(false);
    }
  }

  async function selectCommercialOutcomeFilter(outcomeFilter: CommercialOutcomeFilter) {
    if (outcomeFilter === commercialOutcomeFilterRef.current || commercialOutcomeFilterLoading || commercialOutcomePeriodLoading) return;
    setCommercialOutcomeFilterLoading(true);
    setCommercialOutcomeFilterError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para filtrar a memória comercial.");
      const response = await fetch(dailyQueueUrl(commercialOutcomePeriodRef.current, outcomeFilter), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as DailyQueueResponse;
      if (!response.ok || !payload.data?.commercialOutcomeSummary) {
        throw new Error(payload.error?.message || "Não foi possível aplicar esse filtro agora.");
      }
      const selectedOutcomeFilter = payload.data.commercialOutcomeSummary.filterControl?.selected;
      if (!isCommercialOutcomeFilter(selectedOutcomeFilter)) {
        throw new Error("O resultado observado retornado não pôde ser confirmado.");
      }
      commercialOutcomeFilterRef.current = selectedOutcomeFilter;
      setCommercialOutcomeFilter(selectedOutcomeFilter);
      setCommercialOutcomeSummary(payload.data.commercialOutcomeSummary);
    } catch (error) {
      setCommercialOutcomeFilterError(error instanceof Error ? error.message : "Não foi possível aplicar esse filtro agora.");
    } finally {
      setCommercialOutcomeFilterLoading(false);
    }
  }

  const nextAction = useMemo(() => {
    if (dailyQueue[0]) return dailyQueue[0].recommendedAction;
    if (insights[0]) return insights[0].recommendation || insights[0].title;
    if (tasks[0]) return tasks[0].title;
    return "Cadastre novos leads para o Atlas começar a priorizar ações.";
  }, [dailyQueue, insights, tasks]);

  const previewOnly = externalContext.actionMode === "preview-only";
  const governedLeadId =
    typeof externalContext.leadId === "string" ? externalContext.leadId : null;
  const canCreateGovernedTask =
    previewOnly &&
    externalContext.requiresHumanConfirmation === true &&
    Boolean(governedLeadId) &&
    (!Array.isArray(externalContext.governedActions) || externalContext.governedActions.includes("create-task"));
  const canMoveGovernedPipeline =
    previewOnly &&
    externalContext.requiresHumanConfirmation === true &&
    Boolean(governedLeadId) &&
    (!Array.isArray(externalContext.governedActions) || externalContext.governedActions.includes("move-pipeline"));
  const governedTaskId =
    typeof externalContext.taskId === "string" ? externalContext.taskId : null;
  const canCompleteGovernedTask =
    previewOnly &&
    externalContext.requiresHumanConfirmation === true &&
    Boolean(governedTaskId) &&
    Array.isArray(externalContext.governedActions) &&
    externalContext.governedActions.includes("complete-task");
  const canRescheduleGovernedTask =
    previewOnly &&
    externalContext.requiresHumanConfirmation === true &&
    Boolean(governedTaskId) &&
    Array.isArray(externalContext.governedActions) &&
    externalContext.governedActions.includes("reschedule-task");
  const canRecordGovernedTaskOutcome =
    previewOnly &&
    externalContext.requiresHumanConfirmation === true &&
    Boolean(governedTaskId) &&
    Boolean(governedLeadId) &&
    Array.isArray(externalContext.governedActions) &&
    externalContext.governedActions.includes("record-task-outcome");
  const requestedReturnHref =
    typeof externalContext.returnHref === "string"
      ? externalContext.returnHref
      : null;
  const returnHref =
    requestedReturnHref?.startsWith("/") &&
    !requestedReturnHref.startsWith("//")
      ? requestedReturnHref
      : null;
  const contextLabel =
    typeof externalContext.contextLabel === "string"
      ? externalContext.contextLabel
      : "Operação comercial";
  const workspace = externalContext.workspace;
  const contextualQuestions = useMemo(() => {
    if (workspace === "lead" || workspace === "customer") {
      return [
        "Qual é a próxima pergunta mais importante para esta lead?",
        "Prepare uma abordagem curta e humana para o próximo contato.",
        "Quais dados observados sustentam esta recomendação?",
      ];
    }
    if (workspace === "customers") {
      return [
        "Quais relacionamentos precisam de ação hoje?",
        "Onde faltam próximos passos registrados?",
        "Como organizar a carteira sem misturar a base fria?",
      ];
    }
    if (workspace === "calendar") {
      return [
        "Quais compromissos exigem preparação primeiro?",
        "Como recuperar os follow-ups atrasados de hoje?",
        "Prepare um roteiro de execução para minha agenda.",
      ];
    }
    return suggestedQuestions;
  }, [workspace]);

  function prepareDailyQueueItem(item: DailyQueueItem) {
    const isLeadOpportunity = item.kind === "lead-opportunity";
    setExternalContext({
      workspace: item.leadId ? "lead" : "calendar",
      leadId: item.leadId ?? undefined,
      contextLabel: item.leadName ? `Lead ${item.leadName}` : "Fila diária",
      returnHref: item.href,
      actionMode: "preview-only",
      requiresHumanConfirmation: true,
      taskId: item.taskId ?? undefined,
      governedActions: isLeadOpportunity ? ["create-task", "move-pipeline"] : item.taskId ? ["complete-task", "reschedule-task", "record-task-outcome"] : [],
      dailyQueueItem: {
        kind: item.kind,
        evidence: item.evidence,
        recommendedAction: item.recommendedAction,
        reasonCodes: item.reasonCodes,
        taskId: item.taskId,
        taskStatus: item.taskStatus,
        currentStage: item.currentStage,
        suggestedStage: item.suggestedStage,
      },
    });
    setPrompt(`Analise esta prioridade da minha fila: ${item.title}. Evidência observada: ${item.evidence} Prepare a próxima ação sem executá-la.`);
    setCopilotAnswer("");
    setCopilotError("");
    setCopilotSources([]);
    setCopilotCalibration(null);
    setPersistentCopilot(null);
    setTaskTitle(item.leadName ? `Próxima ação com ${item.leadName}` : item.title);
    setTaskDueAt(defaultTaskDueInput());
    setTaskPriority(item.severity === "critical" ? "alta" : "media");
    setTaskReviewed(false);
    setTaskError("");
    setTaskResult(null);
    setPipelineContext(null);
    setPipelineTarget(item.suggestedStage || "contato");
    setPipelineReviewed(false);
    setPipelineError("");
    setPipelineResult(null);
    if (item.taskId && item.taskStatus) {
      setTaskCompletionContext({
        taskId: item.taskId,
        title: item.title,
        status: item.taskStatus,
        dueAt: item.dueAt,
        leadName: item.leadName,
        outcomeContextPreview: item.outcomeContextPreview,
      });
      taskCompletionIdempotencyRef.current = crypto.randomUUID();
      setTaskRescheduleDueAt(defaultTaskRescheduleInput(item.dueAt));
      taskRescheduleIdempotencyRef.current = crypto.randomUUID();
    } else {
      setTaskCompletionContext(null);
      taskCompletionIdempotencyRef.current = null;
      setTaskRescheduleDueAt(defaultTaskDueInput());
      taskRescheduleIdempotencyRef.current = null;
    }
    setTaskCompletionReviewed(false);
    setTaskCompletionSaving(false);
    setTaskCompletionError("");
    setTaskCompletionResult(null);
    setTaskRescheduleReviewed(false);
    setTaskRescheduleSaving(false);
    setTaskRescheduleError("");
    setTaskRescheduleResult(null);
    setTaskOutcome("");
    setTaskOutcomeNote("");
    setTaskOutcomeReviewed(false);
    setTaskOutcomeSaving(false);
    setTaskOutcomeError("");
    setTaskOutcomeResult(null);
    taskOutcomeIdempotencyRef.current = null;
  }

  function prepareCommercialMemoryGap(gap: CommercialOutcomeMemoryGap) {
    setExternalContext({
      workspace: "lead",
      leadId: gap.leadId,
      contextLabel: `Memória de ${gap.leadName}`,
      returnHref: "/tasks",
      actionMode: "preview-only",
      requiresHumanConfirmation: true,
      taskId: gap.taskId,
      governedActions: ["record-task-outcome"],
    });
    setPrompt(`Revise o resultado observado da tarefa concluída "${gap.taskTitle}" vinculada a ${gap.leadName}. Não presuma o que aconteceu; aguarde minha confirmação.`);
    setCopilotAnswer("");
    setCopilotError("");
    setCopilotSources([]);
    setCopilotCalibration(null);
    setPersistentCopilot(null);
    setTaskCompletionContext({
      taskId: gap.taskId,
      title: gap.taskTitle,
      status: "concluida",
      dueAt: gap.taskDueAt,
      leadName: gap.leadName,
      outcomeContextPreview: buildCommercialOutcomeContextPreview({
        projectName: gap.projectName,
        sourceName: gap.sourceName,
      }),
    });
    setTaskCompletionReviewed(false);
    setTaskCompletionSaving(false);
    setTaskCompletionError("");
    setTaskCompletionResult({ auditRecorded: true, alreadyCompleted: true });
    setTaskOutcome("");
    setTaskOutcomeNote("");
    setTaskOutcomeReviewed(false);
    setTaskOutcomeSaving(false);
    setTaskOutcomeError("");
    setTaskOutcomeResult(null);
    taskOutcomeIdempotencyRef.current = crypto.randomUUID();
    window.setTimeout(() => {
      document.getElementById("copilot-task-completion-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function completeConfirmedTask() {
    if (!canCompleteGovernedTask || !governedTaskId || !taskCompletionContext || taskCompletionSaving) return;
    if (!taskCompletionReviewed) {
      setTaskCompletionError("Confirme que a tarefa foi realmente executada antes de concluí-la.");
      return;
    }

    setTaskCompletionSaving(true);
    setTaskCompletionError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para concluir a tarefa.");
      const idempotencyKey = taskCompletionIdempotencyRef.current || crypto.randomUUID();
      taskCompletionIdempotencyRef.current = idempotencyKey;
      const response = await fetch("/api/v1/tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          id: governedTaskId,
          action: "complete",
          expectedStatus: taskCompletionContext.status,
          source: "atlas-copilot",
          humanConfirmed: true,
        }),
      });
      const payload = (await response.json()) as TaskCompletionResponse;
      if (!response.ok || !payload.data?.task?.id) {
        const currentStatus = payload.error?.details?.currentStatus;
        if (currentStatus) {
          setTaskCompletionContext((current) => current ? { ...current, status: currentStatus } : current);
          setTaskCompletionReviewed(false);
          taskCompletionIdempotencyRef.current = crypto.randomUUID();
        }
        throw new Error(payload.error?.message || "Não foi possível concluir a tarefa confirmada.");
      }

      setTaskCompletionResult({
        auditRecorded: payload.data.auditRecorded === true,
        alreadyCompleted: payload.data.alreadyCompleted === true,
      });
      setTaskCompletionContext((current) => current ? { ...current, status: payload.data?.task?.status || "concluida" } : current);
      taskOutcomeIdempotencyRef.current = crypto.randomUUID();
      setDailyQueue((current) => current.filter((item) => item.taskId !== governedTaskId));
      setTasks((current) => current.filter((task) => task.id !== governedTaskId));

      const queueResponse = await fetch(dailyQueueUrl(commercialOutcomePeriodRef.current, commercialOutcomeFilterRef.current), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => null);
      if (queueResponse?.ok) {
        const queuePayload = (await queueResponse.json()) as DailyQueueResponse;
        setDailyQueue(queuePayload.data?.items ?? []);
        setDailyQueueSummary(queuePayload.data?.summary ?? null);
        setCommercialOutcomeSummary(queuePayload.data?.commercialOutcomeSummary ?? null);
        setTasks(queuePayload.data?.pendingTasks ?? []);
      }
    } catch (error) {
      setTaskCompletionError(error instanceof Error ? error.message : "Não foi possível concluir a tarefa confirmada.");
    } finally {
      setTaskCompletionSaving(false);
    }
  }

  async function recordConfirmedTaskOutcome() {
    if (!canRecordGovernedTaskOutcome || !governedTaskId || !taskCompletionContext || !taskCompletionResult || taskOutcomeSaving) return;
    if (!taskOutcome) {
      setTaskOutcomeError("Selecione o resultado realmente observado após executar a tarefa.");
      return;
    }
    if (!taskOutcomeReviewed) {
      setTaskOutcomeError("Confirme que o resultado foi observado antes de adicioná-lo à memória comercial.");
      return;
    }

    setTaskOutcomeSaving(true);
    setTaskOutcomeError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para registrar o resultado.");
      const idempotencyKey = taskOutcomeIdempotencyRef.current || crypto.randomUUID();
      taskOutcomeIdempotencyRef.current = idempotencyKey;
      const response = await fetch("/api/v1/tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          id: governedTaskId,
          action: "record_outcome",
          expectedStatus: taskCompletionContext.status,
          outcome: taskOutcome,
          outcomeNote: taskOutcomeNote,
          commercialContextReviewed: true,
          expectedCommercialContext: {
            projectName: taskCompletionContext.outcomeContextPreview.projectName,
            sourceName: taskCompletionContext.outcomeContextPreview.sourceName,
          },
          source: "atlas-copilot",
          humanConfirmed: true,
        }),
      });
      const payload = (await response.json()) as TaskCompletionResponse;
      if (!response.ok || !payload.data?.task?.id || !payload.data.outcomeRecord?.id) {
        const currentStatus = payload.error?.details?.currentStatus;
        const refreshedContext = payload.error?.details?.commercialContextPreview;
        if (currentStatus || refreshedContext) {
          setTaskCompletionContext((current) => current ? {
            ...current,
            status: currentStatus || current.status,
            outcomeContextPreview: refreshedContext || current.outcomeContextPreview,
          } : current);
          setTaskOutcomeReviewed(false);
          taskOutcomeIdempotencyRef.current = crypto.randomUUID();
        }
        throw new Error(payload.error?.message || "Não foi possível registrar o resultado na memória comercial.");
      }
      setTaskOutcomeResult({
        eventId: payload.data.outcomeRecord.id || null,
        alreadyRecorded: payload.data.alreadyRecorded === true,
      });
      const queueResponse = await fetch(dailyQueueUrl(commercialOutcomePeriodRef.current, commercialOutcomeFilterRef.current), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => null);
      if (queueResponse?.ok) {
        const queuePayload = (await queueResponse.json()) as DailyQueueResponse;
        setCommercialOutcomeSummary(queuePayload.data?.commercialOutcomeSummary ?? null);
      }
    } catch (error) {
      setTaskOutcomeError(error instanceof Error ? error.message : "Não foi possível registrar o resultado na memória comercial.");
    } finally {
      setTaskOutcomeSaving(false);
    }
  }

  async function rescheduleConfirmedTask() {
    if (!canRescheduleGovernedTask || !governedTaskId || !taskCompletionContext || taskRescheduleSaving) return;
    if (!taskRescheduleReviewed) {
      setTaskRescheduleError("Revise o novo prazo e confirme o reagendamento antes de salvar.");
      return;
    }
    const requestedDueAt = new Date(taskRescheduleDueAt);
    if (!taskRescheduleDueAt || !Number.isFinite(requestedDueAt.getTime()) || requestedDueAt.getTime() < Date.now() - 300_000) {
      setTaskRescheduleReviewed(false);
      setTaskRescheduleError("Escolha um novo prazo futuro válido.");
      return;
    }

    setTaskRescheduleSaving(true);
    setTaskRescheduleError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para reagendar a tarefa.");
      const idempotencyKey = taskRescheduleIdempotencyRef.current || crypto.randomUUID();
      taskRescheduleIdempotencyRef.current = idempotencyKey;
      const response = await fetch("/api/v1/tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          id: governedTaskId,
          action: "reschedule",
          dueAt: requestedDueAt.toISOString(),
          expectedStatus: taskCompletionContext.status,
          expectedDueAt: taskCompletionContext.dueAt,
          source: "atlas-copilot",
          humanConfirmed: true,
        }),
      });
      const payload = (await response.json()) as TaskCompletionResponse;
      if (!response.ok || !payload.data?.task?.id || !payload.data.task.due_at) {
        const currentStatus = payload.error?.details?.currentStatus;
        const currentDueAt = payload.error?.details?.currentDueAt;
        if (currentStatus || currentDueAt !== undefined) {
          setTaskCompletionContext((current) => current ? {
            ...current,
            status: currentStatus || current.status,
            dueAt: currentDueAt === undefined ? current.dueAt : currentDueAt,
          } : current);
          setTaskRescheduleReviewed(false);
          taskRescheduleIdempotencyRef.current = crypto.randomUUID();
        }
        throw new Error(payload.error?.message || "Não foi possível reagendar a tarefa confirmada.");
      }

      const resultingDueAt = payload.data.task.due_at;
      setTaskRescheduleResult({
        auditRecorded: payload.data.auditRecorded === true,
        alreadyScheduled: payload.data.alreadyScheduled === true,
        dueAt: resultingDueAt,
      });
      setTaskCompletionContext((current) => current ? { ...current, dueAt: resultingDueAt } : current);

      const queueResponse = await fetch(dailyQueueUrl(commercialOutcomePeriodRef.current, commercialOutcomeFilterRef.current), {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => null);
      if (queueResponse?.ok) {
        const queuePayload = (await queueResponse.json()) as DailyQueueResponse;
        const refreshedItem = queuePayload.data?.items?.find((item) => item.taskId === governedTaskId);
        setDailyQueue(queuePayload.data?.items ?? []);
        setDailyQueueSummary(queuePayload.data?.summary ?? null);
        setCommercialOutcomeSummary(queuePayload.data?.commercialOutcomeSummary ?? null);
        setTasks(queuePayload.data?.pendingTasks ?? []);
        if (refreshedItem?.taskStatus) setTaskCompletionContext((current) => current ? {
          ...current,
          status: refreshedItem.taskStatus || current.status,
          dueAt: refreshedItem.dueAt,
        } : current);
      }
    } catch (error) {
      setTaskRescheduleError(error instanceof Error ? error.message : "Não foi possível reagendar a tarefa confirmada.");
    } finally {
      setTaskRescheduleSaving(false);
    }
  }

  async function askCopilot() {
    const question = prompt.trim();
    if (!question) return;

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setCopilotLoading(true);
    setCopilotError("");
    setCopilotAnswer("");
    setCopilotSources([]);
    setCopilotCalibration(null);
    setPersistentCopilot(null);
    setTaskResult(null);
    setTaskReviewed(false);
    setTaskError("");
    setPipelineContext(null);
    setPipelineReviewed(false);
    setPipelineError("");
    setPipelineResult(null);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para usar o Atlas Copilot.");

      const response = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: question,
          leadId: typeof externalContext.leadId === "string" ? externalContext.leadId : undefined,
          context: {
            dashboard: externalContext,
            nextAction,
            dailyQueue: dailyQueue.map((item) => ({
              kind: item.kind,
              title: item.title,
              evidence: item.evidence,
              recommendedAction: item.recommendedAction,
              reasonCodes: item.reasonCodes,
              leadId: item.leadId,
              currentStage: item.currentStage,
              suggestedStage: item.suggestedStage,
            })),
            insights: insights.map((insight) => ({
              title: insight.title,
              recommendation: insight.recommendation,
              score: insight.score,
              confidence: insight.confidence,
            })),
            tasks: tasks.map((task) => ({
              title: task.title,
              priority: task.priority,
              status: task.status,
              due_at: task.due_at,
            })),
          },
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as { answer?: string; sources?: CopilotSource[]; calibration?: CopilotCalibration; copilot?: PersistentCopilot | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao consultar o Atlas Copilot.");
      setCopilotAnswer(payload.answer || "Sem resposta do modelo.");
      setCopilotSources(payload.sources ?? []);
      setCopilotCalibration(payload.calibration ?? null);
      setPersistentCopilot(payload.copilot ?? null);

      if (canMoveGovernedPipeline && governedLeadId) {
        try {
          const leadContextResponse = await fetch(`/api/v1/leads/${encodeURIComponent(governedLeadId)}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          });
          const leadPayload = (await leadContextResponse.json()) as {
            lead?: { name?: string | null; status?: string | null };
            error?: string;
          };
          if (!leadContextResponse.ok || !leadPayload.lead) {
            setPipelineError(leadPayload.error || "Não foi possível confirmar a etapa atual desta lead.");
          } else {
            const currentStage = canonicalPipelineStage(leadPayload.lead.status) || "novo";
            setPipelineContext({
              leadName: leadPayload.lead.name || "Lead atual",
              currentStage,
            });
            setPipelineTarget(nextGovernedPipelineStage(currentStage));
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setPipelineError(error instanceof Error ? error.message : "Não foi possível confirmar a etapa atual desta lead.");
          }
        }
      }
    } catch (error) {
      setCopilotError(controller.signal.aborted ? "Consulta cancelada. Ajuste a pergunta ou tente novamente." : error instanceof Error ? error.message : "Falha ao consultar o Atlas Copilot.");
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setCopilotLoading(false);
      }
    }
  }

  async function createConfirmedTask() {
    if (!canCreateGovernedTask || !governedLeadId || taskSaving) return;
    const title = taskTitle.trim();
    const due = new Date(taskDueAt);
    if (title.length < 3 || title.length > 120) {
      setTaskError("Use um título entre 3 e 120 caracteres.");
      return;
    }
    if (!Number.isFinite(due.getTime()) || due.getTime() < Date.now()) {
      setTaskError("Escolha um prazo futuro para a próxima ação.");
      return;
    }
    if (!taskReviewed) {
      setTaskError("Confirme que você revisou título, prioridade e prazo.");
      return;
    }

    setTaskSaving(true);
    setTaskError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para criar a tarefa.");

      const dueAt = due.toISOString();
      const response = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description:
            "Tarefa confirmada pelo usuário a partir de uma recomendação do Atlas Copilot. Revise o contexto no Lead 360 antes do contato.",
          leadId: governedLeadId,
          dueAt,
          priority: taskPriority,
          source: "atlas-copilot",
          humanConfirmed: true,
        }),
      });
      const payload = (await response.json()) as TaskCreateResponse;
      if (!response.ok || !payload.data?.task?.id) {
        throw new Error(payload.error?.message || "Não foi possível criar a tarefa confirmada.");
      }

      const createdTask = payload.data.task;
      const id = String(createdTask.id);
      const auditRecorded = payload.data.auditRecorded === true;
      setTaskResult({ id, auditRecorded });
      setTasks((current) => [
        {
          id,
          title,
          priority: taskPriority,
          status: String(createdTask.status || "pendente"),
          due_at: typeof createdTask.due_at === "string" ? createdTask.due_at : dueAt,
        },
        ...current.filter((task) => task.id !== id),
      ].slice(0, 5));
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Não foi possível criar a tarefa confirmada.");
    } finally {
      setTaskSaving(false);
    }
  }

  async function moveConfirmedPipeline() {
    if (!canMoveGovernedPipeline || !governedLeadId || !pipelineContext || pipelineSaving) return;
    if (pipelineTarget === pipelineContext.currentStage) {
      setPipelineError("Escolha uma etapa diferente da etapa atual.");
      return;
    }
    if (!pipelineReviewed) {
      setPipelineError("Confirme que você revisou a mudança de etapa.");
      return;
    }

    setPipelineSaving(true);
    setPipelineError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para movimentar a lead.");

      const response = await fetch("/api/v1/pipeline", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          leadId: governedLeadId,
          stage: pipelineTarget,
          expectedFromStage: pipelineContext.currentStage,
          source: "atlas-copilot",
          humanConfirmed: true,
          followUpDescription: "Etapa revisada e confirmada pelo usuário no Atlas Copilot.",
          reversalOf: null,
        }),
      });
      const payload = (await response.json()) as PipelineMoveResponse;
      const confirmedMove = payload.move;
      if (!response.ok || !confirmedMove?.moveId || !confirmedMove.fromStage || !confirmedMove.toStage) {
        if (payload.code === "PIPELINE_STAGE_CONFLICT" && payload.currentStage) {
          const currentStage = payload.currentStage;
          setPipelineContext((current) => current ? { ...current, currentStage } : current);
          setPipelineTarget(nextGovernedPipelineStage(currentStage));
          setPipelineReviewed(false);
        }
        throw new Error(payload.error || "Não foi possível confirmar a movimentação.");
      }

      const moveId = confirmedMove.moveId;
      const fromStage = confirmedMove.fromStage;
      const toStage = confirmedMove.toStage;
      setPipelineResult({
        moveId,
        fromStage,
        toStage,
        undone: false,
      });
      setPipelineContext((current) => current ? { ...current, currentStage: toStage } : current);
      setPipelineReviewed(false);
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : "Não foi possível confirmar a movimentação.");
    } finally {
      setPipelineSaving(false);
    }
  }

  async function undoConfirmedPipeline() {
    if (!governedLeadId || !pipelineContext || !pipelineResult || pipelineResult.undone || pipelineSaving) return;

    setPipelineSaving(true);
    setPipelineError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente para desfazer a movimentação.");

      const response = await fetch("/api/v1/pipeline", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          leadId: governedLeadId,
          stage: pipelineResult.fromStage,
          expectedFromStage: pipelineResult.toStage,
          source: "atlas-copilot",
          humanConfirmed: true,
          followUpDescription: "Movimentação do Copilot desfeita pelo usuário.",
          reversalOf: pipelineResult.moveId,
        }),
      });
      const payload = (await response.json()) as PipelineMoveResponse;
      if (!response.ok || !payload.move?.moveId) {
        if (payload.code === "PIPELINE_STAGE_CONFLICT" && payload.currentStage) {
          const currentStage = payload.currentStage;
          setPipelineContext((current) => current ? { ...current, currentStage } : current);
          setPipelineTarget(nextGovernedPipelineStage(currentStage));
        }
        throw new Error(payload.error || "A movimentação mudou e não pôde ser desfeita.");
      }

      setPipelineResult((current) => current ? { ...current, undone: true } : current);
      setPipelineContext((current) => current ? { ...current, currentStage: pipelineResult.fromStage } : current);
      setPipelineTarget(pipelineResult.toStage);
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : "Não foi possível desfazer a movimentação.");
    } finally {
      setPipelineSaving(false);
    }
  }

  function cancelCopilot() {
    requestControllerRef.current?.abort();
  }

  function closeCopilot() {
    requestControllerRef.current?.abort();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 hidden items-center gap-3 rounded-2xl border border-sky-400/20 bg-[#07111f]/90 px-4 py-3 text-left shadow-[0_24px_80px_rgba(2,8,23,.55)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:border-sky-300/35 lg:flex"
        aria-label="Abrir Atlas Copilot"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400/20 to-violet-500/20 text-sky-300">✦</span>
        <span>
          <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">Atlas Copilot</span>
          <span className="mt-0.5 block max-w-48 truncate text-xs text-slate-400">Próxima melhor ação</span>
        </span>
        <kbd className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500">⌘J</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/70 backdrop-blur-sm" onMouseDown={closeCopilot}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-white/[0.08] bg-[#060b16]/98 p-5 shadow-[-24px_0_100px_rgba(2,8,23,.6)]"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Atlas Copilot"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-sky-300">Atlas Intelligence</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-white">Especialista imobiliário</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">Estoque, leads, projetos, materiais, crédito e mercado em uma leitura operacional.</p>
              </div>
              <button type="button" onClick={closeCopilot} className="atlas-icon-button" aria-label="Fechar copilot">×</button>
            </div>

            {previewOnly ? (
              <div
                className="atlas-copilot-preview-notice"
                role="status"
                data-human-confirmation="required"
              >
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Modo preparação · {contextLabel}</strong>
                  <p>
                    O Copilot analisa e sugere. Nada será enviado, concluído ou
                    alterado sem sua confirmação.
                  </p>
                </div>
              </div>
            ) : null}

            <section className="mt-6 rounded-3xl border border-sky-400/15 bg-gradient-to-br from-sky-500/[.12] to-violet-500/[.08] p-5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">Ação recomendada</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
              </div>
              <p className="mt-4 text-lg font-medium leading-7 text-white">{loading ? "Analisando a operação..." : nextAction}</p>
              <div className="mt-5 flex gap-2">
                <Link href="/decision-center" onClick={() => setOpen(false)} className="atlas-button-primary">Abrir decisão</Link>
                <Link href="/tasks" onClick={() => setOpen(false)} className="atlas-button-secondary">Ver tarefas</Link>
              </div>
            </section>

            {(canCompleteGovernedTask || canRescheduleGovernedTask || canRecordGovernedTaskOutcome) && taskCompletionContext ? (
              <section
                className="mt-4 rounded-3xl border border-emerald-300/15 bg-emerald-400/[.05] p-5"
                aria-labelledby="copilot-task-completion-title"
                data-governed-write="task-complete"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-300">Fases 65–66 · execução governada</p>
                    <h3 id="copilot-task-completion-title" className="mt-1 text-sm font-semibold text-white">Atualizar tarefa revisada</h3>
                  </div>
                  <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-amber-200">Confirmação</span>
                </div>
                <div className="mt-4 rounded-2xl border border-white/[0.06] bg-slate-950/40 p-4">
                  <strong className="block text-sm text-white">{taskCompletionContext.title}</strong>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    Estado observado: {taskCompletionContext.status}{taskCompletionContext.leadName ? ` · ${taskCompletionContext.leadName}` : ""}. Prazo atual: {taskCompletionContext.dueAt ? new Date(taskCompletionContext.dueAt).toLocaleString("pt-BR") : "não definido"}.
                  </p>
                </div>
                {taskCompletionResult ? (
                  <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.08] p-4" role="status">
                    <strong className="block text-sm text-emerald-100">
                      {taskCompletionResult.alreadyCompleted ? "A tarefa já estava concluída." : "Tarefa concluída com segurança."}
                    </strong>
                    <p className="mt-1 text-xs leading-5 text-emerald-100/75">
                      {taskCompletionResult.auditRecorded ? "A transição permanece no histórico comercial e a fila foi atualizada." : "A conclusão foi aplicada e o log seguro preservou a evidência para revisão."}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {canCompleteGovernedTask ? (
                      <div className="space-y-3 rounded-2xl border border-emerald-300/10 bg-emerald-400/[.035] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-emerald-300">Concluir</p>
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-slate-300">
                          <input
                            type="checkbox"
                            checked={taskCompletionReviewed}
                            onChange={(event) => { setTaskCompletionReviewed(event.target.checked); setTaskCompletionError(""); }}
                            className="mt-1 h-4 w-4 accent-emerald-400"
                          />
                          <span>Executei a tarefa e confirmo sua conclusão. Entendo que o Atlas registrará esta transição no histórico.</span>
                        </label>
                        <button
                          type="button"
                          onClick={completeConfirmedTask}
                          disabled={!taskCompletionReviewed || taskCompletionSaving}
                          className="atlas-button-primary w-full disabled:cursor-not-allowed disabled:opacity-55"
                          data-human-confirmation="confirmed"
                          data-idempotent-action="task-complete"
                        >
                          {taskCompletionSaving ? "Concluindo e auditando..." : "Confirmar conclusão"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
                {taskCompletionError ? <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">{taskCompletionError}</p> : null}

                {canRecordGovernedTaskOutcome && taskCompletionResult ? (
                  <div className="mt-4 space-y-3 rounded-2xl border border-violet-300/15 bg-violet-400/[.045] p-4" data-governed-write="task-outcome">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-violet-300">Fase 67 · memória comercial</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">Qual foi o resultado observado?</h4>
                      <p className="mt-1 text-xs leading-5 text-slate-400">O registro alimenta o histórico da lead. Não altera score, etapa, responsável nem envia mensagem.</p>
                    </div>
                    {taskOutcomeResult ? (
                      <div className="rounded-xl border border-emerald-300/15 bg-emerald-400/[.06] p-3" role="status">
                        <strong className="block text-sm text-emerald-100">
                          {taskOutcomeResult.alreadyRecorded ? "Este resultado já estava na memória." : "Resultado adicionado à memória comercial."}
                        </strong>
                        <p className="mt-1 text-xs leading-5 text-emerald-100/75">A evidência permanece vinculada à tarefa e à lead para aprendizado supervisionado.</p>
                      </div>
                    ) : (
                      <>
                        <div
                          className={`rounded-xl border p-3 ${taskCompletionContext.outcomeContextPreview.status === "complete" ? "border-emerald-300/15 bg-emerald-400/[.045]" : "border-amber-300/15 bg-amber-400/[.045]"}`}
                          data-commercial-outcome-context-preview={taskCompletionContext.outcomeContextPreview.status}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-cyan-300">Fase 86 · contexto que será preservado</p>
                              <p className="mt-1 text-xs leading-5 text-slate-300">Revise o cadastro disponível antes de confirmar o resultado.</p>
                            </div>
                            <span className={`atlas-badge shrink-0 ${taskCompletionContext.outcomeContextPreview.status === "complete" ? "atlas-badge-success" : "atlas-badge-warning"}`}>
                              {taskCompletionContext.outcomeContextPreview.status === "complete" ? "Completo" : "Atenção"}
                            </span>
                          </div>
                          <dl className="mt-3 grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-white/[0.05] bg-slate-950/35 px-3 py-2">
                              <dt className="text-[9px] uppercase tracking-[.1em] text-slate-500">Projeto</dt>
                              <dd className={`mt-1 truncate text-xs ${taskCompletionContext.outcomeContextPreview.projectName ? "text-slate-100" : "text-amber-200"}`}>
                                {taskCompletionContext.outcomeContextPreview.projectName || "Não informado"}
                              </dd>
                            </div>
                            <div className="rounded-lg border border-white/[0.05] bg-slate-950/35 px-3 py-2">
                              <dt className="text-[9px] uppercase tracking-[.1em] text-slate-500">Origem</dt>
                              <dd className={`mt-1 truncate text-xs ${taskCompletionContext.outcomeContextPreview.sourceName ? "text-slate-100" : "text-amber-200"}`}>
                                {taskCompletionContext.outcomeContextPreview.sourceName || "Não informada"}
                              </dd>
                            </div>
                          </dl>
                          <p className={`mt-3 text-[10px] leading-4 ${taskCompletionContext.outcomeContextPreview.status === "complete" ? "text-emerald-100/75" : "text-amber-100/80"}`}>
                            {taskCompletionContext.outcomeContextPreview.primaryFinding}
                          </p>
                          {taskCompletionContext.outcomeContextPreview.missingDimensions.length > 0 && governedLeadId ? (
                            <Link href={`/leads/${encodeURIComponent(governedLeadId)}#commercial-context`} className="mt-2 inline-flex text-[10px] font-semibold text-cyan-300 hover:text-cyan-200">
                              Revisar cadastro da lead →
                            </Link>
                          ) : null}
                        </div>
                        <label className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                          Resultado observado
                          <select
                            value={taskOutcome}
                            onChange={(event) => {
                              setTaskOutcome(event.target.value as TaskOutcome | "");
                              setTaskOutcomeReviewed(false);
                              setTaskOutcomeError("");
                              setTaskOutcomeResult(null);
                              taskOutcomeIdempotencyRef.current = crypto.randomUUID();
                            }}
                            className="mt-2 w-full rounded-xl border border-white/[0.08] bg-slate-950/70 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-white outline-none transition focus:border-violet-300/40"
                          >
                            <option value="">Selecione o que aconteceu</option>
                            {taskOutcomeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        <label className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                          Observação opcional
                          <textarea
                            value={taskOutcomeNote}
                            onChange={(event) => {
                              setTaskOutcomeNote(event.target.value.slice(0, 500));
                              setTaskOutcomeReviewed(false);
                              setTaskOutcomeError("");
                              setTaskOutcomeResult(null);
                              taskOutcomeIdempotencyRef.current = crypto.randomUUID();
                            }}
                            maxLength={500}
                            rows={3}
                            placeholder="Registre somente o fato útil para o próximo atendimento."
                            className="mt-2 w-full resize-none rounded-xl border border-white/[0.08] bg-slate-950/70 px-3 py-2.5 text-xs font-normal normal-case leading-5 tracking-normal text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/40"
                          />
                          <span className="mt-1 block text-right text-[9px] font-normal normal-case tracking-normal text-slate-600">{taskOutcomeNote.length}/500</span>
                        </label>
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-slate-300">
                          <input
                            type="checkbox"
                            checked={taskOutcomeReviewed}
                            onChange={(event) => { setTaskOutcomeReviewed(event.target.checked); setTaskOutcomeError(""); }}
                            className="mt-1 h-4 w-4 accent-violet-400"
                          />
                          <span>
                            Confirmo que este resultado foi observado e revisei o projeto e a origem mostrados acima. Se algum estiver ausente, entendo que o Atlas salvará o fato sem inventar ou preencher essa dimensão.
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={recordConfirmedTaskOutcome}
                          disabled={!taskOutcome || !taskOutcomeReviewed || taskOutcomeSaving}
                          className="atlas-button-secondary w-full disabled:cursor-not-allowed disabled:opacity-55"
                          data-human-confirmation="confirmed"
                          data-idempotent-action="task-outcome"
                        >
                          {taskOutcomeSaving ? "Registrando evidência..." : "Registrar resultado observado"}
                        </button>
                      </>
                    )}
                    {taskOutcomeError ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">{taskOutcomeError}</p> : null}
                  </div>
                ) : null}

                {canRescheduleGovernedTask && !taskCompletionResult ? (
                  <div className="mt-4 space-y-3 rounded-2xl border border-sky-300/10 bg-sky-400/[.035] p-4" data-governed-write="task-reschedule">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-sky-300">Reagendar</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">Escolha o novo prazo. O Atlas não altera responsável, prioridade, lead ou pipeline.</p>
                    </div>
                    {taskRescheduleResult ? (
                      <div className="rounded-xl border border-sky-300/15 bg-sky-400/[.06] p-3" role="status">
                        <strong className="block text-sm text-sky-100">
                          {taskRescheduleResult.alreadyScheduled ? "A tarefa já estava neste prazo." : "Tarefa reagendada com segurança."}
                        </strong>
                        <p className="mt-1 text-xs leading-5 text-sky-100/75">
                          Novo prazo: {new Date(taskRescheduleResult.dueAt).toLocaleString("pt-BR")}. {taskRescheduleResult.auditRecorded ? "A alteração está no histórico comercial." : "O log seguro preservou a alteração para revisão."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <label className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                          Novo prazo
                          <input
                            type="datetime-local"
                            value={taskRescheduleDueAt}
                            onChange={(event) => {
                              setTaskRescheduleDueAt(event.target.value);
                              setTaskRescheduleReviewed(false);
                              setTaskRescheduleError("");
                              setTaskRescheduleResult(null);
                              taskRescheduleIdempotencyRef.current = crypto.randomUUID();
                            }}
                            className="mt-2 w-full rounded-xl border border-white/[0.08] bg-slate-950/70 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-white outline-none transition focus:border-sky-300/40"
                          />
                        </label>
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-slate-300">
                          <input
                            type="checkbox"
                            checked={taskRescheduleReviewed}
                            onChange={(event) => { setTaskRescheduleReviewed(event.target.checked); setTaskRescheduleError(""); }}
                            className="mt-1 h-4 w-4 accent-sky-400"
                          />
                          <span>Revisei o novo prazo e confirmo o reagendamento desta tarefa.</span>
                        </label>
                        <button
                          type="button"
                          onClick={rescheduleConfirmedTask}
                          disabled={!taskRescheduleReviewed || taskRescheduleSaving}
                          className="atlas-button-secondary w-full disabled:cursor-not-allowed disabled:opacity-55"
                          data-human-confirmation="confirmed"
                          data-idempotent-action="task-reschedule"
                        >
                          {taskRescheduleSaving ? "Reagendando e auditando..." : "Confirmar novo prazo"}
                        </button>
                      </>
                    )}
                    {taskRescheduleError ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">{taskRescheduleError}</p> : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Perguntar ao Atlas Copilot</h3>
                <span className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-400">CALIBRADO · JUL/26</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">O Atlas consulta somente seu escopo comercial e diferencia dados internos, referências externas e recomendações.</p>
              {persistentCopilot?.exclusive ? <div className="mt-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/[.06] px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-300">Fase 45 · Copiloto exclusivo</p><p className="mt-1 text-xs text-emerald-50">Memória vinculada somente a esta lead e ao corretor responsável · versão {persistentCopilot.learningVersion}</p></div> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {contextualQuestions.map((question) => <button key={question} type="button" onClick={() => setPrompt(question)} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-left text-[10px] text-slate-400 transition hover:border-sky-400/25 hover:text-sky-200">{question}</button>)}
              </div>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={2000}
                rows={4}
                className="mt-4 w-full resize-none rounded-2xl border border-white/[0.08] bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-sky-400/40"
                placeholder="Ex.: o que devo priorizar hoje para converter mais leads?"
              />
              {copilotError ? <p role="alert" className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-100">{copilotError}</p> : null}
              {copilotAnswer ? (
                <div className="mt-3 rounded-2xl border border-sky-400/15 bg-sky-400/10 px-4 py-3 text-sm leading-6 text-sky-50">
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-sky-200/10 pb-3">
                    <span className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-300">Resposta imobiliária</span>
                    <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] ${copilotCalibration?.mode === "local-fallback" ? "bg-amber-400/10 text-amber-200" : "bg-emerald-400/10 text-emerald-200"}`}>{copilotCalibration?.mode === "local-fallback" ? "Motor local seguro" : "IA generativa"}</span>
                  </div>
                  <MessageResponse>{copilotAnswer}</MessageResponse>
                  {copilotCalibration ? <p className="mt-3 border-t border-sky-200/10 pt-3 text-[10px] uppercase tracking-[.12em] text-sky-200/70">{copilotCalibration.provider || "local"} · {copilotCalibration.model || "modelo seguro"} · {copilotCalibration.pricingConfigured ? `custo medido US$ ${(copilotCalibration.estimatedCostUsd ?? 0).toFixed(6)}` : "preço pendente de configuração"}</p> : null}
                  {copilotSources.length ? <div className="mt-4 border-t border-sky-200/10 pt-3"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-300">Referências consultadas</p><div className="mt-2 space-y-2">{copilotSources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/[0.06] bg-slate-950/30 px-3 py-2 text-xs text-slate-300 transition hover:border-sky-400/25"><strong className="block text-sky-200">{source.publisher}</strong><span>{source.title} · verificado em {new Date(`${source.verifiedAt}T12:00:00`).toLocaleDateString("pt-BR")}</span></a>)}</div></div> : null}
                  {canCreateGovernedTask ? (
                    <section
                      className="mt-4 rounded-2xl border border-violet-300/15 bg-slate-950/40 p-4"
                      aria-labelledby="copilot-task-confirmation-title"
                      data-governed-write="task-create"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-300">Próxima ação governada</p>
                          <h4 id="copilot-task-confirmation-title" className="mt-1 text-sm font-semibold text-white">Transformar a recomendação em tarefa</h4>
                        </div>
                        <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-amber-200">Prévia</span>
                      </div>

                      {taskResult ? (
                        <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[.08] p-3" role="status">
                          <strong className="block text-sm text-emerald-100">Tarefa criada com confirmação humana.</strong>
                          <p className="mt-1 text-xs leading-5 text-emerald-100/75">
                            {taskResult.auditRecorded
                              ? "A decisão também foi registrada no histórico da lead."
                              : "A tarefa foi criada; o registro complementar de auditoria precisa ser revisado."}
                          </p>
                          <Link href="/tasks" onClick={() => setOpen(false)} className="mt-3 inline-flex text-xs font-semibold text-emerald-200">Abrir em Tarefas →</Link>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <p className="text-xs leading-5 text-slate-400">Revise os campos. A tarefa só será gravada quando você confirmar.</p>
                          <label className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                            Título
                            <input
                              value={taskTitle}
                              onChange={(event) => { setTaskTitle(event.target.value); setTaskReviewed(false); setTaskError(""); }}
                              maxLength={120}
                              className="mt-2 w-full rounded-xl border border-white/[0.08] bg-slate-950/70 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-white outline-none transition focus:border-violet-300/40"
                            />
                          </label>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                              Prazo
                              <input
                                type="datetime-local"
                                value={taskDueAt}
                                onChange={(event) => { setTaskDueAt(event.target.value); setTaskReviewed(false); setTaskError(""); }}
                                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-slate-950/70 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-white outline-none transition focus:border-violet-300/40"
                              />
                            </label>
                            <label className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                              Prioridade
                              <select
                                value={taskPriority}
                                onChange={(event) => { setTaskPriority(event.target.value as TaskPriority); setTaskReviewed(false); setTaskError(""); }}
                                className="mt-2 w-full rounded-xl border border-white/[0.08] bg-slate-950/70 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-white outline-none transition focus:border-violet-300/40"
                              >
                                <option value="baixa">Baixa</option>
                                <option value="media">Média</option>
                                <option value="alta">Alta</option>
                              </select>
                            </label>
                          </div>
                          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-slate-300">
                            <input
                              type="checkbox"
                              checked={taskReviewed}
                              onChange={(event) => { setTaskReviewed(event.target.checked); setTaskError(""); }}
                              className="mt-1 h-4 w-4 accent-violet-400"
                            />
                            <span>Revisei o título, a prioridade e o prazo. Confirmo a criação desta tarefa para a lead atual.</span>
                          </label>
                          {taskError ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">{taskError}</p> : null}
                          <button
                            type="button"
                            onClick={createConfirmedTask}
                            disabled={!taskReviewed || taskSaving}
                            className="atlas-button-primary w-full disabled:cursor-not-allowed disabled:opacity-55"
                            data-human-confirmation="confirmed"
                          >
                            {taskSaving ? "Criando e auditando..." : "Confirmar e criar tarefa"}
                          </button>
                        </div>
                      )}
                    </section>
                  ) : null}
                  {canMoveGovernedPipeline ? (
                    <section
                      className="mt-4 rounded-2xl border border-sky-300/15 bg-slate-950/40 p-4"
                      aria-labelledby="copilot-pipeline-confirmation-title"
                      data-governed-write="pipeline-move"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-300">Pipeline governado</p>
                          <h4 id="copilot-pipeline-confirmation-title" className="mt-1 text-sm font-semibold text-white">Movimentar a lead no Kanban</h4>
                        </div>
                        <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-amber-200">Prévia</span>
                      </div>

                      {pipelineResult ? (
                        <div className="mt-4 space-y-3">
                          <div className={`rounded-xl border p-3 ${pipelineResult.undone ? "border-sky-400/20 bg-sky-400/[.08]" : "border-emerald-400/20 bg-emerald-400/[.08]"}`} role="status">
                            <strong className={`block text-sm ${pipelineResult.undone ? "text-sky-100" : "text-emerald-100"}`}>
                              {pipelineResult.undone ? "Movimentação desfeita com segurança." : "Etapa atualizada com confirmação humana."}
                            </strong>
                            <p className={`mt-1 text-xs leading-5 ${pipelineResult.undone ? "text-sky-100/75" : "text-emerald-100/75"}`}>
                              {pipelineStageLabel(pipelineResult.fromStage)} → {pipelineStageLabel(pipelineResult.toStage)}
                              {pipelineResult.undone ? " foi revertida e permaneceu registrada no histórico." : " foi registrada no histórico comercial."}
                            </p>
                          </div>
                          {!pipelineResult.undone ? (
                            <button
                              type="button"
                              onClick={undoConfirmedPipeline}
                              disabled={pipelineSaving}
                              className="atlas-button-secondary w-full disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              {pipelineSaving ? "Desfazendo com segurança..." : "Desfazer movimentação"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setPipelineResult(null); setPipelineReviewed(false); setPipelineError(""); }}
                              className="atlas-button-secondary w-full"
                            >
                              Preparar nova movimentação
                            </button>
                          )}
                          <Link href="/pipeline" onClick={() => setOpen(false)} className="inline-flex text-xs font-semibold text-sky-200">Abrir no Pipeline →</Link>
                        </div>
                      ) : pipelineContext ? (
                        <div className="mt-4 space-y-3">
                          <p className="text-xs leading-5 text-slate-400">
                            {pipelineContext.leadName} está em <strong className="text-slate-200">{pipelineStageLabel(pipelineContext.currentStage)}</strong>. Revise o destino antes de alterar o Kanban real.
                          </p>
                          <label className="block text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                            Nova etapa
                            <select
                              value={pipelineTarget}
                              onChange={(event) => { setPipelineTarget(event.target.value as PipelineStageKey); setPipelineReviewed(false); setPipelineError(""); }}
                              className="mt-2 w-full rounded-xl border border-white/[0.08] bg-slate-950/70 px-3 py-2.5 text-xs font-normal normal-case tracking-normal text-white outline-none transition focus:border-sky-300/40"
                            >
                              {governedPipelineStages.map((stage) => (
                                <option key={stage.key} value={stage.key} disabled={stage.key === pipelineContext.currentStage}>
                                  {stage.label}{stage.key === pipelineContext.currentStage ? " · atual" : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs leading-5 text-slate-300">
                            <input
                              type="checkbox"
                              checked={pipelineReviewed}
                              onChange={(event) => { setPipelineReviewed(event.target.checked); setPipelineError(""); }}
                              className="mt-1 h-4 w-4 accent-sky-400"
                            />
                            <span>Revisei a etapa atual e o destino. Confirmo esta alteração no pipeline da lead.</span>
                          </label>
                          <button
                            type="button"
                            onClick={moveConfirmedPipeline}
                            disabled={!pipelineReviewed || pipelineSaving || pipelineTarget === pipelineContext.currentStage}
                            className="atlas-button-primary w-full disabled:cursor-not-allowed disabled:opacity-55"
                            data-human-confirmation="confirmed"
                            data-governed-confirmation="pipeline"
                          >
                            {pipelineSaving ? "Movimentando e auditando..." : "Confirmar movimentação"}
                          </button>
                        </div>
                      ) : !pipelineError ? (
                        <p className="mt-4 text-xs leading-5 text-slate-400" role="status">Confirmando a etapa atual desta lead...</p>
                      ) : null}
                      {pipelineError ? <p role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs leading-5 text-rose-100">{pipelineError}</p> : null}
                    </section>
                  ) : null}
                  {returnHref ? (
                    <Link
                      href={returnHref}
                      onClick={() => setOpen(false)}
                      className="atlas-button-secondary mt-4 w-full"
                    >
                      Voltar para {contextLabel}
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {copilotLoading ? (
                <div className="mt-4 grid grid-cols-2 gap-2" aria-live="polite">
                  <button type="button" onClick={cancelCopilot} className="atlas-button-secondary w-full">Cancelar consulta</button>
                  <button type="button" disabled className="atlas-button-primary w-full cursor-wait opacity-70">Consultando...</button>
                </div>
              ) : (
                <button type="button" onClick={askCopilot} disabled={!prompt.trim()} className="atlas-button-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-60">Perguntar</button>
              )}
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Insights ativos</h3>
                <Link href="/intelligence" onClick={() => setOpen(false)} className="text-xs font-semibold text-sky-300">Ver todos →</Link>
              </div>
              <div className="mt-3 space-y-3">
                {loading ? [1, 2, 3].map((item) => <div key={item} className="atlas-skeleton h-24 rounded-2xl" />) : insights.length ? insights.map((insight) => (
                  <article key={insight.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{insight.title}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-400">{insight.recommendation || "Revisar contexto e executar a próxima ação sugerida."}</p>
                      </div>
                      <span className="atlas-badge atlas-badge-violet">{confidenceLabel(insight.confidence)}</span>
                    </div>
                  </article>
                )) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">Ainda não existem insights ativos. Eles surgirão conforme o Atlas analisar sua operação.</div>}
              </div>
            </section>

            <section className="mt-6" data-commercial-outcome-summary="local-explainable">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-300">Fase 68 · resultados observados</p>
                  <h3 className="mt-1 text-sm font-semibold text-white">O que a execução produziu</h3>
                </div>
                <span className="atlas-badge atlas-badge-violet">Local · sem custo IA</span>
              </div>
              <div className="mt-3 rounded-2xl border border-white/[0.06] bg-slate-950/30 p-3" data-commercial-outcome-period-control="supervised">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-500">Fase 74 · período supervisionado</p>
                    <p className="mt-1 text-[11px] text-slate-300">Escolha a extensão da leitura factual</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-black/20 p-1" role="group" aria-label="Período da memória comercial" aria-busy={commercialOutcomePeriodLoading || commercialOutcomeFilterLoading}>
                    {commercialOutcomePeriodOptions.map((periodDays) => (
                      <button
                        key={periodDays}
                        type="button"
                        onClick={() => void selectCommercialOutcomePeriod(periodDays)}
                        disabled={commercialOutcomePeriodLoading || commercialOutcomeFilterLoading}
                        aria-pressed={commercialOutcomePeriodDays === periodDays}
                        className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:cursor-wait disabled:opacity-60 ${commercialOutcomePeriodDays === periodDays ? "bg-violet-400/15 text-violet-100" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"}`}
                      >
                        {periodDays} dias
                      </button>
                    ))}
                  </div>
                </div>
                {commercialOutcomePeriodLoading ? <p role="status" className="mt-2 text-[10px] text-violet-200">Atualizando somente a leitura histórica...</p> : null}
                {commercialOutcomePeriodError ? <p role="status" className="mt-2 text-[10px] leading-4 text-amber-200">{commercialOutcomePeriodError}</p> : null}
                {commercialOutcomeSummary?.periodControl?.historyMayBeTruncated ? (
                  <p role="status" className="mt-2 text-[10px] leading-4 text-amber-200">
                    Esta janela atingiu o limite de {commercialOutcomeSummary.periodControl.historyLimit.toLocaleString("pt-BR")} eventos. A leitura pode ser parcial e não deve ser usada como taxa de desempenho.
                  </p>
                ) : null}
                <p className="mt-2 text-[9px] leading-4 text-slate-600">
                  A escolha altera somente a consulta: período atual e anterior continuam com a mesma duração, sem chamada de modelo, escrita ou ação automática.
                </p>
              </div>
              <div className="mt-3 rounded-2xl border border-cyan-300/10 bg-cyan-400/[.025] p-3" data-commercial-outcome-filter-control="supervised">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[.16em] text-cyan-300">Fase 75 · resultado observado</p>
                  <p className="mt-1 text-[11px] text-slate-300">Isole uma resposta humana confirmada sem alterar a operação</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Resultado observado da memória comercial" aria-busy={commercialOutcomeFilterLoading || commercialOutcomePeriodLoading}>
                  {commercialOutcomeFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void selectCommercialOutcomeFilter(option.value)}
                      disabled={commercialOutcomeFilterLoading || commercialOutcomePeriodLoading}
                      aria-pressed={commercialOutcomeFilter === option.value}
                      className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-wait disabled:opacity-60 ${commercialOutcomeFilter === option.value ? "border-cyan-300/20 bg-cyan-400/10 text-cyan-100" : "border-white/[0.06] bg-black/15 text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {commercialOutcomeFilterLoading ? <p role="status" className="mt-2 text-[10px] text-cyan-200">Aplicando somente o recorte factual...</p> : null}
                {commercialOutcomeFilterError ? <p role="status" className="mt-2 text-[10px] leading-4 text-amber-200">{commercialOutcomeFilterError}</p> : null}
                {commercialOutcomeSummary?.filterControl ? (
                  <p className="mt-2 text-[10px] leading-4 text-slate-400">
                    {commercialOutcomeSummary.filterControl.filtered
                      ? `${commercialOutcomeSummary.filterControl.matchingObservedTasks} de ${commercialOutcomeSummary.filterControl.totalObservedTasks} resultado(s) correspondem ao filtro neste período.`
                      : `${commercialOutcomeSummary.filterControl.totalObservedTasks} resultado(s) humano(s) confirmado(s) neste período.`}
                  </p>
                ) : null}
                <p className="mt-2 text-[9px] leading-4 text-slate-600">
                  O filtro afeta resumo, comparação e contexto. Cobertura e lacunas continuam globais para não tratar outro resultado como informação ausente.
                </p>
              </div>
              {loading ? (
                <div className="atlas-skeleton mt-3 h-40 rounded-2xl" />
              ) : commercialOutcomeSummary?.available ? (
                commercialOutcomeSummary.observedTasks > 0 ? (
                  <div className="mt-3 rounded-2xl border border-violet-300/10 bg-violet-400/[.035] p-4">
                    <div className="grid grid-cols-2 gap-2" aria-label="Resumo dos resultados confirmados">
                      <div className="rounded-xl border border-white/[0.06] bg-slate-950/45 px-3 py-2">
                        <strong className="block text-base text-white">{commercialOutcomeSummary.observedTasks}</strong>
                        <span className="text-[9px] uppercase tracking-[.12em] text-slate-500">Resultados</span>
                      </div>
                      <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[.04] px-3 py-2">
                        <strong className="block text-base text-emerald-200">{commercialOutcomeSummary.advancesObserved}</strong>
                        <span className="text-[9px] uppercase tracking-[.12em] text-slate-500">Avanços comprovados</span>
                      </div>
                      <div className="rounded-xl border border-amber-400/10 bg-amber-400/[.04] px-3 py-2">
                        <strong className="block text-base text-amber-200">{commercialOutcomeSummary.noResponseObserved}</strong>
                        <span className="text-[9px] uppercase tracking-[.12em] text-slate-500">Sem resposta</span>
                      </div>
                      <div className="rounded-xl border border-sky-400/10 bg-sky-400/[.04] px-3 py-2">
                        <strong className="block text-base text-sky-200">{commercialOutcomeSummary.coveragePercent}%</strong>
                        <span className="text-[9px] uppercase tracking-[.12em] text-slate-500">Cobertura registrada</span>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-300">{commercialOutcomeSummary.primaryFinding}</p>
                    <div className="mt-3 space-y-2">
                      {commercialOutcomeSummary.categories
                        .filter((category) => category.count > 0)
                        .sort((left, right) => right.count - left.count)
                        .slice(0, 4)
                        .map((category) => (
                          <div key={category.key} className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                            <span>{category.label}</span>
                            <span className="font-semibold text-slate-200">{category.count} · {category.sharePercent}%</span>
                          </div>
                        ))}
                    </div>
                    <p className="mt-3 border-t border-white/[0.05] pt-3 text-[10px] leading-4 text-slate-600">
                      Últimos {commercialOutcomeSummary.periodDays} dias no seu escopo · somente fatos confirmados · sem previsão ou alteração automática.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-violet-300/15 bg-violet-400/[.025] p-5">
                    <p className="text-sm font-medium text-violet-100">
                      {commercialOutcomeSummary.filterControl?.filtered
                        ? "Nenhum resultado corresponde a este filtro no período."
                        : "A amostra começa com o primeiro resultado confirmado."}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {commercialOutcomeSummary.filterControl?.filtered
                        ? "Escolha Todos ou outro resultado para ampliar o recorte. A memória global permanece preservada."
                        : "Conclua uma tarefa vinculada à lead e registre o que realmente aconteceu. O Atlas resumirá os fatos sem inferir conversão."}
                    </p>
                  </div>
                )
              ) : (
                <p role="status" className="mt-3 rounded-2xl border border-amber-400/15 bg-amber-400/[.05] px-4 py-3 text-xs leading-5 text-amber-100">
                  O resumo histórico está sendo atualizado. A fila operacional continua disponível normalmente.
                </p>
              )}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.freshness ? (
                <section
                  className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3"
                  data-commercial-outcome-freshness={commercialOutcomeSummary.freshness.status}
                  aria-label="Recência da memória comercial observada"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Fase 78 · recência factual</p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">{commercialOutcomeSummary.freshness.primaryFinding}</p>
                    </div>
                    <span className={`atlas-badge shrink-0 ${commercialOutcomeSummary.freshness.status === "current" ? "atlas-badge-success" : commercialOutcomeSummary.freshness.status === "empty" ? "atlas-badge-info" : "atlas-badge-warning"}`}>
                      {commercialOutcomeSummary.freshness.status === "current"
                        ? "Atual"
                        : commercialOutcomeSummary.freshness.status === "attention"
                          ? "Atualizar"
                          : commercialOutcomeSummary.freshness.status === "stale"
                            ? "Desatualizada"
                            : "Sem fatos"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] leading-4 text-slate-600">
                    {commercialOutcomeSummary.freshness.latestObservedAt ? (
                      <span>
                        Último fato: <time dateTime={commercialOutcomeSummary.freshness.latestObservedAt}>{commercialOutcomeEvidenceDateFormatter.format(new Date(commercialOutcomeSummary.freshness.latestObservedAt))}</time>
                      </span>
                    ) : null}
                    <span>{commercialOutcomeSummary.freshness.observedTasks} resultado(s) no recorte</span>
                    <span>Atual até {commercialOutcomeSummary.freshness.thresholds.currentMaxHours / 24} dias · desatualizada após {commercialOutcomeSummary.freshness.thresholds.staleAfterHours / 24} dias</span>
                  </div>
                  <p className="mt-2 text-[9px] leading-4 text-slate-600">
                    Mede somente a idade do último resultado humano confirmado; não avalia qualidade, intenção, conversão ou chance de venda.
                  </p>
                </section>
              ) : null}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.contextFreshness ? (
                <details
                  className="group mt-3 rounded-2xl border border-cyan-300/10 bg-cyan-400/[.02] open:bg-cyan-400/[.035]"
                  data-commercial-context-freshness="human-confirmed"
                >
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 [&::-webkit-details-marker]:hidden"
                    aria-label="Conferir recência factual por projeto e origem"
                  >
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Fase 79 · recência por contexto</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-300">{commercialOutcomeSummary.contextFreshness.primaryFinding}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="atlas-badge atlas-badge-info">{commercialOutcomeSummary.contextFreshness.observedTasks} fatos</span>
                      <span aria-hidden="true" className="text-sm text-slate-500 transition group-open:rotate-180">⌄</span>
                    </span>
                  </summary>
                  <div className="border-t border-white/[0.05] px-4 pb-4 pt-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(["projects", "sources"] as const).map((dimensionKey) => {
                        const dimension = commercialOutcomeSummary.contextFreshness?.[dimensionKey];
                        if (!dimension) return null;
                        const label = dimensionKey === "projects" ? "Projetos" : "Origens";
                        return (
                          <section key={dimensionKey} aria-label={`Recência por ${label.toLocaleLowerCase("pt-BR")}`} className="rounded-xl border border-white/[0.06] bg-slate-950/35 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-300">{label}</h4>
                              <span className="text-[9px] text-slate-600">{dimension.classifiedTasks} classificados</span>
                            </div>
                            {dimension.segments.length > 0 ? (
                              <div className="mt-2 space-y-2">
                                {dimension.segments.map((segment) => (
                                  <div key={segment.key} className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="min-w-0 truncate text-[11px] font-medium text-slate-200" title={segment.label}>{segment.label}</span>
                                      <span className={`atlas-badge shrink-0 ${segment.status === "current" ? "atlas-badge-success" : "atlas-badge-warning"}`}>
                                        {segment.status === "current" ? "Atual" : segment.status === "attention" ? "Atualizar" : "Desatualizada"}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-[9px] leading-4 text-slate-600">
                                      {segment.observedTasks} resultado(s) · último em <time dateTime={segment.latestObservedAt}>{commercialOutcomeEvidenceDateFormatter.format(new Date(segment.latestObservedAt))}</time> · há {segment.ageHours < 24 ? `${segment.ageHours}h` : `${segment.ageDays}d`}
                                    </p>
                                    <details
                                      className="group/evidence mt-2 rounded-lg border border-white/[0.05] bg-slate-950/30 open:bg-white/[0.02]"
                                      data-commercial-context-evidence={segment.key}
                                    >
                                      <summary
                                        className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[9px] font-medium text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 [&::-webkit-details-marker]:hidden"
                                        aria-label={`Conferir fatos humanos de ${segment.label}`}
                                      >
                                        <span>Conferir fatos</span>
                                        <span className="flex items-center gap-2">
                                          <span>{segment.evidence.length}/{segment.observedTasks}</span>
                                          <span aria-hidden="true" className="text-slate-600 transition group-open/evidence:rotate-180">⌄</span>
                                        </span>
                                      </summary>
                                      <div className="border-t border-white/[0.05] px-2.5 pb-2.5 pt-2">
                                        <ul className="space-y-1.5" aria-label={`Fatos que sustentam a recência de ${segment.label}`}>
                                          {segment.evidence.map((evidence) => (
                                            <li key={evidence.eventId} className="flex items-start justify-between gap-2 text-[9px] leading-4">
                                              <span>
                                                <span className="block text-slate-300">{evidence.outcomeLabel}</span>
                                                <span className={evidence.contextBasis === "historical_outcome_snapshot" ? "text-emerald-300/70" : "text-amber-200/65"}>
                                                  {evidence.contextBasis === "historical_outcome_snapshot" ? "Contexto preservado" : "Fallback legado"}
                                                  {evidence.contextCapturedAt ? <>{" · "}<time dateTime={evidence.contextCapturedAt}>{commercialOutcomeEvidenceDateFormatter.format(new Date(evidence.contextCapturedAt))}</time></> : null}
                                                </span>
                                              </span>
                                              <time className="shrink-0 text-slate-600" dateTime={evidence.observedAt}>{commercialOutcomeEvidenceDateFormatter.format(new Date(evidence.observedAt))}</time>
                                            </li>
                                          ))}
                                        </ul>
                                        {segment.remainingEvidence > 0 ? (
                                          <p className="mt-2 text-[9px] leading-4 text-slate-600">Mais {segment.remainingEvidence} fato(s) permanecem preservados no recorte.</p>
                                        ) : null}
                                        <p className="mt-2 text-[9px] leading-4 text-slate-600">Somente resultado e horário; sem nome, contato ou mensagem.</p>
                                      </div>
                                    </details>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-[10px] leading-4 text-slate-600">Nenhum contexto classificado neste recorte.</p>
                            )}
                            {dimension.remainingSegments > 0 ? (
                              <p className="mt-2 text-[9px] leading-4 text-slate-600">Mais {dimension.remainingSegments} contexto(s), com {dimension.remainingObservedTasks} resultado(s), permanecem no resumo completo.</p>
                            ) : null}
                            {dimension.unclassifiedTasks > 0 ? (
                              <p className="mt-2 text-[9px] leading-4 text-amber-200/65">{dimension.unclassifiedTasks} resultado(s) ainda sem {dimensionKey === "projects" ? "projeto" : "origem"} no contexto disponível.</p>
                            ) : null}
                          </section>
                        );
                      })}
                    </div>
                    <div
                      className="mt-3 rounded-xl border border-sky-300/10 bg-sky-400/[.025] p-3"
                      data-commercial-context-provenance={commercialOutcomeSummary.contextFreshness.provenance.contextTimeBasis}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[.14em] text-sky-300">Fase 82 · contexto supervisionado</p>
                      <dl className="mt-2 grid gap-2 text-[9px] leading-4 sm:grid-cols-2">
                        <div>
                          <dt className="font-semibold text-slate-300">Horário do resultado</dt>
                          <dd className="text-slate-600">Momento em que o resultado humano foi confirmado.</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-300">Projeto e origem</dt>
                          <dd className="text-slate-600">
                            O resultado usa o contexto preservado quando existe; registros antigos usam o cadastro consultado em <time dateTime={commercialOutcomeSummary.contextFreshness.provenance.contextResolvedAt}>{commercialOutcomeEvidenceDateFormatter.format(new Date(commercialOutcomeSummary.contextFreshness.provenance.contextResolvedAt))}</time>.
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] leading-4">
                        <span className="rounded-lg border border-emerald-300/10 bg-emerald-400/[.025] px-2 py-1.5 text-emerald-200/75">
                          {commercialOutcomeSummary.contextFreshness.provenance.historicalSnapshotTasks} preservado(s) no resultado
                        </span>
                        <span className="rounded-lg border border-amber-300/10 bg-amber-400/[.025] px-2 py-1.5 text-amber-200/75">
                          {commercialOutcomeSummary.contextFreshness.provenance.currentSnapshotFallbackTasks} fallback(s) legado(s)
                        </span>
                      </div>
                      {commercialOutcomeSummary.contextFreshness.provenance.currentSnapshotFallbackTasks > 0 ? (
                        <p className="mt-2 text-[9px] leading-4 text-amber-200/65">
                          Registros antigos não são reconstruídos: a lead pode ter mudado de projeto ou origem depois do resultado.
                        </p>
                      ) : commercialOutcomeSummary.contextFreshness.provenance.historicalSnapshotTasks > 0 ? (
                        <p className="mt-2 text-[9px] leading-4 text-emerald-200/65">Todo o recorte exibido possui contexto preservado na confirmação humana.</p>
                      ) : null}
                    </div>
                    <p className="mt-3 text-[9px] leading-4 text-slate-600">
                      Fase 80 · evidências sob demanda. Ordem alfabética, sem ranking. A idade considera o último resultado humano confirmado no contexto disponível e não mede qualidade, desempenho, conversão ou chance de venda.
                    </p>
                  </div>
                </details>
              ) : null}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.contextCoverage ? (
                <section
                  className="mt-3 rounded-2xl border border-sky-300/10 bg-sky-400/[.025] p-4"
                  data-commercial-context-coverage="dimension-period-observed-denominator"
                  aria-label="Cobertura contextual por dimensão e período"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">Fase 84 · cobertura contextual</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">Quanto da memória está realmente contextualizada</h4>
                    </div>
                    <span className="atlas-badge atlas-badge-info shrink-0">
                      {commercialOutcomeSummary.contextCoverage.current.historicalSnapshotCoveragePercent}% histórico
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">{commercialOutcomeSummary.contextCoverage.primaryFinding}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Cobertura nas janelas equivalentes">
                    {([[
                      "Período atual",
                      commercialOutcomeSummary.contextCoverage.current,
                    ], [
                      "Período anterior",
                      commercialOutcomeSummary.contextCoverage.previous,
                    ]] as const).map(([windowLabel, window]) => (
                      <section key={windowLabel} className="rounded-xl border border-white/[0.06] bg-slate-950/35 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-300">{windowLabel}</h5>
                          <span className="text-[9px] text-slate-600">{window.observedTasks} resultado(s)</span>
                        </div>
                        <p className="mt-2 text-[9px] leading-4 text-slate-500">
                          {window.historicalSnapshotTasks} com snapshot histórico · {window.currentLeadFallbackTasks} com fallback legado
                        </p>
                        <div className="mt-3 space-y-3">
                          {([[
                            "Projeto",
                            window.projects,
                          ], [
                            "Origem",
                            window.sources,
                          ]] as const).map(([dimensionLabel, dimension]) => (
                            <div key={dimensionLabel}>
                              <div className="flex items-center justify-between gap-2 text-[10px]">
                                <strong className="text-slate-300">{dimensionLabel}</strong>
                                <span className="text-slate-500">{dimension.classifiedTasks}/{dimension.observedTasks} disponível</span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]" aria-hidden="true">
                                <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-400" style={{ width: `${dimension.classifiedCoveragePercent}%` }} />
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[9px] leading-4">
                                <span className="text-cyan-200/75">Disponível {dimension.classifiedCoveragePercent}%</span>
                                <span className="text-emerald-200/75">Preservado no fato {dimension.historicalClassifiedCoveragePercent}%</span>
                                {dimension.unclassifiedTasks > 0 ? <span className="text-amber-200/70">Sem contexto {dimension.unclassifiedTasks}</span> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-white/[0.05] pt-3 text-[9px] leading-4 text-slate-600">
                    Denominador: resultados humanos confirmados e únicos por tarefa em cada janela de {commercialOutcomeSummary.contextCoverage.periodDays} dias. Valor histórico nulo permanece sem contexto; fallback legado é identificado e não vira backfill. Percentuais descrevem cobertura, não qualidade, desempenho, causa ou previsão.
                  </p>
                </section>
              ) : null}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.contextGapQueue ? (
                <section
                  className="mt-3 rounded-2xl border border-amber-300/10 bg-amber-400/[.025] p-4"
                  data-commercial-context-gap-queue="missing-dimensions-oldest-human-review"
                  aria-label="Fila auditável de lacunas contextuais"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-300">Fase 85 · revisão contextual</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">O que precisa de contexto humano</h4>
                    </div>
                    <span className={`atlas-badge shrink-0 ${commercialOutcomeSummary.contextGapQueue.outcomesWithContextGaps > 0 ? "atlas-badge-warning" : "atlas-badge-success"}`}>
                      {commercialOutcomeSummary.contextGapQueue.outcomesWithContextGaps > 0
                        ? `${commercialOutcomeSummary.contextGapQueue.outcomesWithContextGaps} para revisar`
                        : "Contexto completo"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">{commercialOutcomeSummary.contextGapQueue.primaryFinding}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center" aria-label="Lacunas por dimensão">
                    {([[
                      "Projeto",
                      commercialOutcomeSummary.contextGapQueue.missingProjectTasks,
                    ], [
                      "Origem",
                      commercialOutcomeSummary.contextGapQueue.missingSourceTasks,
                    ], [
                      "Ambos",
                      commercialOutcomeSummary.contextGapQueue.missingBothTasks,
                    ]] as const).map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-white/[0.06] bg-slate-950/35 px-2 py-2">
                        <dt className="text-[9px] uppercase tracking-[.1em] text-slate-500">{label}</dt>
                        <dd className="mt-1 text-sm font-semibold text-white">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {commercialOutcomeSummary.contextGapQueue.queue.length > 0 ? (
                    <div className="mt-3 space-y-2" aria-label="Resultados aguardando revisão contextual">
                      {commercialOutcomeSummary.contextGapQueue.queue.map((gap) => (
                        <article key={gap.eventId} className="rounded-xl border border-white/[0.06] bg-slate-950/40 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <strong className="block truncate text-[11px] text-slate-200">{gap.taskTitle}</strong>
                              <span className="mt-0.5 block truncate text-[9px] text-slate-500">{gap.leadName} · observado há {gap.ageDays} dia(s)</span>
                            </div>
                            <span className={`atlas-badge shrink-0 ${gap.historicalEvidenceImmutable ? "atlas-badge-info" : "atlas-badge-warning"}`}>
                              {gap.historicalEvidenceImmutable ? "Fato imutável" : "Cadastro atual"}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {gap.missingDimensions.map((dimension) => (
                              <span key={dimension} className="rounded-full border border-amber-300/10 bg-amber-400/[.04] px-2 py-1 text-[9px] text-amber-200/75">
                                {dimension === "project" ? "Projeto ausente" : "Origem ausente"}
                              </span>
                            ))}
                          </div>
                          <Link href={gap.href} className="mt-2 inline-flex text-[10px] font-semibold text-cyan-300 hover:text-cyan-200">
                            {gap.correctionMode === "update_current_lead" ? "Atualizar lead" : "Preparar próximos registros"} →
                          </Link>
                        </article>
                      ))}
                      {commercialOutcomeSummary.contextGapQueue.remainingGaps > 0 ? (
                        <p className="px-1 text-[9px] leading-4 text-slate-600">Mais {commercialOutcomeSummary.contextGapQueue.remainingGaps} lacuna(s) permanecem no recorte completo.</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl border border-emerald-300/10 bg-emerald-400/[.025] px-3 py-2 text-[10px] leading-4 text-emerald-200/75">
                      Nenhuma correção contextual manual é necessária neste período.
                    </p>
                  )}
                  <p className="mt-3 border-t border-white/[0.05] pt-3 text-[9px] leading-4 text-slate-600">
                    Ordem: mais dimensões ausentes e depois fato observado mais antigo. Editar a lead melhora somente os próximos registros; evidência histórica nunca é reescrita. A fila não infere impacto comercial, score, ranking ou previsão e não executa ações automaticamente.
                  </p>
                </section>
              ) : null}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.sampleSufficiency ? (
                <div
                  className="mt-3 rounded-2xl border border-cyan-300/10 bg-cyan-400/[.025] p-4"
                  data-commercial-outcome-sample-sufficiency={commercialOutcomeSummary.sampleSufficiency.status}
                  role="status"
                  aria-label="Suficiência factual da amostra comercial"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Fase 76 · suficiência factual</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">A leitura tem base descritiva suficiente?</h4>
                    </div>
                    <span className={`atlas-badge ${commercialOutcomeSummary.sampleSufficiency.status === "descriptive" ? "atlas-badge-success" : commercialOutcomeSummary.sampleSufficiency.status === "empty" ? "atlas-badge-info" : "atlas-badge-warning"}`}>
                      {commercialOutcomeSummary.sampleSufficiency.status === "descriptive" ? "Base disponível" : commercialOutcomeSummary.sampleSufficiency.status === "empty" ? "Sem amostra" : "Amostra inicial"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2" aria-label="Resultados confirmados por janela">
                    {([
                      ["Período atual", commercialOutcomeSummary.sampleSufficiency.currentObservedTasks, commercialOutcomeSummary.sampleSufficiency.currentMissing],
                      ["Período anterior", commercialOutcomeSummary.sampleSufficiency.previousObservedTasks, commercialOutcomeSummary.sampleSufficiency.previousMissing],
                    ] as const).map(([label, observed, missing]) => (
                      <div key={label} className="rounded-xl border border-white/[0.06] bg-slate-950/40 px-3 py-2">
                        <strong className="block text-sm text-white">{observed} <span className="text-[10px] font-normal text-slate-500">/ {commercialOutcomeSummary.sampleSufficiency?.minimumPerWindow}</span></strong>
                        <span className="text-[9px] uppercase tracking-[.1em] text-slate-500">{label}</span>
                        <span className={`mt-1 block text-[9px] ${missing === 0 ? "text-emerald-300/80" : "text-amber-200/80"}`}>
                          {missing === 0 ? "mínimo operacional atingido" : `faltam ${missing} resultado(s)`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">{commercialOutcomeSummary.sampleSufficiency.primaryFinding}</p>
                  <p className="mt-2 text-[9px] leading-4 text-slate-600">
                    Critério transparente: {commercialOutcomeSummary.sampleSufficiency.minimumPerWindow} resultados humanos confirmados em cada janela. Serve apenas para comparação descritiva; não representa significância estatística, causalidade ou previsão.
                  </p>
                </div>
              ) : null}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.evidence ? (
                <details
                  className="group mt-3 rounded-2xl border border-violet-300/10 bg-violet-400/[.025] open:bg-violet-400/[.04]"
                  data-commercial-outcome-evidence="human-confirmed"
                >
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 [&::-webkit-details-marker]:hidden"
                    aria-label="Conferir evidências humanas da memória comercial"
                  >
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-[.18em] text-violet-300">Fase 77 · evidências auditáveis</span>
                      <span className="mt-1 block text-sm font-semibold text-white">Conferir os fatos que formam este recorte</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="atlas-badge atlas-badge-info">{commercialOutcomeSummary.evidence.currentTotal + commercialOutcomeSummary.evidence.previousTotal} fatos</span>
                      <span aria-hidden="true" className="text-sm text-slate-500 transition group-open:rotate-180">⌄</span>
                    </span>
                  </summary>
                  <div className="border-t border-white/[0.05] px-4 pb-4 pt-3">
                    <p className="text-[10px] leading-4 text-slate-500">
                      Último resultado humano por tarefa, dentro do período e do seu acesso. Sem telefone, e-mail, previsão ou alteração automática.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {([
                        {
                          key: "current",
                          label: "Período atual",
                          total: commercialOutcomeSummary.evidence.currentTotal,
                          remaining: commercialOutcomeSummary.evidence.currentRemaining,
                          items: commercialOutcomeSummary.evidence.current,
                        },
                        {
                          key: "previous",
                          label: "Período anterior",
                          total: commercialOutcomeSummary.evidence.previousTotal,
                          remaining: commercialOutcomeSummary.evidence.previousRemaining,
                          items: commercialOutcomeSummary.evidence.previous,
                        },
                      ] as const).map((window) => (
                        <section key={window.key} className="rounded-xl border border-white/[0.06] bg-slate-950/45 p-3" aria-label={`${window.label}: ${window.total} resultados confirmados`}>
                          <div className="flex items-center justify-between gap-2">
                            <h5 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{window.label}</h5>
                            <span className="text-[10px] font-semibold text-violet-200">{window.total}</span>
                          </div>
                          {window.items.length > 0 ? (
                            <ul className="mt-2 space-y-2">
                              {window.items.map((item) => (
                                <li key={item.eventId} className="rounded-lg border border-white/[0.05] bg-white/[0.025] px-3 py-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <strong className="block truncate text-[11px] text-white">{item.outcomeLabel}</strong>
                                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">{item.leadName} · {item.taskTitle}</span>
                                    </div>
                                    <time dateTime={item.observedAt} className="shrink-0 text-[9px] text-slate-600">
                                      {commercialOutcomeEvidenceDateFormatter.format(new Date(item.observedAt))}
                                    </time>
                                  </div>
                                  <div className="mt-2 flex items-center justify-between gap-2">
                                    <span className="min-w-0">
                                      <span className="block truncate text-[9px] text-slate-600">
                                        {[item.projectName, item.sourceName].filter(Boolean).join(" · ") || "Contexto não informado"}
                                      </span>
                                      <span className={`mt-0.5 block text-[8px] ${item.contextBasis === "historical_outcome_snapshot" ? "text-emerald-300/65" : "text-amber-200/60"}`}>
                                        {item.contextBasis === "historical_outcome_snapshot" ? "Contexto preservado" : "Fallback legado"}
                                        {item.contextCapturedAt ? <> · <time dateTime={item.contextCapturedAt}>{commercialOutcomeEvidenceDateFormatter.format(new Date(item.contextCapturedAt))}</time></> : null}
                                      </span>
                                    </span>
                                    <Link href={`/leads/${encodeURIComponent(item.leadId)}#commercial-context`} className="shrink-0 text-[9px] font-semibold text-violet-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60">
                                      Abrir lead
                                    </Link>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 rounded-lg border border-dashed border-white/[0.06] px-3 py-3 text-[10px] leading-4 text-slate-600">Nenhum fato confirmado nesta janela.</p>
                          )}
                          {window.remaining > 0 ? (
                            <p className="mt-2 text-[9px] leading-4 text-slate-600">Mais {window.remaining} fato(s) permanecem na contagem deste recorte.</p>
                          ) : null}
                        </section>
                      ))}
                    </div>
                    <p className="mt-3 text-[9px] leading-4 text-slate-600">
                      Evidência somente leitura · escopo hierárquico preservado · contexto histórico preferido; registros antigos usam fallback atual sem reconstrução.
                    </p>
                  </div>
                </details>
              ) : null}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.comparison ? (
                <div className="mt-3 rounded-2xl border border-sky-300/10 bg-sky-400/[.03] p-4" data-commercial-outcome-comparison="descriptive">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">Fase 69 · comparação temporal</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">{commercialOutcomeSummary.comparison.periodDays} dias atuais × {commercialOutcomeSummary.comparison.periodDays} anteriores</h4>
                    </div>
                    <span className={`atlas-badge ${commercialOutcomeSummary.comparison.sampleStatus === "descriptive" ? "atlas-badge-info" : "atlas-badge-warning"}`}>
                      {commercialOutcomeSummary.comparison.sampleStatus === "descriptive" ? "Leitura descritiva" : "Amostra inicial"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">{commercialOutcomeSummary.comparison.primaryFinding}</p>
                  <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.06]" role="table" aria-label="Comparação dos resultados comerciais confirmados">
                    <div className="grid grid-cols-[1fr_3rem_3rem_3.5rem] gap-2 bg-white/[0.035] px-3 py-2 text-[9px] font-bold uppercase tracking-[.1em] text-slate-500" role="row">
                      <span role="columnheader">Métrica</span><span role="columnheader">Atual</span><span role="columnheader">Antes</span><span role="columnheader">Dif.</span>
                    </div>
                    {([
                      ["Resultados", commercialOutcomeSummary.comparison.metrics.observedTasks],
                      ["Avanços", commercialOutcomeSummary.comparison.metrics.advancesObserved],
                      ["Sem resposta", commercialOutcomeSummary.comparison.metrics.noResponseObserved],
                      ["Cobertura", commercialOutcomeSummary.comparison.metrics.coveragePercent],
                    ] as const).map(([label, metric]) => (
                      <div key={label} className="grid grid-cols-[1fr_3rem_3rem_3.5rem] gap-2 border-t border-white/[0.05] px-3 py-2 text-[11px] text-slate-400" role="row">
                        <span className="text-slate-300" role="cell">{label}</span>
                        <span role="cell">{metric.current}{metric.unit === "percentage-points" ? "%" : ""}</span>
                        <span role="cell">{metric.previous}{metric.unit === "percentage-points" ? "%" : ""}</span>
                        <span className="font-semibold text-sky-200" role="cell">{metric.delta > 0 ? "+" : ""}{metric.delta}{metric.unit === "percentage-points" ? " p.p." : ""}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] leading-4 text-slate-600">
                    Leitura descritiva e local · sem atribuir causa · sem previsão · nenhuma ação automática.
                  </p>
                </div>
              ) : null}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.quality ? (
                <div className="mt-3 rounded-2xl border border-amber-300/10 bg-amber-400/[.025] p-4" data-commercial-memory-quality="local-supervised">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-300">Fase 70 · qualidade da memória</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">Conclusões que ainda precisam de resultado</h4>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`atlas-badge ${commercialOutcomeSummary.quality.status === "complete" ? "atlas-badge-success" : commercialOutcomeSummary.quality.status === "attention" ? "atlas-badge-warning" : "atlas-badge-info"}`}>
                        {commercialOutcomeSummary.quality.coveragePercent}% coberto
                      </span>
                      <span className="text-[8px] uppercase tracking-[.1em] text-slate-600">Todos os resultados</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">{commercialOutcomeSummary.quality.primaryFinding}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Qualidade factual da memória comercial">
                    <div className="rounded-xl border border-white/[0.06] bg-slate-950/45 px-3 py-2">
                      <strong className="block text-sm text-white">{commercialOutcomeSummary.quality.eligibleCompletedTasks}</strong>
                      <span className="text-[9px] uppercase tracking-[.1em] text-slate-500">Concluídas</span>
                    </div>
                    <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[.04] px-3 py-2">
                      <strong className="block text-sm text-emerald-200">{commercialOutcomeSummary.quality.observedTasks}</strong>
                      <span className="text-[9px] uppercase tracking-[.1em] text-slate-500">Com resultado</span>
                    </div>
                    <div className="rounded-xl border border-amber-400/10 bg-amber-400/[.04] px-3 py-2">
                      <strong className="block text-sm text-amber-200">{commercialOutcomeSummary.quality.missingOutcomeTasks}</strong>
                      <span className="text-[9px] uppercase tracking-[.1em] text-slate-500">A revisar</span>
                    </div>
                  </div>
                  {commercialOutcomeSummary.quality.gapQueue.length > 0 ? (
                    <div className="mt-3 space-y-2" aria-label="Fila de resultados comerciais não registrados">
                      {commercialOutcomeSummary.quality.gapQueue.map((gap) => (
                        <article key={gap.taskId} className="rounded-xl border border-white/[0.06] bg-slate-950/35 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <strong className="block truncate text-xs text-slate-100">{gap.taskTitle}</strong>
                              <p className="mt-1 truncate text-[10px] text-slate-500">{gap.leadName} · {gap.ageDays === 0 ? "concluída hoje" : gap.ageDays === 1 ? "há 1 dia" : `há ${gap.ageDays} dias`}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-bold uppercase tracking-[.1em] ${gap.urgency === "stale" ? "bg-rose-400/10 text-rose-200" : gap.urgency === "attention" ? "bg-amber-400/10 text-amber-200" : "bg-sky-400/10 text-sky-200"}`}>
                              {gap.urgency === "stale" ? "Antiga" : gap.urgency === "attention" ? "Atenção" : "Recente"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => prepareCommercialMemoryGap(gap)}
                            className="mt-3 text-[10px] font-semibold text-amber-200 transition hover:text-amber-100"
                          >
                            Registrar resultado observado →
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl border border-emerald-300/10 bg-emerald-400/[.04] px-3 py-2 text-[11px] leading-5 text-emerald-100/80">
                      Nenhuma lacuna elegível na fila curta deste período.
                    </p>
                  )}
                  <p className="mt-3 border-t border-white/[0.05] pt-3 text-[10px] leading-4 text-slate-600">
                    Somente tarefas concluídas com confirmação humana e vínculo com lead · correção manual · sem modelo generativo, previsão ou escrita automática.
                  </p>
                </div>
              ) : null}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.context ? (
                <div className="mt-3 rounded-2xl border border-cyan-300/10 bg-cyan-400/[.025] p-4" data-commercial-outcome-context="historical-preferred-with-legacy-fallback">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Fase 71 · contexto comercial</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">Resultados por projeto e origem</h4>
                    </div>
                    <span className="atlas-badge atlas-badge-info">Histórico preferido</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">{commercialOutcomeSummary.context.primaryFinding}</p>
                  <p className="mt-2 text-[10px] leading-4 text-cyan-100/65" data-commercial-outcome-detail="factual-aggregate">
                    Fase 72 · abra um projeto ou origem para ver os resultados humanos que compõem a contagem.
                  </p>
                  {commercialOutcomeSummary.context.observedTasks > 0 ? (
                    <div className="mt-3 space-y-3" aria-label="Contexto histórico preferido dos resultados comerciais confirmados">
                      {([[
                        "Projetos",
                        commercialOutcomeSummary.context.projects,
                      ], [
                        "Origens",
                        commercialOutcomeSummary.context.sources,
                      ]] as const).map(([label, dimension]) => (
                        <section key={label} className="rounded-xl border border-white/[0.06] bg-slate-950/35 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <h5 className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{label}</h5>
                            <span className="text-[9px] text-slate-600">{dimension.classifiedTasks}/{commercialOutcomeSummary.context?.observedTasks} classificados</span>
                          </div>
                          {dimension.segments.length ? (
                            <ol className="mt-2 space-y-2">
                              {dimension.segments.map((segment) => (
                                <li key={segment.key} className="rounded-lg border border-white/[0.04] bg-white/[0.015] px-2.5 py-2 text-[11px]">
                                  <details>
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-slate-300 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/50">
                                      <span className="min-w-0 truncate">{segment.label}</span>
                                      <span className="shrink-0 font-semibold text-cyan-100">{segment.observedTasks} · {segment.sharePercent}%</span>
                                    </summary>
                                    <dl className="mt-2 space-y-1 border-t border-white/[0.05] pt-2" aria-label={`Resultados confirmados em ${segment.label}`}>
                                      {segment.outcomes.map((outcome) => (
                                        <div key={outcome.key} className="flex items-center justify-between gap-3 text-[10px]">
                                          <dt className="min-w-0 truncate text-slate-500">{outcome.label}</dt>
                                          <dd className="shrink-0 text-slate-300">{outcome.count} · {outcome.sharePercent}% do contexto</dd>
                                        </div>
                                      ))}
                                    </dl>
                                  </details>
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="mt-2 text-[10px] leading-4 text-slate-600">Contexto ainda não informado nas leads observadas.</p>
                          )}
                          {dimension.unclassifiedTasks > 0 ? (
                            <p className="mt-2 text-[9px] text-slate-600">{dimension.unclassifiedTasks} resultado(s) sem {label === "Projetos" ? "projeto" : "origem"} no contexto disponível.</p>
                          ) : null}
                          {dimension.remainingSegments > 0 ? (
                            <p className="mt-2 text-[9px] text-slate-600">Mais {dimension.remainingSegments} contexto(s), somando {dimension.remainingObservedTasks} resultado(s).</p>
                          ) : null}
                        </section>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl border border-dashed border-cyan-300/10 px-3 py-3 text-[11px] leading-5 text-slate-500">
                      O contexto aparecerá após o primeiro resultado humano confirmado.
                    </p>
                  )}
                  <p className="mt-3 border-t border-white/[0.05] pt-3 text-[10px] leading-4 text-slate-600">
                    Fase 83 · todas as leituras usam o contexto preservado quando comprovado; legado usa o cadastro atual sem backfill · leitura local e descritiva · não atribui causa, não prevê conversão e não altera a operação.
                  </p>
                </div>
              ) : null}
              {!loading && commercialOutcomeSummary?.available && commercialOutcomeSummary.contextComparison ? (
                <div className="mt-3 rounded-2xl border border-indigo-300/10 bg-indigo-400/[.025] p-4" data-commercial-context-comparison="raw-counts-only">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-indigo-300">Fase 73 · comparação contextual</p>
                      <h4 className="mt-1 text-sm font-semibold text-white">Projeto e origem em janelas equivalentes</h4>
                    </div>
                    <span className={`atlas-badge ${commercialOutcomeSummary.contextComparison.sampleStatus === "descriptive" ? "atlas-badge-info" : "atlas-badge-warning"}`}>
                      {commercialOutcomeSummary.contextComparison.sampleStatus === "descriptive" ? "Contagem descritiva" : commercialOutcomeSummary.contextComparison.sampleStatus === "empty" ? "Sem amostra" : "Amostra inicial"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-300">{commercialOutcomeSummary.contextComparison.primaryFinding}</p>
                  <div className="mt-3 space-y-3" aria-label="Comparação factual dos contextos comerciais">
                    {([[
                      "Projetos",
                      commercialOutcomeSummary.contextComparison.projects,
                    ], [
                      "Origens",
                      commercialOutcomeSummary.contextComparison.sources,
                    ]] as const).map(([label, dimension]) => (
                      <section key={label} className="overflow-hidden rounded-xl border border-white/[0.06] bg-slate-950/35">
                        <div className="grid grid-cols-[1fr_3rem_3rem_3.5rem] gap-2 bg-white/[0.025] px-3 py-2 text-[9px] font-bold uppercase tracking-[.1em] text-slate-500" role="row">
                          <span role="columnheader">{label}</span>
                          <span role="columnheader">Atual</span>
                          <span role="columnheader">Antes</span>
                          <span role="columnheader">Dif.</span>
                        </div>
                        {dimension.segments.length ? dimension.segments.map((segment) => (
                          <div key={segment.key} className="grid grid-cols-[1fr_3rem_3rem_3.5rem] gap-2 border-t border-white/[0.05] px-3 py-2 text-[11px] text-slate-400" role="row">
                            <span className="truncate text-slate-300" role="cell">{segment.label}</span>
                            <span role="cell">{segment.currentObservedTasks}</span>
                            <span role="cell">{segment.previousObservedTasks}</span>
                            <span className="font-semibold text-indigo-200" role="cell">{segment.delta > 0 ? "+" : ""}{segment.delta}</span>
                          </div>
                        )) : (
                          <p className="border-t border-white/[0.05] px-3 py-3 text-[10px] leading-4 text-slate-600">Nenhum contexto classificado nas duas janelas.</p>
                        )}
                        {(dimension.currentUnclassifiedTasks > 0 || dimension.previousUnclassifiedTasks > 0) ? (
                          <p className="border-t border-white/[0.05] px-3 py-2 text-[9px] text-slate-600">
                            Sem {label === "Projetos" ? "projeto" : "origem"}: atual {dimension.currentUnclassifiedTasks} · anterior {dimension.previousUnclassifiedTasks}.
                          </p>
                        ) : null}
                        {dimension.remainingSegments > 0 ? (
                          <p className="border-t border-white/[0.05] px-3 py-2 text-[9px] text-slate-600">
                            Mais {dimension.remainingSegments} contexto(s): atual {dimension.remainingCurrentObservedTasks} · anterior {dimension.remainingPreviousObservedTasks}.
                          </p>
                        ) : null}
                      </section>
                    ))}
                  </div>
                  <p className="mt-3 border-t border-white/[0.05] pt-3 text-[10px] leading-4 text-slate-600">
                    {commercialOutcomeSummary.contextComparison.periodDays} dias atuais × {commercialOutcomeSummary.contextComparison.periodDays} anteriores · diferenças de contagem, não taxas · contexto histórico preferido com fallback legado explícito · sem ranking, causa, previsão ou ação automática.
                  </p>
                </div>
              ) : null}
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">Fase 64 · prioridade explicável</p>
                  <h3 className="mt-1 text-sm font-semibold text-white">Fila curta de hoje</h3>
                </div>
                <span className="text-xs text-slate-500">{dailyQueueSummary?.shown ?? dailyQueue.length} de {dailyQueueSummary?.totalCandidates ?? dailyQueue.length}</span>
              </div>
              {dailyQueueSummary ? (
                <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Resumo da fila diária">
                  <div className="rounded-xl border border-rose-400/10 bg-rose-400/[.04] px-3 py-2"><strong className="block text-sm text-rose-200">{dailyQueueSummary.overdue}</strong><span className="text-[9px] uppercase tracking-[.12em] text-slate-500">Atrasadas</span></div>
                  <div className="rounded-xl border border-amber-400/10 bg-amber-400/[.04] px-3 py-2"><strong className="block text-sm text-amber-200">{dailyQueueSummary.dueToday}</strong><span className="text-[9px] uppercase tracking-[.12em] text-slate-500">Hoje</span></div>
                  <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[.04] px-3 py-2"><strong className="block text-sm text-emerald-200">{dailyQueueSummary.opportunities}</strong><span className="text-[9px] uppercase tracking-[.12em] text-slate-500">Oportunidades</span></div>
                </div>
              ) : null}
              {dailyQueueError ? <p role="status" className="mt-3 rounded-2xl border border-amber-400/15 bg-amber-400/[.06] px-4 py-3 text-xs leading-5 text-amber-100">{dailyQueueError}</p> : null}
              <div className="mt-3 space-y-3">
                {loading ? [1, 2, 3].map((item) => <div key={item} className="atlas-skeleton h-36 rounded-2xl" />) : dailyQueue.length ? dailyQueue.map((item) => (
                  <article key={item.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4" data-daily-queue-kind={item.kind}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.severity === "critical" ? "bg-rose-400" : item.severity === "attention" ? "bg-amber-400" : "bg-emerald-400"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">{item.title}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-400">{item.evidence}</p>
                        <p className="mt-2 text-xs leading-5 text-sky-100">{item.recommendedAction}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => prepareDailyQueueItem(item)} className="atlas-button-primary px-3 py-2 text-xs">Preparar com IA</button>
                      <Link href={item.href} onClick={() => setOpen(false)} className="atlas-button-secondary px-3 py-2 text-xs">Abrir registro</Link>
                    </div>
                  </article>
                )) : (
                  <div className="rounded-2xl border border-dashed border-emerald-400/15 bg-emerald-400/[.03] p-5">
                    <p className="text-sm font-medium text-emerald-100">Nenhuma prioridade crítica na fila curta.</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">O Atlas continuará monitorando prazos, próximas ações e oportunidades observadas.</p>
                    <Link href="/tasks" onClick={() => setOpen(false)} className="mt-3 inline-flex text-xs font-semibold text-emerald-200">Abrir todas as tarefas →</Link>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      ) : null}
    </>
  );
}
