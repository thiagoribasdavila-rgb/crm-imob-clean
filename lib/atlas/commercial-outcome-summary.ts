export const commercialOutcomeDefinitions = [
  { key: "contacted", label: "Contato realizado", group: "engagement" },
  { key: "no_response", label: "Cliente não respondeu", group: "attention" },
  { key: "meeting_scheduled", label: "Visita ou reunião agendada", group: "advance" },
  { key: "proposal_sent", label: "Proposta enviada", group: "advance" },
  { key: "follow_up_needed", label: "Novo acompanhamento necessário", group: "attention" },
  { key: "not_interested", label: "Sem interesse neste momento", group: "closed" },
  { key: "other", label: "Outro resultado observado", group: "other" },
] as const;

export type CommercialOutcomeCode = (typeof commercialOutcomeDefinitions)[number]["key"];
export type CommercialOutcomeGroup = (typeof commercialOutcomeDefinitions)[number]["group"];
export type CommercialOutcomeContextBasis = "historical_outcome_snapshot" | "current_lead_snapshot";

export type CommercialOutcomeResolvedContext = {
  projectName: string | null;
  sourceName: string | null;
  basis: CommercialOutcomeContextBasis;
  capturedAt: string | null;
};

export type CommercialOutcomeMemoryInput = {
  id: string;
  eventType: string;
  createdAt: string | null;
  leadId: string | null;
  leadName?: string | null;
  projectName?: string | null;
  sourceName?: string | null;
  historicalProjectName?: string | null;
  historicalSourceName?: string | null;
  contextBasis?: CommercialOutcomeContextBasis;
  contextCapturedAt?: string | null;
  taskId: string | null;
  taskTitle?: string | null;
  taskDueAt?: string | null;
  outcome: string | null;
  humanConfirmed: boolean;
};

export type CommercialOutcomeCategory = {
  key: CommercialOutcomeCode;
  label: string;
  group: CommercialOutcomeGroup;
  count: number;
  sharePercent: number;
};

export type CommercialOutcomeSummary = {
  periodDays: number;
  periodStart: string;
  generatedAt: string;
  observedTasks: number;
  completedTasks: number;
  coveragePercent: number;
  uniqueLeads: number;
  advancesObserved: number;
  contactsObserved: number;
  noResponseObserved: number;
  followUpsNeeded: number;
  latestObservedAt: string | null;
  sampleStatus: "empty" | "initial" | "descriptive";
  primaryFinding: string;
  categories: CommercialOutcomeCategory[];
  policy: {
    localOnly: true;
    generativeModelUsed: false;
    predictiveClaim: false;
    humanConfirmedOnly: true;
    latestOutcomePerTask: true;
    downstreamWrites: false;
  };
};

export type CommercialOutcomeMetricComparison = {
  current: number;
  previous: number;
  delta: number;
  direction: "up" | "down" | "stable";
  unit: "count" | "percentage-points";
};

export type CommercialOutcomeComparison = {
  periodDays: number;
  generatedAt: string;
  currentPeriod: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  comparable: boolean;
  sampleStatus: "empty" | "insufficient" | "descriptive";
  primaryFinding: string;
  metrics: {
    observedTasks: CommercialOutcomeMetricComparison;
    advancesObserved: CommercialOutcomeMetricComparison;
    noResponseObserved: CommercialOutcomeMetricComparison;
    followUpsNeeded: CommercialOutcomeMetricComparison;
    coveragePercent: CommercialOutcomeMetricComparison;
  };
  policy: {
    localOnly: true;
    generativeModelUsed: false;
    causalClaim: false;
    predictiveClaim: false;
    humanConfirmedOnly: true;
    absoluteDeltasOnly: true;
    downstreamWrites: false;
  };
};

export const COMMERCIAL_OUTCOME_MINIMUM_PER_WINDOW = 10;

export type CommercialOutcomeSampleSufficiency = {
  status: "empty" | "insufficient" | "descriptive";
  minimumPerWindow: number;
  currentObservedTasks: number;
  previousObservedTasks: number;
  currentMissing: number;
  previousMissing: number;
  comparable: boolean;
  primaryFinding: string;
  policy: {
    localOnly: true;
    humanConfirmedOnly: true;
    descriptiveOnly: true;
    statisticalSignificanceClaim: false;
    causalClaim: false;
    predictiveClaim: false;
    downstreamWrites: false;
  };
};

export type CommercialOutcomeEvidenceItem = {
  eventId: string;
  taskId: string;
  taskTitle: string;
  leadId: string;
  leadName: string;
  observedAt: string;
  outcome: CommercialOutcomeCode;
  outcomeLabel: string;
  projectName: string | null;
  sourceName: string | null;
  contextBasis: CommercialOutcomeContextBasis;
  contextCapturedAt: string | null;
  window: "current" | "previous";
};

export type CommercialOutcomeEvidence = {
  periodDays: number;
  generatedAt: string;
  currentPeriod: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  currentTotal: number;
  previousTotal: number;
  currentRemaining: number;
  previousRemaining: number;
  current: CommercialOutcomeEvidenceItem[];
  previous: CommercialOutcomeEvidenceItem[];
  policy: {
    localOnly: true;
    humanConfirmedOnly: true;
    latestOutcomePerTask: true;
    historicalSnapshotPreferred: true;
    currentLeadFallbackForLegacy: true;
    historicalBackfillInferred: false;
    readOnly: true;
    personalContactDataIncluded: false;
    causalClaim: false;
    predictiveClaim: false;
    downstreamWrites: false;
  };
};

export const COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS = 72;
export const COMMERCIAL_OUTCOME_STALE_AFTER_HOURS = 168;

export type CommercialOutcomeFreshness = {
  periodDays: number;
  generatedAt: string;
  periodStart: string;
  latestObservedAt: string | null;
  ageHours: number | null;
  ageDays: number | null;
  observedTasks: number;
  status: "empty" | "current" | "attention" | "stale";
  primaryFinding: string;
  thresholds: {
    currentMaxHours: typeof COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS;
    staleAfterHours: typeof COMMERCIAL_OUTCOME_STALE_AFTER_HOURS;
  };
  policy: {
    localOnly: true;
    humanConfirmedOnly: true;
    currentWindowOnly: true;
    latestOutcomePerTask: true;
    ageSignalOnly: true;
    qualityClaim: false;
    causalClaim: false;
    predictiveClaim: false;
    downstreamWrites: false;
  };
};

export type CommercialOutcomeContextFreshnessSegment = {
  key: string;
  label: string;
  observedTasks: number;
  latestObservedAt: string;
  ageHours: number;
  ageDays: number;
  status: "current" | "attention" | "stale";
  evidence: CommercialOutcomeContextFreshnessEvidenceItem[];
  remainingEvidence: number;
};

export type CommercialOutcomeContextFreshnessEvidenceItem = {
  eventId: string;
  observedAt: string;
  outcome: CommercialOutcomeCode;
  outcomeLabel: string;
  contextBasis: CommercialOutcomeContextBasis;
  contextCapturedAt: string | null;
};

export type CommercialOutcomeContextFreshnessDimension = {
  classifiedTasks: number;
  unclassifiedTasks: number;
  segments: CommercialOutcomeContextFreshnessSegment[];
  remainingSegments: number;
  remainingObservedTasks: number;
  statusCounts: {
    current: number;
    attention: number;
    stale: number;
  };
};

export type CommercialOutcomeContextProvenance = {
  outcomeTimeBasis: "human_confirmed_event_time";
  contextTimeBasis: "historical_outcome_snapshot" | "current_lead_snapshot" | "mixed";
  contextResolvedAt: string;
  historicalContextConfirmed: boolean;
  historicalSnapshotTasks: number;
  currentSnapshotFallbackTasks: number;
};

