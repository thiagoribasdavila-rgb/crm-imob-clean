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

type DataRow = Record<string, unknown>;
type Period = "7" | "30" | "90" | "all";
type DashboardData = {
  leads: DataRow[];
  opportunities: DataRow[];
  tasks: DataRow[];
  insights: DataRow[];
  developments: DataRow[];
  profiles: DataRow[];
};
type SuperintendentSummary = { scope: { role: "superintendent"; directManagersOnly: boolean; parallelStructuresExcluded: boolean; unassignedExcluded: boolean }; totals: { managers: number; brokers: number; leads: number; activeLeads: number; hotLeads: number; overdueLeads: number; won: number; potentialVgv: number }; managers: Array<{ managerId: string; managerName: string; brokers: number; leads: number; activeLeads: number; hotLeads: number; overdueLeads: number; won: number; conversionRate: number; potentialVgv: number }>; reconciliation: { managerLeadSum: number; scopedLeadCount: number; matches: boolean }; generatedAt: string };

const emptyData: DashboardData = {
  leads: [],
  opportunities: [],
  tasks: [],
  insights: [],
  developments: [],
  profiles: [],
};

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
  const [period, setPeriod] = useState<Period>("30");
  const [project, setProject] = useState("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [viewerId, setViewerId] = useState("");
  const [superintendentSummary, setSuperintendentSummary] = useState<SuperintendentSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("opportunities").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("tasks").select("*").order("due_at", { ascending: true, nullsFirst: false }).limit(300),
      supabase.from("ai_insights").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("developments").select("*").order("name", { ascending: true }).limit(100),
      supabase.from("profiles").select("id,full_name,role,commercial_role,reports_to,active").eq("active", true).limit(300),
    ]);

    const labels = ["Leads", "Pipeline", "Tarefas", "Inteligência", "Projetos", "Equipe"];
    setWarnings(
      results.flatMap((result, index) =>
        result.error ? [`${labels[index]}: ${result.error.message}`] : [],
      ),
    );
    setData({
      leads: (results[0].data ?? []) as DataRow[],
      opportunities: (results[1].data ?? []) as DataRow[],
      tasks: (results[2].data ?? []) as DataRow[],
      insights: (results[3].data ?? []) as DataRow[],
      developments: (results[4].data ?? []) as DataRow[],
      profiles: (results[5].data ?? []) as DataRow[],
    });
    const { data: authData } = await supabase.auth.getUser();
    setViewerId(authData.user?.id || "");
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
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
  const viewerRole = stringValue(viewer ?? {}, "commercial_role", "role") || "broker";
  const isDirector = viewerRole === "director" || stringValue(viewer ?? {}, "role") === "admin";
  const isSuperintendent = viewerRole === "superintendent";
  const isManager = viewerRole === "manager";

  useEffect(() => {
    if (viewerRole !== "superintendent") { setSuperintendentSummary(null); return; }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const response = await fetch("/api/v1/analytics/dashboard", { headers: { Authorization: `Bearer ${session.session?.access_token || ""}` }, cache: "no-store" });
      const body = await response.json();
      if (active) { if (response.ok) setSuperintendentSummary(body.data); else setWarnings((current) => [...current, body.error?.message || "Painel da superintendência indisponível."]); }
    });
    return () => { active = false; };
  }, [viewerRole]);

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

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-command-hero">
        <div className="atlas-command-hero-copy">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">{isDirector ? "COMMAND CENTER DIRETORIA" : isSuperintendent ? "PAINEL DA SUPERINTENDÊNCIA" : isManager ? "COMMAND CENTER DO TIME" : "MINHA OPERAÇÃO"}</StatusBadge>
            <StatusBadge tone="success">DADOS REAIS</StatusBadge>
            <StatusBadge tone="violet">ATLAS COPILOT</StatusBadge>
          </div>
          <h1>{isDirector ? <>Toda a empresa, decisões e IA em <span className="atlas-gradient-text">uma única visão.</span></> : isSuperintendent ? <>Seus gerentes e equipes em <span className="atlas-gradient-text">uma visão comparativa.</span></> : isManager ? <>Seu time, carteira e conversão em <span className="atlas-gradient-text">tempo real.</span></> : <>Suas prioridades comerciais em <span className="atlas-gradient-text">uma única visão.</span></>}</h1>
          <p>
            {isDirector ? "Acompanhe equipes, conversão, campanhas, projetos, recebíveis e decisões estratégicas." : isSuperintendent ? "Compare somente os gerentes que respondem a você, com totais reconciliados e estruturas paralelas excluídas." : isManager ? "Acompanhe todos os corretores sob sua gestão, gargalos, SLA, tarefas e oportunidades do time." : "Organize seus leads, tarefas, próximos contatos e oportunidades prioritárias."}
          </p>
          <div className="atlas-command-actions">
            <button
              type="button"
              className="atlas-button-primary"
              onClick={() =>
                openCopilot(
                  "Analise o snapshot atual da operação e liste as 5 ações mais importantes para hoje, com justificativa e ordem de execução.",
                  aiContext,
                )
              }
            >
              ✦ Analisar operação com IA
            </button>
            <Link href="/leads/new" className="atlas-button-secondary">+ Novo lead</Link>
            <button type="button" className="atlas-button-secondary" onClick={() => void load()}>
              Atualizar
            </button>
          </div>
        </div>
        <div className="atlas-command-pulse atlas-command-pulse-with-robot">
          <Image className="atlas-dashboard-robot" src="/brand/atlas-robot-assistant.png" alt="Assistente Atlas, robô de inteligência comercial" width={240} height={360} priority />
          <div className="atlas-command-pulse-head">
            <div>
              <span>Saúde comercial</span>
              <strong>Operação agora</strong>
            </div>
            <b>{Math.max(0, Math.min(100, 100 - metrics.overdue * 4 - metrics.unassigned * 2))}</b>
          </div>
          <div className="atlas-health-track">
            <span
              style={{
                width: `${Math.max(4, Math.min(100, 100 - metrics.overdue * 4 - metrics.unassigned * 2))}%`,
              }}
            />
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
      </section>

      {warnings.length ? (
        <ErrorState
          title="Alguns módulos estão indisponíveis"
          description={warnings.join(" · ")}
          action={<button type="button" className="atlas-button-secondary" onClick={() => void load()}>Tentar novamente</button>}
        />
      ) : null}

      {isSuperintendent ? (
        <section className="rounded-[28px] border border-sky-400/15 bg-gradient-to-br from-sky-500/[.09] to-violet-500/[.05] p-5 sm:p-6">
          <PageHeader eyebrow="Fase 34 · Escopo reconciliado" title="Comparativo dos gerentes subordinados" description="Somente gerentes que respondem diretamente a você e as equipes abaixo deles entram nesta visão." />
          {!superintendentSummary ? <LoadingState rows={3} /> : <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Gerentes" value={superintendentSummary.totals.managers} detail={`${superintendentSummary.totals.brokers} corretores subordinados`} trend="ESCOPO" tone="violet" /><MetricCard label="Leads das equipes" value={superintendentSummary.totals.leads} detail={`${superintendentSummary.totals.activeLeads} ativos · ${superintendentSummary.totals.hotLeads} quentes`} trend="CARTEIRA" /><MetricCard label="Vendas ganhas" value={superintendentSummary.totals.won} detail="Somente equipes subordinadas" trend="CONVERSÃO" tone="success" /><MetricCard label="VGV potencial" value={brl.format(superintendentSummary.totals.potentialVgv)} detail={`${superintendentSummary.totals.overdueLeads} leads atrasados`} trend="PIPELINE" tone={superintendentSummary.totals.overdueLeads ? "warning" : "success"} /></div><div className="overflow-x-auto rounded-2xl border border-white/[.07]"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-white/[.035] text-slate-500"><tr><th className="p-3">Gerente</th><th className="p-3">Corretores</th><th className="p-3">Leads</th><th className="p-3">Quentes</th><th className="p-3">Atrasados</th><th className="p-3">Ganhos</th><th className="p-3">Conversão</th><th className="p-3">VGV potencial</th></tr></thead><tbody>{superintendentSummary.managers.map((manager) => <tr key={manager.managerId} className="border-t border-white/[.06]"><td className="p-3 font-semibold text-white">{manager.managerName}</td><td className="p-3 text-slate-300">{manager.brokers}</td><td className="p-3 text-slate-300">{manager.leads}</td><td className="p-3 text-amber-200">{manager.hotLeads}</td><td className="p-3 text-rose-200">{manager.overdueLeads}</td><td className="p-3 text-emerald-200">{manager.won}</td><td className="p-3 text-slate-300">{manager.conversionRate}%</td><td className="p-3 text-slate-300">{brl.format(manager.potentialVgv)}</td></tr>)}</tbody></table></div><div className="flex flex-wrap gap-2"><StatusBadge tone={superintendentSummary.reconciliation.matches ? "success" : "danger"}>{superintendentSummary.reconciliation.matches ? "TOTAIS CONFEREM" : "REVISAR TOTAIS"}</StatusBadge><StatusBadge tone="info">ESTRUTURAS PARALELAS EXCLUÍDAS</StatusBadge><StatusBadge tone="info">SEM NÚMEROS DA DIRETORIA INTEIRA</StatusBadge></div></div>}
        </section>
      ) : null}

      <section className="atlas-command-metrics">
        <MetricCard label="Leads ativos" value={loading ? "—" : metrics.active} detail="Base em atendimento" trend="LIVE" />
        <MetricCard label="Leads quentes" value={loading ? "—" : metrics.hot} detail="Score ≥ 70 ou temperatura quente" trend="HOT" tone="danger" />
        <MetricCard label="Sem responsável" value={loading ? "—" : metrics.unassigned} detail="Exigem distribuição manual" trend="AÇÃO" tone="warning" />
        <MetricCard label="Tarefas atrasadas" value={loading ? "—" : metrics.overdue} detail="Follow-ups fora do prazo" trend="SLA" tone="danger" />
        <MetricCard label="Visitas" value={loading ? "—" : metrics.visits} detail="Visitas pendentes no período" trend="AGENDA" tone="success" />
        <MetricCard label="Pipeline estimado" value={loading ? "—" : brl.format(metrics.pipeline)} detail="Potencial comercial aberto" trend="VGV" tone="violet" />
        <MetricCard label="Leads Meta ativos" value={loading ? "—" : metrics.metaActive} detail={`${metrics.metaQualified} já qualificados`} trend="META" tone="violet" />
        <MetricCard label="Meta com aprendizado" value={loading ? "—" : metrics.metaLearning} detail="Consentimento e sinal habilitados" trend="CAPI" tone="success" />
        <MetricCard label="Meta sem contato" value={loading ? "—" : metrics.metaAwaitingContact} detail="Precisam de primeira resposta" trend="SPEED" tone="warning" />
        {isDirector ? <><MetricCard label="Comissões a receber" value={loading ? "—" : brl.format(metrics.commissionReceivable)} detail={`${metrics.commissionDueSoon} vencem em até 7 dias`} trend="CAIXA" tone="success" /><MetricCard label="Comissões atrasadas" value={loading ? "—" : metrics.commissionOverdue} detail="Exigem cobrança da incorporadora" trend="SLA" tone="danger" /><MetricCard label="Vendas sem comissão" value={loading ? "—" : metrics.commissionUnconfigured} detail="Precisam de configuração financeira" trend="AÇÃO" tone="warning" /></> : null}
      </section>

      <section className="atlas-command-grid atlas-command-grid-main">
        <article className="atlas-command-panel">
          <PageHeader eyebrow="Conversão" title="Funil comercial" description="Distribuição real dos leads no período selecionado." actions={<Link href="/pipeline">Abrir pipeline →</Link>} />
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

      <section className="atlas-command-grid atlas-command-grid-triple">
        <article className="atlas-command-panel">
          <PageHeader eyebrow="Prioridades" title="Ações de hoje" description="Score, atraso e ausência de responsável combinados." actions={<Link href="/leads">Ver leads →</Link>} />
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
          <PageHeader eyebrow="Distribuição" title="Sem responsável" description="Leads que precisam de atribuição manual." actions={<Link href="/brokers">Corretores →</Link>} />
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
          <PageHeader eyebrow="Execução" title="Próximas tarefas" description="Fila aberta ordenada por prazo." actions={<Link href="/tasks">Abrir tarefas →</Link>} />
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

      {(isDirector || isManager) ? <section className="atlas-command-panel">
        <PageHeader eyebrow={isDirector ? "Performance comercial" : "Gestão do time"} title={isDirector ? "Corretores e carteiras" : "Números de cada corretor"} description="Carteira, leads quentes, atrasos e conversão dentro do seu escopo hierárquico." actions={<Link href="/brokers">Abrir equipe →</Link>} />
        {loading ? <LoadingState rows={4} /> : teamPerformance.length === 0 ? <EmptyState title="Nenhum corretor visível" description="Vincule corretores à hierarquia para acompanhar o desempenho." /> : <div className="atlas-team-performance">
          {teamPerformance.map((broker, index) => <Link href={`/leads?assigned_to=${broker.id}`} key={broker.id}>
            <span className="atlas-priority-rank">{String(index + 1).padStart(2, "0")}</span>
            <p><strong>{broker.name}</strong><small>{broker.active} ativos · {broker.hot} quentes · {broker.overdue} atrasados</small></p>
            <div><b>{broker.won}</b><span>vendas</span></div>
            <div><b>{broker.conversion}%</b><span>conversão</span></div>
          </Link>)}
        </div>}
      </section> : null}

      {isDirector ? <section className="atlas-command-panel">
        <PageHeader eyebrow="Recebíveis" title="Comissões sob atenção" description="Prioridade financeira por vencimento, saldo e incorporadora." actions={<Link href="/sales">Abrir vendas →</Link>} />
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

      <section className="atlas-command-grid atlas-command-grid-bottom">
        <article className="atlas-command-panel">
          <PageHeader eyebrow="Portfólio" title="Projetos" description="Volume e temperatura dos leads por empreendimento." actions={<Link href="/developments">Launch OS →</Link>} />
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
