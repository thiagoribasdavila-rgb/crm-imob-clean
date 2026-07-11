"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Metrics = {
  inventoryTotal: number;
  available: number;
  sold: number;
  reserved: number;
  totalVgv: number;
  soldVgv: number;
  absorption: number;
  pipeline: number;
  forecast: number;
  opportunities: number;
  campaignSpend: number;
  campaignRevenue: number;
  campaignLeads: number;
  cpl: number;
  roi: number;
  activeReservations: number;
};

type Development = {
  id: string;
  name: string;
  developer_name: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  status: string;
  delivery_date: string | null;
  launch_date?: string | null;
  metrics: Metrics;
};

type Payload = {
  portfolio: {
    totalVgv: number;
    soldVgv: number;
    pipeline: number;
    forecast: number;
    units: number;
    available: number;
    sold: number;
    reservations: number;
  };
  developments: Development[];
  generatedAt: string;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" | "violet" {
  const value = status.toLowerCase();
  if (["lançado", "lancado", "ativo", "vendas"].includes(value)) return "success";
  if (["pré-lançamento", "pre-lancamento", "planejamento"].includes(value)) return "violet";
  if (["pausado", "suspenso"].includes(value)) return "warning";
  if (["encerrado", "cancelado"].includes(value)) return "danger";
  return "info";
}

export default function DevelopmentsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sessão expirada. Entre novamente no Atlas.");
      setLoading(false);
      return;
    }
    const response = await fetch("/api/v1/launch-os", { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (!response.ok) setError(payload.error || "Falha ao carregar o Launch OS.");
    else setData(payload as Payload);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data?.developments ?? [];
    return (data?.developments ?? []).filter((item) => [item.name, item.developer_name, item.neighborhood, item.city, item.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized)));
  }, [data, query]);

  const portfolioAbsorption = data?.portfolio.units ? Math.round((data.portfolio.sold / data.portfolio.units) * 100) : 0;
  const attention = (data?.developments ?? []).filter((item) => item.metrics.inventoryTotal > 0 && item.metrics.absorption < 20).length;

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-violet-400/10 bg-gradient-to-br from-violet-500/[.13] via-blue-500/[.055] to-cyan-500/[.08] p-6 shadow-[0_34px_120px_rgba(2,8,23,.42)] sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.45fr_.8fr] xl:items-end">
          <div>
            <div className="flex flex-wrap gap-2"><AtlasBadge tone="violet">LAUNCH OS</AtlasBadge><AtlasBadge tone="success">PORTFÓLIO AO VIVO</AtlasBadge><AtlasBadge tone="info">INCORPORADORAS</AtlasBadge></div>
            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">O centro operacional de <span className="atlas-gradient-text">lançamentos imobiliários.</span></h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">VGV, estoque, reservas, marketing, forecast e velocidade de vendas em uma visão única para incorporadoras e gestores comerciais.</p>
            <div className="mt-6 flex flex-wrap gap-3"><Link href="/properties" className="atlas-button-primary">Abrir estoque</Link><Link href="/marketing" className="atlas-button-secondary">Marketing do portfólio</Link><button onClick={() => void load()} className="atlas-button-secondary">Atualizar dados</button></div>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-[#070d1b]/70 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between"><div><p className="atlas-eyebrow">Sell-through</p><p className="mt-2 text-2xl font-semibold text-white">Absorção do portfólio</p></div><span className="text-3xl font-semibold text-emerald-300">{portfolioAbsorption}%</span></div>
            <div className="mt-5"><AtlasProgress value={portfolioAbsorption} label="Unidades vendidas" /></div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-sm font-semibold text-white">{data?.portfolio.units ?? 0}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Unidades</p></div><div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-sm font-semibold text-white">{data?.portfolio.reservations ?? 0}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Reservas</p></div><div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3"><p className="text-sm font-semibold text-white">{attention}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">Atenção</p></div></div>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AtlasMetric label="VGV do portfólio" value={loading ? "—" : brl.format(data?.portfolio.totalVgv ?? 0)} detail="Valor total do estoque vinculado" trend="PORTFÓLIO" tone="violet" />
        <AtlasMetric label="VGV vendido" value={loading ? "—" : brl.format(data?.portfolio.soldVgv ?? 0)} detail={`${data?.portfolio.sold ?? 0} unidades vendidas`} trend="SELL-OUT" tone="green" />
        <AtlasMetric label="Pipeline comercial" value={loading ? "—" : brl.format(data?.portfolio.pipeline ?? 0)} detail="Oportunidades em andamento" trend="VENDAS" tone="blue" />
        <AtlasMetric label="Forecast ponderado" value={loading ? "—" : brl.format(data?.portfolio.forecast ?? 0)} detail="Previsão ajustada por probabilidade" trend="ATLAS AI" tone="amber" />
      </section>

      <AtlasCard>
        <AtlasCardHeader eyebrow="Launch portfolio" title="Empreendimentos em operação" description="Visão executiva por projeto, incorporadora, estoque, vendas e marketing." action={<div className="relative"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empreendimento..." className="w-64 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30" /></div>} />
        <div className="p-5 sm:p-6">
          {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1,2,3,4,5,6].map((item) => <AtlasSkeleton key={item} className="h-72 w-full" />)}</div> : filtered.length === 0 ? <AtlasEmpty title="Nenhum empreendimento encontrado" description="Cadastre ou ajuste os filtros para começar a operar o portfólio no Launch OS." /> : <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">{filtered.map((item) => {
            const m = item.metrics;
            return <article key={item.id} className="group rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-sky-400/20 hover:bg-sky-400/[0.035]">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">{item.developer_name || "Incorporadora"}</p><h2 className="mt-2 text-xl font-semibold text-white">{item.name}</h2><p className="mt-2 text-sm text-slate-400">{[item.neighborhood, item.city, item.state].filter(Boolean).join(" · ") || "Localização não informada"}</p></div><AtlasBadge tone={statusTone(item.status)}>{item.status}</AtlasBadge></div>
              <div className="mt-6 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-lg font-semibold text-white">{m.inventoryTotal}</p><p className="text-[10px] uppercase text-slate-500">Unidades</p></div><div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-lg font-semibold text-emerald-300">{m.sold}</p><p className="text-[10px] uppercase text-slate-500">Vendidas</p></div><div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-lg font-semibold text-sky-300">{m.available}</p><p className="text-[10px] uppercase text-slate-500">Disponíveis</p></div></div>
              <div className="mt-5"><AtlasProgress value={m.absorption} label="Absorção de vendas" /></div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-slate-500">VGV total</p><p className="mt-1 font-semibold text-white">{brl.format(m.totalVgv)}</p></div><div><p className="text-xs text-slate-500">Forecast</p><p className="mt-1 font-semibold text-white">{brl.format(m.forecast)}</p></div><div><p className="text-xs text-slate-500">CPL</p><p className="mt-1 font-semibold text-white">{m.cpl ? brl.format(m.cpl) : "—"}</p></div><div><p className="text-xs text-slate-500">ROI marketing</p><p className={`mt-1 font-semibold ${m.roi >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{m.campaignSpend ? `${m.roi.toFixed(0)}%` : "—"}</p></div></div>
              <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4"><span className="text-xs text-slate-500">Entrega {item.delivery_date ? new Date(item.delivery_date).toLocaleDateString("pt-BR") : "a definir"}</span><Link href={`/developments/${item.id}`} className="text-xs font-semibold text-sky-300">Abrir comando →</Link></div>
            </article>;
          })}</div>}
        </div>
      </AtlasCard>
    </div>
  );
}