export type CommercialOutcomeContextFreshness = {
  periodDays: number;
  periodStart: string;
  generatedAt: string;
  observedTasks: number;
  primaryFinding: string;
  provenance: CommercialOutcomeContextProvenance;
  projects: CommercialOutcomeContextFreshnessDimension;
  sources: CommercialOutcomeContextFreshnessDimension;
  thresholds: {
    currentMaxHours: typeof COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS;
    staleAfterHours: typeof COMMERCIAL_OUTCOME_STALE_AFTER_HOURS;
  };
  policy: {
    localOnly: true;
    humanConfirmedOnly: true;
    currentWindowOnly: true;
    latestOutcomePerTask: true;
    historicalSnapshotPreferred: true;
    currentLeadFallbackForLegacy: true;
    historicalBackfillInferred: false;
    rawObservedAgeOnly: true;
    alphabeticalDisplayOrder: true;
    evidenceReadOnly: true;
    personalIdentityIncluded: false;
    personalContactDataIncluded: false;
    rankingClaim: false;
    qualityClaim: false;
    causalClaim: false;
    predictiveClaim: false;
    downstreamWrites: false;
  };
};

export type CommercialOutcomeMemoryGap = {
  taskId: string;
  taskTitle: string;
  taskDueAt: string | null;
  leadId: string;
  leadName: string;
  completedAt: string;
  ageDays: number;
  urgency: "recent" | "attention" | "stale";
  projectName: string | null;
  sourceName: string | null;
};

export type CommercialOutcomeMemoryQuality = {
  periodDays: number;
  periodStart: string;
  generatedAt: string;
  eligibleCompletedTasks: number;
  observedTasks: number;
  missingOutcomeTasks: number;
  coveragePercent: number;
  oldestGapDays: number | null;
  status: "empty" | "complete" | "attention";
  primaryFinding: string;
  gapQueue: CommercialOutcomeMemoryGap[];
  policy: {
    localOnly: true;
    generativeModelUsed: false;
    humanConfirmedCompletionsOnly: true;
    leadLinkedTasksOnly: true;
    manualResolutionOnly: true;
    predictiveClaim: false;
    downstreamWrites: false;
  };
};

export type CommercialOutcomeContextSegment = {
  key: string;
  label: string;
  observedTasks: number;
  sharePercent: number;
  advancesObserved: number;
  noResponseObserved: number;
  followUpsNeeded: number;
  outcomes: CommercialOutcomeCategory[];
};

export type CommercialOutcomeContextDimension = {
  classifiedTasks: number;
  unclassifiedTasks: number;
  segments: CommercialOutcomeContextSegment[];
  remainingSegments: number;
  remainingObservedTasks: number;
};

export type CommercialOutcomeContextBreakdown = {
  periodDays: number;
  periodStart: string;
  generatedAt: string;
  observedTasks: number;
  sampleStatus: "empty" | "initial" | "descriptive";
  primaryFinding: string;
  projects: CommercialOutcomeContextDimension;
  sources: CommercialOutcomeContextDimension;
  policy: {
    localOnly: true;
    generativeModelUsed: false;
    humanConfirmedOnly: true;
    historicalSnapshotPreferred: true;
    currentLeadFallbackForLegacy: true;
    historicalBackfillInferred: false;
    causalClaim: false;
    predictiveClaim: false;
    downstreamWrites: false;
  };
};

export type CommercialOutcomeContextComparisonSegment = {
  key: string;
  label: string;
  currentObservedTasks: number;
  previousObservedTasks: number;
  delta: number;
  direction: "up" | "down" | "stable";
};

export type CommercialOutcomeContextComparisonDimension = {
  currentClassifiedTasks: number;
  previousClassifiedTasks: number;
  currentUnclassifiedTasks: number;
  previousUnclassifiedTasks: number;
  segments: CommercialOutcomeContextComparisonSegment[];
  remainingSegments: number;
  remainingCurrentObservedTasks: number;
  remainingPreviousObservedTasks: number;
};

export type CommercialOutcomeContextComparison = {
  periodDays: number;
  generatedAt: string;
  currentPeriod: { start: string; end: string };
  previousPeriod: { start: string; end: string };
  comparable: boolean;
  sampleStatus: "empty" | "insufficient" | "descriptive";
  primaryFinding: string;
  projects: CommercialOutcomeContextComparisonDimension;
  sources: CommercialOutcomeContextComparisonDimension;
  policy: {
    localOnly: true;
    generativeModelUsed: false;
    humanConfirmedOnly: true;
    historicalSnapshotPreferred: true;
    currentLeadFallbackForLegacy: true;
    historicalBackfillInferred: false;
    rawCountDeltasOnly: true;
    causalClaim: false;
    predictiveClaim: false;
    rankingClaim: false;
    downstreamWrites: false;
  };
};

export type CommercialOutcomeContextCoverageDimension = {
  observedTasks: number;
  classifiedTasks: number;
  unclassifiedTasks: number;
  classifiedCoveragePercent: number;
  historicalClassifiedTasks: number;
  legacyFallbackClassifiedTasks: number;
  historicalClassifiedCoveragePercent: number;
};

export type CommercialOutcomeContextCoverageWindow = {
  start: string;
  end: string;
  observedTasks: number;
  historicalSnapshotTasks: number;
  currentLeadFallbackTasks: number;
  historicalSnapshotCoveragePercent: number;
  projects: CommercialOutcomeContextCoverageDimension;
  sources: CommercialOutcomeContextCoverageDimension;
};

export type CommercialOutcomeContextCoverage = {
  periodDays: number;
  generatedAt: string;
  primaryFinding: string;
  current: CommercialOutcomeContextCoverageWindow;
  previous: CommercialOutcomeContextCoverageWindow;
  policy: {
    localOnly: true;
    humanConfirmedOnly: true;
    latestOutcomePerTask: true;
    equalWindows: true;
    denominator: "observed_tasks";
    historicalSnapshotPreferred: true;
    currentLeadFallbackForLegacy: true;
    historicalBackfillInferred: false;
    descriptiveCoverageOnly: true;
    qualityClaim: false;
    causalClaim: false;
    predictiveClaim: false;
    downstreamWrites: false;
  };
};

export type CommercialOutcomeContextGapDimension = "project" | "source";

export type CommercialOutcomeContextGapItem = {
  eventId: string;
  taskId: string;
  taskTitle: string;
  leadId: string;
  leadName: string;
  observedAt: string;
  ageDays: number;
  missingDimensions: CommercialOutcomeContextGapDimension[];
  contextBasis: CommercialOutcomeContextBasis;
  contextCapturedAt: string | null;
  historicalEvidenceImmutable: boolean;
  correctionMode: "update_current_lead" | "future_results_only";
  href: string;
};

export type CommercialOutcomeContextGapQueue = {
  periodDays: number;
  periodStart: string;
  generatedAt: string;
  observedTasks: number;
  outcomesWithContextGaps: number;
  missingProjectTasks: number;
  missingSourceTasks: number;
  missingBothTasks: number;
  immutableHistoricalGaps: number;
  currentLeadReviewableGaps: number;
  queue: CommercialOutcomeContextGapItem[];
  remainingGaps: number;
  primaryFinding: string;
  ordering: {
    first: "missing_dimension_count";
    second: "oldest_observed_fact";
    businessImpactInferred: false;
  };
  policy: {
    localOnly: true;
    humanConfirmedOnly: true;
    latestOutcomePerTask: true;
    currentWindowOnly: true;
    historicalSnapshotPreferred: true;
    currentLeadFallbackForLegacy: true;
    historicalBackfillInferred: false;
    manualCorrectionOnly: true;
    historicalEvidenceImmutable: true;
    personalContactDataIncluded: false;
    predictiveClaim: false;
    rankingClaim: false;
    downstreamWrites: false;
  };
};

const validOutcomeCodes = new Set<CommercialOutcomeCode>(
  commercialOutcomeDefinitions.map((definition) => definition.key),
);
const commercialOutcomeDefinitionByCode = new Map<CommercialOutcomeCode, (typeof commercialOutcomeDefinitions)[number]>(
  commercialOutcomeDefinitions.map((definition) => [definition.key, definition]),
);

