"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { EmptyState } from "@/components/atlas/empty-state";
import { ErrorState } from "@/components/atlas/error-state";
import { LoadingState } from "@/components/atlas/loading-state";
import { MetricCard } from "@/components/atlas/metric-card";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";

// Fase 40 · SLA do time permanece como base da fila; a Fase 35 amplia sua medição.

type DataRow = Record<string, unknown>;
type Period = "7" | "30" | "90" | "all";
type DecisionPeriod = "day" | "week" | "month";
type CommandMode = "focus" | "complete";
type ModuleWriteReadiness = {
  state: "ready" | "source-mediated" | "blocked";
  label: string;
  detail: string;
  href: string;
  actionLabel: string;
  mode: "protected-server-boundary" | "rls-direct" | "lead-source" | "manual-gate";
  operations: readonly string[];
  safeguards: readonly string[];
  blockers: readonly string[];
};
type ModuleHealth = {
  id: string;
  label: string;
  state: "operational" | "degraded" | "unavailable";
  detail: string;
  href: string;
  count: number | null;
  write: ModuleWriteReadiness;
};
const DASHBOARD_PERIOD_KEY = "atlas:dashboard-periods:v1";
const COMMAND_MODE_KEY = "atlas:command-mode:v1";
type DashboardData = {
  leads: DataRow[];
  opportunities: DataRow[];
  tasks: DataRow[];
  insights: DataRow[];
  developments: DataRow[];
  profiles: DataRow[];
};
type ModuleHealthApiData = {
  generatedAt: string;
  snapshot: DashboardData;
  health: {
    state: "operational" | "degraded" | "attention";
    write: { ready: number; sourceMediated: number; blocked: number };
    modules: ModuleHealth[];
  };
};
type ModuleHealthApiEnvelope = {
  ok: boolean;
  data?: ModuleHealthApiData;
  error?: { message?: string };
};
type SuperintendentSummary = { scope: { role: "superintendent"; directManagersOnly: true; directBrokersPerManagerOnly: true; parallelStructuresExcluded: true; unassignedExcluded: true }; totals: { managers: number; brokers: number; online: number; available: number; leads: number; activeLeads: number; hotLeads: number; firstContactOverdue: number; followUpOverdue: number; withoutNextAction: number; overdueLeads: number; won: number; potentialVgv: number }; benchmark: { conversionRate: number | null; minimumLeadsPerTeam: number; comparableManagers: number }; distribution: { averageActivePerBroker: number; spread: number; imbalanced: boolean; metric: string }; managers: Array<{ managerId: string; managerName: string; brokers: number; online: number; available: number; leads: number; activeLeads: number; hotLeads: number; firstContactOverdue: number; followUpOverdue: number; withoutNextAction: number; overdueLeads: number; won: number; conversionRate: number; conversionSampleSufficient: boolean; comparison: "insufficient_sample" | "at_or_above_benchmark" | "below_benchmark"; averageActivePerBroker: number; recentAssignments: number; potentialVgv: number }>; interventions: Array<{ managerId: string; managerName: string; severity: "critical" | "attention" | "opportunity"; reason: string; action: string; href: string }>; reconciliation: { managerLeadSum: number; scopedLeadCount: number; matches: boolean }; governance: { readOnly: true; humanDecisionRequired: true; automaticTransfer: false }; generatedAt: string };
type TeamSlaSummary = { scope: { role: "manager"; directBrokersOnly: boolean }; totals: { alerts: number; firstContactOverdue: number; followUpOverdue: number; brokersWithAlerts: number; measured: number; met: number; complianceRate: number | null; averageResponseMinutes: number | null; followUpsMeasured: number; followUpComplianceRate: number | null; recoveredFollowUps: number; averageFollowUpMinutes: number | null }; alerts: Array<{ kind: "first_contact" | "follow_up"; dueAt: string; overdueMinutes: number; leadId: string; leadName: string; brokerId: string; brokerName: string }>; byBroker: Array<{ brokerId: string; brokerName: string; firstContactOverdue: number; followUpOverdue: number; followUpsMeasured: number; followUpComplianceRate: number | null; recoveredFollowUps: number }>; generatedAt: string };
type PredictiveBriefing = { status: "critical" | "attention" | "healthy"; signals: Array<{ id: string; severity: "critical" | "attention" | "opportunity" | "healthy"; title: string; evidence: string; action: string; href: string }>; model: { generativeReady: boolean; localIntelligenceReady: boolean } };
type AttentionSignalItem = { kind: string; severity: "critical" | "warning" | "info"; reason: string; detail: string; since: string | null; metric: number };
type AttentionQueueItem = { leadId: string; leadName: string; status: string; score: number; topSeverity: "critical" | "warning" | "info"; topReason: string; signals: AttentionSignalItem[] };
type BrokerDaily = { scope: { role: "broker"; ownPortfolioOnly: true; brokerId: string }; summary: { activeLeads: number; hotLeads: number; openTasks: number; overdueTasks: number; firstContactOverdue: number; followUpOverdue: number; agendaNext7Days: number; leadsNeedingAttention: number }; priorities: Array<{ leadId: string; leadName: string; status: string; score: number; priorityScore: number; conversionProbability: number; reason: string; nextBestAction: string; dueAt: string | null; hot: boolean; source: string | null; developmentId: string | null; attentionSignals: AttentionSignalItem[] }>; agenda: Array<{ id: string; title: string; dueAt: string; priority: string; leadId: string | null; overdue: boolean }>; attention: { explainable: true; humanApprovalRequired: true; rules: { staleStage: string; followUpOverdue: string; highScoreNoContact: string }; queue: AttentionQueueItem[] }; ranking: { explainable: true; signals: string[]; humanApprovalRequired: true }; generatedAt: string };
type ManagerDaily = { scope: { role: "manager"; directBrokersOnly: true; parallelTeamsExcluded: true }; totals: { brokers: number; online: number; available: number; activeLeads: number; hotLeads: number; won: number; firstContactOverdue: number; followUpOverdue: number; withoutNextAction: number }; distribution: { averageActiveLeads: number; spread: number; imbalanced: boolean; metric: string }; brokers: Array<{ brokerId: string; brokerName: string; availability: string; online: boolean; leads: number; activeLeads: number; hotLeads: number; won: number; conversionRate: number; conversionSampleSufficient: boolean; firstContactOverdue: number; followUpOverdue: number; withoutNextAction: number; recentAssignments: number }>; interventions: Array<{ brokerId: string; brokerName: string; severity: "critical" | "attention" | "opportunity"; reason: string; action: string; href: string }>; generatedAt: string };
type DirectorDaily = { scope: { role: "director"; organizationWide: true; directSuperintendentsOnly: true }; commercial: { leads: number; activeLeads: number; hotLeads: number; unassigned: number; won: number; conversionRate: number; firstContactOverdue: number; followUpOverdue: number; withoutNextAction: number }; financial: { pipelineGross: number; forecastWeighted: number; forecastMethod: string; wonValue: number; commissionReceivable: number; commissionOverdue: number }; marketing: { campaigns: number; campaignsWithSample: number; spend: number; attributedRevenue: number; roas: number | null; minimumLeadsForDecision: number; ranking: Array<{ id: string; name: string; channel: string; status: string; spend: number; leads: number; sales: number; revenue: number; costPerLead: number | null; conversionRate: number; sampleSufficient: boolean }> }; developers: Array<{ developerName: string; developments: number; leads: number; won: number }>; hierarchy: { superintendents: Array<{ superintendentId: string; superintendentName: string; managers: number; brokers: number; leads: number; activeLeads: number; won: number; conversionRate: number; conversionSampleSufficient: boolean }>; gaps: number; comparisonMinimumLeads: number }; ai: { calls30d: number; tokens30d: number; estimatedCostUsd30d: number; averageLatencyMs30d: number; measured: boolean }; risks: Array<{ severity: "critical" | "attention"; area: string; reason: string; action: string }>; governance: { readOnly: true; humanApprovalRequired: true; noAutomaticBudgetChange: true; noAutomaticPeopleDecision: true }; generatedAt: string };

const emptyData: DashboardData = {
  leads: [],
  opportunities: [],
  tasks: [],
  insights: [],
  developments: [],
  profiles: [],
};

const CONNECTING_WRITE: ModuleWriteReadiness = {
  state: "blocked",
  label: "Verificando ação",
  detail: "Confirmando a escrita segura",
  href: "/dashboard",
  actionLabel: "Aguarde",
  mode: "manual-gate",
  operations: [],
  safeguards: ["read-before-write"],
  blockers: ["health-loading"],
};

const INITIAL_MODULE_HEALTH: ModuleHealth[] = [
  { id: "leads", label: "Leads", state: "degraded", detail: "Conectando carteira", href: "/leads", count: null, write: CONNECTING_WRITE },
  { id: "pipeline", label: "Pipeline", state: "degraded", detail: "Conectando funil", href: "/pipeline", count: null, write: CONNECTING_WRITE },
  { id: "tasks-and-agenda", label: "Tarefas e agenda", state: "degraded", detail: "Conectando prazos", href: "/tasks", count: null, write: CONNECTING_WRITE },
  { id: "customers-360", label: "Clientes 360", state: "degraded", detail: "Conectando visão unificada", href: "/customers", count: null, write: CONNECTING_WRITE },
  { id: "developments", label: "Projetos", state: "degraded", detail: "Conectando portfólio", href: "/developments", count: null, write: CONNECTING_WRITE },
];

