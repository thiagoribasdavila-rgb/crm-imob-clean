"use client";

import Link from "next/link";
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
};

const emptyData: DashboardData = {
  leads: [],
  opportunities: [],
  tasks: [],
  insights: [],
  developments: [],
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

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all([
      supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("opportunities").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("tasks").select("*").order("due_at", { ascending: true, nullsFirst: false }).limit(300),
      supabase.from("ai_insights").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("developments").select("*").order("name", { ascending: true }).limit(100),
    ]);

    const labels = ["Leads", "Pipeline", "Tarefas", "Inteligência", "Projetos"];
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
    });
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
    };
  }, [leads, opportunities, referenceTime, tasks]);

  const funnel = useMemo(() => {
    const rows = stageOrder.map((stage) => ({
      ...stage,
      count: leads.filter((lead) => normalized(lead.status) === stage.key).length,
    }));
    return { rows, max: Math.max(1, ...rows.map((item) => item.count)) };
  }, [leads]);

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
            <StatusBadge tone="info">COMMAND CENTER</StatusBadge>
            <StatusBadge tone="success">DADOS REAIS</StatusBadge>
            <StatusBadge tone="violet">ATLAS COPILOT</StatusBadge>
          </div>
          <h1>
            Sua operação, prioridades e IA em{" "}
            <span className="atlas-gradient-text">uma única visão.</span>
          </h1>
          <p>
            Acompanhe conversão, gargalos, tarefas e projetos. O Atlas organiza o
            contexto real para transformar sinais comerciais em próximas ações.
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
        <div className="atlas-command-pulse">
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

      <section className="atlas-command-metrics">
        <MetricCard label="Leads ativos" value={loading ? "—" : metrics.active} detail="Base em atendimento" trend="LIVE" />
        <MetricCard label="Leads quentes" value={loading ? "—" : metrics.hot} detail="Score ≥ 70 ou temperatura quente" trend="HOT" tone="danger" />
        <MetricCard label="Sem responsável" value={loading ? "—" : metrics.unassigned} detail="Exigem distribuição manual" trend="AÇÃO" tone="warning" />
        <MetricCard label="Tarefas atrasadas" value={loading ? "—" : metrics.overdue} detail="Follow-ups fora do prazo" trend="SLA" tone="danger" />
        <MetricCard label="Visitas" value={loading ? "—" : metrics.visits} detail="Visitas pendentes no período" trend="AGENDA" tone="success" />
        <MetricCard label="Pipeline estimado" value={loading ? "—" : brl.format(metrics.pipeline)} detail="Potencial comercial aberto" trend="VGV" tone="violet" />
        <MetricCard label="Leads Meta ativos" value={loading ? "—" : metrics.metaActive} detail={`${metrics.metaQualified} já qualificados`} trend="META" tone="violet" />
        <MetricCard label="Meta com aprendizado" value={loading ? "—" : metrics.metaLearning} detail="Consentimento e sinal habilitados" trend="CAPI" tone="success" />
      </section>

      <section className="atlas-command-grid atlas-command-grid-main">
        <article className="atlas-command-panel">
          <PageHeader eyebrow="Conversão" title="Funil comercial" description="Distribuição real dos leads no período selecionado." actions={<Link href="/pipeline">Abrir pipeline →</Link>} />
          {loading ? <LoadingState rows={4} /> : leads.length === 0 ? (
            <EmptyState title="Sem leads no período" description="Amplie o período ou cadastre o primeiro lead para iniciar o funil." />
          ) : (
            <div className="atlas-funnel">
              {funnel.rows.map((stage) => (
                <div key={stage.key} className="atlas-funnel-row">
                  <span>{stage.label}</span>
                  <div><i style={{ width: `${Math.max(4, (stage.count / funnel.max) * 100)}%` }} /></div>
                  <strong>{stage.count}</strong>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="atlas-command-panel atlas-ai-panel">
          <PageHeader eyebrow="Atlas Intelligence" title="Copilot operacional" description="Insights persistidos e análise sob demanda." />
          <div className="atlas-ai-orb" aria-hidden="true"><span>✦</span></div>
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