function timestamp(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function isCommercialOutcomeCode(value: string | null): value is CommercialOutcomeCode {
  return Boolean(value && validOutcomeCodes.has(value as CommercialOutcomeCode));
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100)));
}

function compareMetric(
  current: number,
  previous: number,
  unit: CommercialOutcomeMetricComparison["unit"] = "count",
): CommercialOutcomeMetricComparison {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "stable",
    unit,
  };
}

function hasDescriptiveSample(currentObservedTasks: number, previousObservedTasks: number) {
  return currentObservedTasks >= COMMERCIAL_OUTCOME_MINIMUM_PER_WINDOW
    && previousObservedTasks >= COMMERCIAL_OUTCOME_MINIMUM_PER_WINDOW;
}

export function buildCommercialOutcomeSampleSufficiency(
  comparison: CommercialOutcomeComparison,
): CommercialOutcomeSampleSufficiency {
  const currentObservedTasks = Math.max(0, comparison.metrics.observedTasks.current);
  const previousObservedTasks = Math.max(0, comparison.metrics.observedTasks.previous);
  const currentMissing = Math.max(0, COMMERCIAL_OUTCOME_MINIMUM_PER_WINDOW - currentObservedTasks);
  const previousMissing = Math.max(0, COMMERCIAL_OUTCOME_MINIMUM_PER_WINDOW - previousObservedTasks);
  const totalObservedTasks = currentObservedTasks + previousObservedTasks;
  const status = totalObservedTasks === 0
    ? "empty"
    : currentMissing === 0 && previousMissing === 0
      ? "descriptive"
      : "insufficient";

  let primaryFinding = "Ainda não há resultados humanos confirmados nas duas janelas.";
  if (status === "descriptive") {
    primaryFinding = `Leitura descritiva disponível com ${currentObservedTasks} resultado(s) atuais e ${previousObservedTasks} anteriores.`;
  } else if (status === "insufficient") {
    const missingParts = [
      currentMissing > 0 ? `${currentMissing} no período atual` : null,
      previousMissing > 0 ? `${previousMissing} no período anterior` : null,
    ].filter(Boolean);
    primaryFinding = `Amostra inicial: faltam ${missingParts.join(" e ")} para o mínimo operacional por janela.`;
  }

  return {
    status,
    minimumPerWindow: COMMERCIAL_OUTCOME_MINIMUM_PER_WINDOW,
    currentObservedTasks,
    previousObservedTasks,
    currentMissing,
    previousMissing,
    comparable: currentObservedTasks > 0 && previousObservedTasks > 0,
    primaryFinding,
    policy: {
      localOnly: true,
      humanConfirmedOnly: true,
      descriptiveOnly: true,
      statisticalSignificanceClaim: false,
      causalClaim: false,
      predictiveClaim: false,
      downstreamWrites: false,
    },
  };
}

function normalizedContextLabel(value: string | null | undefined) {
  const label = value?.trim().replace(/\s+/g, " ") || "";
  return label || null;
}

export function resolveCommercialOutcomeContext(
  outcome: CommercialOutcomeMemoryInput,
): CommercialOutcomeResolvedContext {
  const historicalSnapshot = outcome.contextBasis === "historical_outcome_snapshot";
  const capturedAtMs = timestamp(outcome.contextCapturedAt);

  // Um snapshot histórico com valor nulo continua nulo. Usar o cadastro atual
  // nesse caso fabricaria uma associação que não existia na confirmação humana.
  return {
    projectName: normalizedContextLabel(
      historicalSnapshot ? outcome.historicalProjectName : outcome.projectName,
    ),
    sourceName: normalizedContextLabel(
      historicalSnapshot ? outcome.historicalSourceName : outcome.sourceName,
    ),
    basis: historicalSnapshot ? "historical_outcome_snapshot" : "current_lead_snapshot",
    capturedAt: capturedAtMs === null ? null : new Date(capturedAtMs).toISOString(),
  };
}

function latestObservedOutcomes(
  events: CommercialOutcomeMemoryInput[],
  periodStartMs: number,
  periodEndMs: number,
) {
  const latestOutcomeByTask = new Map<string, CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>();
  const orderedOutcomes = events
    .filter((event) => {
      const occurredAt = timestamp(event.createdAt);
      return event.eventType === "copilot_task_outcome_recorded"
        && event.humanConfirmed
        && Boolean(event.taskId)
        && Boolean(event.leadId)
        && isCommercialOutcomeCode(event.outcome)
        && occurredAt !== null
        && occurredAt >= periodStartMs
        && occurredAt <= periodEndMs;
    })
    .map((event) => ({ ...event, outcome: event.outcome as CommercialOutcomeCode }))
    .sort((left, right) => (timestamp(right.createdAt) ?? 0) - (timestamp(left.createdAt) ?? 0));

  for (const outcome of orderedOutcomes) {
    const taskId = outcome.taskId as string;
    if (!latestOutcomeByTask.has(taskId)) latestOutcomeByTask.set(taskId, outcome);
  }

  return [...latestOutcomeByTask.values()];
}

export function buildCommercialOutcomeEvidence(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
  requestedPerWindowLimit = 3,
): CommercialOutcomeEvidence {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const perWindowLimit = Math.min(5, Math.max(1, Math.round(requestedPerWindowLimit)));
  const currentEndMs = now.getTime();
  const currentStartMs = currentEndMs - periodDays * 86_400_000;
  const previousEndMs = currentStartMs - 1;
  const previousStartMs = previousEndMs - periodDays * 86_400_000;
  const currentOutcomes = latestObservedOutcomes(events, currentStartMs, currentEndMs);
  const previousOutcomes = latestObservedOutcomes(events, previousStartMs, previousEndMs);

  const evidenceItem = (
    outcome: CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode },
    window: CommercialOutcomeEvidenceItem["window"],
  ): CommercialOutcomeEvidenceItem => {
    const context = resolveCommercialOutcomeContext(outcome);
    return {
      eventId: outcome.id,
      taskId: outcome.taskId as string,
      taskTitle: outcome.taskTitle?.trim() || "Tarefa comercial",
      leadId: outcome.leadId as string,
      leadName: outcome.leadName?.trim() || "Lead sem nome",
      observedAt: new Date(timestamp(outcome.createdAt) ?? currentEndMs).toISOString(),
      outcome: outcome.outcome,
      outcomeLabel: commercialOutcomeDefinitionByCode.get(outcome.outcome)?.label ?? "Resultado observado",
      projectName: context.projectName,
      sourceName: context.sourceName,
      contextBasis: context.basis,
      contextCapturedAt: context.capturedAt,
      window,
    };
  };

  return {
    periodDays,
    generatedAt: now.toISOString(),
    currentPeriod: { start: new Date(currentStartMs).toISOString(), end: new Date(currentEndMs).toISOString() },
    previousPeriod: { start: new Date(previousStartMs).toISOString(), end: new Date(previousEndMs).toISOString() },
    currentTotal: currentOutcomes.length,
    previousTotal: previousOutcomes.length,
    currentRemaining: Math.max(0, currentOutcomes.length - perWindowLimit),
    previousRemaining: Math.max(0, previousOutcomes.length - perWindowLimit),
    current: currentOutcomes.slice(0, perWindowLimit).map((outcome) => evidenceItem(outcome, "current")),
    previous: previousOutcomes.slice(0, perWindowLimit).map((outcome) => evidenceItem(outcome, "previous")),
    policy: {
      localOnly: true,
      humanConfirmedOnly: true,
      latestOutcomePerTask: true,
      historicalSnapshotPreferred: true,
      currentLeadFallbackForLegacy: true,
      historicalBackfillInferred: false,
      readOnly: true,
      personalContactDataIncluded: false,
      causalClaim: false,
      predictiveClaim: false,
      downstreamWrites: false,
    },
  };
}