const stageOrder = [
  { key: "novo", label: "Novos" },
  { key: "contato", label: "Contato" },
  { key: "qualificacao", label: "Qualificação" },
  { key: "visita", label: "Visita" },
  { key: "proposta", label: "Proposta" },
  { key: "negociacao", label: "Negociação" },
] as const;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function stringValue(row: DataRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function numberValue(row: DataRow, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function dateValue(row: DataRow, ...keys: string[]) {
  const value = stringValue(row, ...keys);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isDone(row: DataRow) {
  return ["done", "concluido", "concluida", "completed", "cancelado"].includes(
    normalized(row.status),
  );
}

function ownerId(row: DataRow) {
  return stringValue(row, "assigned_to", "broker_id", "owner_id", "user_id");
}

function developmentId(row: DataRow) {
  return stringValue(row, "development_id", "project_id");
}

function displayName(row: DataRow, fallback: string) {
  return stringValue(row, "name", "title", "full_name") || fallback;
}

function withinPeriod(row: DataRow, period: Period, referenceTime: number) {
  if (period === "all") return true;
  const date = dateValue(row, "created_at", "updated_at");
  if (!date) return true;
  return date.getTime() >= referenceTime - Number(period) * 86_400_000;
}

function relativeDate(row: DataRow, referenceTime: number) {
  const date = dateValue(row, "updated_at", "created_at", "due_at");
  if (!date) return "Data não informada";
  const diff = referenceTime - date.getTime();
  const days = Math.floor(Math.abs(diff) / 86_400_000);
  if (days === 0) return "Hoje";
  if (days === 1) return diff >= 0 ? "Ontem" : "Amanhã";
  return diff >= 0 ? `Há ${days} dias` : `Em ${days} dias`;
}

function leadPriority(lead: DataRow, referenceTime: number) {
  const score = numberValue(lead, "score", "score_ia");
  const nextAction = dateValue(lead, "next_action_at");
  const overdue = nextAction ? nextAction.getTime() < referenceTime : false;
  return score + (overdue ? 30 : 0) + (!ownerId(lead) ? 20 : 0);
}

function openCopilot(prompt: string, context: DataRow) {
  window.dispatchEvent(
    new CustomEvent("atlas:open-copilot", { detail: { prompt, context } }),
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [moduleHealth, setModuleHealth] = useState<ModuleHealth[]>(INITIAL_MODULE_HEALTH);
  const [period, setPeriod] = useState<Period>("30");
  const [decisionPeriod, setDecisionPeriod] = useState<DecisionPeriod>("day");
  const [commandMode, setCommandMode] = useState<CommandMode>("focus");
  const [project, setProject] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [viewerId, setViewerId] = useState("");
  const [superintendentSummary, setSuperintendentSummary] = useState<SuperintendentSummary | null>(null);
  const [teamSla, setTeamSla] = useState<TeamSlaSummary | null>(null);
  const [predictiveBriefing, setPredictiveBriefing] = useState<PredictiveBriefing | null>(null);
  const [brokerDaily, setBrokerDaily] = useState<BrokerDaily | null>(null);
  const [managerDaily, setManagerDaily] = useState<ManagerDaily | null>(null);
  const [directorDaily, setDirectorDaily] = useState<DirectorDaily | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(DASHBOARD_PERIOD_KEY) || "{}") as { period?: Period; decisionPeriod?: DecisionPeriod };
      if (["7", "30", "90", "all"].includes(saved.period || "")) setPeriod(saved.period!);
      if (["day", "week", "month"].includes(saved.decisionPeriod || "")) setDecisionPeriod(saved.decisionPeriod!);
      const savedMode = window.localStorage.getItem(COMMAND_MODE_KEY);
      if (savedMode === "focus" || savedMode === "complete") setCommandMode(savedMode);
    } catch {
      window.sessionStorage.removeItem(DASHBOARD_PERIOD_KEY);
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(DASHBOARD_PERIOD_KEY, JSON.stringify({ period, decisionPeriod }));
  }, [decisionPeriod, period]);

  useEffect(() => {
    window.localStorage.setItem(COMMAND_MODE_KEY, commandMode);
  }, [commandMode]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) throw new Error("ATLAS_SESSION_REQUIRED");

      const response = await fetch("/api/v1/core-v2/module-health", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => null) as ModuleHealthApiEnvelope | null;
      if (!response.ok || !body?.ok || !body.data) throw new Error("ATLAS_MODULE_HEALTH_UNAVAILABLE");

      setViewerId(session.user.id);
      setData(body.data.snapshot);
      setModuleHealth(body.data.health.modules);
      setWarnings(
        body.data.health.modules
          .filter((module) => module.state !== "operational")
          .map((module) => `${module.label}: ${module.detail}.`),
      );
      setLastUpdated(new Date(body.data.generatedAt));
    } catch {
      setData(emptyData);
      setModuleHealth(
        INITIAL_MODULE_HEALTH.map((module) => ({
          ...module,
          state: "unavailable",
          detail: "Conexão temporariamente indisponível",
          write: {
            ...module.write,
            label: "Leitura necessária",
            detail: "Restabeleça a leitura antes de alterar dados",
            href: module.href,
            actionLabel: "Revisar módulo",
            blockers: ["module-read-unavailable"],
          },
        })),
      );
      setWarnings(["Não foi possível atualizar o Command Center agora. Seus dados permanecem protegidos."]);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void load(), 700);
    };
    const channel = supabase
      .channel("atlas-command-center-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
      .subscribe((status) => setLiveConnected(status === "SUBSCRIBED"));
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      setLiveConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const projectMap = useMemo(
    () =>
      new Map(
        data.developments.map((item) => [
          String(item.id),
          displayName(item, "Projeto sem nome"),
        ]),
      ),
    [data.developments],
  );
  const referenceTime = lastUpdated?.getTime() ?? 0;
  const viewer = data.profiles.find((profile) => String(profile.id) === viewerId);
  const viewerRole = viewer ? normalized(stringValue(viewer, "commercial_role", "role")) : "";
  const isDirector = viewerRole === "director" || stringValue(viewer ?? {}, "role") === "admin";
  const isSuperintendent = viewerRole === "superintendent";
  const isManager = viewerRole === "manager";
  const isBroker = viewerRole === "broker";

  useEffect(() => {
    if (!isDirector) { setDirectorDaily(null); return; }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/director-daily", { headers: { Authorization: `Bearer ${session.session?.access_token || ""}` }, cache: "no-store" });
      const body = await response.json();
      if (!active) return;
      if (response.ok) setDirectorDaily(body.data as DirectorDaily);
      else setWarnings((current) => [...current, "Visão executiva temporariamente indisponível."]);
    });
    return () => { active = false; };
  }, [isDirector]);

  useEffect(() => {
    if (viewerRole !== "superintendent") { setSuperintendentSummary(null); return; }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/dashboard", { headers: { Authorization: `Bearer ${session.session?.access_token || ""}` }, cache: "no-store" });
      const body = await response.json();
      if (active) { if (response.ok) setSuperintendentSummary(body.data); else setWarnings((current) => [...current, "Painel da superintendência temporariamente indisponível."]); }
    });
    return () => { active = false; };
  }, [viewerRole]);

  useEffect(() => {
    if (viewerRole !== "manager") { setManagerDaily(null); return; }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/manager-daily", { headers: { Authorization: `Bearer ${session.session?.access_token || ""}` }, cache: "no-store" });
      const body = await response.json();
      if (!active) return;
      if (response.ok) setManagerDaily(body.data as ManagerDaily);
      else setWarnings((current) => [...current, "Cockpit diário do gerente temporariamente indisponível."]);
    });
    return () => { active = false; };
  }, [viewerRole]);

  useEffect(() => {
    if (viewerRole !== "manager") { setTeamSla(null); return; }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/team-sla", { headers: { Authorization: `Bearer ${session.session?.access_token || ""}` }, cache: "no-store" });
      const body = await response.json();
      if (active) { if (response.ok) setTeamSla(body.data); else setWarnings((current) => [...current, "Fila de SLA temporariamente indisponível."]); }
    });
    return () => { active = false; };
  }, [viewerRole]);

  useEffect(() => {
    if (!viewerId) return;
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/ai/briefing", { headers: { Authorization: `Bearer ${session.session?.access_token || ""}` }, cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      if (active) setPredictiveBriefing(body as PredictiveBriefing);
    });
    return () => { active = false; };
  }, [viewerId]);

  useEffect(() => {
    if (!isBroker) { setBrokerDaily(null); return; }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/broker-daily", { headers: { Authorization: `Bearer ${session.session?.access_token || ""}` }, cache: "no-store" });
      const body = await response.json();
      if (!active) return;
      if (response.ok) setBrokerDaily(body.data as BrokerDaily);
      else setWarnings((current) => [...current, "Sua agenda diária está temporariamente indisponível."]);
    });
    return () => { active = false; };
  }, [isBroker]);

  const leads = useMemo(
    () =>
      data.leads.filter(
        (lead) =>
          withinPeriod(lead, period, referenceTime) &&
          (project === "all" || developmentId(lead) === project),
      ),
    [data.leads, period, project, referenceTime],
  );

  const opportunities = useMemo(
    () =>
      data.opportunities.filter(
        (item) =>
          withinPeriod(item, period, referenceTime) &&
          (project === "all" || developmentId(item) === project),
      ),
    [data.opportunities, period, project, referenceTime],
  );

  const tasks = useMemo(
    () =>
      data.tasks.filter(
        (task) =>
          (project === "all" || developmentId(task) === project) &&
          withinPeriod(task, period, referenceTime),
      ),
    [data.tasks, period, project, referenceTime],
  );

  const metrics = useMemo(() => {
    const activeLeads = leads.filter(
      (lead) => !["ganho", "perdido", "arquivado", "comprou_outro"].includes(normalized(lead.status)),
    );
    const hot = activeLeads.filter(
      (lead) =>
        normalized(lead.temperature) === "quente" ||
        numberValue(lead, "score", "score_ia") >= 70,
    );
    const unassigned = activeLeads.filter((lead) => !ownerId(lead));
    const overdue = tasks.filter((task) => {
      const dueAt = dateValue(task, "due_at");
      return !isDone(task) && dueAt && dueAt.getTime() < referenceTime;
    });
    const visits = tasks.filter(
      (task) => !isDone(task) && normalized(displayName(task, "")).includes("visita"),
    );
    const pipeline = opportunities.reduce(
      (sum, item) => sum + numberValue(item, "value", "amount", "budget_max"),
      0,
    );
    const leadPipeline = activeLeads.reduce(
      (sum, item) => sum + numberValue(item, "budget_max", "budget"),
      0,
    );
    const metaLeads = activeLeads.filter((lead) => stringValue(lead, "source") === "Meta Lead Ads");
    const metaQualified = metaLeads.filter((lead) => ["qualificacao", "visita", "proposta", "contrato"].includes(normalized(lead.status)) || numberValue(lead, "score") >= 60).length;
    const metaLearning = metaLeads.filter((lead) => { const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as DataRow : {}; const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as DataRow : {}; return meta.dataSharingConsent === true; }).length;
    const metaAwaitingContact = metaLeads.filter((lead) => !dateValue(lead, "last_interaction_at")).length;
    const wonOpportunities = opportunities.filter((item) => Boolean(dateValue(item, "won_at")) || ["ganho", "won", "fechado"].includes(normalized(item.stage)));
    const commissionOpen = wonOpportunities.filter((item) => !dateValue(item, "commission_received_at"));
    const commissionOverdue = commissionOpen.filter((item) => { const due = dateValue(item, "commission_due_at"); return due && due.getTime() < referenceTime; });
    const commissionDueSoon = commissionOpen.filter((item) => { const due = dateValue(item, "commission_due_at"); if (!due) return false; const remaining = due.getTime() - referenceTime; return remaining >= 0 && remaining <= 7 * 86_400_000; });
    const commissionReceivable = commissionOpen.reduce((sum, item) => sum + Math.max(0, numberValue(item, "commission_net") - numberValue(item, "commission_received_amount")), 0);
    const commissionUnconfigured = wonOpportunities.filter((item) => numberValue(item, "commission_net") <= 0).length;
    return {
      active: activeLeads.length,
      hot: hot.length,
      unassigned: unassigned.length,
      overdue: overdue.length,
      visits: visits.length,
      pipeline: pipeline || leadPipeline,
      metaActive: metaLeads.length,
      metaQualified,
      metaLearning,
      metaAwaitingContact,
      commissionOverdue: commissionOverdue.length,
      commissionDueSoon: commissionDueSoon.length,
      commissionReceivable,
      commissionUnconfigured,
    };
  }, [leads, opportunities, referenceTime, tasks]);

  const commissionQueue = useMemo(() => opportunities
    .filter((item) => (Boolean(dateValue(item, "won_at")) || ["ganho", "won", "fechado"].includes(normalized(item.stage))) && !dateValue(item, "commission_received_at"))
    .map((item) => ({ row: item, due: dateValue(item, "commission_due_at"), remaining: Math.max(0, numberValue(item, "commission_net") - numberValue(item, "commission_received_amount")) }))
    .sort((a, b) => (a.due?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.due?.getTime() ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 6), [opportunities]);

  const teamPerformance = useMemo(() => data.profiles
    .filter((profile) => stringValue(profile, "commercial_role", "role") === "broker")
    .map((profile) => {
      const id = String(profile.id);
      const portfolio = leads.filter((lead) => ownerId(lead) === id);
      const won = portfolio.filter((lead) => normalized(lead.status) === "ganho").length;
      const hot = portfolio.filter((lead) => normalized(lead.temperature) === "quente" || numberValue(lead, "score") >= 70).length;
      const overdue = portfolio.filter((lead) => { const due = dateValue(lead, "next_action_at"); return due && due.getTime() < referenceTime; }).length;
      return { id, name: displayName(profile, "Corretor"), total: portfolio.length, active: portfolio.filter((lead) => !["ganho", "perdido", "comprou_outro"].includes(normalized(lead.status))).length, won, hot, overdue, conversion: portfolio.length ? Math.round(won / portfolio.length * 100) : 0 };
    })
    .sort((a, b) => b.won - a.won || b.hot - a.hot || b.total - a.total), [data.profiles, leads, referenceTime]);

  const funnel = useMemo(() => {
    const rows = stageOrder.map((stage) => ({
      ...stage,
      count: leads.filter((lead) => normalized(lead.status) === stage.key).length,
    }));
    return { rows, max: Math.max(1, ...rows.map((item) => item.count)) };
  }, [leads]);

  const chartPoints = useMemo(() =>
    funnel.rows.map((stage, index) => ({
      ...stage,
      x: funnel.rows.length === 1 ? 50 : 4 + (index / (funnel.rows.length - 1)) * 92,
      y: 88 - (stage.count / funnel.max) * 70,
    })), [funnel]);
  const chartLine = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");

  const priorities = useMemo(
    () =>
      leads
        .filter((lead) => !["ganho", "perdido", "comprou_outro"].includes(normalized(lead.status)))
        .sort((a, b) => leadPriority(b, referenceTime) - leadPriority(a, referenceTime))
        .slice(0, 6),
    [leads, referenceTime],
  );

  const unassignedLeads = useMemo(
    () =>
      leads
        .filter((lead) => !ownerId(lead))
        .sort((a, b) => numberValue(b, "score") - numberValue(a, "score"))
        .slice(0, 5),
    [leads],
  );

  const dueTasks = useMemo(
    () => tasks.filter((task) => !isDone(task)).slice(0, 5),
    [tasks],
  );

  const recentActivity = useMemo(() => {
    const leadEvents = leads.slice(0, 8).map((lead) => ({
      id: `lead-${String(lead.id)}`,
      title: displayName(lead, "Lead sem nome"),
      detail: `Lead · ${stringValue(lead, "status") || "novo"}`,
      date: dateValue(lead, "updated_at", "created_at")?.getTime() ?? 0,
      row: lead,
    }));
    const taskEvents = tasks.slice(0, 8).map((task) => ({
      id: `task-${String(task.id)}`,
      title: displayName(task, "Tarefa"),
      detail: `Tarefa · ${stringValue(task, "status") || "pendente"}`,
      date: dateValue(task, "updated_at", "created_at", "due_at")?.getTime() ?? 0,
      row: task,
    }));
    return [...leadEvents, ...taskEvents].sort((a, b) => b.date - a.date).slice(0, 6);
  }, [leads, tasks]);

  const visibleProjects = useMemo(
    () =>
      data.developments.map((development) => {
        const id = String(development.id);
        const projectLeads = data.leads.filter((lead) => developmentId(lead) === id);
        return {
          id,
          name: displayName(development, "Projeto sem nome"),
          status: stringValue(development, "status") || "ativo",
          leads: projectLeads.length,
          hot: projectLeads.filter(
            (lead) =>
              normalized(lead.temperature) === "quente" ||
              numberValue(lead, "score") >= 70,
          ).length,
        };
      }),
    [data.developments, data.leads],
  );

  const activeInsights = useMemo(
    () =>
      data.insights
        .filter((insight) => !["dismissed", "archived"].includes(normalized(insight.status)))
        .slice(0, 4),
    [data.insights],
  );

  const decisionReports = useMemo(() => {
    const windows: Array<{ key: DecisionPeriod; label: string; days: number }> = [
      { key: "day", label: "Hoje", days: 1 },
      { key: "week", label: "7 dias", days: 7 },
      { key: "month", label: "30 dias", days: 30 },
    ];
    return Object.fromEntries(windows.map(({ key, label, days }) => {
      const since = referenceTime - days * 86_400_000;
      const createdLeads = data.leads.filter((lead) => (dateValue(lead, "created_at")?.getTime() ?? 0) >= since);
      const movedLeads = data.leads.filter((lead) => (dateValue(lead, "updated_at")?.getTime() ?? 0) >= since);
      const won = data.opportunities.filter((opportunity) => normalized(opportunity.stage) === "ganho" && (dateValue(opportunity, "won_at", "updated_at", "created_at")?.getTime() ?? 0) >= since);
      const completedTasks = data.tasks.filter((task) => isDone(task) && (dateValue(task, "updated_at", "created_at")?.getTime() ?? 0) >= since);
      const conversion = createdLeads.length ? Math.round((won.length / createdLeads.length) * 1000) / 10 : 0;
      const relationship = createdLeads.filter((lead) => ["indicacao", "referral", "recorrente", "recompra", "cliente_antigo"].some((signal) => normalized(stringValue(lead, "source", "origin", "lead_source")).includes(signal))).length;
      return [key, { label, created: createdLeads.length, moved: movedLeads.length, won: won.length, completed: completedTasks.length, conversion, relationship }];
    })) as Record<DecisionPeriod, { label: string; created: number; moved: number; won: number; completed: number; conversion: number; relationship: number }>;
  }, [data.leads, data.opportunities, data.tasks, referenceTime]);

  const roleActions = useMemo(() => {
    if (isDirector) {
      const risks = directorDaily?.risks.slice(0, 3).map((risk) => ({
        title: risk.reason,
        detail: `${risk.area} · evidência executiva da organização`,
        action: risk.action,
        href: "/reports",
        priority: risk.severity === "critical" ? "Agora" : "Revisar",
      })) ?? [];
      return {
        eyebrow: "Rotina da diretoria",
        title: "Decisões que exigem atenção",
        mission: "Atuar por exceção: proteger receita, remover riscos e confirmar cada decisão sensível com evidência e aprovação humana.",
        items: risks,
      };
    }
    if (isSuperintendent) {
      const interventions = superintendentSummary?.interventions.slice(0, 3).map((item) => ({
        title: item.managerName,
        detail: item.reason,
        action: item.action,
        href: item.href,
        priority: item.severity === "critical" ? "Agora" : item.severity === "attention" ? "Apoiar" : "Equilibrar",
      })) ?? [];
      return {
        eyebrow: "Rotina da superintendência",
        title: "Onde apoiar os gerentes",
        mission: "Comparar somente sua estrutura direta e intervir onde SLA, carga ou conversão exigem apoio comprovado.",
        items: interventions,
      };
    }
    if (isManager) {
      const interventions = managerDaily?.interventions.slice(0, 3).map((item) => ({
        title: item.brokerName,
        detail: item.reason,
        action: item.action,
        href: item.href,
        priority: item.severity === "critical" ? "Agora" : item.severity === "attention" ? "Intervir" : "Equilibrar",
      })) ?? [];
      return {
        eyebrow: "Rotina do gerente",
        title: "Onde o time precisa de você",
        mission: "Atuar como coach: remover gargalos, garantir SLA e orientar os corretores sem retirar sua autonomia.",
        items: interventions,
      };
    }
    const items = priorities.slice(0, 3).map((lead) => {
      const nextAction = dateValue(lead, "next_action_at");
      const overdue = Boolean(nextAction && nextAction.getTime() < referenceTime);
      return {
        title: displayName(lead, "Lead"),
        detail: `${stringValue(lead, "status") || "novo"} · score ${numberValue(lead, "score", "score_ia")}`,
        action: overdue ? "Fazer o follow-up vencido agora" : "Executar e registrar a próxima ação",
        href: `/leads/${String(lead.id)}`,
        priority: overdue ? "Agora" : "Prioridade",
      };
    });
    return {
      eyebrow: "Rotina do corretor",
      title: "O que fazer agora",
      mission: "Cuidar do cliente e do próprio negócio: atender, avançar a próxima ação e registrar o resultado para a IA reduzir trabalho administrativo.",
      items,
    };
  }, [directorDaily, isDirector, isManager, isSuperintendent, managerDaily, priorities, referenceTime, superintendentSummary]);

  const roleSummaryLoading = (isDirector && !directorDaily)
    || (isSuperintendent && !superintendentSummary)
    || (isManager && !managerDaily)
    || (isBroker && !brokerDaily);
  const fallbackCommandHref = isDirector
    ? "/reports"
    : isSuperintendent || isManager
      ? "/distribution"
      : "/leads";
  const primaryCommand = roleActions.items[0] ?? {
    title: roleSummaryLoading ? "Preparando sua prioridade" : "Nenhuma exceção crítica no seu escopo",
    detail: roleSummaryLoading ? "Consolidando os dados permitidos para o seu papel." : "A operação visível não apresenta uma ação urgente agora.",
    action: roleSummaryLoading ? "Aguarde a consolidação ou atualize os dados" : "Revise a carteira e confirme as próximas ações",
    href: fallbackCommandHref,
    priority: roleSummaryLoading ? "Atualizando" : "Em dia",
  };
  const commandStatus = roleSummaryLoading
    ? "Atualizando"
    : roleActions.items.length
      ? "Ação necessária"
      : "Em dia";

  const selectedDecisionReport = decisionReports[decisionPeriod];
  const predictiveSignal = predictiveBriefing?.signals[0];
  const aiDecision = isManager
    ? (teamSla?.totals.alerts ?? 0) > 0
      ? `Comece pelos ${teamSla?.totals.brokersWithAlerts ?? 0} corretores com SLA vencido. Combine responsável e prazo ainda hoje.`
      : predictiveSignal ? `${predictiveSignal.evidence} ${predictiveSignal.action}` : "O time está sem alertas críticos. Use o dia para revisar conversão, qualidade das próximas ações e coaching."
    : selectedDecisionReport.relationship > 0
      ? `${selectedDecisionReport.relationship} novos leads vieram de relacionamento neste período. Priorize resposta pessoal, peça contexto da indicação e planeje o próximo contato.`
    : predictiveSignal
      ? `${predictiveSignal.evidence} ${predictiveSignal.action}`
    : metrics.overdue > 0
      ? `Resolva primeiro os ${metrics.overdue} itens atrasados e depois avance os leads quentes. Registre cada resultado para melhorar a próxima recomendação.`
    : "Sua operação está em dia. Priorize leads quentes e confirme uma próxima ação com data em cada atendimento.";

  const decisionBrief = useMemo(() => {
    const atRiskValue = priorities.reduce((sum, lead) => sum + numberValue(lead, "value", "estimated_value", "potential_value"), 0);
    const happened = metrics.overdue > 0
      ? `${metrics.overdue} ações estão fora do prazo.`
      : metrics.unassigned > 0
        ? `${metrics.unassigned} leads ainda estão sem responsável.`
        : `${metrics.hot} oportunidades quentes estão no recorte atual.`;
    const why = metrics.overdue > 0
      ? "O prazo da próxima ação venceu sem conclusão registrada."
      : metrics.unassigned > 0
        ? "A distribuição ainda não associou um responsável único."
        : "Score e temperatura indicam intenção comercial acima da média da carteira.";
    const action = isDirector
      ? (directorDaily?.risks[0]?.action || aiDecision)
      : isManager
        ? (managerDaily?.interventions[0]?.action || aiDecision)
        : brokerDaily?.priorities[0]?.nextBestAction || aiDecision;
    const impact = atRiskValue > 0
      ? `${brl.format(atRiskValue)} associados às prioridades visíveis, sem promessa de fechamento.`
      : metrics.pipeline > 0
        ? `${brl.format(metrics.pipeline)} no pipeline aberto; impacto depende de avanço e probabilidade registrados.`
        : "Impacto financeiro ainda não mensurável: complete valor e probabilidade das oportunidades.";
    return { happened, why, action, impact };
  }, [aiDecision, brokerDaily, directorDaily, isDirector, isManager, managerDaily, metrics.hot, metrics.overdue, metrics.pipeline, metrics.unassigned, priorities]);

  const aiContext = {
    period,
    project: project === "all" ? "Todos os projetos" : projectMap.get(project),
    metrics,
    priorities: priorities.map((lead) => ({
      id: lead.id,
      name: displayName(lead, "Lead"),
      score: numberValue(lead, "score"),
      status: stringValue(lead, "status"),
      assigned: Boolean(ownerId(lead)),
    })),
    overdueTasks: metrics.overdue,
    insights: activeInsights.map((insight) => ({
      title: displayName(insight, "Insight"),
      recommendation: stringValue(insight, "recommendation", "summary"),
    })),
  };
  const viewerFirstName = displayName(viewer ?? {}, "Usuário Atlas").split(/\s+/)[0];
  const viewerRoleLabel = isDirector
    ? "Diretoria"
    : isSuperintendent
      ? "Superintendência"
      : isManager
        ? "Gerência"
        : "Corretor";
  const aiMode: { label: string; detail: string; tone: "success" | "info" | "warning" } = predictiveBriefing?.model.generativeReady
    ? { label: "IA generativa online", detail: "Modelo e inteligência operacional disponíveis", tone: "success" }
    : predictiveBriefing?.model.localIntelligenceReady
      ? { label: "Inteligência local ativa", detail: "Prioridades calculadas sem depender do modelo externo", tone: "info" }
      : { label: "Preparando inteligência", detail: "Consolidando os sinais permitidos para o seu perfil", tone: "warning" };
  const copilotPrompts = isDirector
    ? [
        "Qual é o maior risco comercial hoje e qual decisão exige minha aprovação?",
        "Quais campanhas estão mais próximas de gerar receita real?",
        "Onde há VGV parado e qual ação executiva tem maior impacto?",
      ]
    : isSuperintendent
      ? [
          "Qual gerente precisa de apoio hoje e por quê?",
          "Onde a distribuição entre equipes está desequilibrada?",
          "Resuma os gargalos de conversão da minha estrutura.",
        ]
      : isManager
        ? [
            "Quais corretores e leads precisam da minha intervenção hoje?",
            "Onde o time está perdendo velocidade no funil?",
            "Prepare um plano curto de coaching para os atrasos atuais.",
          ]
        : [
            "Quais leads devo priorizar hoje e por quê?",
            "Prepare minha agenda comercial com as próximas melhores ações.",
            "Crie uma abordagem para reativar meus clientes sem resposta.",
          ];

  if (loading) return <LoadingState rows={6} />;
  if (viewer && viewer.active !== true) return <ErrorState title="Perfil aguardando ativação" description="Seu login está correto, mas o perfil comercial está inativo. Um administrador deve ativar seu acesso antes de abrir a operação." action={<Link href="/settings/profile" className="atlas-button-secondary">Ver situação do perfil</Link>} />;
  if (!viewerRole) return <ErrorState title="Perfil comercial não identificado" description="Seu usuário está autenticado, mas ainda não possui um papel comercial ativo nesta organização." action={<Link href="/settings/profile" className="atlas-button-secondary">Revisar meu perfil</Link>} />;

  return (
    <div className="atlas-command-shell space-y-6 pb-10" data-command-mode={commandMode} data-dashboard-layout="decision-first" data-copilot-command-center="role-aware" data-ai-mode={predictiveBriefing?.model.generativeReady ? "generative" : predictiveBriefing?.model.localIntelligenceReady ? "local" : "preparing"}>
      <section className="atlas-command-hero">
        <div className="atlas-command-hero-copy">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">{isDirector ? "COMMAND CENTER DIRETORIA" : isSuperintendent ? "PAINEL DA SUPERINTENDÊNCIA" : isManager ? "COMMAND CENTER DO TIME" : "MINHA OPERAÇÃO"}</StatusBadge>
            <StatusBadge tone={aiMode.tone}>{aiMode.label.toUpperCase()}</StatusBadge>
          </div>
          <h1>{isDirector ? <>Decida onde a operação <span className="atlas-gradient-text">exige atenção.</span></> : isSuperintendent ? <>Veja qual gerente <span className="atlas-gradient-text">precisa de apoio.</span></> : isManager ? <>Intervenha onde o time <span className="atlas-gradient-text">mais precisa.</span></> : <>Comece pela ação com <span className="atlas-gradient-text">maior prioridade.</span></>}</h1>
          <p>
            {isDirector ? "Receita, risco e próxima decisão organizados por exceção, dentro do seu escopo autorizado." : isSuperintendent ? "Gerentes diretos, SLA e carga comercial consolidados sem misturar estruturas paralelas." : isManager ? "Corretores diretos, gargalos e próxima intervenção em uma fila curta e explicável." : "Leads, tarefas e próximos contatos ordenados para você agir sem procurar em várias telas."}
          </p>
          <div className="atlas-command-actions">
            <Link href={primaryCommand.href} className="atlas-button-primary">
              Agir agora
            </Link>
            <button
              type="button"
              className="atlas-button-secondary"
              onClick={() =>
                openCopilot(
                  `Explique por que esta é a próxima prioridade e prepare um plano curto, sem executar nenhuma ação: ${primaryCommand.title}. ${primaryCommand.action}`,
                  { ...aiContext, primaryCommand },
                )
              }
            >
              ✦ Explicar com IA
            </button>
            <button type="button" className="atlas-button-secondary atlas-command-refresh" onClick={() => void load()} aria-label="Atualizar dados do Command Center">
              ↻
            </button>
          </div>
        </div>
        <div className="atlas-command-pulse atlas-command-pulse-with-robot" aria-live="polite">
          <Image className="atlas-dashboard-robot" src="/brand/atlas-robot-assistant.png" alt="Assistente Atlas, robô de inteligência comercial" width={240} height={360} priority />
          <div className="atlas-command-pulse-head">
            <div>
              <span>Próxima decisão</span>
              <strong>{commandStatus}</strong>
            </div>
            <div className="atlas-command-priority-count">
              <b>{roleActions.items.length}</b>
              <span>prioridades visíveis</span>
            </div>
          </div>
          <div className="atlas-command-primary-signal">
            <strong>{primaryCommand.title}</strong>
            <p>{primaryCommand.detail}</p>
            <Link href={primaryCommand.href}>{primaryCommand.action} →</Link>
          </div>
          <div className="atlas-command-pulse-grid">
            <div><strong>{metrics.hot}</strong><span>quentes</span></div>
            <div><strong>{metrics.overdue}</strong><span>atrasadas</span></div>
            <div><strong>{metrics.unassigned}</strong><span>sem corretor</span></div>
          </div>
          <small>
            {lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Sincronizando dados"}
          </small>
        </div>
      </section>

      <section className="atlas-copilot-commandbar" data-phase="60-atlas-copilot-command-center" aria-label="Atlas Copilot AI">
        <div className="atlas-copilot-commandbar-copy">
          <span className="atlas-copilot-commandbar-icon" aria-hidden="true">✦</span>
          <div>
            <p>ATLAS COPILOT AI · {viewerRoleLabel}</p>
            <h2>{viewerFirstName}, seu assistente comercial está acompanhando a operação.</h2>
            <span>{aiMode.detail}. A IA sugere; você confirma antes de qualquer ação.</span>
          </div>
        </div>
        <div className="atlas-copilot-commandbar-prompts" aria-label="Perguntas rápidas ao Copilot">
          {copilotPrompts.map((question) => (
            <button key={question} type="button" onClick={() => openCopilot(question, { ...aiContext, viewerRole: viewerRoleLabel })}>
              {question}
            </button>
          ))}
          <button type="button" className="atlas-copilot-commandbar-primary" onClick={() => openCopilot("Analise minha operação e indique as três próximas ações com maior impacto comercial.", { ...aiContext, viewerRole: viewerRoleLabel })}>
            Conversar com o Copilot →
          </button>
        </div>
      </section>

      <section className="atlas-dashboard-toolbar" aria-label="Filtros do Command Center">
        <div>
          <label htmlFor="period">Período</label>
          <select id="period" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="all">Todo o histórico</option>
          </select>
        </div>
        <div>
          <label htmlFor="project">Projeto</label>
          <select id="project" value={project} onChange={(event) => setProject(event.target.value)}>
            <option value="all">Todos os projetos</option>
            {data.developments.map((item) => (
              <option key={String(item.id)} value={String(item.id)}>
                {displayName(item, "Projeto sem nome")}
              </option>
            ))}
          </select>
        </div>
        <span>{loading ? "Carregando operação..." : `${leads.length} leads no recorte atual`}</span>
        <div className="atlas-command-mode" role="group" aria-label="Nível de detalhe do Command Center">
          <button type="button" aria-pressed={commandMode === "focus"} onClick={() => setCommandMode("focus")}>Foco diário</button>
          <button type="button" aria-pressed={commandMode === "complete"} onClick={() => setCommandMode("complete")}>Análise completa</button>
        </div>
      </section>

      <section className="atlas-command-detail grid gap-2 sm:grid-cols-2 xl:grid-cols-5" aria-label="Saúde operacional dos módulos">
        {moduleHealth.map((module) => (
          <article key={module.id} className="rounded-2xl border border-white/[.06] bg-white/[.018] p-3 transition hover:border-sky-300/20 hover:bg-white/[.035]">
            <Link href={module.href} className="group flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${module.state === "operational" ? "bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.7)]" : module.state === "degraded" ? "bg-amber-300" : "bg-rose-400"}`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">{module.label}</p>
                <p className="truncate text-[10px] text-slate-500">{module.detail}</p>
              </div>
              {module.count !== null ? <span className="ml-auto text-xs font-semibold text-slate-400">{module.count}</span> : <span className="ml-auto text-xs text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-sky-300">→</span>}
            </Link>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[.05] pt-2">
              <span className={`text-[9px] font-bold uppercase tracking-[.12em] ${module.write.state === "ready" ? "text-emerald-300" : module.write.state === "source-mediated" ? "text-sky-300" : "text-amber-300"}`}>{module.write.label}</span>
              <Link href={module.write.href} className="text-[10px] font-semibold text-slate-400 transition hover:text-white" title={module.write.detail}>{module.write.actionLabel} →</Link>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-[26px] border border-cyan-400/10 bg-gradient-to-r from-cyan-500/[.055] via-white/[.018] to-violet-500/[.055] p-4 sm:p-5" aria-label="Briefing de decisão do Command Center">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">Decision Engine · leitura executável</p><h2 className="mt-1 text-lg font-semibold text-white">Da evidência para a próxima decisão</h2></div><StatusBadge tone={liveConnected ? "success" : "neutral"}>{liveConnected ? "TEMPO REAL" : "ATUALIZAÇÃO SEGURA"}</StatusBadge></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[
          ["O que aconteceu", decisionBrief.happened],
          ["Por que aconteceu", decisionBrief.why],
          ["O que fazer agora", decisionBrief.action],
          ["Impacto financeiro", decisionBrief.impact],
        ].map(([title, detail]) => <article key={title} className="rounded-2xl border border-white/[.065] bg-[#07101f]/70 p-4"><h3 className="text-sm font-semibold text-white">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p></article>)}</div>
      </section>

      {warnings.length ? (
        <ErrorState
          title="Atualização parcial do Command Center"
          description={warnings.join(" · ")}
          action={<button type="button" className="atlas-button-secondary" onClick={() => void load()}>Tentar novamente</button>}
        />
      ) : null}

      {isBroker ? (
        <section className="atlas-command-detail rounded-[28px] border border-sky-400/15 bg-gradient-to-br from-sky-500/[.09] via-slate-950/75 to-cyan-500/[.05] p-5 sm:p-6" data-phase="21-broker-daily">
          <PageHeader eyebrow="Meu dia" title="Seu plano comercial em 60 segundos" description="Somente sua carteira: quem atender agora, por que entrou na fila e qual é a próxima melhor ação." action={{ href: "/pipeline", label: "Abrir meu pipeline", priority: "secondary" }} />
          {!brokerDaily ? <LoadingState rows={4} /> : <div className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="Leads ativos" value={brokerDaily.summary.activeLeads} />
              <MetricCard label="Leads quentes" value={brokerDaily.summary.hotLeads} detail="Alta intenção ou score ≥ 70" tone="danger" />
              <MetricCard label="Sem primeiro contato" value={brokerDaily.summary.firstContactOverdue} detail="SLA inicial vencido" tone={brokerDaily.summary.firstContactOverdue ? "danger" : "success"} />
              <MetricCard label="Follow-ups vencidos" value={brokerDaily.summary.followUpOverdue} detail="Próxima ação atrasada" tone={brokerDaily.summary.followUpOverdue ? "warning" : "success"} />
              <MetricCard label="Tarefas abertas" value={brokerDaily.summary.openTasks} detail={`${brokerDaily.summary.overdueTasks} atrasadas`} tone={brokerDaily.summary.overdueTasks ? "warning" : "success"} />
              <MetricCard label="Agenda 7 dias" value={brokerDaily.summary.agendaNext7Days} detail="Compromissos próximos" tone="violet" />
            </div>
            <div className="grid gap-5 xl:grid-cols-[1.35fr_.8fr]">
              <div className="rounded-2xl border border-white/[.07] bg-slate-950/45 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-cyan-300">Fila explicável</p><h2 className="mt-1 text-lg font-bold text-white">Comece por aqui</h2></div></div>
                {brokerDaily.priorities.length ? <div className="mt-4 grid gap-3">{brokerDaily.priorities.map((item, index) => <Link href={`/leads/${item.leadId}`} key={item.leadId} className="group rounded-2xl border border-white/[.06] bg-white/[.025] p-4 transition hover:border-cyan-300/25 hover:bg-white/[.045]"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cyan-400/10 text-xs font-black text-cyan-200">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-white">{item.leadName}</strong><StatusBadge tone={item.reason.includes("SLA") || item.reason.includes("vencido") || item.reason.includes("atrasada") ? "danger" : item.hot ? "warning" : "info"}>{item.reason}</StatusBadge></div><p className="mt-2 text-sm text-slate-300">{item.nextBestAction}</p><p className="mt-2 text-[11px] text-slate-500">Score {item.score} · etapa {item.status} · {item.conversionProbability}% conversão{item.dueAt ? ` · prazo ${new Date(item.dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</p></div><span className="text-cyan-200 transition group-hover:translate-x-1">→</span></div></Link>)}</div> : <EmptyState title="Prioridades concluídas" description="Sua carteira não possui ação urgente neste momento." />}
              </div>
              <aside className="rounded-2xl border border-white/[.07] bg-slate-950/45 p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-300">Agenda prática</p><h2 className="mt-1 text-lg font-bold text-white">Próximos 7 dias</h2></div><Link href="/calendar" className="text-xs font-semibold text-violet-200">Calendário →</Link></div>{brokerDaily.agenda.length ? <div className="mt-4 grid gap-3">{brokerDaily.agenda.map((item) => <Link href={item.leadId ? `/leads/${item.leadId}` : "/tasks"} key={item.id} className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-white">{item.title}</strong>{item.overdue ? <StatusBadge tone="danger">ATRASADA</StatusBadge> : <StatusBadge tone="violet">AGENDADA</StatusBadge>}</div><p className="mt-2 text-xs text-slate-500">{new Date(item.dueAt).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p></Link>)}</div> : <EmptyState title="Agenda livre" description="Nenhuma tarefa com prazo nos próximos sete dias." />}<div className="mt-4 rounded-xl border border-cyan-400/10 bg-cyan-500/[.05] p-3"><p className="text-xs font-semibold text-cyan-100">Como a IA priorizou</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Score, SLA do primeiro contato, follow-up, tarefa atrasada, temperatura e ausência de próxima ação. A decisão final continua com você.</p></div></aside>
            </div>
            <div className="rounded-2xl border border-rose-400/15 bg-gradient-to-br from-rose-500/[.06] to-transparent p-4 sm:p-5" data-phase="100-proactive-attention-signals">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-rose-300">Sinais de atenção</p><h2 className="mt-1 text-lg font-bold text-white">Leads que precisam de atenção agora</h2></div><StatusBadge tone={brokerDaily.attention.queue.length ? "danger" : "success"}>{brokerDaily.attention.queue.length ? `${brokerDaily.attention.queue.length} SINALIZADOS` : "CARTEIRA EM DIA"}</StatusBadge></div>
              {brokerDaily.attention.queue.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{brokerDaily.attention.queue.map((item) => <Link href={`/leads/${item.leadId}`} key={item.leadId} className="group rounded-2xl border border-white/[.06] bg-white/[.025] p-4 transition hover:border-rose-300/25 hover:bg-white/[.045]"><div className="flex items-start justify-between gap-3"><div><strong className="text-white group-hover:text-rose-100">{item.leadName}</strong><p className="mt-1 text-xs text-slate-500">Score {item.score} · etapa {item.status}</p></div><StatusBadge tone={item.topSeverity === "critical" ? "danger" : item.topSeverity === "warning" ? "warning" : "info"}>{item.topSeverity === "critical" ? "CRÍTICO" : item.topSeverity === "warning" ? "ATENÇÃO" : "INFO"}</StatusBadge></div><p className="mt-3 text-xs text-rose-200">{item.topReason}</p>{item.signals.length > 1 ? <p className="mt-1 text-[11px] text-slate-500">+{item.signals.length - 1} outro{item.signals.length - 1 === 1 ? "" : "s"} sinal{item.signals.length - 1 === 1 ? "" : "is"} ativo{item.signals.length - 1 === 1 ? "" : "s"}</p> : null}</Link>)}</div> : <EmptyState title="Nenhum sinal ativo" description="Nenhum lead da sua carteira está parado na etapa, com follow-up vencido ou quente sem contato recente." />}
              <details className="mt-4">
                <summary className="cursor-pointer text-[11px] font-semibold text-slate-500">Como os sinais são calculados</summary>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">{brokerDaily.attention.rules.staleStage} {brokerDaily.attention.rules.followUpOverdue} {brokerDaily.attention.rules.highScoreNoContact}</p>
              </details>
            </div>
          </div>}
        </section>
      ) : null}

      <section className="rounded-[28px] border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[.08] via-slate-950/70 to-violet-500/[.07] p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.35fr_.9fr]">
          <div>
            <PageHeader eyebrow={roleActions.eyebrow} title={roleActions.title} description={roleActions.mission} />
            {roleActions.items.length ? <div className="mt-4 grid gap-3">
              {roleActions.items.map((item) => <Link key={`${item.title}-${item.href}`} href={item.href} className="group flex flex-col gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-cyan-300/25 hover:bg-white/[.045] sm:flex-row sm:items-center sm:justify-between">
                <div><div className="flex items-center gap-2"><StatusBadge tone={item.priority === "Agora" || item.priority === "Intervir" ? "danger" : "info"}>{item.priority.toUpperCase()}</StatusBadge><strong className="text-white">{item.title}</strong></div><p className="mt-2 text-xs text-slate-400">{item.detail}</p></div>
                <span className="text-sm font-semibold text-cyan-200 group-hover:text-white">{item.action} →</span>
              </Link>)}
            </div> : <EmptyState title={isManager ? "Time sem exceções críticas" : "Fila de prioridades concluída"} description={isManager ? "Nenhum corretor direto exige intervenção agora." : "Não há lead ativo exigindo ação imediata neste recorte."} />}
          </div>
          <aside className="rounded-2xl border border-white/[.08] bg-slate-950/55 p-4 sm:p-5" aria-label="Relatório simples para decisão">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-300">Relatório para decisão</p><h2 className="mt-1 text-lg font-bold text-white">Resumo simples da operação</h2></div><StatusBadge tone="violet">IA OPERACIONAL</StatusBadge></div>
            <div className="mt-4 flex gap-2" role="group" aria-label="Período do relatório">
              {(["day", "week", "month"] as DecisionPeriod[]).map((key) => <button key={key} type="button" aria-pressed={decisionPeriod === key} onClick={() => setDecisionPeriod(key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${decisionPeriod === key ? "bg-white text-slate-950" : "border border-white/10 text-slate-400 hover:text-white"}`}>{decisionReports[key].label}</button>)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[{ label: "Novos leads", value: selectedDecisionReport.created }, { label: "Leads movimentados", value: selectedDecisionReport.moved }, { label: "Vendas ganhas", value: selectedDecisionReport.won }, { label: "Indicação e recompra", value: selectedDecisionReport.relationship }].map((metric) => <div key={metric.label} className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"><strong className="text-xl text-white">{metric.value}</strong><p className="mt-1 text-[11px] text-slate-500">{metric.label}</p></div>)}
            </div>
            <div className="mt-4 rounded-xl border border-violet-400/15 bg-violet-500/[.07] p-4"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-violet-200">✦ Recomendação preditiva Atlas</p>{predictiveSignal ? <StatusBadge tone={predictiveSignal.severity === "critical" ? "danger" : predictiveSignal.severity === "attention" ? "warning" : "success"}>{predictiveSignal.severity === "critical" ? "RISCO" : predictiveSignal.severity === "attention" ? "ATENÇÃO" : "OPORTUNIDADE"}</StatusBadge> : null}</div><p className="mt-2 text-sm leading-6 text-slate-300">{aiDecision}</p>{predictiveSignal ? <Link href={predictiveSignal.href} className="mt-3 inline-flex text-xs font-semibold text-violet-200 hover:text-white">Preparar ação sugerida →</Link> : null}</div>
          </aside>
        </div>
      </section>

      {isDirector ? <section className="rounded-[28px] border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[.09] via-slate-950/80 to-violet-500/[.06] p-5 sm:p-6" data-phase="24-director-command-center"><PageHeader eyebrow="Command Center executivo" title="Empresa, caixa, campanhas, IA e riscos" description="Visão consolidada da organização para decidir com evidência. Forecast é ponderado pela probabilidade registrada no CRM; recomendações não alteram orçamento, pessoas ou carteira automaticamente." action={{ href: "/reports", label: "Abrir relatórios", priority: "secondary" }} />{!directorDaily ? <LoadingState rows={6} /> : <div className="mt-5 space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><MetricCard label="Pipeline bruto" value={brl.format(directorDaily.financial.pipelineGross)} detail={`${brl.format(directorDaily.financial.forecastWeighted)} ponderado`} tone="violet" /><MetricCard label="Vendas ganhas" value={brl.format(directorDaily.financial.wonValue)} detail={`${directorDaily.commercial.won} leads ganhos`} tone="success" /><MetricCard label="Comissões a receber" value={brl.format(directorDaily.financial.commissionReceivable)} detail={`${directorDaily.financial.commissionOverdue} vencidas`} tone={directorDaily.financial.commissionOverdue ? "danger" : "success"} /><MetricCard label="Conversão geral" value={`${directorDaily.commercial.conversionRate}%`} detail={`${directorDaily.commercial.activeLeads} leads ativos`} /><MetricCard label="Campanhas" value={directorDaily.marketing.campaigns} detail={`${directorDaily.marketing.campaignsWithSample} com amostra decisória`} tone="warning" /><MetricCard label="IA em 30 dias" value={directorDaily.ai.calls30d} detail={`US$ ${directorDaily.ai.estimatedCostUsd30d.toFixed(2)} medidos`} tone="violet" /></div><div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><div className="space-y-4"><div className="overflow-x-auto rounded-2xl border border-white/[.07]"><div className="border-b border-white/[.06] p-4"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-cyan-300">Liderança comercial</p><h2 className="mt-1 text-lg font-bold text-white">Superintendências diretas</h2></div><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-white/[.035] text-slate-500"><tr><th className="p-3">Superintendente</th><th className="p-3">Gerentes</th><th className="p-3">Corretores</th><th className="p-3">Ativos</th><th className="p-3">Ganhos</th><th className="p-3">Conversão</th></tr></thead><tbody>{directorDaily.hierarchy.superintendents.map((item) => <tr key={item.superintendentId} className="border-t border-white/[.06]"><td className="p-3 font-semibold text-white">{item.superintendentName}</td><td className="p-3 text-slate-300">{item.managers}</td><td className="p-3 text-slate-300">{item.brokers}</td><td className="p-3 text-slate-300">{item.activeLeads}</td><td className="p-3 text-emerald-200">{item.won}</td><td className="p-3"><StatusBadge tone={item.conversionSampleSufficient ? "success" : "neutral"}>{item.conversionSampleSufficient ? `${item.conversionRate}%` : "AMOSTRA BAIXA"}</StatusBadge></td></tr>)}</tbody></table></div><div className="grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-300">Campanhas</p><div className="mt-3 grid gap-2">{directorDaily.marketing.ranking.slice(0, 4).map((campaign) => <Link href="/integrations/meta" key={campaign.id} className="rounded-xl border border-white/[.06] p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-white">{campaign.name}</strong><StatusBadge tone={campaign.sampleSufficient ? "success" : "neutral"}>{campaign.sampleSufficient ? `${campaign.conversionRate}%` : "AMOSTRA BAIXA"}</StatusBadge></div><p className="mt-1 text-[11px] text-slate-500">{campaign.leads} leads · {campaign.sales} vendas · {campaign.costPerLead === null ? "CPL indisponível" : `${brl.format(campaign.costPerLead)} CPL`}</p></Link>)}</div></div><div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-amber-300">Incorporadoras</p><div className="mt-3 grid gap-2">{directorDaily.developers.slice(0, 4).map((developer) => <Link href="/developments" key={developer.developerName} className="flex items-center justify-between rounded-xl border border-white/[.06] p-3"><div><strong className="text-sm text-white">{developer.developerName}</strong><p className="mt-1 text-[11px] text-slate-500">{developer.developments} projetos · {developer.leads} leads</p></div><span className="text-sm font-bold text-emerald-200">{developer.won} ganhos</span></Link>)}</div></div></div></div><aside className="rounded-2xl border border-white/[.07] bg-slate-950/45 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-rose-300">Fila do diretor</p><h2 className="mt-1 text-lg font-bold text-white">Decisões que exigem atenção</h2></div><StatusBadge tone={directorDaily.risks.length ? "danger" : "success"}>{directorDaily.risks.length ? "REVISAR" : "SAUDÁVEL"}</StatusBadge></div>{directorDaily.risks.length ? <div className="mt-4 grid gap-3">{directorDaily.risks.map((risk, index) => <div className="rounded-xl border border-white/[.06] bg-white/[.025] p-3" key={`${risk.area}-${index}`}><div className="flex items-center gap-2"><StatusBadge tone={risk.severity === "critical" ? "danger" : "warning"}>{risk.area.toUpperCase()}</StatusBadge><strong className="text-sm text-white">{risk.reason}</strong></div><p className="mt-2 text-xs font-semibold text-cyan-100">{risk.action}</p></div>)}</div> : <EmptyState title="Sem risco executivo crítico" description="Os controles comerciais e financeiros não apontam exceções relevantes agora." />}<div className="mt-4 rounded-xl border border-violet-400/15 bg-violet-500/[.06] p-3 text-xs leading-5 text-slate-400"><strong className="text-violet-200">Confiança do forecast:</strong> usa apenas valor e probabilidade atualmente registrados no CRM. Sem snapshot anterior, não afirma movimento nem causalidade.</div></aside></div><div className="flex flex-wrap gap-2"><StatusBadge tone="success">ORGANIZAÇÃO INTEIRA</StatusBadge><StatusBadge tone="info">FORECAST EXPLICÁVEL</StatusBadge><StatusBadge tone="violet">APROVAÇÃO HUMANA</StatusBadge><StatusBadge tone={directorDaily.hierarchy.gaps ? "warning" : "success"}>{directorDaily.hierarchy.gaps ? `${directorDaily.hierarchy.gaps} LACUNAS NA HIERARQUIA` : "HIERARQUIA ÍNTEGRA"}</StatusBadge></div></div>}</section> : null}

      {isSuperintendent ? (
        <section className="rounded-[28px] border border-sky-400/15 bg-gradient-to-br from-sky-500/[.09] via-slate-950/75 to-violet-500/[.05] p-5 sm:p-6" data-phase="23-superintendent-daily">
          <PageHeader eyebrow="Superintendência diária" title="Gerentes, equipes e prioridades sob seu comando" description="Comparação responsável somente entre gerentes diretamente subordinados. Estruturas paralelas, leads sem responsável e números da diretoria inteira ficam fora." action={{ href: "/distribution", label: "Ver liderança online", priority: "secondary" }} />
          {!superintendentSummary ? <LoadingState rows={5} /> : <div className="mt-5 space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><MetricCard label="Gerentes diretos" value={superintendentSummary.totals.managers} detail={`${superintendentSummary.totals.brokers} corretores subordinados`} tone="violet" /><MetricCard label="Equipe presente" value={superintendentSummary.totals.online} detail={`${superintendentSummary.totals.available} disponíveis agora`} tone="success" /><MetricCard label="Leads ativos" value={superintendentSummary.totals.activeLeads} detail={`${superintendentSummary.totals.hotLeads} quentes`} /><MetricCard label="Sem primeiro contato" value={superintendentSummary.totals.firstContactOverdue} detail="SLA inicial vencido" tone={superintendentSummary.totals.firstContactOverdue ? "danger" : "success"} /><MetricCard label="Follow-ups vencidos" value={superintendentSummary.totals.followUpOverdue} detail={`${superintendentSummary.totals.withoutNextAction} sem próxima ação`} tone={superintendentSummary.totals.followUpOverdue ? "warning" : "success"} /><MetricCard label="Equilíbrio entre equipes" value={superintendentSummary.distribution.imbalanced ? "Revisar" : "Equilibrado"} detail={`Média ${superintendentSummary.distribution.averageActivePerBroker} · diferença ${superintendentSummary.distribution.spread}`} tone={superintendentSummary.distribution.imbalanced ? "warning" : "success"} /></div><div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><div className="overflow-x-auto rounded-2xl border border-white/[.07]"><table className="w-full min-w-[1040px] text-left text-xs"><thead className="bg-white/[.035] text-slate-500"><tr><th className="p-3">Gerente</th><th className="p-3">Equipe</th><th className="p-3">Presença</th><th className="p-3">Ativos</th><th className="p-3">Quentes</th><th className="p-3">Sem contato</th><th className="p-3">Follow-up</th><th className="p-3">Sem ação</th><th className="p-3">Carga/corretor</th><th className="p-3">Conversão</th><th className="p-3">Entradas 7d</th></tr></thead><tbody>{superintendentSummary.managers.map((manager) => <tr key={manager.managerId} className="border-t border-white/[.06]"><td className="p-3 font-semibold text-white">{manager.managerName}</td><td className="p-3 text-slate-300">{manager.brokers}</td><td className="p-3 text-emerald-200">{manager.online}/{manager.brokers} online</td><td className="p-3 text-slate-300">{manager.activeLeads}</td><td className="p-3 text-amber-200">{manager.hotLeads}</td><td className="p-3 text-rose-200">{manager.firstContactOverdue}</td><td className="p-3 text-amber-200">{manager.followUpOverdue}</td><td className="p-3 text-slate-300">{manager.withoutNextAction}</td><td className="p-3 text-slate-300">{manager.averageActivePerBroker}</td><td className="p-3"><StatusBadge tone={manager.comparison === "below_benchmark" ? "warning" : manager.comparison === "at_or_above_benchmark" ? "success" : "neutral"}>{manager.conversionSampleSufficient ? `${manager.conversionRate}%` : "AMOSTRA BAIXA"}</StatusBadge></td><td className="p-3 text-slate-300">{manager.recentAssignments}</td></tr>)}</tbody></table></div><aside className="rounded-2xl border border-white/[.07] bg-slate-950/45 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-sky-300">Fila da superintendência</p><h2 className="mt-1 text-lg font-bold text-white">Onde apoiar os gerentes</h2></div><StatusBadge tone="violet">DECIDIR</StatusBadge></div>{superintendentSummary.interventions.length ? <div className="mt-4 grid gap-3">{superintendentSummary.interventions.map((item, index) => <Link href={item.href} key={`${item.managerId}-${index}`} className="rounded-xl border border-white/[.06] bg-white/[.025] p-3 transition hover:border-sky-300/20"><div className="flex items-center gap-2"><StatusBadge tone={item.severity === "critical" ? "danger" : item.severity === "attention" ? "warning" : "info"}>{item.severity === "critical" ? "AGORA" : item.severity === "attention" ? "ATENÇÃO" : "EQUILÍBRIO"}</StatusBadge><strong className="text-sm text-white">{item.managerName}</strong></div><p className="mt-2 text-xs text-slate-400">{item.reason}</p><p className="mt-2 text-xs font-semibold text-sky-100">{item.action} →</p></Link>)}</div> : <EmptyState title="Gestão sem exceções críticas" description="As equipes subordinadas estão sem gargalos relevantes neste momento." />}<p className="mt-4 text-[10px] leading-4 text-slate-600">Comparação de conversão exige pelo menos {superintendentSummary.benchmark.minimumLeadsPerTeam} leads por equipe. O painel recomenda apoio; não transfere leads nem altera metas automaticamente.</p></aside></div><div className="flex flex-wrap gap-2"><StatusBadge tone={superintendentSummary.reconciliation.matches ? "success" : "danger"}>{superintendentSummary.reconciliation.matches ? "TOTAIS CONFEREM" : "REVISAR TOTAIS"}</StatusBadge><StatusBadge tone="info">GERENTES DIRETOS</StatusBadge><StatusBadge tone="info">ESTRUTURAS PARALELAS EXCLUÍDAS</StatusBadge><StatusBadge tone="violet">DECISÃO HUMANA</StatusBadge></div></div>}
        </section>
      ) : null}

      {isManager ? <section className="rounded-[28px] border border-amber-400/15 bg-gradient-to-br from-amber-500/[.08] via-slate-950/75 to-sky-500/[.05] p-5 sm:p-6" data-phase="22-manager-daily"><PageHeader eyebrow="Gestão diária" title="Seu time, os gargalos e onde intervir" description="Somente corretores diretamente subordinados. A visão combina SLA, conversão, carga, distribuição e qualidade da carteira sem revelar equipes paralelas." action={{ href: "/distribution", label: "Abrir distribuição", priority: "secondary" }} />{!managerDaily ? <LoadingState rows={5} /> : <div className="mt-5 space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><MetricCard label="Corretores diretos" value={managerDaily.totals.brokers} detail={`${managerDaily.totals.online} online · ${managerDaily.totals.available} disponíveis`} /><MetricCard label="Leads ativos" value={managerDaily.totals.activeLeads} detail={`${managerDaily.totals.hotLeads} quentes`} tone="violet" /><MetricCard label="Sem primeiro contato" value={managerDaily.totals.firstContactOverdue} detail="SLA inicial vencido" tone={managerDaily.totals.firstContactOverdue ? "danger" : "success"} /><MetricCard label="Follow-ups vencidos" value={managerDaily.totals.followUpOverdue} detail="Recuperação necessária" tone={managerDaily.totals.followUpOverdue ? "warning" : "success"} /><MetricCard label="Sem próxima ação" value={managerDaily.totals.withoutNextAction} detail="Higiene da carteira" tone={managerDaily.totals.withoutNextAction ? "warning" : "success"} /><MetricCard label="Equilíbrio da carga" value={managerDaily.distribution.imbalanced ? "Revisar" : "Equilibrada"} detail={`Média ${managerDaily.distribution.averageActiveLeads} · diferença ${managerDaily.distribution.spread}`} tone={managerDaily.distribution.imbalanced ? "warning" : "success"} /></div><div className="grid gap-5 xl:grid-cols-[1.2fr_.85fr]"><div className="overflow-x-auto rounded-2xl border border-white/[.07]"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-white/[.035] text-slate-500"><tr><th className="p-3">Corretor</th><th className="p-3">Presença</th><th className="p-3">Ativos</th><th className="p-3">Quentes</th><th className="p-3">Sem contato</th><th className="p-3">Follow-up</th><th className="p-3">Sem ação</th><th className="p-3">Conversão</th><th className="p-3">Leads 24h</th></tr></thead><tbody>{managerDaily.brokers.map((broker) => <tr key={broker.brokerId} className="border-t border-white/[.06]"><td className="p-3 font-semibold text-white">{broker.brokerName}</td><td className="p-3"><StatusBadge tone={broker.availability === "available" ? "success" : broker.online ? "warning" : "neutral"}>{broker.availability === "available" ? "DISPONÍVEL" : broker.online ? "OCUPADO" : "OFFLINE"}</StatusBadge></td><td className="p-3 text-slate-300">{broker.activeLeads}</td><td className="p-3 text-amber-200">{broker.hotLeads}</td><td className="p-3 text-rose-200">{broker.firstContactOverdue}</td><td className="p-3 text-amber-200">{broker.followUpOverdue}</td><td className="p-3 text-slate-300">{broker.withoutNextAction}</td><td className="p-3 text-slate-300">{broker.conversionSampleSufficient ? `${broker.conversionRate}%` : "Amostra baixa"}</td><td className="p-3 text-slate-300">{broker.recentAssignments}</td></tr>)}</tbody></table></div><aside className="rounded-2xl border border-white/[.07] bg-slate-950/45 p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-amber-300">Fila do gerente</p><h2 className="mt-1 text-lg font-bold text-white">Intervenções necessárias</h2></div><StatusBadge tone="warning">COACHING</StatusBadge></div>{managerDaily.interventions.length ? <div className="mt-4 grid gap-3">{managerDaily.interventions.map((item, index) => <Link href={item.href} key={`${item.brokerId}-${index}`} className="rounded-xl border border-white/[.06] bg-white/[.025] p-3 transition hover:border-amber-300/20"><div className="flex items-center gap-2"><StatusBadge tone={item.severity === "critical" ? "danger" : item.severity === "attention" ? "warning" : "info"}>{item.severity === "critical" ? "AGORA" : item.severity === "attention" ? "ATENÇÃO" : "EQUILÍBRIO"}</StatusBadge><strong className="text-sm text-white">{item.brokerName}</strong></div><p className="mt-2 text-xs text-slate-400">{item.reason}</p><p className="mt-2 text-xs font-semibold text-amber-100">{item.action} →</p></Link>)}</div> : <EmptyState title="Time sem intervenção crítica" description="SLAs, carga e higiene da carteira estão dentro dos limites agora." />}<p className="mt-4 text-[10px] leading-4 text-slate-600">Conversão só é comparada com pelo menos 20 leads. Redistribuição é apenas sugerida e nunca rompe atendimento ativo automaticamente.</p></aside></div><div className="flex flex-wrap gap-2"><StatusBadge tone="success">TIME DIRETO</StatusBadge><StatusBadge tone="info">ESTRUTURAS PARALELAS EXCLUÍDAS</StatusBadge><StatusBadge tone="violet">DECISÃO HUMANA</StatusBadge></div></div>}</section> : null}

      {isManager ? <section className="rounded-[28px] border border-rose-400/15 bg-gradient-to-br from-rose-500/[.08] to-amber-500/[.04] p-5 sm:p-6" data-phase="35-follow-up-sla"><PageHeader eyebrow="SLA de follow-up" title="Cadência, atraso e recuperação do time" description="Compromissos cumpridos, recuperações e alertas somente dos corretores diretamente subordinados, medidos nos últimos 30 dias." />{!teamSla ? <LoadingState rows={3} /> : <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><MetricCard label="Cumprimento" value={teamSla.totals.followUpComplianceRate === null ? "—" : `${teamSla.totals.followUpComplianceRate}%`} detail={`${teamSla.totals.followUpsMeasured} follow-ups medidos`} tone={teamSla.totals.followUpComplianceRate === null ? "neutral" : teamSla.totals.followUpComplianceRate >= 80 ? "success" : "warning"} /><MetricCard label="Tempo de execução" value={teamSla.totals.averageFollowUpMinutes === null ? "—" : `${teamSla.totals.averageFollowUpMinutes} min`} detail="Do agendamento ao contato" /><MetricCard label="Recuperados" value={teamSla.totals.recoveredFollowUps} detail="Executados depois do prazo" tone="violet" /><MetricCard label="Follow-ups atrasados" value={teamSla.totals.followUpOverdue} detail="Próxima ação vencida agora" tone="warning" /><MetricCard label="Sem primeiro contato" value={teamSla.totals.firstContactOverdue} detail="SLA inicial vencido" tone="danger" /><MetricCard label="Corretores com alerta" value={teamSla.totals.brokersWithAlerts} detail="Somente meu time direto" tone="violet" /></div>{teamSla.alerts.length ? <div className="grid gap-3 lg:grid-cols-2">{teamSla.alerts.slice(0, 12).map((alert) => <a key={`${alert.kind}-${alert.leadId}`} href={`/leads/${alert.leadId}`} className="group rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-rose-300/25 hover:bg-white/[.04]"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white group-hover:text-rose-100">{alert.leadName}</p><p className="mt-1 text-xs text-slate-500">Responsável: {alert.brokerName}</p></div><StatusBadge tone={alert.kind === "first_contact" ? "danger" : "warning"}>{alert.kind === "first_contact" ? "SEM CONTATO" : "FOLLOW-UP"}</StatusBadge></div><p className="mt-3 text-xs text-rose-200">Atrasado há {alert.overdueMinutes < 60 ? `${alert.overdueMinutes} min` : `${Math.floor(alert.overdueMinutes / 60)}h`} · abrir Lead 360 →</p></a>)}</div> : <EmptyState title="SLAs do time em dia" description="Nenhum primeiro contato ou follow-up está vencido agora." />}</div>}</section> : null}

      <section className="atlas-command-detail atlas-command-metrics">
        <MetricCard label="Leads ativos" value={loading ? "—" : metrics.active} detail="Base em atendimento" />
        <MetricCard label="Leads quentes" value={loading ? "—" : metrics.hot} detail="Score ≥ 70 ou temperatura quente" tone="danger" />
        <MetricCard label="Sem responsável" value={loading ? "—" : metrics.unassigned} detail="Exigem distribuição manual" tone="warning" />
        <MetricCard label="Tarefas atrasadas" value={loading ? "—" : metrics.overdue} detail="Follow-ups fora do prazo" tone="danger" />
        <MetricCard label="Visitas" value={loading ? "—" : metrics.visits} detail="Visitas pendentes no período" tone="success" />
        <MetricCard label="Pipeline estimado" value={loading ? "—" : brl.format(metrics.pipeline)} detail="Potencial comercial aberto" tone="violet" />
        <MetricCard label="Leads Meta ativos" value={loading ? "—" : metrics.metaActive} detail={`${metrics.metaQualified} já qualificados`} tone="violet" />
        <MetricCard label="Meta com aprendizado" value={loading ? "—" : metrics.metaLearning} detail="Consentimento e sinal habilitados" tone="success" />
        <MetricCard label="Meta sem contato" value={loading ? "—" : metrics.metaAwaitingContact} detail="Precisam de primeira resposta" tone="warning" />
        {isDirector ? <><MetricCard label="Comissões a receber" value={loading ? "—" : brl.format(metrics.commissionReceivable)} detail={`${metrics.commissionDueSoon} vencem em até 7 dias`} tone="success" /><MetricCard label="Comissões atrasadas" value={loading ? "—" : metrics.commissionOverdue} detail="Exigem cobrança da incorporadora" tone="danger" /><MetricCard label="Vendas sem comissão" value={loading ? "—" : metrics.commissionUnconfigured} detail="Precisam de configuração financeira" tone="warning" /></> : null}
      </section>

      <section className="atlas-command-detail atlas-command-grid atlas-command-grid-main">
        <article className="atlas-command-panel">
          <PageHeader eyebrow="Conversão" title="Funil comercial" description="Distribuição real dos leads no período selecionado." action={{ href: "/pipeline", label: "Abrir pipeline", priority: "secondary" }} />
          {loading ? <LoadingState rows={4} /> : leads.length === 0 ? (
            <EmptyState title="Sem leads no período" description="Amplie o período ou cadastre o primeiro lead para iniciar o funil." />
          ) : (
            <div>
            <div className="atlas-modern-chart" aria-label="Gráfico moderno da evolução dos leads por etapa">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
                <defs>
                  <linearGradient id="atlasChartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity=".42" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="atlasChartLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#67e8f9" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                {[24, 48, 72].map((y) => <line key={y} x1="0" y1={y} x2="100" y2={y} className="atlas-chart-gridline" />)}
                <polygon points={`4,92 ${chartLine} 96,92`} fill="url(#atlasChartFill)" />
                <polyline points={chartLine} fill="none" stroke="url(#atlasChartLine)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
                {chartPoints.map((point) => <circle key={point.key} cx={point.x} cy={point.y} r="1.8" className="atlas-chart-dot" vectorEffect="non-scaling-stroke" />)}
              </svg>
              <div className="atlas-chart-labels">
                {chartPoints.map((point) => <span key={point.key}><strong>{point.count}</strong>{point.label}</span>)}
              </div>
            </div>
            <div className="atlas-funnel atlas-funnel-compact">
              {funnel.rows.map((stage) => (
                <div key={stage.key} className="atlas-funnel-row">
                  <span>{stage.label}</span>
                  <div><i style={{ width: `${Math.max(4, (stage.count / funnel.max) * 100)}%` }} /></div>
                  <strong>{stage.count}</strong>
                </div>
              ))}
            </div>
            </div>
          )}
        </article>

        <article className="atlas-command-panel atlas-ai-panel">
          <PageHeader eyebrow="Atlas Intelligence" title="Copilot operacional" description="Insights persistidos e análise sob demanda." />
          <div className="atlas-ai-orb atlas-ai-robot-orb" aria-hidden="true"><Image src="/brand/atlas-robot-assistant.png" alt="" width={74} height={111} /></div>
          <button
            type="button"
            className="atlas-ai-primary-action"
            onClick={() =>
              openCopilot(
                "Com base nestes indicadores, identifique riscos, oportunidades e recomende um plano objetivo para aumentar conversão.",
                aiContext,
              )
            }
          >
            Gerar briefing executivo
            <span>Usar contexto do dashboard →</span>
          </button>
          <div className="atlas-insight-stack">
            {activeInsights.length ? activeInsights.map((insight) => (
              <div key={String(insight.id)}>
                <span>✦</span>
                <p>
                  <strong>{displayName(insight, "Insight operacional")}</strong>
                  <small>{stringValue(insight, "recommendation", "summary") || "Revisar contexto e definir a próxima ação."}</small>
                </p>
              </div>
            )) : <p className="atlas-muted-copy">Nenhum insight persistido. O Copilot ainda pode analisar o snapshot atual sob demanda.</p>}
          </div>
        </article>
      </section>

      <section className="atlas-command-detail atlas-command-grid atlas-command-grid-triple">
        <article className="atlas-command-panel">
          <PageHeader eyebrow="Prioridades" title="Ações de hoje" description="Score, atraso e ausência de responsável combinados." action={{ href: "/leads", label: "Ver leads", priority: "secondary" }} />
          {loading ? <LoadingState rows={4} /> : priorities.length === 0 ? (
            <EmptyState title="Sem prioridades abertas" description="Não há leads ativos no recorte selecionado." />
          ) : (
            <div className="atlas-priority-list">
              {priorities.map((lead, index) => (
                <Link href={`/leads/${String(lead.id)}`} key={String(lead.id)}>
                  <span className="atlas-priority-rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="atlas-priority-copy">
                    <strong>{displayName(lead, "Lead sem nome")}</strong>
                    <small>{projectMap.get(developmentId(lead)) || "Projeto não informado"} · {stringValue(lead, "status") || "novo"}</small>
                  </span>
                  <span className="atlas-priority-score">{numberValue(lead, "score")}</span>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="atlas-command-panel">
          <PageHeader eyebrow="Distribuição" title="Sem responsável" description="Leads que precisam de atribuição manual." action={{ href: "/brokers", label: "Abrir corretores", priority: "secondary" }} />
          {loading ? <LoadingState rows={4} /> : unassignedLeads.length === 0 ? (
            <EmptyState title="Carteira distribuída" description="Nenhum lead sem responsável neste recorte." />
          ) : (
            <div className="atlas-compact-list">
              {unassignedLeads.map((lead) => (
                <Link href={`/leads/${String(lead.id)}`} key={String(lead.id)}>
                  <span className="atlas-list-avatar">{displayName(lead, "L").slice(0, 2).toUpperCase()}</span>
                  <span><strong>{displayName(lead, "Lead sem nome")}</strong><small>{projectMap.get(developmentId(lead)) || "Sem projeto"}</small></span>
                  <StatusBadge tone={numberValue(lead, "score") >= 70 ? "danger" : "warning"}>{numberValue(lead, "score")} pts</StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="atlas-command-panel">
          <PageHeader eyebrow="Execução" title="Próximas tarefas" description="Fila aberta ordenada por prazo." action={{ href: "/tasks", label: "Abrir tarefas", priority: "secondary" }} />
          {loading ? <LoadingState rows={4} /> : dueTasks.length === 0 ? (
            <EmptyState title="Fila limpa" description="Nenhuma tarefa pendente no período." />
          ) : (
            <div className="atlas-task-list">
              {dueTasks.map((task) => {
                const due = dateValue(task, "due_at");
                const overdue = due ? due.getTime() < referenceTime : false;
                return (
                  <Link href="/tasks" key={String(task.id)}>
                    <span data-overdue={overdue ? "true" : "false"} />
                    <p><strong>{displayName(task, "Tarefa")}</strong><small>{relativeDate(task, referenceTime)}</small></p>
                    <StatusBadge tone={overdue ? "danger" : "neutral"}>{stringValue(task, "priority") || "normal"}</StatusBadge>
                  </Link>
                );
              })}
            </div>
          )}
        </article>
      </section>

      {(isDirector || isManager) ? <section className="atlas-command-detail atlas-command-panel">
        <PageHeader eyebrow={isDirector ? "Performance comercial" : "Gestão do time"} title={isDirector ? "Corretores e carteiras" : "Números de cada corretor"} description="Carteira, leads quentes, atrasos e conversão dentro do seu escopo hierárquico." action={{ href: "/brokers", label: "Abrir equipe", priority: "secondary" }} />
        {loading ? <LoadingState rows={4} /> : teamPerformance.length === 0 ? <EmptyState title="Nenhum corretor visível" description="Vincule corretores à hierarquia para acompanhar o desempenho." /> : <div className="atlas-team-performance">
          {teamPerformance.map((broker, index) => <Link href={`/leads?assigned_to=${broker.id}`} key={broker.id}>
            <span className="atlas-priority-rank">{String(index + 1).padStart(2, "0")}</span>
            <p><strong>{broker.name}</strong><small>{broker.active} ativos · {broker.hot} quentes · {broker.overdue} atrasados</small></p>
            <div><b>{broker.won}</b><span>vendas</span></div>
            <div><b>{broker.conversion}%</b><span>conversão</span></div>
          </Link>)}
        </div>}
      </section> : null}

      {isDirector ? <section className="atlas-command-detail atlas-command-panel">
        <PageHeader eyebrow="Recebíveis" title="Comissões sob atenção" description="Prioridade financeira por vencimento, saldo e incorporadora." action={{ href: "/sales", label: "Abrir vendas", priority: "secondary" }} />
        {loading ? <LoadingState rows={4} /> : commissionQueue.length === 0 ? (
          <EmptyState title="Nenhuma comissão pendente" description="Vendas ganhas com valores a receber aparecerão nesta fila." />
        ) : (
          <div className="atlas-commission-grid">
            {commissionQueue.map((item) => {
              const overdue = item.due ? item.due.getTime() < referenceTime : false;
              const unconfigured = numberValue(item.row, "commission_net") <= 0;
              return <Link href="/sales" key={String(item.row.id)}>
                <div><StatusBadge tone={unconfigured || overdue ? "danger" : "warning"}>{unconfigured ? "CONFIGURAR" : overdue ? "ATRASADA" : "A RECEBER"}</StatusBadge><span>{item.due ? item.due.toLocaleDateString("pt-BR") : "Sem vencimento"}</span></div>
                <strong>{displayName(item.row, "Venda ganha")}</strong>
                <p><span>Saldo</span><b>{unconfigured ? "Não informado" : brl.format(item.remaining)}</b></p>
              </Link>;
            })}
          </div>
        )}
      </section> : null}

      <section className="atlas-command-detail atlas-command-grid atlas-command-grid-bottom">
        <article className="atlas-command-panel">
          <PageHeader eyebrow="Portfólio" title="Projetos" description="Volume e temperatura dos leads por empreendimento." action={{ href: "/developments", label: "Abrir Launch OS", priority: "secondary" }} />
          {loading ? <LoadingState rows={3} /> : visibleProjects.length === 0 ? (
            <EmptyState title="Nenhum projeto cadastrado" description="Cadastre projetos reais para segmentar a operação." />
          ) : (
            <div className="atlas-project-grid">
              {visibleProjects.slice(0, 6).map((item) => (
                <Link href={`/developments/${item.id}`} key={item.id}>
                  <div><StatusBadge tone="success">{item.status}</StatusBadge><span>↗</span></div>
                  <strong>{item.name}</strong>
                  <p><span>{item.leads} leads</span><span>{item.hot} quentes</span></p>
                </Link>
              ))}
            </div>
          )}
        </article>

        <article className="atlas-command-panel">
          <PageHeader eyebrow="Timeline" title="Atividades recentes" description="Últimas movimentações visíveis da operação." />
          {loading ? <LoadingState rows={5} /> : recentActivity.length === 0 ? (
            <EmptyState title="Sem atividade recente" description="Novos leads e tarefas aparecerão aqui." />
          ) : (
            <div className="atlas-timeline">
              {recentActivity.map((activity) => (
                <div key={activity.id}>
                  <i />
                  <p><strong>{activity.title}</strong><span>{activity.detail}</span></p>
                  <time>{relativeDate(activity.row, referenceTime)}</time>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
