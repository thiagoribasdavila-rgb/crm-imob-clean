export type LeadIntakeRow = {
  id: string;
  created_at: string;
  assigned_to: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  development_id?: string | null;
  development_name?: string | null;
  developer_id?: string | null;
  developer_name?: string | null;
  source?: string | null;
  source_normalized?: string | null;
  first_contacted_at?: string | null;
  first_response_minutes?: number | null;
  next_action_at?: string | null;
  import_batch_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type LeadAssignmentRow = {
  lead_id: string;
  assigned_to: string;
  created_at: string;
};

export type IntakeBroker = {
  id: string;
  name: string;
};

const DAY = 86_400_000;
const HISTORICAL_SOURCE = /base\s*(antiga|hist[oó]rica|externa)|hist[oó]rico|arquivo|importa[cç][aã]o|reativa[cç][aã]o/i;

export type LeadProvenance = "operational" | "historical_import" | "ambiguous";

export type LeadIntakePriority = {
  code:
    | "distribute_unassigned"
    | "review_unassigned"
    | "classify_source"
    | "schedule_next_action"
    | "measure_first_action"
    | "accelerate_first_action"
    | "rebalance_distribution"
    | "await_operational_sample"
    | "keep_cadence";
  severity: "critical" | "attention" | "monitor" | "healthy";
  title: string;
  description: string;
  metricLabel: string;
  metricValue: number | string | null;
  actionLabel: string;
  actionHref: string;
  automaticAction: false;
  humanDecisionRequired: true;
};

type LeadIntakePriorityInput = {
  role?: string;
  summary: {
    unassignedToday: number;
    ambiguousToday: number;
  };
  dataBoundary: {
    operationalPeriod: number;
  };
  distribution: {
    imbalanced: boolean;
  };
  baseline: {
    sampleSize: number;
    medianFirstActionMinutes: number | null;
    firstActionCoveragePercent: number | null;
    nextActionRatePercent: number | null;
  };
};

export function buildLeadIntakePriority({
  role = "",
  summary,
  dataBoundary,
  distribution,
  baseline,
}: LeadIntakePriorityInput): LeadIntakePriority {
  const managementRole = role === "admin" || role === "director" || role === "superintendent" || role === "manager";
  const common = { automaticAction: false as const, humanDecisionRequired: true as const };

  if (summary.unassignedToday > 0) {
    return managementRole
      ? {
          code: "distribute_unassigned",
          severity: "critical",
          title: "Distribuir as leads sem responsável",
          description: `${summary.unassignedToday} ${summary.unassignedToday === 1 ? "lead nova ainda não tem" : "leads novas ainda não têm"} corretor responsável.`,
          metricLabel: "Sem responsável hoje",
          metricValue: summary.unassignedToday,
          actionLabel: "Abrir fila de distribuição",
          actionHref: "/distribution",
          ...common,
        }
      : {
          code: "review_unassigned",
          severity: "attention",
          title: "Acompanhar atribuição das novas leads",
          description: `${summary.unassignedToday} ${summary.unassignedToday === 1 ? "entrada aguarda" : "entradas aguardam"} decisão da gestão.`,
          metricLabel: "Aguardando responsável",
          metricValue: summary.unassignedToday,
          actionLabel: "Ver carteira atribuída",
          actionHref: "/leads",
          ...common,
        };
  }

  if (summary.ambiguousToday > 0) {
    return {
      code: "classify_source",
      severity: "attention",
      title: "Corrigir a origem antes de decidir",
      description: "Há entradas sem origem operacional comprovada; elas foram retiradas dos indicadores de decisão.",
      metricLabel: "Sem origem clara hoje",
      metricValue: summary.ambiguousToday,
      actionLabel: "Revisar qualidade dos dados",
      actionHref: "/leads?quality=missing_source",
      ...common,
    };
  }

  if (!baseline.sampleSize || !dataBoundary.operationalPeriod) {
    return {
      code: "await_operational_sample",
      severity: "monitor",
      title: "Aguardar entrada operacional real",
      description: "Ainda não existe amostra operacional suficiente para recomendar uma intervenção.",
      metricLabel: "Amostra operacional",
      metricValue: null,
      actionLabel: "Abrir leads",
      actionHref: "/leads",
      ...common,
    };
  }

  if (baseline.nextActionRatePercent !== null && baseline.nextActionRatePercent < 70) {
    return {
      code: "schedule_next_action",
      severity: "critical",
      title: "Definir a próxima ação das novas leads",
      description: "A prioridade é impedir que entradas recentes fiquem sem continuidade comercial registrada.",
      metricLabel: "Com próxima ação",
      metricValue: `${baseline.nextActionRatePercent}%`,
      actionLabel: "Abrir leads sem próxima ação",
      actionHref: "/leads?attention=no_action",
      ...common,
    };
  }

  if (baseline.firstActionCoveragePercent !== null && baseline.firstActionCoveragePercent < 70) {
    return {
      code: "measure_first_action",
      severity: "attention",
      title: "Registrar a primeira ação comercial",
      description: "A cobertura atual não permite comparar com segurança a velocidade de atendimento.",
      metricLabel: "Primeira ação medida",
      metricValue: `${baseline.firstActionCoveragePercent}%`,
      actionLabel: "Revisar entradas recentes",
      actionHref: "/leads",
      ...common,
    };
  }

  if (baseline.medianFirstActionMinutes !== null && baseline.medianFirstActionMinutes > 15) {
    return {
      code: "accelerate_first_action",
      severity: "attention",
      title: "Reduzir o tempo até a primeira ação",
      description: "A mediana observada passou de 15 minutos nas entradas operacionais do período.",
      metricLabel: "Mediana até primeira ação",
      metricValue: `${baseline.medianFirstActionMinutes} min`,
      actionLabel: "Abrir leads recentes",
      actionHref: "/leads",
      ...common,
    };
  }

  if (distribution.imbalanced && managementRole) {
    return {
      code: "rebalance_distribution",
      severity: "attention",
      title: "Revisar o equilíbrio da distribuição",
      description: "A amostra do dia mostra concentração de recebimentos entre os corretores elegíveis.",
      metricLabel: "Distribuição",
      metricValue: "Desequilibrada",
      actionLabel: "Revisar fila de distribuição",
      actionHref: "/distribution",
      ...common,
    };
  }

  return {
    code: "keep_cadence",
    severity: "healthy",
    title: "Manter a cadência de entrada",
    description: "Não há desvio prioritário comprovado na entrada operacional observada.",
    metricLabel: "Leitura da entrada",
    metricValue: "Saudável",
    actionLabel: "Acompanhar leads",
    actionHref: "/leads",
    ...common,
  };
}

export function classifyLeadProvenance(lead: LeadIntakeRow): LeadProvenance {
  const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
  const reactivation = metadata.reactivation;
  const historicalMemory = metadata.historicalMemory;
  const source = `${lead.source_normalized ?? ""} ${lead.source ?? ""}`.trim();

  if (
    Boolean(lead.import_batch_id) ||
    historicalMemory === true ||
    (reactivation !== null && typeof reactivation === "object") ||
    HISTORICAL_SOURCE.test(source)
  ) return "historical_import";

  if (source) return "operational";
  return "ambiguous";
}

export function calendarDayKey(value: string | number | Date, timeZone = "America/Sao_Paulo") {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
  const year = read("year");
  const month = read("month");
  const day = read("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function rate(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
}

function firstActionMinutes(lead: LeadIntakeRow) {
  const hasStoredValue = lead.first_response_minutes !== null
    && lead.first_response_minutes !== undefined
    && `${lead.first_response_minutes}`.trim() !== "";
  const stored = hasStoredValue ? Number(lead.first_response_minutes) : Number.NaN;
  if (Number.isFinite(stored) && stored >= 0) return stored;
  if (!lead.first_contacted_at) return null;
  const createdAt = Date.parse(lead.created_at);
  const contactedAt = Date.parse(lead.first_contacted_at);
  if (!Number.isFinite(createdAt) || !Number.isFinite(contactedAt) || contactedAt < createdAt) return null;
  return (contactedAt - createdAt) / 60_000;
}

function hasScheduledNextAction(lead: LeadIntakeRow) {
  return Boolean(lead.next_action_at && Number.isFinite(Date.parse(lead.next_action_at)));
}

function normalizedDimension(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function dimensionKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "") || "unknown";
}

function dimensionIdentity(id: string | null | undefined, name: string | null | undefined, fallback: string) {
  const normalizedId = id?.trim();
  if (normalizedId) return `id:${normalizedId}`;
  const normalizedName = name?.trim();
  if (normalizedName) return `name:${dimensionKey(normalizedName)}`;
  return fallback;
}

export function buildLeadIntakeAnalytics({
  leads,
  assignments,
  brokers,
  now = new Date(),
  periodDays = 14,
  timeZone = "America/Sao_Paulo",
  ledgerAvailable = true,
  role = "",
}: {
  leads: LeadIntakeRow[];
  assignments: LeadAssignmentRow[];
  brokers: IntakeBroker[];
  now?: Date;
  periodDays?: number;
  timeZone?: string;
  ledgerAvailable?: boolean;
  role?: string;
}) {
  const days = Math.min(31, Math.max(7, Math.trunc(periodDays)));
  const dayKeys = Array.from({ length: days }, (_, index) =>
    calendarDayKey(now.getTime() - (days - index - 1) * DAY, timeZone),
  ).filter((value): value is string => Boolean(value));
  const allowedDays = new Set(dayKeys);
  const brokerMap = new Map(brokers.map((broker) => [broker.id, broker]));
  const today = dayKeys.at(-1) ?? calendarDayKey(now, timeZone) ?? "";
  const yesterday = dayKeys.at(-2) ?? "";

  const daily = new Map(dayKeys.map((date) => [date, { date, total: 0, assigned: 0, unassigned: 0, received: 0, historicalImports: 0, ambiguous: 0 }]));
  const provenance = new Map(leads.map((lead) => [lead.id, classifyLeadProvenance(lead)]));
  const operationalLeadIds = new Set(leads.filter((lead) => provenance.get(lead.id) === "operational").map((lead) => lead.id));
  const operationalAssignments = assignments.filter((assignment) => operationalLeadIds.has(assignment.lead_id));
  const eventLeadIds = new Set(operationalAssignments.map((assignment) => assignment.lead_id));
  const receipts: LeadAssignmentRow[] = operationalAssignments.filter((assignment) => brokerMap.has(assignment.assigned_to));

  for (const lead of leads) {
    const key = calendarDayKey(lead.created_at, timeZone);
    if (!key || !allowedDays.has(key)) continue;
    const bucket = daily.get(key)!;
    const leadProvenance = provenance.get(lead.id);
    if (leadProvenance === "historical_import") {
      bucket.historicalImports += 1;
      continue;
    }
    if (leadProvenance === "ambiguous") {
      bucket.ambiguous += 1;
      continue;
    }
    bucket.total += 1;
    if (lead.assigned_to && brokerMap.has(lead.assigned_to)) bucket.assigned += 1;
    else bucket.unassigned += 1;

    // A lead assigned directly at creation may not have a distribution ledger entry.
    if (lead.assigned_to && brokerMap.has(lead.assigned_to) && !eventLeadIds.has(lead.id)) {
      receipts.push({ lead_id: lead.id, assigned_to: lead.assigned_to, created_at: lead.created_at });
    }
  }

  const receiptsByBroker = new Map<string, Map<string, number>>();
  for (const receipt of receipts) {
    const key = calendarDayKey(receipt.created_at, timeZone);
    if (!key || !allowedDays.has(key) || !brokerMap.has(receipt.assigned_to)) continue;
    daily.get(key)!.received += 1;
    const byDay = receiptsByBroker.get(receipt.assigned_to) ?? new Map<string, number>();
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
    receiptsByBroker.set(receipt.assigned_to, byDay);
  }

  const byDay = dayKeys.map((key) => daily.get(key)!);
  const sevenDayKeys = new Set(dayKeys.slice(-7));
  const receivedToday = daily.get(today)?.received ?? 0;
  const byBroker = brokers
    .map((broker) => {
      const counts = receiptsByBroker.get(broker.id) ?? new Map<string, number>();
      const todayCount = counts.get(today) ?? 0;
      const yesterdayCount = counts.get(yesterday) ?? 0;
      const last7Days = [...counts.entries()].reduce(
        (sum, [key, count]) => sum + (sevenDayKeys.has(key) ? count : 0),
        0,
      );
      const totalPeriod = [...counts.values()].reduce((sum, count) => sum + count, 0);
      return {
        brokerId: broker.id,
        brokerName: broker.name,
        today: todayCount,
        yesterday: yesterdayCount,
        last7Days,
        totalPeriod,
        shareToday: receivedToday ? Math.round((todayCount / receivedToday) * 1000) / 10 : 0,
        changePercent: percentageChange(todayCount, yesterdayCount),
      };
    })
    .sort((left, right) => right.today - left.today || right.last7Days - left.last7Days || left.brokerName.localeCompare(right.brokerName, "pt-BR"));

  const todayCounts = byBroker.map((broker) => broker.today);
  const averageToday = brokers.length ? receivedToday / brokers.length : 0;
  const spreadToday = todayCounts.length ? Math.max(...todayCounts) - Math.min(...todayCounts) : 0;
  const todayBucket = daily.get(today) ?? { total: 0, assigned: 0, unassigned: 0, received: 0, historicalImports: 0, ambiguous: 0 };
  const yesterdayBucket = daily.get(yesterday) ?? { total: 0, assigned: 0, unassigned: 0, received: 0, historicalImports: 0, ambiguous: 0 };
  const sevenDayTotal = byDay.slice(-7).reduce((sum, item) => sum + item.total, 0);
  const operationalPeriod = byDay.reduce((sum, item) => sum + item.total, 0);
  const historicalImportsPeriod = byDay.reduce((sum, item) => sum + item.historicalImports, 0);
  const ambiguousPeriod = byDay.reduce((sum, item) => sum + item.ambiguous, 0);
  const observedPeriod = operationalPeriod + historicalImportsPeriod + ambiguousPeriod;
  const classifiedPeriod = operationalPeriod + historicalImportsPeriod;
  const provenanceCoveragePercent = observedPeriod ? Math.round((classifiedPeriod / observedPeriod) * 1000) / 10 : 100;
  const minimumOperationalSample = 5;
  const qualityStatus = observedPeriod === 0 ? "no_sample" : operationalPeriod < minimumOperationalSample || ambiguousPeriod > 0 ? "insufficient" : "sufficient";
  const decisionReady = qualityStatus === "sufficient" && ledgerAvailable;
  const imbalanced = decisionReady && receivedToday >= Math.max(4, brokers.length) && spreadToday >= Math.max(3, Math.ceil(averageToday * 1.5));

  const operationalLeads = leads.filter((lead) => {
    const key = calendarDayKey(lead.created_at, timeZone);
    return Boolean(key && allowedDays.has(key) && provenance.get(lead.id) === "operational");
  });
  const measuredFirstActions = operationalLeads.flatMap((lead) => {
    const minutes = firstActionMinutes(lead);
    return minutes === null ? [] : [minutes];
  });
  const leadsWithOwner = operationalLeads.filter((lead) => Boolean(lead.assigned_to && brokerMap.has(lead.assigned_to))).length;
  const leadsWithNextAction = operationalLeads.filter(hasScheduledNextAction).length;

  const dimensionRows = <T extends { key: string; name: string }>(
    dimensions: T[],
    read: (lead: LeadIntakeRow) => string,
  ) => dimensions.map((dimension) => {
    const rows = operationalLeads.filter((lead) => read(lead) === dimension.key);
    const firstActions = rows.flatMap((lead) => {
      const minutes = firstActionMinutes(lead);
      return minutes === null ? [] : [minutes];
    });
    return {
      ...dimension,
      leads: rows.length,
      assigned: rows.filter((lead) => Boolean(lead.assigned_to && brokerMap.has(lead.assigned_to))).length,
      withNextAction: rows.filter(hasScheduledNextAction).length,
      medianFirstActionMinutes: median(firstActions),
      firstActionCoveragePercent: rate(firstActions.length, rows.length),
    };
  }).sort((left, right) => right.leads - left.leads || left.name.localeCompare(right.name, "pt-BR"));

  const projectDimensions = [...new Map(operationalLeads.map((lead) => {
    const key = normalizedDimension(lead.development_id, "unassigned-project");
    return [key, {
      key,
      name: normalizedDimension(lead.development_name, lead.development_id ? "Projeto identificado" : "Sem projeto"),
      developmentId: lead.development_id || null,
    }];
  })).values()];
  const sourceDimensionMap = new Map<string, { key: string; name: string }>();
  for (const lead of operationalLeads) {
    const canonical = normalizedDimension(lead.source_normalized || lead.source, "Sem origem");
    const key = dimensionKey(canonical);
    const displayName = normalizedDimension(lead.source, canonical).replaceAll("_", " ");
    if (!sourceDimensionMap.has(key)) sourceDimensionMap.set(key, { key, name: displayName });
  }
  const sourceDimensions = [...sourceDimensionMap.values()];
  const campaignDimensions = [...new Map(operationalLeads.map((lead) => {
    const key = dimensionIdentity(lead.campaign_id, lead.campaign_name, "unassigned-campaign");
    return [key, {
      key,
      name: normalizedDimension(lead.campaign_name, lead.campaign_id ? "Campanha identificada" : "Sem campanha"),
      campaignId: lead.campaign_id || null,
    }];
  })).values()];
  const developerDimensions = [...new Map(operationalLeads.map((lead) => {
    const key = dimensionIdentity(lead.developer_id, lead.developer_name, "unassigned-developer");
    return [key, {
      key,
      name: normalizedDimension(lead.developer_name, lead.developer_id ? "Incorporadora identificada" : "Incorporadora não informada"),
      developerId: lead.developer_id || null,
    }];
  })).values()];

  const byProject = dimensionRows(
    projectDimensions,
    (lead) => normalizedDimension(lead.development_id, "unassigned-project"),
  ).map(({ key: _key, ...row }) => row);
  const bySource = dimensionRows(
    sourceDimensions,
    (lead) => dimensionKey(normalizedDimension(lead.source_normalized || lead.source, "Sem origem")),
  ).map(({ key: _key, ...row }) => row);
  const byCampaign = dimensionRows(
    campaignDimensions,
    (lead) => dimensionIdentity(lead.campaign_id, lead.campaign_name, "unassigned-campaign"),
  ).map(({ key: _key, ...row }) => row);
  const byDeveloper = dimensionRows(
    developerDimensions,
    (lead) => dimensionIdentity(lead.developer_id, lead.developer_name, "unassigned-developer"),
  ).map(({ key: _key, ...row }) => row);

  const baselineByDay = byDay.map((day) => {
    const rows = operationalLeads.filter((lead) => calendarDayKey(lead.created_at, timeZone) === day.date);
    const firstActions = rows.flatMap((lead) => {
      const minutes = firstActionMinutes(lead);
      return minutes === null ? [] : [minutes];
    });
    return {
      date: day.date,
      leads: rows.length,
      ownerRatePercent: rate(rows.filter((lead) => Boolean(lead.assigned_to && brokerMap.has(lead.assigned_to))).length, rows.length),
      nextActionRatePercent: rate(rows.filter(hasScheduledNextAction).length, rows.length),
      medianFirstActionMinutes: median(firstActions),
      firstActionCoveragePercent: rate(firstActions.length, rows.length),
    };
  });

  const summary = {
    today: todayBucket.total,
    yesterday: yesterdayBucket.total,
    changePercent: percentageChange(todayBucket.total, yesterdayBucket.total),
    assignedToday: todayBucket.assigned,
    unassignedToday: todayBucket.unassigned,
    receivedToday,
    brokersReceivingToday: byBroker.filter((broker) => broker.today > 0).length,
    sevenDayTotal,
    averagePerDay7d: Math.round((sevenDayTotal / Math.min(7, byDay.length)) * 10) / 10,
    historicalImportsToday: todayBucket.historicalImports,
    ambiguousToday: todayBucket.ambiguous,
  };
  const dataBoundary = {
    status: qualityStatus,
    decisionReady,
    minimumOperationalSample,
    operationalPeriod,
    historicalImportsPeriod,
    ambiguousPeriod,
    provenanceCoveragePercent,
    historicalImportsExcludedFromOperationalMetrics: true as const,
  };
  const distribution = {
    averageToday: Math.round(averageToday * 10) / 10,
    spreadToday,
    imbalanced,
    method: ledgerAvailable ? "distribution_ledger_plus_direct_intake" : "direct_intake_snapshot",
    ledgerAvailable,
  };
  const baseline = {
    periodDays: days,
    sampleSize: operationalLeads.length,
    medianFirstActionMinutes: median(measuredFirstActions),
    firstActionMeasured: measuredFirstActions.length,
    firstActionCoveragePercent: rate(measuredFirstActions.length, operationalLeads.length),
    ownerRatePercent: rate(leadsWithOwner, operationalLeads.length),
    nextActionRatePercent: rate(leadsWithNextAction, operationalLeads.length),
    noSampleAsZero: false as const,
    historicalImportsExcluded: true as const,
  };

  return {
    summary,
    dataBoundary,
    distribution,
    baseline,
    priority: buildLeadIntakePriority({ role, summary, dataBoundary, distribution, baseline }),
    byDay,
    baselineByDay,
    byProject,
    bySource,
    byCampaign,
    byDeveloper,
    byBroker,
    executiveSnapshot: {
      capturedAt: now.toISOString(),
      timeZone,
      businessDate: today,
      operationalLeads: todayBucket.total,
      historicalImports: todayBucket.historicalImports,
      ambiguousRecords: todayBucket.ambiguous,
      assignedOperationalLeads: todayBucket.assigned,
      unassignedOperationalLeads: todayBucket.unassigned,
      distributionReceipts: todayBucket.received,
      decisionReady,
    },
  };
}