export function buildCommercialOutcomeFreshness(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
): CommercialOutcomeFreshness {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const currentEndMs = now.getTime();
  const currentStartMs = currentEndMs - periodDays * 86_400_000;
  const currentOutcomes = latestObservedOutcomes(events, currentStartMs, currentEndMs);
  const latestObservedMs = timestamp(currentOutcomes[0]?.createdAt ?? null);
  const ageHours = latestObservedMs === null
    ? null
    : Math.max(0, Math.floor((currentEndMs - latestObservedMs) / 3_600_000));
  const ageDays = ageHours === null ? null : Math.floor(ageHours / 24);
  const status: CommercialOutcomeFreshness["status"] = ageHours === null
    ? "empty"
    : ageHours <= COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS
      ? "current"
      : ageHours <= COMMERCIAL_OUTCOME_STALE_AFTER_HOURS
        ? "attention"
        : "stale";

  const primaryFinding = status === "empty"
    ? "Nenhum resultado humano confirmado foi observado no recorte atual."
    : status === "current"
      ? `Memória atualizada: último resultado observado há ${ageHours} hora(s).`
      : status === "attention"
        ? `Memória precisa de atualização: último resultado observado há ${ageDays} dia(s).`
        : `Memória desatualizada: último resultado observado há ${ageDays} dia(s).`;

  return {
    periodDays,
    generatedAt: now.toISOString(),
    periodStart: new Date(currentStartMs).toISOString(),
    latestObservedAt: latestObservedMs === null ? null : new Date(latestObservedMs).toISOString(),
    ageHours,
    ageDays,
    observedTasks: currentOutcomes.length,
    status,
    primaryFinding,
    thresholds: {
      currentMaxHours: COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS,
      staleAfterHours: COMMERCIAL_OUTCOME_STALE_AFTER_HOURS,
    },
    policy: {
      localOnly: true,
      humanConfirmedOnly: true,
      currentWindowOnly: true,
      latestOutcomePerTask: true,
      ageSignalOnly: true,
      qualityClaim: false,
      causalClaim: false,
      predictiveClaim: false,
      downstreamWrites: false,
    },
  };
}

function contextFreshnessStatus(ageHours: number): CommercialOutcomeContextFreshnessSegment["status"] {
  if (ageHours <= COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS) return "current";
  if (ageHours <= COMMERCIAL_OUTCOME_STALE_AFTER_HOURS) return "attention";
  return "stale";
}

function buildContextFreshnessDimension(
  outcomes: Array<CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>,
  currentEndMs: number,
  contextOf: (outcome: CommercialOutcomeMemoryInput) => string | null | undefined,
  requestedSegmentLimit: number,
  requestedEvidenceLimit: number,
): CommercialOutcomeContextFreshnessDimension {
  const segmentLimit = Math.min(6, Math.max(1, Math.round(requestedSegmentLimit)));
  const evidenceLimit = Math.min(3, Math.max(1, Math.round(requestedEvidenceLimit)));
  const grouped = new Map<string, {
    label: string;
    observedTasks: number;
    latestObservedMs: number;
    outcomes: Array<CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>;
  }>();
  let unclassifiedTasks = 0;

  for (const outcome of outcomes) {
    const label = normalizedContextLabel(contextOf(outcome));
    if (!label) {
      unclassifiedTasks += 1;
      continue;
    }
    const observedAtMs = timestamp(outcome.createdAt);
    if (observedAtMs === null) continue;
    const key = label.toLocaleLowerCase("pt-BR");
    const current = grouped.get(key) ?? {
      label,
      observedTasks: 0,
      latestObservedMs: observedAtMs,
      outcomes: [],
    };
    current.observedTasks += 1;
    current.latestObservedMs = Math.max(current.latestObservedMs, observedAtMs);
    current.outcomes.push(outcome);
    grouped.set(key, current);
  }

  const allSegments = [...grouped.entries()]
    .map(([key, context]): CommercialOutcomeContextFreshnessSegment => {
      const ageHours = Math.max(0, Math.floor((currentEndMs - context.latestObservedMs) / 3_600_000));
      const orderedEvidence = [...context.outcomes]
        .sort((left, right) => (timestamp(right.createdAt) ?? 0) - (timestamp(left.createdAt) ?? 0));
      return {
        key,
        label: context.label,
        observedTasks: context.observedTasks,
        latestObservedAt: new Date(context.latestObservedMs).toISOString(),
        ageHours,
        ageDays: Math.floor(ageHours / 24),
        status: contextFreshnessStatus(ageHours),
        evidence: orderedEvidence.slice(0, evidenceLimit).map((outcome) => {
          const resolvedContext = resolveCommercialOutcomeContext(outcome);
          return {
            eventId: outcome.id,
            observedAt: new Date(timestamp(outcome.createdAt) ?? currentEndMs).toISOString(),
            outcome: outcome.outcome,
            outcomeLabel: commercialOutcomeDefinitionByCode.get(outcome.outcome)?.label ?? "Resultado observado",
            contextBasis: resolvedContext.basis,
            contextCapturedAt: resolvedContext.capturedAt,
          };
        }),
        remainingEvidence: Math.max(0, orderedEvidence.length - evidenceLimit),
      };
    })
    // Ordem estável para navegação; não representa prioridade ou desempenho.
    .sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
  const hidden = allSegments.slice(segmentLimit);
  const statusCounts = allSegments.reduce(
    (counts, segment) => {
      counts[segment.status] += 1;
      return counts;
    },
    { current: 0, attention: 0, stale: 0 },
  );

  return {
    classifiedTasks: outcomes.length - unclassifiedTasks,
    unclassifiedTasks,
    segments: allSegments.slice(0, segmentLimit),
    remainingSegments: hidden.length,
    remainingObservedTasks: hidden.reduce((total, segment) => total + segment.observedTasks, 0),
    statusCounts,
  };
}

export function buildCommercialOutcomeContextFreshness(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
  requestedSegmentLimit = 4,
  requestedEvidenceLimit = 2,
  contextResolvedAt = now,
): CommercialOutcomeContextFreshness {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const currentEndMs = now.getTime();
  const currentStartMs = currentEndMs - periodDays * 86_400_000;
  const currentOutcomes = latestObservedOutcomes(events, currentStartMs, currentEndMs);
  const historicalSnapshotTasks = currentOutcomes.filter(
    (outcome) => resolveCommercialOutcomeContext(outcome).basis === "historical_outcome_snapshot",
  ).length;
  const currentSnapshotFallbackTasks = currentOutcomes.length - historicalSnapshotTasks;
  const contextTimeBasis: CommercialOutcomeContextProvenance["contextTimeBasis"] = historicalSnapshotTasks > 0
    ? currentSnapshotFallbackTasks > 0 ? "mixed" : "historical_outcome_snapshot"
    : "current_lead_snapshot";
  const projects = buildContextFreshnessDimension(
    currentOutcomes,
    currentEndMs,
    (outcome) => resolveCommercialOutcomeContext(outcome).projectName,
    requestedSegmentLimit,
    requestedEvidenceLimit,
  );
  const sources = buildContextFreshnessDimension(
    currentOutcomes,
    currentEndMs,
    (outcome) => resolveCommercialOutcomeContext(outcome).sourceName,
    requestedSegmentLimit,
    requestedEvidenceLimit,
  );

  const projectNeedsUpdate = projects.statusCounts.attention + projects.statusCounts.stale;
  const sourceNeedsUpdate = sources.statusCounts.attention + sources.statusCounts.stale;
  let primaryFinding = "Ainda não há resultados humanos confirmados para medir a recência por contexto.";
  if (currentOutcomes.length > 0 && projects.classifiedTasks === 0 && sources.classifiedTasks === 0) {
    primaryFinding = `${currentOutcomes.length} resultado(s) existem, mas projeto e origem não estão disponíveis no contexto preservado nem no cadastro atual das leads.`;
  } else if (currentOutcomes.length > 0) {
    primaryFinding = `Projetos: ${projects.statusCounts.current} atual(is) e ${projectNeedsUpdate} a atualizar. Origens: ${sources.statusCounts.current} atual(is) e ${sourceNeedsUpdate} a atualizar.`;
  }

  return {
    periodDays,
    periodStart: new Date(currentStartMs).toISOString(),
    generatedAt: now.toISOString(),
    observedTasks: currentOutcomes.length,
    primaryFinding,
    provenance: {
      outcomeTimeBasis: "human_confirmed_event_time",
      contextTimeBasis,
      contextResolvedAt: contextResolvedAt.toISOString(),
      historicalContextConfirmed: historicalSnapshotTasks > 0 && currentSnapshotFallbackTasks === 0,
      historicalSnapshotTasks,
      currentSnapshotFallbackTasks,
    },
    projects,
    sources,
    thresholds: {
      currentMaxHours: COMMERCIAL_OUTCOME_FRESH_WITHIN_HOURS,
      staleAfterHours: COMMERCIAL_OUTCOME_STALE_AFTER_HOURS,
    },
    policy: {
      localOnly: true,
      humanConfirmedOnly: true,
      currentWindowOnly: true,
      latestOutcomePerTask: true,
      historicalSnapshotPreferred: true,
      currentLeadFallbackForLegacy: true,
      historicalBackfillInferred: false,
      rawObservedAgeOnly: true,
      alphabeticalDisplayOrder: true,
      evidenceReadOnly: true,
      personalIdentityIncluded: false,
      personalContactDataIncluded: false,
      rankingClaim: false,
      qualityClaim: false,
      causalClaim: false,
      predictiveClaim: false,
      downstreamWrites: false,
    },
  };
}

