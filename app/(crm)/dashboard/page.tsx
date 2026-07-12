"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";

type Lead = { id: string; name: string | null; status: string | null; score: number | null; temperature: string | null; source: string | null; created_at: string | null; next_action_at: string | null };
type Opportunity = { id: string; stage: string; value: number | null; probability: number; expected_close_at: string | null; lead_id: string | null };
type Campaign = { id: string; name: string; spend: number; revenue: number; leads_count: number; status: string };
type Insight = { id: string; title: string; recommendation: string | null; confidence: number | null; score: number | null; status: string; created_at: string };
type Task = { id: string; title: string; priority: string; status: string; due_at: string | null };
type Property = { id: string; status: string | null; price: number | null };
type DashboardApiResponse = {
  ok?: boolean;
  data?: {
    leads?: Lead[];
    opportunities?: Opportunity[];
    campaigns?: Campaign[];
    insights?: Insight[];
    tasks?: Task[];
    properties?: Property[];
    partial?: boolean;
    errors?: Array<{ table: string; message: string }>;
  };
  error?: { message?: string };
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function statusTone(status?: string | null): "neutral" | "success" | "warning" | "danger" | "info" | "violet" {
  const value = (status ?? "").toLowerCase();
  if (["ganho", "won", "concluido", "concluída", "ativo"].includes(value)) return "success";
  if (["proposta", "qualificacao", "qualificação", "em_andamento"].includes(value)) return "violet";
  if (["perdido", "lost", "atrasado"].includes(value)) return "danger";
  if (["contato", "visita", "pendente"].includes(value)) return "warning";
  return "info";
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Sessão expirada. Entre novamente.");

        const response = await fetch("/api/v1/crm/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as DashboardApiResponse;
        if (!response.ok) throw new Error(payload.error?.message || "Não foi possível carregar o dashboard.");
        if (!active) return;

        const data = payload.data;
        setLeads(data?.leads ?? []);
        setOpportunities(data?.opportunities ?? []);
        setCampaigns(data?.campaigns ?? []);
        setInsights(data?.insights ?? []);
        setTasks(data?.tasks ?? []);
        setProperties(data?.properties ?? []);
        setError(data?.partial ? `Algumas tabelas não carregaram: ${data.errors?.map((item) => item.table).join(", ")}` : null);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar dashboard.");
        setLeads([]);
        setOpportunities([]);
        setCampaigns([]);
        setInsights([]);
        setTasks([]);
        setProperties([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => {
    const won = opportunities.filter((item) => ["ganho", "won", "closed"].includes(item.stage?.toLowerCase())).reduce((sum, item) => sum + Number(item.value ?? 0), 0);
    const pipeline = opportunities.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
    const forecast = opportunities.reduce((sum, item) => sum + Number(item.value ?? 0) * (Number(item.probability ?? 0) / 100), 0);
    const hot = leads.filter((lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70).length;
    const pendingTasks = tasks.filter((task) => !["concluido", "concluída", "done"].includes(task.status?.toLowerCase())).length;
    const activeProperties = properties.filter((property) => ["ativo", "available", "disponivel", "disponível"].includes((property.status ?? "").toLowerCase())).length;
    const spend = campaigns.reduce((sum, item) => sum + Number(item.spend ?? 0), 0);
    const revenue = campaigns.reduce((sum, item) => sum + Number(item.revenue ?? 0), 0);
    const roi = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;
    const averageScore = leads.length ? Math.round(leads.reduce((sum, lead) => sum + Number(lead.score ?? 0), 0) / leads.length) : 0;
    return { won, pipeline, forecast, hot, pendingTasks, activeProperties, spend, revenue, roi, averageScore };
  }, [campaigns, leads, opportunities, properties, tasks]);

  const funnel = ["novo", "contato", "qualificacao", "visita", "proposta", "ganho"].map((stage) => ({
    stage,
    count: leads.filter((lead) => (lead.status ?? "novo").toLowerCase() === stage).length,
  }));
  const maxFunnel = Math.max(1, ...funnel.map((item) => item.count));
  const dueTasks = tasks.filter((task) => !["concluido", "done"].includes(task.status?.toLowerCase())).slice(0, 5);

  return (
    <div className="space-y-6 pb-8">
      <section className="atlas-grid-glow overflow-hidden rounded-[28px] border border-sky-400/10 bg-gradient-to-br from-sky-500/[.12] via-blue-500/[.055] to-violet-500/[.1] p-6 shadow-[0_34px_120px_rgba(2,8,23,.38)] sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.5fr_.8fr] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <AtlasBadge tone="info">ATLAS COMMAND CENTER</AtlasBadge>
              <AtlasBadge tone="success">REAL TIME</AtlasBadge>
              <AtlasBadge tone="violet">V3 INTELLIGENCE</AtlasBadge>
            </div>
            <h2 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">
              Operação imobiliária em uma <span className="atlas-gradient-text">única camada inteligente.</span>
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              Leads, vendas, marketing, estoque, automações e decisões de IA conectados para acelerar conversão e reduzir perda operacional.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/leads/new" className="atlas-button-primary">+ Novo lead</Link>
              <Link href="/decision-center" className="atlas-button-secondary">Abrir centro de decisão →</Link>
              <Link href="/atlas-v3" className="atlas-button-secondary">Explorar Atlas V3</Link>
            </div>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-[#070d1b]/70 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between"><div><p className="atlas-eyebrow">Health score</p><p className="mt-2 text-2xl font-semibold text-white">Operação Atlas</p></div><span className="text-3xl font-semibold text-emerald-300">86</span></div>
            <div className="mt-5"><AtlasProgress value={86} label="Maturidade operacional" /></div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              {[{ l: "Dados", v: "92%" }, { l: "CRM", v: "88%" }, { l: "IA", v: "74%" }].map((item) => <div key={item.l} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-sm font-semibold text-white">{item.v}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{item.l}</p></div>)}
            </div>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">Alguns dados não puderam ser carregados: {error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <AtlasMetric label="Leads ativos" value={loading ? "—" : leads.length} detail={`${metrics.hot} leads quentes para priorizar`} trend={metrics.hot ? `${metrics.hot} HOT` : "BASE"} tone="blue" />
        <AtlasMetric label="Pipeline bruto" value={loading ? "—" : brl.format(metrics.pipeline)} detail="Valor total em oportunidades" trend="VGV" tone="violet" />
        <AtlasMetric label="Forecast" value={loading ? "—" : brl.format(metrics.forecast)} detail="Ponderado por probabilidade" trend="AI" tone="green" />
        <AtlasMetric label="Vendas ganhas" value={loading ? "—" : brl.format(metrics.won)} detail="Negócios concluídos" trend="WON" tone="green" />
        <AtlasMetric label="ROI marketing" value={loading ? "—" : `${metrics.roi.toFixed(0)}%`} detail={`${brl.format(metrics.spend)} investidos`} trend="ATTR" tone="amber" />
        <AtlasMetric label="Score médio" value={loading ? "—" : metrics.averageScore} detail={`${metrics.activeProperties} imóveis ativos`} trend={`${metrics.pendingTasks} TASKS`} tone="rose" />
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.4fr_.9fr]">
        <AtlasCard>
          <AtlasCardHeader eyebrow="Sales engine" title="Funil comercial em tempo real" description="Distribuição dos leads por etapa e leitura rápida dos gargalos de conversão." action={<Link className="atlas-button-secondary" href="/pipeline">Abrir pipeline</Link>} />
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
            {funnel.map((item, index) => (
              <div key={item.stage} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold capitalize text-slate-300">{item.stage.replace("qualificacao", "qualificação")}</span><span className="text-lg font-semibold text-white">{loading ? "—" : item.count}</span></div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500" style={{ width: `${Math.max(8, (item.count / maxFunnel) * 100)}%`, opacity: 1 - index * .08 }} /></div>
              </div>
            ))}
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader eyebrow="Atlas AI" title="Inteligência acionável" description="Recomendações produzidas pela camada de decisão." action={<Link href="/intelligence" className="text-xs font-semibold text-sky-300">Ver tudo →</Link>} />
          <div className="p-5 sm:p-6">
            {loading ? <div className="space-y-4"><AtlasSkeleton className="h-20 w-full" /><AtlasSkeleton className="h-20 w-full" /><AtlasSkeleton className="h-20 w-full" /></div> : insights.length === 0 ? <AtlasEmpty title="Sem insights ainda" description="Os insights aparecerão quando os agentes analisarem leads, campanhas e oportunidades." /> : <div className="space-y-3">{insights.slice(0, 4).map((insight) => <article key={insight.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-white">{insight.title}</p><p className="mt-2 text-xs leading-5 text-slate-400">{insight.recommendation || "Analisar contexto e definir próxima ação."}</p></div><AtlasBadge tone={Number(insight.score ?? 0) >= 70 ? "success" : "violet"}>{Math.round(Number(insight.confidence ?? 0) * (Number(insight.confidence ?? 0) <= 1 ? 100 : 1))}%</AtlasBadge></div></article>)}</div>}
          </div>
        </AtlasCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr_.9fr]">
        <AtlasCard>
          <AtlasCardHeader title="Leads prioritários" eyebrow="Customer intelligence" description="Leads recentes ordenados para ação comercial." action={<Link href="/leads" className="text-xs font-semibold text-sky-300">Lista completa →</Link>} />
          <div className="divide-y divide-white/[0.06] px-5 sm:px-6">
            {loading ? [1,2,3,4].map((item) => <div key={item} className="py-4"><AtlasSkeleton className="h-12 w-full" /></div>) : leads.slice().sort((a,b) => Number(b.score ?? 0) - Number(a.score ?? 0)).slice(0,6).map((lead) => <Link href={`/leads/${lead.id}`} key={lead.id} className="flex items-center gap-4 py-4 transition hover:translate-x-1"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-400/15 to-violet-500/10 text-xs font-bold text-sky-200">{(lead.name || "L").slice(0,2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{lead.name || "Lead sem nome"}</p><p className="mt-1 truncate text-xs text-slate-500">{lead.source || "Origem não informada"}</p></div><div className="text-right"><p className="text-sm font-semibold text-white">{lead.score ?? 0}</p><AtlasBadge tone={statusTone(lead.status)}>{lead.status || "novo"}</AtlasBadge></div></Link>)}
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader title="Próximas ações" eyebrow="Orchestration" description="Fila operacional priorizada para hoje." action={<Link href="/tasks" className="text-xs font-semibold text-sky-300">Abrir tarefas →</Link>} />
          <div className="p-5 sm:p-6">
            {dueTasks.length === 0 && !loading ? <AtlasEmpty title="Fila limpa" description="Nenhuma tarefa pendente encontrada para o período." /> : <div className="space-y-3">{dueTasks.map((task) => <article key={task.id} className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${task.priority === "alta" ? "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,.6)]" : task.priority === "media" ? "bg-amber-300" : "bg-sky-400"}`} /><div><p className="text-sm font-medium text-slate-100">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.due_at ? new Date(task.due_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem prazo definido"}</p></div></article>)}</div>}
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader title="Performance de mídia" eyebrow="Marketing intelligence" description="Atribuição consolidada das campanhas." action={<Link href="/marketing" className="text-xs font-semibold text-sky-300">Andromeda →</Link>} />
          <div className="p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-xs text-slate-500">Investimento</p><p className="mt-2 text-lg font-semibold text-white">{brl.format(metrics.spend)}</p></div><div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-xs text-slate-500">Receita atribuída</p><p className="mt-2 text-lg font-semibold text-emerald-300">{brl.format(metrics.revenue)}</p></div></div>
            <div className="mt-4 space-y-3">{campaigns.slice(0,4).map((campaign) => <div key={campaign.id} className="rounded-2xl border border-white/[0.06] p-4"><div className="flex justify-between gap-3"><p className="truncate text-sm font-medium text-white">{campaign.name}</p><AtlasBadge tone={campaign.status === "active" || campaign.status === "ativa" ? "success" : "neutral"}>{campaign.status}</AtlasBadge></div><div className="mt-3 flex justify-between text-xs text-slate-500"><span>{campaign.leads_count} leads</span><span>{campaign.spend > 0 ? brl.format(campaign.spend / Math.max(1,campaign.leads_count)) : "CPL —"}</span></div></div>)}</div>
          </div>
        </AtlasCard>
      </section>
    </div>
  );
}
