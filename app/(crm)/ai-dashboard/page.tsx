"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Signal = { id: string; severity: "critical" | "attention" | "opportunity" | "healthy"; area: string; title: string; evidence: string; action: string; href: string };
type Briefing = {
  generatedAt: string; status: "critical" | "attention" | "healthy";
  context: { portfolio: { developments: number; inventory: number; available: number; sold: number; absorptionPercent: number; availableVgv: number }; commercial: { leads: number; hotLeads: number; overdueNextActions: number; withoutNextAction: number; openOpportunities: number; pipelineValue: number; weightedForecast: number }; materials: { current: number; expired: number } };
  signals: Signal[]; model: { generativeReady: boolean; localIntelligenceReady: boolean; calibrationVerifiedAt: string };
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const tones = { critical: "danger", attention: "warning", opportunity: "violet", healthy: "success" } as const;
const labels = { critical: "CRÍTICO", attention: "ATENÇÃO", opportunity: "OPORTUNIDADE", healthy: "SAUDÁVEL" } as const;

export default function AIDashboard() {
  const [data, setData] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    const response = await fetch("/api/ai/briefing");
    const payload = await response.json();
    if (!response.ok) setError(payload?.error?.message || payload?.error || "Não foi possível carregar o briefing.");
    else setData(payload as Briefing);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  function askCopilot(signal: Signal) {
    window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: { prompt: `Analise este sinal imobiliário e crie um plano de execução: ${signal.title}. Evidência: ${signal.evidence}.`, context: { signal } } }));
  }

  const portfolio = data?.context.portfolio;
  const commercial = data?.context.commercial;
  const materials = data?.context.materials;

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-violet-400/10 bg-gradient-to-br from-violet-500/[.14] via-blue-500/[.06] to-cyan-500/[.09] p-6 sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.35fr_.65fr] xl:items-end"><div><div className="flex flex-wrap gap-2"><AtlasBadge tone="violet">INTELLIGENCE COCKPIT</AtlasBadge><AtlasBadge tone="info">REAL ESTATE</AtlasBadge><AtlasBadge tone={data?.model.generativeReady ? "success" : "warning"}>{data?.model.generativeReady ? "IA ONLINE" : "MOTOR LOCAL"}</AtlasBadge></div><h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">A operação imobiliária ordenada pelo que mais exige decisão.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Gargalos, oportunidades, qualidade do pipeline, estoque e materiais em uma leitura hierárquica pronta para execução.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={() => void load()} className="atlas-button-primary">Atualizar briefing</button><Link href="/leads/ai-qualify" className="atlas-button-secondary">Fila de qualificação</Link><Link href="/settings/ai" className="atlas-button-secondary">Diagnóstico da IA</Link></div></div><div className="rounded-3xl border border-white/[0.08] bg-[#070d1b]/75 p-5"><p className="atlas-eyebrow">Saúde operacional</p><p className="mt-2 text-3xl font-semibold text-white">{loading ? "—" : labels[data?.status || "healthy"]}</p><p className="mt-2 text-xs text-slate-500">{data ? `Atualizado em ${new Date(data.generatedAt).toLocaleString("pt-BR")}` : "Calculando sinais..."}</p></div></div>
      </section>
      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><AtlasMetric label="Leads visíveis" value={loading ? "—" : commercial?.leads ?? 0} detail={`${commercial?.hotLeads ?? 0} quentes`} trend="CARTEIRA" tone="blue" /><AtlasMetric label="Follow-ups atrasados" value={loading ? "—" : commercial?.overdueNextActions ?? 0} detail={`${commercial?.withoutNextAction ?? 0} sem próxima ação`} trend="SLA" tone="rose" /><AtlasMetric label="Pipeline" value={loading ? "—" : brl.format(commercial?.pipelineValue ?? 0)} detail={`${commercial?.openOpportunities ?? 0} oportunidades`} trend="VENDAS" tone="violet" /><AtlasMetric label="Estoque disponível" value={loading ? "—" : portfolio?.available ?? 0} detail={brl.format(portfolio?.availableVgv ?? 0)} trend="INVENTÁRIO" tone="green" /><AtlasMetric label="Materiais vencidos" value={loading ? "—" : materials?.expired ?? 0} detail={`${materials?.current ?? 0} vigentes`} trend="HUB" tone="amber" /></section>
      <section className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <AtlasCard><AtlasCardHeader eyebrow="Decision queue" title="Sinais priorizados" description="Ordenados por gravidade e impacto operacional." /><div className="space-y-3 p-5 sm:p-6">{loading ? [1,2,3,4].map((item) => <AtlasSkeleton key={item} className="h-36 w-full" />) : !data?.signals.length ? <AtlasEmpty title="Nenhum sinal encontrado" description="Atualize os dados para gerar o briefing." /> : data.signals.map((signal, index) => <article key={signal.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-sm font-bold text-slate-400">{index + 1}</span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">{signal.area}</p><h2 className="mt-1 font-semibold text-white">{signal.title}</h2></div></div><AtlasBadge tone={tones[signal.severity]}>{labels[signal.severity]}</AtlasBadge></div><p className="mt-4 text-sm leading-6 text-slate-400">{signal.evidence}</p><div className="mt-4 rounded-xl border border-sky-400/10 bg-sky-400/[0.05] p-3 text-xs leading-5 text-sky-100">{signal.action}</div><div className="mt-4 flex flex-wrap gap-2"><Link href={signal.href} className="atlas-button-secondary">Executar agora</Link><button onClick={() => askCopilot(signal)} className="atlas-button-secondary">✦ Criar plano com IA</button></div></article>)}</div></AtlasCard>
        <div className="space-y-6"><AtlasCard><AtlasCardHeader eyebrow="Portfolio pulse" title="Absorção do estoque" description={`${portfolio?.sold ?? 0} unidades vendidas de ${portfolio?.inventory ?? 0}.`} /><div className="p-5 sm:p-6"><div className="flex items-end justify-between"><span className="text-sm text-slate-400">Sell-through</span><strong className="text-4xl text-emerald-300">{portfolio?.absorptionPercent ?? 0}%</strong></div><div className="mt-5"><AtlasProgress value={portfolio?.absorptionPercent ?? 0} /></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/[0.03] p-3 text-center"><strong className="block text-white">{portfolio?.developments ?? 0}</strong><span className="text-[10px] uppercase text-slate-500">Projetos</span></div><div className="rounded-xl bg-white/[0.03] p-3 text-center"><strong className="block text-white">{portfolio?.available ?? 0}</strong><span className="text-[10px] uppercase text-slate-500">Disponíveis</span></div></div></div></AtlasCard><AtlasCard><AtlasCardHeader eyebrow="AI readiness" title="Camadas ativas" description="A inteligência local continua operando sem dependência externa." /><div className="space-y-3 p-5"><div className="flex justify-between rounded-xl bg-white/[0.03] p-3 text-sm"><span className="text-slate-400">Motor imobiliário local</span><AtlasBadge tone="success">ATIVO</AtlasBadge></div><div className="flex justify-between rounded-xl bg-white/[0.03] p-3 text-sm"><span className="text-slate-400">Modelo generativo</span><AtlasBadge tone={data?.model.generativeReady ? "success" : "warning"}>{data?.model.generativeReady ? "ATIVO" : "PENDENTE"}</AtlasBadge></div><div className="flex justify-between rounded-xl bg-white/[0.03] p-3 text-sm"><span className="text-slate-400">Calibração de mercado</span><AtlasBadge tone="info">VALIDADA</AtlasBadge></div></div></AtlasCard></div>
      </section>
    </div>
  );
}