function buildContextComparisonDimension(
  currentOutcomes: Array<CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>,
  previousOutcomes: Array<CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>,
  contextOf: (outcome: CommercialOutcomeMemoryInput) => string | null | undefined,
  requestedSegmentLimit: number,
): CommercialOutcomeContextComparisonDimension {
  const segmentLimit = Math.min(6, Math.max(1, Math.round(requestedSegmentLimit)));
  const countContexts = (outcomes: Array<CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>) => {
    const contexts = new Map<string, { label: string; count: number }>();
    let unclassified = 0;
    for (const outcome of outcomes) {
      const label = normalizedContextLabel(contextOf(outcome));
      if (!label) {
        unclassified += 1;
        continue;
      }
      const key = label.toLocaleLowerCase("pt-BR");
      const current = contexts.get(key) ?? { label, count: 0 };
      current.count += 1;
      contexts.set(key, current);
    }
    return { contexts, unclassified };
  };

  const current = countContexts(currentOutcomes);
  const previous = countContexts(previousOutcomes);
  const keys = new Set([...current.contexts.keys(), ...previous.contexts.keys()]);
  const ordered = [...keys]
    .map((key): CommercialOutcomeContextComparisonSegment => {
      const currentContext = current.contexts.get(key);
      const previousContext = previous.contexts.get(key);
      const currentObservedTasks = currentContext?.count ?? 0;
      const previousObservedTasks = previousContext?.count ?? 0;
      const delta = currentObservedTasks - previousObservedTasks;
      return {
        key,
        label: currentContext?.label ?? previousContext?.label ?? key,
        currentObservedTasks,
        previousObservedTasks,
        delta,
        direction: delta > 0 ? "up" : delta < 0 ? "down" : "stable",
      };
    })
    .sort((left, right) => (
      (right.currentObservedTasks + right.previousObservedTasks) - (left.currentObservedTasks + left.previousObservedTasks)
      || left.label.localeCompare(right.label, "pt-BR")
    ));
  const hidden = ordered.slice(segmentLimit);

  return {
    currentClassifiedTasks: currentOutcomes.length - current.unclassified,
    previousClassifiedTasks: previousOutcomes.length - previous.unclassified,
    currentUnclassifiedTasks: current.unclassified,
    previousUnclassifiedTasks: previous.unclassified,
    segments: ordered.slice(0, segmentLimit),
    remainingSegments: hidden.length,
    remainingCurrentObservedTasks: hidden.reduce((total, segment) => total + segment.currentObservedTasks, 0),
    remainingPreviousObservedTasks: hidden.reduce((total, segment) => total + segment.previousObservedTasks, 0),
  };
}

function buildContextDimension(
  outcomes: Array<CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>,
  contextOf: (outcome: CommercialOutcomeMemoryInput) => string | null | undefined,
  requestedSegmentLimit: number,
): CommercialOutcomeContextDimension {
  const segmentLimit = Math.min(6, Math.max(1, Math.round(requestedSegmentLimit)));
  const grouped = new Map<string, CommercialOutcomeContextSegment>();
  const outcomeCountsByContext = new Map<string, Map<CommercialOutcomeCode, number>>();
  let unclassifiedTasks = 0;

  for (const outcome of outcomes) {
    const label = normalizedContextLabel(contextOf(outcome));
    if (!label) {
      unclassifiedTasks += 1;
      continue;
    }
    const key = label.toLocaleLowerCase("pt-BR");
    const current = grouped.get(key) ?? {
      key,
      label,
      observedTasks: 0,
      sharePercent: 0,
      advancesObserved: 0,
      noResponseObserved: 0,
      followUpsNeeded: 0,
      outcomes: [],
    };
    current.observedTasks += 1;
    if (outcome.outcome === "meeting_scheduled" || outcome.outcome === "proposal_sent") current.advancesObserved += 1;
    if (outcome.outcome === "no_response") current.noResponseObserved += 1;
    if (outcome.outcome === "follow_up_needed") current.followUpsNeeded += 1;
    const outcomeCounts = outcomeCountsByContext.get(key) ?? new Map<CommercialOutcomeCode, number>();
    outcomeCounts.set(outcome.outcome, (outcomeCounts.get(outcome.outcome) ?? 0) + 1);
    outcomeCountsByContext.set(key, outcomeCounts);
    grouped.set(key, current);
  }

  const classifiedTasks = outcomes.length - unclassifiedTasks;
  const ordered = [...grouped.values()]
    .map((segment) => {
      const outcomeCounts = outcomeCountsByContext.get(segment.key) ?? new Map<CommercialOutcomeCode, number>();
      const segmentOutcomes = commercialOutcomeDefinitions
        .map((definition): CommercialOutcomeCategory => ({
          ...definition,
          count: outcomeCounts.get(definition.key) ?? 0,
          sharePercent: percentage(outcomeCounts.get(definition.key) ?? 0, segment.observedTasks),
        }))
        .filter((category) => category.count > 0);
      return {
        ...segment,
        sharePercent: percentage(segment.observedTasks, outcomes.length),
        outcomes: segmentOutcomes,
      };
    })
    .sort((left, right) => right.observedTasks - left.observedTasks || left.label.localeCompare(right.label, "pt-BR"));
  const hidden = ordered.slice(segmentLimit);

  return {
    classifiedTasks,
    unclassifiedTasks,
    segments: ordered.slice(0, segmentLimit),
    remainingSegments: hidden.length,
    remainingObservedTasks: hidden.reduce((total, segment) => total + segment.observedTasks, 0),
  };
}

