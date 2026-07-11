"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Lead = { id: string; status: string | null; source: string | null; score: number | null };
type Opportunity = { id: string; stage: string; value: number | null; probability: number };
type Campaign = { id: string; name: string; spend: number; revenue: number; leads_count: number; sales_count: number };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function ReportsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [leadResult, opportunityResult, campaignResult] = await Promise.all([
        supabase.from("leads").select("id,status,source,score"),
        supabase.from("opportunities").select("id,stage,value,probability"),
        supabase.from("campaigns").select("id,name,spend,revenue,leads_count,sales_count"),
      ]);
      const firstError = leadResult.error ?? opportunityResult.error ?? campaignResult.error;
      if (firstError) setError(firstError.message);
      setLeads((leadResult.data as Lead[] | null) ?? []);
      setOpportunities((opportunityResult.data as Opportunity[] | null) ?? []);
      setCampaigns((campaignResult.data as Campaign[] | null) ?? []);
      setLoading(false);
    }
    void load();
  }, []);

  const metrics = useMemo(() => {
    const vgv = opportunities.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
    const forecast = opportunities.reduce((sum, item) => sum + Number(item.value ?? 0) * Number(item.probability ?? 0) / 100, 0);
    const won = opportunities.filter((item) => ["ganho", "won", "fechado"].includes(item.stage)).length;
    const spend = campaigns.reduce((sum, item) => sum + Number(item.spend ?? 0), 0);
    const revenue = campaigns.reduce((sum, item) => sum + Number(item.revenue ?? 0), 0);
    const campaignLeads = campaigns.reduce((sum, item) => sum + Number(item.leads_count ?? 0), 0);
    return {
      vgv,
      forecast,
      won,
      conversion: leads.length ? (won / leads.length) * 100 : 0,
      spend,
      revenue,
      roi: spend ? ((revenue - spend) / spend) * 100 : 0,
      cpl: campaignLeads ? spend / campaignLeads : 0,
      averageScore: leads.length ? leads.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / leads.length : 0,
    };
  }, [leads, opportunities, campaigns]);

  const funnel = ["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho"].map((status) => ({
    status,
    total: leads.filter((lead) => lead.status === status).length,
  }));

  const sources = Array.from(new Set(leads.map((lead) => lead.source || "não informada"))).map((source) => ({
    source,
    total: leads.filter((lead) => (lead.source || "não informada") === source).length,
  })).sort((a, b) => b.total - a.total);

  return <div className="space-y-8">
    <header><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">Analytics</p><h1 className="mt-2 text-3xl font-black">Relatórios executivos</h1><p className="mt-2 text-sm text-zinc-400">VGV, forecast, conversão, marketing e qualidade da base comercial.</p></header>
    {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["VGV em oportunidades", money(metrics.vgv)], ["Forecast ponderado", money(metrics.forecast)],
        ["Conversão", `${metrics.conversion.toFixed(1)}%`], ["Score médio", metrics.averageScore.toFixed(0)],
        ["Investimento", money(metrics.spend)], ["Receita atribuída", money(metrics.revenue)],
        ["ROI", `${metrics.roi.toFixed(1)}%`], ["CPL", money(metrics.cpl)],
      ].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-3 text-2xl font-black">{loading ? "—" : value}</p></article>)}
    </section>
    <section className="grid gap-6 xl:grid-cols-2">
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><h2 className="text-xl font-black">Funil comercial</h2><div className="mt-6 space-y-4">{funnel.map((item) => { const width = leads.length ? Math.max(3, (item.total / leads.length) * 100) : 3; return <div key={item.status}><div className="flex justify-between text-sm"><span className="capitalize text-zinc-300">{item.status}</span><strong>{item.total}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500" style={{ width: `${width}%` }} /></div></div>; })}</div></article>
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><h2 className="text-xl font-black">Origem dos leads</h2><div className="mt-6 divide-y divide-zinc-800">{sources.length === 0 ? <p className="text-sm text-zinc-500">Sem dados de origem.</p> : null}{sources.slice(0, 10).map((item) => <div key={item.source} className="flex items-center justify-between py-4"><span className="capitalize text-zinc-300">{item.source}</span><strong>{item.total}</strong></div>)}</div></article>
    </section>
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><h2 className="text-xl font-black">Campanhas</h2><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-zinc-500"><tr><th className="pb-3">Campanha</th><th className="pb-3">Leads</th><th className="pb-3">Vendas</th><th className="pb-3">Investimento</th><th className="pb-3">Receita</th><th className="pb-3">ROI</th></tr></thead><tbody className="divide-y divide-zinc-800">{campaigns.map((campaign) => { const roi = campaign.spend ? ((campaign.revenue - campaign.spend) / campaign.spend) * 100 : 0; return <tr key={campaign.id}><td className="py-4 font-semibold">{campaign.name}</td><td>{campaign.leads_count}</td><td>{campaign.sales_count}</td><td>{money(Number(campaign.spend))}</td><td>{money(Number(campaign.revenue))}</td><td>{roi.toFixed(1)}%</td></tr>; })}</tbody></table></div></section>
  </div>;
}
