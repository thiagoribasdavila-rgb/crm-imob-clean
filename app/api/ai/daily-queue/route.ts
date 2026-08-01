import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  buildCopilotDailyQueue,
  type DailyQueueLeadInput,
  type DailyQueueTaskInput,
} from "@/lib/atlas/copilot-daily-queue";
import {
  buildCommercialOutcomeContextCoverage,
  buildCommercialOutcomeContextGapQueue,
  buildCommercialOutcomeContextComparison,
  buildCommercialOutcomeContextFreshness,
  buildCommercialOutcomeContextBreakdown,
  buildCommercialOutcomeComparison,
  buildCommercialOutcomeEvidence,
  buildCommercialOutcomeFreshness,
  buildCommercialOutcomeMemoryQuality,
  buildCommercialOutcomeSampleSufficiency,
  buildCommercialOutcomeSummary,
  commercialOutcomeDefinitions,
  type CommercialOutcomeCode,
  type CommercialOutcomeContextBasis,
  type CommercialOutcomeMemoryInput,
} from "@/lib/atlas/commercial-outcome-summary";
import {
  LIVE_LEAD_SELECT,
  mapLegacyLead,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import { buildCommercialOutcomeContextPreview } from "@/lib/atlas/commercial-outcome-context-preview";

export const dynamic = "force-dynamic";

const text = (value: unknown) => typeof value === "string" ? value : "";
const nullableText = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const OUTCOME_PERIOD_OPTIONS = [7, 30, 90] as const;
const DEFAULT_OUTCOME_PERIOD_DAYS = 30;
const OUTCOME_HISTORY_LIMIT = 8_000;

type OutcomePeriodDays = (typeof OUTCOME_PERIOD_OPTIONS)[number];
type OutcomeFilter = "all" | CommercialOutcomeCode;
type CommercialContextSnapshot = {
  capturedAt: string;
  projectName: string | null;
  sourceName: string | null;
};

function contextLabel(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 160) || null : null;
}

function commercialContextSnapshotFrom(metadata: Record<string, unknown>): CommercialContextSnapshot | null {
  const candidate = metadata.commercialContextSnapshot;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const snapshot = candidate as Record<string, unknown>;
  const capturedAt = nullableText(snapshot.capturedAt);
  if (
    snapshot.schemaVersion !== 1
    || snapshot.basis !== "lead_at_human_confirmation"
    || !capturedAt
    || !Number.isFinite(new Date(capturedAt).getTime())
  ) return null;
  return {
    capturedAt: new Date(capturedAt).toISOString(),
    projectName: contextLabel(snapshot.projectName),
    sourceName: contextLabel(snapshot.sourceName),
  };
}

const OUTCOME_FILTER_OPTIONS: ReadonlyArray<{ value: OutcomeFilter; label: string }> = [
  { value: "all", label: "Todos os resultados" },
  ...commercialOutcomeDefinitions.map(({ key, label }) => ({ value: key, label })),
];
const OUTCOME_FILTER_VALUES = new Set<OutcomeFilter>(OUTCOME_FILTER_OPTIONS.map((option) => option.value));

function parseOutcomePeriodDays(value: string | null): OutcomePeriodDays | null {
  if (value === null) return DEFAULT_OUTCOME_PERIOD_DAYS;
  const parsed = Number(value);
  return OUTCOME_PERIOD_OPTIONS.find((option) => option === parsed) ?? null;
}