export function buildCommercialOutcomeSummary(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
): CommercialOutcomeSummary {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const nowMs = now.getTime();
  const periodStartMs = nowMs - periodDays * 86_400_000;
  const inPeriod = events.filter((event) => {
    const occurredAt = timestamp(event.createdAt);
    return occurredAt !== null && occurredAt >= periodStartMs && occurredAt <= nowMs;
  });

  const completedTaskIds = new Set(
    inPeriod
      .filter((event) => event.eventType === "copilot_task_completed" && Boolean(event.taskId))
      .map((event) => event.taskId as string),
  );
  const latestOutcomeByTask = new Map<string, CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>();
  const orderedOutcomes = inPeriod
    .filter((event) => (
      event.eventType === "copilot_task_outcome_recorded"
      && event.humanConfirmed
      && Boolean(event.taskId)
      && Boolean(event.leadId)
      && isCommercialOutcomeCode(event.outcome)
    ))
    .map((event) => ({ ...event, outcome: event.outcome as CommercialOutcomeCode }))
    .sort((left, right) => (timestamp(right.createdAt) ?? 0) - (timestamp(left.createdAt) ?? 0));

  for (const event of orderedOutcomes) {
    const evidenceKey = `task:${event.taskId}`;
    if (!latestOutcomeByTask.has(evidenceKey)) latestOutcomeByTask.set(evidenceKey, event);
  }

  const observedOutcomes = [...latestOutcomeByTask.values()];
  const outcomeCounts = new Map<CommercialOutcomeCode, number>();
  for (const event of observedOutcomes) {
    outcomeCounts.set(event.outcome, (outcomeCounts.get(event.outcome) ?? 0) + 1);
    if (event.taskId) completedTaskIds.add(event.taskId);
  }

  const observedTasks = observedOutcomes.length;
  const completedTasks = completedTaskIds.size;
  const categories = commercialOutcomeDefinitions.map((definition) => {
    const count = outcomeCounts.get(definition.key) ?? 0;
    return {
      ...definition,
      count,
      sharePercent: percentage(count, observedTasks),
    };
  });
  const countFor = (key: CommercialOutcomeCode) => outcomeCounts.get(key) ?? 0;
  const advancesObserved = countFor("meeting_scheduled") + countFor("proposal_sent");
  const contactsObserved = countFor("contacted");
  const noResponseObserved = countFor("no_response");
  const followUpsNeeded = countFor("follow_up_needed");
  const uniqueLeads = new Set(observedOutcomes.map((event) => event.leadId).filter(Boolean)).size;
  const latestObservedAt = observedOutcomes[0]?.createdAt ?? null;
  const sampleStatus = observedTasks === 0 ? "empty" : observedTasks < 10 ? "initial" : "descriptive";

  let primaryFinding = "Ainda não há resultados confirmados neste período.";
  if (observedTasks > 0) {
    const leadingCategory = [...categories].sort((left, right) => right.count - left.count)[0];
    primaryFinding = leadingCategory?.count
      ? `${leadingCategory.label} foi o resultado mais registrado: ${leadingCategory.count} de ${observedTasks}.`
      : `${observedTasks} resultado(s) confirmado(s) compõem a leitura atual.`;
  }

  return {
    periodDays,
    periodStart: new Date(periodStartMs).toISOString(),
    generatedAt: now.toISOString(),
    observedTasks,
    completedTasks,
    coveragePercent: percentage(observedTasks, completedTasks),
    uniqueLeads,
    advancesObserved,
    contactsObserved,
    noResponseObserved,
    followUpsNeeded,
    latestObservedAt,
    sampleStatus,
    primaryFinding,
    categories,
    policy: {
      localOnly: true,
      generativeModelUsed: false,
      predictiveClaim: false,
      humanConfirmedOnly: true,
      latestOutcomePerTask: true,
      downstreamWrites: false,
    },
  };
}

export function buildCommercialOutcomeComparison(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
): CommercialOutcomeComparison {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const current = buildCommercialOutcomeSummary(events, now, periodDays);
  // A janela anterior termina 1 ms antes da atual para não contar um evento de fronteira duas vezes.
  const previousEnd = new Date(new Date(current.periodStart).getTime() - 1);
  const previous = buildCommercialOutcomeSummary(events, previousEnd, periodDays);
  const comparable = current.observedTasks > 0 && previous.observedTasks > 0;
  const totalObserved = current.observedTasks + previous.observedTasks;
  const sampleStatus = totalObserved === 0
    ? "empty"
    : !hasDescriptiveSample(current.observedTasks, previous.observedTasks)
      ? "insufficient"
      : "descriptive";

  let primaryFinding = "Nenhum resultado confirmado foi registrado nos dois períodos.";
  if (current.observedTasks > 0 && previous.observedTasks === 0) {
    primaryFinding = `O período atual registrou ${current.observedTasks} resultado(s); o período anterior ainda não possui base comparável.`;
  } else if (current.observedTasks === 0 && previous.observedTasks > 0) {
    primaryFinding = `O período atual ainda não registrou resultados; o período anterior tinha ${previous.observedTasks}.`;
  } else if (comparable) {
    const advancesDelta = current.advancesObserved - previous.advancesObserved;
    const noResponseDelta = current.noResponseObserved - previous.noResponseObserved;
    if (advancesDelta !== 0) {
      primaryFinding = `O período atual registrou ${Math.abs(advancesDelta)} avanço(s) ${advancesDelta > 0 ? "a mais" : "a menos"} que o anterior.`;
    } else if (noResponseDelta !== 0) {
      primaryFinding = `O período atual registrou ${Math.abs(noResponseDelta)} resultado(s) sem resposta ${noResponseDelta > 0 ? "a mais" : "a menos"} que o anterior.`;
    } else {
      primaryFinding = "Avanços e resultados sem resposta permaneceram iguais entre os períodos observados.";
    }
  }

  return {
    periodDays,
    generatedAt: now.toISOString(),
    currentPeriod: { start: current.periodStart, end: now.toISOString() },
    previousPeriod: { start: previous.periodStart, end: previousEnd.toISOString() },
    comparable,
    sampleStatus,
    primaryFinding,
    metrics: {
      observedTasks: compareMetric(current.observedTasks, previous.observedTasks),
      advancesObserved: compareMetric(current.advancesObserved, previous.advancesObserved),
      noResponseObserved: compareMetric(current.noResponseObserved, previous.noResponseObserved),
      followUpsNeeded: compareMetric(current.followUpsNeeded, previous.followUpsNeeded),
      coveragePercent: compareMetric(current.coveragePercent, previous.coveragePercent, "percentage-points"),
    },
    policy: {
      localOnly: true,
      generativeModelUsed: false,
      causalClaim: false,
      predictiveClaim: false,
      humanConfirmedOnly: true,
      absoluteDeltasOnly: true,
      downstreamWrites: false,
    },
  };
}

