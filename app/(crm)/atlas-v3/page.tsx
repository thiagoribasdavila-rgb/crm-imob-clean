"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const modules = [
  ["Digital Twin", "/atlas-v3/digital-twin", "Modelos vivos de comprador, imóvel, mercado e campanha."],
  ["Agentes", "/atlas-v3/agents", "Especialistas governados para vendas, marketing, gestão e investimento."],
  ["Market Intelligence", "/atlas-v3/market", "Sinais de preço, liquidez, demanda e oportunidade."],
  ["Forecast", "/atlas-v3/forecast", "Previsões de conversão, VGV e risco operacional."],
  ["Marketplace", "/atlas-v3/marketplace", "Distribuição inteligente de estoque e parceiros."],
  ["Governança", "/atlas-v3/governance", "Aprovação humana, explicabilidade, auditoria e segurança."],
] as const;

type Metrics = {
  leads: number;
  properties: number;
  opportunities: number;
  campaigns: number;
  conversations: number;
  approvals: number;
  decisions: number;
  insights: number;
};

const emptyMetrics: Metrics = {
  leads: 0,
  properties: 0,
  opportunities: 0,
  campaigns: 0,
  conversations: 0,
  approvals: 0,
  decisions: 0,
  insights: 0,
};

export default function AtlasV3Page() {
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const results = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("properties").select("id", { count: "exact", head: true }),
        supabase.from("opportunities").select("id", { count: "exact", head: true }),
        supabase.from("campaigns").select("id", { count: "exact", head: true }),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("atlas_decisions").select("id", { count: "exact", head: true }).eq("status", "proposed"),
        supabase.from("ai_insights").select("id", { count: "exact", head: true }),
      ]);

      if (!active) return;
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) setError(firstError.message);
      setMetrics({
        leads: results[0].count ?? 0,
        properties: results[1].count ?? 0,
        opportunities: results[2].count ?? 0,
        campaigns: results[3].count ?? 0,
        conversations: results[4].count ?? 0,
        approvals: results[5].count ?? 0,
        decisions: results[6].count ?? 0,
        insights: results[7].count ?? 0,
      });
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const maturity = useMemo(() => {
    const activeDomains = [metrics.leads, metrics.properties, metrics.opportunities, metrics.campaigns, metrics.insights]
      .filter((value) => value > 0).length;
    return Math.min(100, 45 + activeDomains * 8 + Math.min(15, metrics.decisions + metrics.approvals));
  }, [metrics]);

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-[30px] border border-fuchsia-400/15 bg-gradient-to-br from-fuchsia-500/[.12] via-blue-500/[.06] to-transparent p-7 sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <p className="atlas-eyebrow text-fuchsia-300">Atlas Operating System · Unified Core</p>
        <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-[-.05em] sm:text-5xl">V1, V2 e V3 operando sobre o mesmo núcleo de dados.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">O CRM operacional alimenta o Growth Layer; campanhas, conversas e automações geram sinais; o Atlas V3 transforma tudo em decisões, previsões, Digital Twins e ações governadas.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/dashboard" className="atlas-button-secondary">Abrir operação V1</Link>
          <Link href="/atlas-v2" className="atlas-button-secondary">Abrir Growth Layer V2</Link>
          <Link href="/decision-center" className="atlas-button-primary">Abrir Centro de decisão →</Link>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">Algumas métricas ainda dependem da migração V3: {error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Leads V1", metrics.leads],
          ["Imóveis", metrics.properties],
          ["Oportunidades", metrics.opportunities],
          ["Campanhas V2", metrics.campaigns],
          ["Conversas abertas", metrics.conversations],
          ["Aprovações", metrics.approvals],
          ["Decisões propostas", metrics.decisions],
          ["Insights", metrics.insights],
        ].map(([label, value]) => (
          <article key={String(label)} className="atlas-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-black text-white">{loading ? "—" : value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="atlas-panel p-6">
          <div className="flex items-center justify-between gap-4"><div><p className="atlas-eyebrow">Operating maturity</p><h2 className="mt-2 text-xl font-bold">Integração do ecossistema</h2></div><span className="text-3xl font-black text-sky-300">{loading ? "—" : `${maturity}%`}</span></div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500" style={{ width: `${maturity}%` }} /></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["V1 · Operação e dados", "V2 · Crescimento e comunicação", "V3 · Inteligência e decisão"].map((item, index) => <div key={item} className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4"><span className="text-xs text-sky-300">0{index + 1}</span><p className="mt-2 text-sm font-semibold text-slate-200">{item}</p></div>)}
          </div>
        </div>
        <div className="atlas-panel p-6">
          <p className="atlas-eyebrow">Governança ativa</p><h2 className="mt-2 text-xl font-bold">Human-in-the-loop</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">Decisões de alto risco, mensagens em massa, publicação de campanhas, contratos e movimentações financeiras permanecem bloqueadas até aprovação autorizada.</p>
          <Link href="/approvals" className="mt-6 inline-flex text-sm font-semibold text-violet-300 hover:text-violet-200">Revisar aprovações pendentes →</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map(([name, href, description]) => (
          <Link key={href} href={href} className="group atlas-panel p-6 transition hover:-translate-y-0.5 hover:border-fuchsia-400/25">
            <div className="flex items-start justify-between gap-4"><h2 className="font-bold text-white">{name}</h2><span className="text-fuchsia-300 transition group-hover:translate-x-1">→</span></div>
            <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