function parseOutcomeFilter(value: string | null): OutcomeFilter | null {
  if (value === null) return "all";
  return OUTCOME_FILTER_VALUES.has(value as OutcomeFilter) ? value as OutcomeFilter : null;
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, scope: "copilot-daily-queue" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;
  const outcomePeriodDays = parseOutcomePeriodDays(request.nextUrl.searchParams.get("outcomePeriodDays"));
  if (!outcomePeriodDays) {
    return apiError(
      "COPILOT_OUTCOME_PERIOD_INVALID",
      "Escolha um período disponível para consultar a memória comercial.",
      identity.meta,
      { status: 400, headers: rate.headers },
    );
  }
  const outcomeFilter = parseOutcomeFilter(request.nextUrl.searchParams.get("outcomeFilter"));
  if (!outcomeFilter) {
    return apiError(
      "COPILOT_OUTCOME_FILTER_INVALID",
      "Escolha um resultado observado disponível para filtrar a memória comercial.",
      identity.meta,
      { status: 400, headers: rate.headers },
    );
  }
  const outcomeGeneratedAt = new Date();
  const outcomeLookbackDays = outcomePeriodDays * 2;
  // A janela anterior termina 1 ms antes da atual; leia também essa fronteira exata.
  const outcomeHistoryStart = new Date(outcomeGeneratedAt.getTime() - outcomeLookbackDays * 86_400_000 - 1).toISOString();

  const [tasksResult, leadsResult, outcomeEventsResult] = await Promise.all([
    identity.supabase
      .from("tasks")
      .select("id,title,status,user_id,lead_id,priority,due_date,created_at,organization_id")
      .eq("organization_id", organizationId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(2_000),
    identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT)
      .eq("organization_id", organizationId)
      .order("score_ia", { ascending: false, nullsFirst: false })
      .limit(2_000),
    identity.supabase
      .from("lead_events")
      .select("id,lead_id,event_type,description,metadata,created_at")
      .eq("organization_id", organizationId)
      .in("event_type", ["copilot_task_completed", "copilot_task_outcome_recorded"])
      .gte("created_at", outcomeHistoryStart)
      .order("created_at", { ascending: false })
      .limit(OUTCOME_HISTORY_LIMIT),
  ]);

  if (tasksResult.error || leadsResult.error) {
    return apiError(
      "COPILOT_DAILY_QUEUE_UNAVAILABLE",
      "A fila diária está sendo atualizada. Tente novamente em instantes.",
      identity.meta,
      { status: 503, headers: rate.headers },
    );
  }

  const leads = ((leadsResult.data ?? []) as unknown as CompatRow[]).map(mapLegacyLead);
  const leadContexts = new Map(leads.map((lead) => [text(lead.id), {
    name: text(lead.name) || "Lead sem nome",
    projectName: nullableText(lead.project),
    sourceName: nullableText(lead.source),
  }]));
  const currentLeadContextResolvedAt = new Date();
  const tasks: DailyQueueTaskInput[] = ((tasksResult.data ?? []) as unknown as CompatRow[]).map((task) => {
    const leadId = nullableText(task.lead_id);
    return {
      id: text(task.id),
      title: text(task.title) || "Tarefa comercial",
      priority: text(task.priority) || "media",
      status: text(task.status) || "pendente",
      // A data de criação nunca vira prazo: ausência de due_date permanece explícita.
      dueAt: nullableText(task.due_date),
      leadId,
      leadName: leadId ? leadContexts.get(leadId)?.name ?? null : null,
    };
  }).filter((task) => Boolean(task.id));

  const leadInputs: DailyQueueLeadInput[] = leads.map((lead) => ({
    id: text(lead.id),
    name: text(lead.name) || "Lead sem nome",
    status: text(lead.status) || "novo",
    score: Number(lead.score ?? 0),
    temperature: nullableText(lead.temperature),
    nextActionAt: nullableText(lead.next_action_at),
    nextActionLabel: nullableText(lead.next_action_label),
  })).filter((lead) => Boolean(lead.id));
  const taskDetailsById = new Map(tasks.map((task) => [task.id, task]));

  const queue = buildCopilotDailyQueue(tasks, leadInputs, new Date(), 5);
  const queueItems = queue.items.map((item) => {
    const leadContext = item.leadId ? leadContexts.get(item.leadId) : null;
    return {
      ...item,
      outcomeContextPreview: buildCommercialOutcomeContextPreview({
        projectName: leadContext?.projectName,
        sourceName: leadContext?.sourceName,
      }),
    };
  });
  const outcomeInputs: CommercialOutcomeMemoryInput[] = ((outcomeEventsResult.data ?? []) as unknown as CompatRow[]).map((event) => {
    const metadata = event.metadata && typeof event.metadata === "object"
      ? event.metadata as Record<string, unknown>
      : {};
    const leadId = nullableText(event.lead_id);
    const leadContext = leadId ? leadContexts.get(leadId) : null;
    const historicalContext = commercialContextSnapshotFrom(metadata);
    const contextBasis: CommercialOutcomeContextBasis = historicalContext
      ? "historical_outcome_snapshot"
      : "current_lead_snapshot";
    // Resultados novos preservam projeto e origem no evento confirmado. Os
    // eventos antigos continuam legíveis pelo snapshot atual, identificado
    // explicitamente como fallback e nunca reconstruído como histórico.
    return {
      id: text(event.id),
      eventType: text(event.event_type),
      createdAt: nullableText(event.created_at),
      leadId,
      leadName: leadContext?.name ?? null,
      projectName: leadContext?.projectName ?? null,
      sourceName: leadContext?.sourceName ?? null,
      historicalProjectName: historicalContext?.projectName ?? null,
      historicalSourceName: historicalContext?.sourceName ?? null,
      contextBasis,
      contextCapturedAt: historicalContext?.capturedAt ?? currentLeadContextResolvedAt.toISOString(),
      taskId: nullableText(metadata.taskId),
      taskTitle: nullableText(metadata.taskId)
        ? taskDetailsById.get(text(metadata.taskId))?.title ?? nullableText(event.description)
        : nullableText(event.description),
      taskDueAt: nullableText(metadata.taskId)
        ? taskDetailsById.get(text(metadata.taskId))?.dueAt ?? nullableText(metadata.dueAt)
        : nullableText(metadata.dueAt),
      outcome: nullableText(metadata.outcome),
      humanConfirmed: metadata.humanConfirmed === true,
    };
  }).filter((event) => Boolean(event.id));
  // O filtro recorta somente os painéis descritivos. Conclusões permanecem na
  // amostra para preservar a cobertura geral; a fila de lacunas usa todos os
  // resultados e nunca confunde uma categoria diferente com dado ausente.
  const filteredOutcomeInputs = outcomeFilter === "all"
    ? outcomeInputs
    : outcomeInputs.filter((event) => (
      event.eventType === "copilot_task_completed"
      || (event.eventType === "copilot_task_outcome_recorded" && event.outcome === outcomeFilter)
    ));
  const allCommercialOutcomeSummary = buildCommercialOutcomeSummary(outcomeInputs, outcomeGeneratedAt, outcomePeriodDays);
  const filteredCommercialOutcomeSummary = buildCommercialOutcomeSummary(filteredOutcomeInputs, outcomeGeneratedAt, outcomePeriodDays);
  const commercialOutcomeSummary = outcomeFilter === "all"
    ? allCommercialOutcomeSummary
    : {
      ...filteredCommercialOutcomeSummary,
      completedTasks: allCommercialOutcomeSummary.completedTasks,
      coveragePercent: allCommercialOutcomeSummary.coveragePercent,
    };
  const allCommercialOutcomeComparison = buildCommercialOutcomeComparison(outcomeInputs, outcomeGeneratedAt, outcomePeriodDays);
  const filteredCommercialOutcomeComparison = buildCommercialOutcomeComparison(filteredOutcomeInputs, outcomeGeneratedAt, outcomePeriodDays);
  const commercialOutcomeComparison = outcomeFilter === "all"
    ? allCommercialOutcomeComparison
    : {
      ...filteredCommercialOutcomeComparison,
      metrics: {
        ...filteredCommercialOutcomeComparison.metrics,
        coveragePercent: allCommercialOutcomeComparison.metrics.coveragePercent,
      },
    };
  const commercialOutcomeSampleSufficiency = buildCommercialOutcomeSampleSufficiency(commercialOutcomeComparison);
  const commercialOutcomeEvidence = buildCommercialOutcomeEvidence(filteredOutcomeInputs, outcomeGeneratedAt, outcomePeriodDays, 3);
  const commercialOutcomeFreshness = buildCommercialOutcomeFreshness(filteredOutcomeInputs, outcomeGeneratedAt, outcomePeriodDays);
  const commercialOutcomeContextFreshness = buildCommercialOutcomeContextFreshness(filteredOutcomeInputs, outcomeGeneratedAt, outcomePeriodDays, 4, 2, currentLeadContextResolvedAt);
  const commercialOutcomeMemoryQuality = buildCommercialOutcomeMemoryQuality(outcomeInputs, outcomeGeneratedAt, outcomePeriodDays, 5);
  const commercialOutcomeContext = buildCommercialOutcomeContextBreakdown(filteredOutcomeInputs, outcomeGeneratedAt, outcomePeriodDays, 4);
  const commercialOutcomeContextComparison = buildCommercialOutcomeContextComparison(filteredOutcomeInputs, outcomeGeneratedAt, outcomePeriodDays, 4);
  const commercialOutcomeContextCoverage = buildCommercialOutcomeContextCoverage(filteredOutcomeInputs, outcomeGeneratedAt, outcomePeriodDays);
  const commercialOutcomeContextGapQueue = buildCommercialOutcomeContextGapQueue(outcomeInputs, outcomeGeneratedAt, outcomePeriodDays, 5);
  return apiSuccess({
    scope: {
      organizationId,
      actorId: identity.access.profile.id,
      role: identity.access.profile.commercialRole || identity.access.profile.role,
      hierarchicalRls: true,
      operationalBaseOnly: true,
    },
    ...queue,
    items: queueItems,
    commercialOutcomeSummary: {
      ...commercialOutcomeSummary,
      comparison: commercialOutcomeComparison,
      sampleSufficiency: commercialOutcomeSampleSufficiency,
      evidence: commercialOutcomeEvidence,
      freshness: commercialOutcomeFreshness,
      contextFreshness: commercialOutcomeContextFreshness,
      quality: commercialOutcomeMemoryQuality,
      context: commercialOutcomeContext,
      contextComparison: commercialOutcomeContextComparison,
      contextCoverage: commercialOutcomeContextCoverage,
      contextGapQueue: commercialOutcomeContextGapQueue,
      available: !outcomeEventsResult.error,
      source: "lead_events",
      periodControl: {
        selectedDays: outcomePeriodDays,
        options: [...OUTCOME_PERIOD_OPTIONS],
        currentWindowDays: outcomePeriodDays,
        previousWindowDays: outcomePeriodDays,
        totalLookbackDays: outcomeLookbackDays,
        supervised: true,
        readOnly: true,
        historyLimit: OUTCOME_HISTORY_LIMIT,
        historyMayBeTruncated: !outcomeEventsResult.error && (outcomeEventsResult.data?.length ?? 0) >= OUTCOME_HISTORY_LIMIT,
      },
      filterControl: {
        selected: outcomeFilter,
        options: OUTCOME_FILTER_OPTIONS,
        filtered: outcomeFilter !== "all",
        matchingObservedTasks: commercialOutcomeSummary.observedTasks,
        totalObservedTasks: allCommercialOutcomeSummary.observedTasks,
        appliedTo: ["summary", "comparison", "evidence", "freshness", "contextFreshness", "context", "contextComparison", "contextCoverage"],
        qualityScope: "all-outcomes",
        coverageScope: "all-outcomes",
        contextGapQueueScope: "all-outcomes",
        supervised: true,
        readOnly: true,
      },
    },
    generatedAt: outcomeGeneratedAt.toISOString(),
  }, identity.meta, {
    headers: { ...rate.headers, "Cache-Control": "no-store" },
  });
}