export function buildCommercialOutcomeMemoryQuality(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
  requestedQueueLimit = 5,
): CommercialOutcomeMemoryQuality {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const queueLimit = Math.min(10, Math.max(1, Math.round(requestedQueueLimit)));
  const nowMs = now.getTime();
  const periodStartMs = nowMs - periodDays * 86_400_000;
  const inPeriod = events.filter((event) => {
    const occurredAt = timestamp(event.createdAt);
    return occurredAt !== null && occurredAt >= periodStartMs && occurredAt <= nowMs;
  });

  const latestCompletionByTask = new Map<string, CommercialOutcomeMemoryInput>();
  const orderedCompletions = inPeriod
    .filter((event) => (
      event.eventType === "copilot_task_completed"
      && event.humanConfirmed
      && Boolean(event.taskId)
      && Boolean(event.leadId)
    ))
    .sort((left, right) => (timestamp(right.createdAt) ?? 0) - (timestamp(left.createdAt) ?? 0));
  for (const completion of orderedCompletions) {
    const taskId = completion.taskId as string;
    if (!latestCompletionByTask.has(taskId)) latestCompletionByTask.set(taskId, completion);
  }

  const latestOutcomeAtByTask = new Map<string, number>();
  for (const outcomeEvent of inPeriod) {
    if (
      outcomeEvent.eventType !== "copilot_task_outcome_recorded"
      || !outcomeEvent.humanConfirmed
      || !outcomeEvent.taskId
      || !outcomeEvent.leadId
      || !isCommercialOutcomeCode(outcomeEvent.outcome)
    ) continue;
    const occurredAt = timestamp(outcomeEvent.createdAt);
    if (occurredAt === null) continue;
    const previous = latestOutcomeAtByTask.get(outcomeEvent.taskId) ?? 0;
    if (occurredAt > previous) latestOutcomeAtByTask.set(outcomeEvent.taskId, occurredAt);
  }

  const gaps = [...latestCompletionByTask.values()]
    .filter((completion) => {
      const completedAt = timestamp(completion.createdAt) ?? 0;
      return (latestOutcomeAtByTask.get(completion.taskId as string) ?? 0) < completedAt;
    })
    .map((completion): CommercialOutcomeMemoryGap => {
      const completedAtMs = timestamp(completion.createdAt) ?? nowMs;
      const ageDays = Math.max(0, Math.floor((nowMs - completedAtMs) / 86_400_000));
      return {
        taskId: completion.taskId as string,
        taskTitle: completion.taskTitle?.trim() || "Tarefa comercial concluída",
        taskDueAt: completion.taskDueAt ?? null,
        leadId: completion.leadId as string,
        leadName: completion.leadName?.trim() || "Lead sem nome",
        completedAt: new Date(completedAtMs).toISOString(),
        ageDays,
        urgency: ageDays >= 7 ? "stale" : ageDays >= 2 ? "attention" : "recent",
        projectName: normalizedContextLabel(completion.projectName),
        sourceName: normalizedContextLabel(completion.sourceName),
      };
    })
    .sort((left, right) => right.ageDays - left.ageDays || left.completedAt.localeCompare(right.completedAt));

  const eligibleCompletedTasks = latestCompletionByTask.size;
  const missingOutcomeTasks = gaps.length;
  const observedTasks = Math.max(0, eligibleCompletedTasks - missingOutcomeTasks);
  const coveragePercent = percentage(observedTasks, eligibleCompletedTasks);
  const oldestGapDays = gaps[0]?.ageDays ?? null;
  const status = eligibleCompletedTasks === 0 ? "empty" : missingOutcomeTasks === 0 ? "complete" : "attention";
  const primaryFinding = status === "empty"
    ? "Ainda não há conclusões elegíveis para revisar neste período."
    : status === "complete"
      ? "Todas as conclusões elegíveis possuem resultado humano registrado."
      : `${missingOutcomeTasks} tarefa(s) concluída(s) ainda precisam do resultado observado.`;

  return {
    periodDays,
    periodStart: new Date(periodStartMs).toISOString(),
    generatedAt: now.toISOString(),
    eligibleCompletedTasks,
    observedTasks,
    missingOutcomeTasks,
    coveragePercent,
    oldestGapDays,
    status,
    primaryFinding,
    gapQueue: gaps.slice(0, queueLimit),
    policy: {
      localOnly: true,
      generativeModelUsed: false,
      humanConfirmedCompletionsOnly: true,
      leadLinkedTasksOnly: true,
      manualResolutionOnly: true,
      predictiveClaim: false,
      downstreamWrites: false,
    },
  };
}

export function buildCommercialOutcomeContextBreakdown(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
  requestedSegmentLimit = 4,
): CommercialOutcomeContextBreakdown {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const nowMs = now.getTime();
  const periodStartMs = nowMs - periodDays * 86_400_000;
  const observedOutcomes = latestObservedOutcomes(events, periodStartMs, nowMs);
  const projects = buildContextDimension(
    observedOutcomes,
    (outcome) => resolveCommercialOutcomeContext(outcome).projectName,
    requestedSegmentLimit,
  );
  const sources = buildContextDimension(
    observedOutcomes,
    (outcome) => resolveCommercialOutcomeContext(outcome).sourceName,
    requestedSegmentLimit,
  );
  const observedTasks = observedOutcomes.length;
  const sampleStatus = observedTasks === 0 ? "empty" : observedTasks < 10 ? "initial" : "descriptive";
  const leadingProject = projects.segments[0];
  const leadingSource = sources.segments[0];

  let primaryFinding = "Ainda não há resultados confirmados para contextualizar neste período.";
  if (leadingProject && leadingSource) {
    primaryFinding = `${leadingProject.label} reúne ${leadingProject.observedTasks} resultado(s) e ${leadingSource.label} aparece em ${leadingSource.observedTasks}, conforme o contexto preservado ou o fallback legado identificado.`;
  } else if (leadingProject) {
    primaryFinding = `${leadingProject.label} reúne ${leadingProject.observedTasks} resultado(s); a origem ainda precisa de mais preenchimento factual.`;
  } else if (leadingSource) {
    primaryFinding = `${leadingSource.label} aparece em ${leadingSource.observedTasks} resultado(s); o projeto ainda precisa de mais preenchimento factual.`;
  } else if (observedTasks > 0) {
    primaryFinding = `${observedTasks} resultado(s) estão confirmados, mas ainda não possuem projeto ou origem no contexto disponível.`;
  }

  return {
    periodDays,
    periodStart: new Date(periodStartMs).toISOString(),
    generatedAt: now.toISOString(),
    observedTasks,
    sampleStatus,
    primaryFinding,
    projects,
    sources,
    policy: {
      localOnly: true,
      generativeModelUsed: false,
      humanConfirmedOnly: true,
      historicalSnapshotPreferred: true,
      currentLeadFallbackForLegacy: true,
      historicalBackfillInferred: false,
      causalClaim: false,
      predictiveClaim: false,
      downstreamWrites: false,
    },
  };
}

export function buildCommercialOutcomeContextComparison(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
  requestedSegmentLimit = 4,
): CommercialOutcomeContextComparison {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const currentEndMs = now.getTime();
  const currentStartMs = currentEndMs - periodDays * 86_400_000;
  const previousEndMs = currentStartMs - 1;
  const previousStartMs = previousEndMs - periodDays * 86_400_000;
  const currentOutcomes = latestObservedOutcomes(events, currentStartMs, currentEndMs);
  const previousOutcomes = latestObservedOutcomes(events, previousStartMs, previousEndMs);
  const projects = buildContextComparisonDimension(
    currentOutcomes,
    previousOutcomes,
    (outcome) => resolveCommercialOutcomeContext(outcome).projectName,
    requestedSegmentLimit,
  );
  const sources = buildContextComparisonDimension(
    currentOutcomes,
    previousOutcomes,
    (outcome) => resolveCommercialOutcomeContext(outcome).sourceName,
    requestedSegmentLimit,
  );
  const comparable = currentOutcomes.length > 0 && previousOutcomes.length > 0;
  const totalObserved = currentOutcomes.length + previousOutcomes.length;
  const sampleStatus = totalObserved === 0
    ? "empty"
    : !hasDescriptiveSample(currentOutcomes.length, previousOutcomes.length)
      ? "insufficient"
      : "descriptive";
  const firstChangedContext = [...projects.segments, ...sources.segments].find((segment) => segment.delta !== 0);

  let primaryFinding = "Nenhum resultado confirmado foi registrado nas duas janelas contextuais.";
  if (firstChangedContext) {
    primaryFinding = `${firstChangedContext.label}: ${firstChangedContext.currentObservedTasks} no período atual e ${firstChangedContext.previousObservedTasks} no anterior (diferença ${firstChangedContext.delta > 0 ? "+" : ""}${firstChangedContext.delta}).`;
  } else if (totalObserved > 0) {
    primaryFinding = "Os contextos exibidos mantiveram as mesmas contagens nas duas janelas observadas.";
  }

  return {
    periodDays,
    generatedAt: now.toISOString(),
    currentPeriod: { start: new Date(currentStartMs).toISOString(), end: new Date(currentEndMs).toISOString() },
    previousPeriod: { start: new Date(previousStartMs).toISOString(), end: new Date(previousEndMs).toISOString() },
    comparable,
    sampleStatus,
    primaryFinding,
    projects,
    sources,
    policy: {
      localOnly: true,
      generativeModelUsed: false,
      humanConfirmedOnly: true,
      historicalSnapshotPreferred: true,
      currentLeadFallbackForLegacy: true,
      historicalBackfillInferred: false,
      rawCountDeltasOnly: true,
      causalClaim: false,
      predictiveClaim: false,
      rankingClaim: false,
      downstreamWrites: false,
    },
  };
}

