"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Period = "day" | "week" | "month" | "all";
type Lead = { id: string; status: string | null; source: string | null; score: number | null; created_at: string };
type Opportunity = { id: string; stage: string; value: number | null; probability: number; created_at: string; won_at: string | null };
type Campaign = { id: string; name: string; spend: number; revenue: number; leads_count: number; sales_count: number; created_at: string };
type Briefing = { status: string; signals: Array<{ id: string; severity: string; title: string; evidence: string; action: string; href: string }> };
type WeeklyReport = { totals: { leads: number; spend: number; cpl: number | null; campaigns: number; developers: number }; campaigns: Array<{ campaignId: string; campaignName: string; leads: number; qualified: number; spend: number | null; cpl: number | null; costSource: string }>; developers: Array<{ developer: string; leads: number; spend: number; cpl: number | null; campaigns: number; allocation: string }>; warnings: string[]; period: { start: string; end: string } };
type WeeklyReview = { outcomes:{completedTasks:number;completedVisits:number;interactions:number;newLeads:number};backlog:{openTasks:number;overdueTasks:number;leadsWithoutNextAction:number;hotLeadsWithoutNextAction:number;noShows:number};quality:{completionRate:number|null;sampleSize:number;minimumSample:number;sufficientSample:boolean};plan:Array<{key:string;title:string;evidence:string;action:string;href:string}>;method:{llmCost:number;peopleRanking:boolean;humanDecisionRequired:boolean} };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function ReportsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [referenceTime, setReferenceTime] = useState(0);
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);

  useEffect(() => {
    async function load() {
      const [leadResult, opportunityResult, campaignResult] = await Promise.all([
        supabase.from("leads").select("id,status,source,score,created_at"),
        supabase.from("opportunities").select("id,stage,value,probability,created_at,won_at"),
        supabase.from("campaigns").select("id,name,spend,revenue,leads_count,sales_count,created_at"),
      ]);
      const firstError = leadResult.error ?? opportunityResult.error ?? campaignResult.error;
      if (firstError) setError(firstError.message);
      setLeads((leadResult.data as Lead[] | null) ?? []);
      setOpportunities((opportunityResult.data as Opportunity[] | null) ?? []);
      setCampaigns((campaignResult.data as Campaign[] | null) ?? []);
      setReferenceTime(Date.now());
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.access_token) {
        const headers = { Authorization: `Bearer ${session.session.access_token}` };
        const [response, weeklyResponse, reviewResponse] = await Promise.all([fetch("/api/ai/briefing", { headers, cache: "no-store" }), fetch("/api/v1/analytics/weekly-acquisition", { headers, cache: "no-store" }), fetch("/api/v1/productivity/weekly", { headers, cache: "no-store" })]);
        if (response.ok) setBriefing(await response.json() as Briefing);
        if (weeklyResponse.ok) setWeekly(await weeklyResponse.json() as WeeklyReport);
        if (reviewResponse.ok) { const payload = await reviewResponse.json(); setWeeklyReview((payload.data || payload) as WeeklyReview); }
      }
      setLoading(false);
    }
    void load();
  }, []);

  const periodData = useMemo(() => {
    const days = period === "day" ? 1 : period === "week" ? 7 : period === "month" ? 30 : null;
    const since = days ? referenceTime - days * 86_400_000 : 0;
    const recent = (date: string | null) => !days || Boolean(date && new Date(date).getTime() >= since);
    return { leads: leads.filter((item) => recent(item.created_at)), opportunities: opportunities.filter((item) => recent(item.created_at)), campaigns: campaigns.filter((item) => recent(item.created_at)) };
  }, [campaigns, leads, opportunities, period, referenceTime]);

  const metrics = useMemo(() => {
    const vgv = periodData.opportunities.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
    const forecast = periodData.opportunities.reduce((sum, item) => sum + Number(item.value ?? 0) * Number(item.probability ?? 0) / 100, 0);
    const won = periodData.opportunities.filter((item) => ["ganho", "won", "fechado"].includes(item.stage)).length;
    const spend = periodData.campaigns.reduce((sum, item) => sum + Number(item.spend ?? 0), 0);
    const revenue = periodData.campaigns.reduce((sum, item) => sum + Number(item.revenue ?? 0), 0);
    const campaignLeads = periodData.campaigns.reduce((sum, item) => sum + Number(item.leads_count ?? 0), 0);
    return {
      vgv,
      forecast,
      won,
      conversion: periodData.leads.length ? (won / periodData.leads.length) * 100 : 0,
      spend,
      revenue,
      roi: spend ? ((revenue - spend) / spend) * 100 : 0,
      cpl: campaignLeads ? spend / campaignLeads : 0,
      averageScore: periodData.leads.length ? periodData.leads.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / periodData.leads.length : 0,
    };
  }, [periodData]);

  const funnel = ["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho"].map((status) => ({
    status,
    total: periodData.leads.filter((lead) => lead.status === status).length,
  }));

  const sources = Array.from(new Set(periodData.leads.map((lead) => lead.source || "não informada"))).map((source) => ({
    source,
    total: periodData.leads.filter((lead) => (lead.source || "não informada") === source).length,
  })).sort((a, b) => b.total - a.total);

  return <div className="space-y-8">
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">Analytics</p><h1 className="mt-2 text-3xl font-black">Relatórios executivos</h1><p className="mt-2 text-sm text-zinc-400">VGV, forecast, conversão, marketing e qualidade da base comercial.</p></div><div className="flex flex-wrap gap-2" role="group" aria-label="Período do relatório">{(["day", "week", "month", "all"] as Period[]).map((key) => <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${period === key ? "bg-white text-zinc-950" : "border border-zinc-800 text-zinc-400 hover:text-white"}`}>{key === "day" ? "Hoje" : key === "week" ? "7 dias" : key === "month" ? "30 dias" : "Histórico"}</button>)}</div></header>
    {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
    {weeklyReview ? <section className="space-y-5 rounded-3xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[.07] to-violet-500/[.04] p-5 sm:p-7" data-phase="49-weekly-review"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Fase 49 · Revisão semanal pessoal</p><h2 className="mt-2 text-2xl font-black">O que avançou e o que merece foco</h2><p className="mt-2 text-sm text-zinc-400">Últimos 7 dias, somente sua operação. Sem ranking de pessoas e sem decisões automáticas.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Tarefas concluídas",weeklyReview.outcomes.completedTasks],["Visitas realizadas",weeklyReview.outcomes.completedVisits],["Interações registradas",weeklyReview.outcomes.interactions],["Novas leads",weeklyReview.outcomes.newLeads]].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><p className="text-xs text-zinc-500">{label}</p><strong className="mt-2 block text-xl">{value}</strong></div>)}</div><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><article className="rounded-2xl border border-white/[.07] bg-black/15 p-5"><h3 className="font-bold">Pendências reais</h3><div className="mt-4 space-y-3 text-sm text-zinc-400"><p><strong className="text-rose-200">{weeklyReview.backlog.overdueTasks}</strong> tarefas vencidas</p><p><strong className="text-amber-200">{weeklyReview.backlog.leadsWithoutNextAction}</strong> leads sem próxima ação</p><p><strong className="text-violet-200">{weeklyReview.backlog.hotLeadsWithoutNextAction}</strong> quentes sem agenda</p><p><strong className="text-zinc-200">{weeklyReview.backlog.noShows}</strong> ausências em visitas</p></div><p className="mt-5 text-[11px] leading-5 text-zinc-500">{weeklyReview.quality.sufficientSample?`Cumprimento observado: ${weeklyReview.quality.completionRate}% em ${weeklyReview.quality.sampleSize} tarefas.`:`Amostra pequena (${weeklyReview.quality.sampleSize}/${weeklyReview.quality.minimumSample}); sem percentual para evitar conclusão frágil.`}</p></article><article className="rounded-2xl border border-white/[.07] bg-black/15 p-5"><h3 className="font-bold">Plano da próxima semana</h3><div className="mt-4 space-y-3">{weeklyReview.plan.map((item,index)=><a key={item.key} href={item.href} className="flex gap-3 rounded-xl border border-white/[.06] p-3 transition hover:border-cyan-300/20"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cyan-400/10 text-xs font-bold text-cyan-200">{index+1}</span><span><strong className="text-sm text-white">{item.title}</strong><span className="mt-1 block text-xs text-zinc-500">{item.evidence}</span><span className="mt-1 block text-xs text-cyan-200">{item.action} →</span></span></a>)}</div></article></div><p className="text-[10px] text-zinc-500">Plano explicável, custo LLM zero e aprovação humana obrigatória.</p></section> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["VGV em oportunidades", money(metrics.vgv)], ["Forecast ponderado", money(metrics.forecast)],
        ["Conversão", `${metrics.conversion.toFixed(1)}%`], ["Score médio", metrics.averageScore.toFixed(0)],
        ["Investimento", money(metrics.spend)], ["Receita atribuída", money(metrics.revenue)],
        ["ROI", `${metrics.roi.toFixed(1)}%`], ["CPL", money(metrics.cpl)],
      ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-3 text-2xl font-black">{loading ? "—" : value}</p></article>)}
    </section>
    {weekly ? <section className="space-y-5 rounded-3xl border border-blue-400/15 bg-gradient-to-br from-blue-500/[.08] to-cyan-500/[.03] p-5 sm:p-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Relatório semanal de aquisição</p><h2 className="mt-2 text-2xl font-black">Leads e custo por campanha e incorporadora</h2><p className="mt-2 text-sm text-zinc-400">Últimos 7 dias · custo oficial da Meta quando conectado · sem decisões automáticas.</p></div><button type="button" onClick={() => window.print()} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-zinc-200">Imprimir semanal</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Leads", weekly.totals.leads],["Investimento", money(weekly.totals.spend)],["CPL", weekly.totals.cpl === null ? "—" : money(weekly.totals.cpl)],["Campanhas", weekly.totals.campaigns],["Incorporadoras", weekly.totals.developers]].map(([label,value]) => <div key={String(label)} className="rounded-2xl border border-white/[.07] bg-black/15 p-4"><p className="text-xs text-zinc-500">{label}</p><strong className="mt-2 block text-xl">{value}</strong></div>)}</div>{weekly.warnings?.map((warning) => <p key={warning} className="rounded-xl border border-amber-400/20 bg-amber-400/[.07] p-3 text-xs text-amber-100">{warning}</p>)}<div className="grid gap-5 xl:grid-cols-2"><div className="overflow-x-auto rounded-2xl border border-white/[.07] bg-black/15 p-4"><h3 className="font-bold">Por campanha</h3><table className="mt-4 w-full min-w-[560px] text-left text-sm"><thead className="text-zinc-500"><tr><th className="pb-3">Campanha</th><th>Leads</th><th>Qualificadas</th><th>Custo</th><th>CPL</th></tr></thead><tbody className="divide-y divide-white/[.06]">{weekly.campaigns.map((row) => <tr key={row.campaignId}><td className="py-3 font-semibold">{row.campaignName}</td><td>{row.leads}</td><td>{row.qualified}</td><td>{row.spend === null ? "Não conectado" : money(row.spend)}</td><td>{row.cpl === null ? "—" : money(row.cpl)}</td></tr>)}</tbody></table></div><div className="overflow-x-auto rounded-2xl border border-white/[.07] bg-black/15 p-4"><h3 className="font-bold">Por incorporadora</h3><table className="mt-4 w-full min-w-[520px] text-left text-sm"><thead className="text-zinc-500"><tr><th className="pb-3">Incorporadora</th><th>Leads</th><th>Campanhas</th><th>Custo</th><th>CPL</th></tr></thead><tbody className="divide-y divide-white/[.06]">{weekly.developers.map((row) => <tr key={row.developer}><td className="py-3"><span className="font-semibold">{row.developer}</span>{row.allocation !== "direct" ? <span className="mt-1 block text-[10px] text-amber-300">rateio proporcional por leads</span> : null}</td><td>{row.leads}</td><td>{row.campaigns}</td><td>{money(row.spend)}</td><td>{row.cpl === null ? "—" : money(row.cpl)}</td></tr>)}</tbody></table></div></div></section> : null}
    <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><article className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-blue-500/5 p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-300">IA preditiva explicável</p><h2 className="mt-2 text-xl font-black">{briefing?.signals[0]?.title || "Consolidando tendências"}</h2></div><span className="rounded-full border border-violet-400/20 px-3 py-1 text-[10px] font-bold text-violet-200">{briefing?.status?.toUpperCase() || "ANÁLISE"}</span></div><p className="mt-4 text-sm leading-6 text-zinc-300">{briefing?.signals[0]?.evidence || "O Atlas está reunindo sinais suficientes para calcular risco, oportunidade e próxima ação."}</p><p className="mt-3 text-sm font-semibold text-violet-100">{briefing?.signals[0]?.action}</p>{briefing?.signals[0] ? <a href={briefing.signals[0].href} className="mt-4 inline-flex text-xs font-bold text-blue-300">Abrir ação recomendada →</a> : null}</article><article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-300">Leitura do período</p><h2 className="mt-2 text-xl font-black">Decisão, não excesso de gráficos</h2><p className="mt-3 text-sm leading-6 text-zinc-400">O painel usa somente dados visíveis no seu escopo. Tendências são recomendações; forecast, campanhas e registros não mudam sem revisão humana.</p><button type="button" onClick={() => window.print()} className="mt-5 rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-200">Salvar ou imprimir relatório</button></article></section>
    <section className="grid gap-6 xl:grid-cols-2">
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><h2 className="text-xl font-black">Funil comercial</h2><div className="mt-6 space-y-4">{funnel.map((item) => { const width = periodData.leads.length ? Math.max(3, (item.total / periodData.leads.length) * 100) : 3; return <div key={item.status}><div className="flex justify-between text-sm"><span className="capitalize text-zinc-300">{item.status}</span><strong>{item.total}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${width}%` }} /></div></div>; })}</div></article>
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><h2 className="text-xl font-black">Origem dos leads</h2><div className="mt-6 divide-y divide-zinc-800">{sources.length === 0 ? <p className="text-sm text-zinc-500">Sem dados de origem.</p> : null}{sources.slice(0, 10).map((item) => <div key={item.source} className="flex items-center justify-between py-4"><span className="capitalize text-zinc-300">{item.source}</span><strong>{item.total}</strong></div>)}</div></article>
    </section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><h2 className="text-xl font-black">Campanhas</h2><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-zinc-500"><tr><th className="pb-3">Campanha</th><th className="pb-3">Leads</th><th className="pb-3">Vendas</th><th className="pb-3">Investimento</th><th className="pb-3">Receita</th><th className="pb-3">ROI</th></tr></thead><tbody className="divide-y divide-zinc-800">{periodData.campaigns.map((campaign) => { const roi = campaign.spend ? ((campaign.revenue - campaign.spend) / campaign.spend) * 100 : 0; return <tr key={campaign.id}><td className="py-4 font-semibold">{campaign.name}</td><td>{campaign.leads_count}</td><td>{campaign.sales_count}</td><td>{money(Number(campaign.spend))}</td><td>{money(Number(campaign.revenue))}</td><td>{roi.toFixed(1)}%</td></tr>; })}</tbody></table></div></section>
  </div>;
}