function buildContextCoverageDimension(
  outcomes: Array<CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>,
  contextOf: (context: CommercialOutcomeResolvedContext) => string | null,
): CommercialOutcomeContextCoverageDimension {
  let classifiedTasks = 0;
  let historicalClassifiedTasks = 0;
  let legacyFallbackClassifiedTasks = 0;

  for (const outcome of outcomes) {
    const context = resolveCommercialOutcomeContext(outcome);
    if (!contextOf(context)) continue;
    classifiedTasks += 1;
    if (context.basis === "historical_outcome_snapshot") historicalClassifiedTasks += 1;
    else legacyFallbackClassifiedTasks += 1;
  }

  return {
    observedTasks: outcomes.length,
    classifiedTasks,
    unclassifiedTasks: outcomes.length - classifiedTasks,
    classifiedCoveragePercent: percentage(classifiedTasks, outcomes.length),
    historicalClassifiedTasks,
    legacyFallbackClassifiedTasks,
    historicalClassifiedCoveragePercent: percentage(historicalClassifiedTasks, outcomes.length),
  };
}

function buildContextCoverageWindow(
  outcomes: Array<CommercialOutcomeMemoryInput & { outcome: CommercialOutcomeCode }>,
  startMs: number,
  endMs: number,
): CommercialOutcomeContextCoverageWindow {
  const historicalSnapshotTasks = outcomes.filter(
    (outcome) => resolveCommercialOutcomeContext(outcome).basis === "historical_outcome_snapshot",
  ).length;

  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    observedTasks: outcomes.length,
    historicalSnapshotTasks,
    currentLeadFallbackTasks: outcomes.length - historicalSnapshotTasks,
    historicalSnapshotCoveragePercent: percentage(historicalSnapshotTasks, outcomes.length),
    projects: buildContextCoverageDimension(outcomes, (context) => context.projectName),
    sources: buildContextCoverageDimension(outcomes, (context) => context.sourceName),
  };
}

export function buildCommercialOutcomeContextCoverage(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
): CommercialOutcomeContextCoverage {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const currentEndMs = now.getTime();
  const currentStartMs = currentEndMs - periodDays * 86_400_000;
  const previousEndMs = currentStartMs - 1;
  const previousStartMs = previousEndMs - periodDays * 86_400_000;
  const currentOutcomes = latestObservedOutcomes(events, currentStartMs, currentEndMs);
  const previousOutcomes = latestObservedOutcomes(events, previousStartMs, previousEndMs);
  const current = buildContextCoverageWindow(currentOutcomes, currentStartMs, currentEndMs);
  const previous = buildContextCoverageWindow(previousOutcomes, previousStartMs, previousEndMs);

  const primaryFinding = current.observedTasks === 0
    ? "Ainda não há resultados humanos confirmados para medir a cobertura contextual atual."
    : `Cobertura atual — projeto: ${current.projects.classifiedCoveragePercent}% disponível e ${current.projects.historicalClassifiedCoveragePercent}% preservado; origem: ${current.sources.classifiedCoveragePercent}% disponível e ${current.sources.historicalClassifiedCoveragePercent}% preservado. ${current.currentLeadFallbackTasks} resultado(s) usam fallback legado.`;

  return {
    periodDays,
    generatedAt: now.toISOString(),
    primaryFinding,
    current,
    previous,
    policy: {
      localOnly: true,
      humanConfirmedOnly: true,
      latestOutcomePerTask: true,
      equalWindows: true,
      denominator: "observed_tasks",
      historicalSnapshotPreferred: true,
      currentLeadFallbackForLegacy: true,
      historicalBackfillInferred: false,
      descriptiveCoverageOnly: true,
      qualityClaim: false,
      causalClaim: false,
      predictiveClaim: false,
      downstreamWrites: false,
    },
  };
}

export function buildCommercialOutcomeContextGapQueue(
  events: CommercialOutcomeMemoryInput[],
  now = new Date(),
  requestedPeriodDays = 30,
  requestedLimit = 5,
): CommercialOutcomeContextGapQueue {
  const periodDays = Math.min(90, Math.max(1, Math.round(requestedPeriodDays)));
  const limit = Math.min(10, Math.max(1, Math.round(requestedLimit)));
  const periodEndMs = now.getTime();
  const periodStartMs = periodEndMs - periodDays * 86_400_000;
  const outcomes = latestObservedOutcomes(events, periodStartMs, periodEndMs);

  const gaps = outcomes.flatMap<CommercialOutcomeContextGapItem>((outcome) => {
    const context = resolveCommercialOutcomeContext(outcome);
    const missingDimensions: CommercialOutcomeContextGapDimension[] = [];
    if (!context.projectName) missingDimensions.push("project");
    if (!context.sourceName) missingDimensions.push("source");
    if (missingDimensions.length === 0) return [];

    const observedAtMs = timestamp(outcome.createdAt) as number;
    const historicalEvidenceImmutable = context.basis === "historical_outcome_snapshot";
    const leadId = outcome.leadId as string;
    return [{
      eventId: outcome.id,
      taskId: outcome.taskId as string,
      taskTitle: outcome.taskTitle?.trim() || "Tarefa comercial",
      leadId,
      leadName: outcome.leadName?.trim() || "Lead sem nome",
      observedAt: new Date(observedAtMs).toISOString(),
      ageDays: Math.max(0, Math.floor((periodEndMs - observedAtMs) / 86_400_000)),
      missingDimensions,
      contextBasis: context.basis,
      contextCapturedAt: context.capturedAt,
      historicalEvidenceImmutable,
      correctionMode: historicalEvidenceImmutable ? "future_results_only" : "update_current_lead",
      href: `/leads/${encodeURIComponent(leadId)}`,
    }];
  }).sort((left, right) => (
    right.missingDimensions.length - left.missingDimensions.length
    || left.observedAt.localeCompare(right.observedAt)
    || left.eventId.localeCompare(right.eventId)
  ));

  const missingProjectTasks = gaps.filter((gap) => gap.missingDimensions.includes("project")).length;
  const missingSourceTasks = gaps.filter((gap) => gap.missingDimensions.includes("source")).length;
  const missingBothTasks = gaps.filter((gap) => gap.missingDimensions.length === 2).length;
  const queue = gaps.slice(0, limit);

  let primaryFinding = "Ainda não há resultados humanos confirmados no período atual.";
  if (outcomes.length > 0 && gaps.length === 0) {
    primaryFinding = `Os ${outcomes.length} resultado(s) observados possuem projeto e origem no contexto disponível.`;
  } else if (gaps.length > 0) {
    primaryFinding = `${gaps.length} resultado(s) precisam de contexto humano: ${missingProjectTasks} sem projeto, ${missingSourceTasks} sem origem e ${missingBothTasks} sem ambas as dimensões.`;
  }

  return {
    periodDays,
    periodStart: new Date(periodStartMs).toISOString(),
    generatedAt: now.toISOString(),
    observedTasks: outcomes.length,
    outcomesWithContextGaps: gaps.length,
    missingProjectTasks,
    missingSourceTasks,
    missingBothTasks,
    immutableHistoricalGaps: gaps.filter((gap) => gap.historicalEvidenceImmutable).length,
    currentLeadReviewableGaps: gaps.filter((gap) => !gap.historicalEvidenceImmutable).length,
    queue,
    remainingGaps: Math.max(0, gaps.length - queue.length),
    primaryFinding,
    ordering: {
      first: "missing_dimension_count",
      second: "oldest_observed_fact",
      businessImpactInferred: false,
    },
    policy: {
      localOnly: true,
      humanConfirmedOnly: true,
      latestOutcomePerTask: true,
      currentWindowOnly: true,
      historicalSnapshotPreferred: true,
      currentLeadFallbackForLegacy: true,
      historicalBackfillInferred: false,
      manualCorrectionOnly: true,
      historicalEvidenceImmutable: true,
      personalContactDataIncluded: false,
      predictiveClaim: false,
      rankingClaim: false,
      downstreamWrites: false,
    },
  };
}
