"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Metrics = {
  entities: number;
  relationships: number;
  memories: number;
  recommendations: number;
  simulations: number;
  launchRooms: number;
  reservations: number;
  dataProducts: number;
};

const initialMetrics: Metrics = {
  entities: 0,
  relationships: 0,
  memories: 0,
  recommendations: 0,
  simulations: 0,
  launchRooms: 0,
  reservations: 0,
  dataProducts: 0,
};

const capabilities = [
  ["Knowledge Graph", "Entidades e relações vivas do ecossistema imobiliário."],
  ["AI Memory", "Memória institucional, comercial, de mercado e de agentes."],
  ["Recommendation Engine", "Recomendações explicáveis para comprador, estoque e campanhas."],
  ["Simulation Engine", "Cenários de preço, verba, estoque, atraso e VGV."],
  ["Launch Commerce", "Salas de lançamento, reservas e distribuição de unidades."],
  ["Data Products", "Contratos de dados versionados para parceiros e incorporadoras."],
] as const;

export default function Atlas2030Page() {
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const tables = [
        "atlas_entities",
        "atlas_relationships",
        "atlas_memories",
        "atlas_recommendations",
        "atlas_simulations",
        "atlas_launch_rooms",
        "atlas_inventory_reservations",
        "atlas_data_products",
      ] as const;
      const results = await Promise.all(tables.map((table) => supabase.from(table).select("id", { count: "exact", head: true })));
      if (!mounted) return;
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) setError(firstError.message);
      setMetrics({
        entities: results[0].count ?? 0,
        relationships: results[1].count ?? 0,
        memories: results[2].count ?? 0,
        recommendations: results[3].count ?? 0,
        simulations: results[4].count ?? 0,
        launchRooms: results[5].count ?? 0,
        reservations: results[6].count ?? 0,
        dataProducts: results[7].count ?? 0,
      });
      setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, []);

  const maturity = useMemo(() => {
    const active = Object.values(metrics).filter((value) => value > 0).length;
    return Math.min(100, 55 + active * 5);
  }, [metrics]);

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-[32px] border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.08] to-fuchsia-500/[.06] p-7 sm:p-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <p className="atlas-eyebrow text-cyan-300">ATLAS AI OS 2030 · Platform Layer</p>
        <h1 className="mt-3 max-w-5xl text-4xl font-semibold tracking-[-.055em] sm:text-6xl">A infraestrutura inteligente dos lançamentos imobiliários.</h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-400">Uma plataforma para incorporadoras operarem dados, estoque, distribuição, marketing, compradores, simulações, recomendações e inteligência em um único sistema operacional.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/atlas-v3" className="atlas-button-secondary">Abrir Intelligence Layer</Link>
          <Link href="/atlas-v3/developer" className="atlas-button-secondary">Portal da incorporadora</Link>
          <Link href="/atlas-v3/scenarios" className="atlas-button-primary">Executar simulação →</Link>
        </div>
      </header>

      {error ? <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">Aplique as migrations Atlas 2030 para ativar todos os indicadores: {error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Entidades no grafo", metrics.entities],
          ["Relações", metrics.relationships],
          ["Memórias", metrics.memories],
          ["Recomendações", metrics.recommendations],
          ["Simulações", metrics.simulations],
          ["Salas de lançamento", metrics.launchRooms],
          ["Reservas", metrics.reservations],
          ["Produtos de dados", metrics.dataProducts],
        ].map(([label, value]) => (
          <article key={String(label)} className="atlas-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-500">{label}</p>
            <p className="mt-3 text-3xl font-black text-white">{loading ? "—" : value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <article className="atlas-panel p-6">
          <p className="atlas-eyebrow">Platform maturity</p>
          <div className="mt-2 flex items-end justify-between gap-4"><h2 className="text-xl font-bold">Prontidão Atlas 2030</h2><span className="text-4xl font-black text-cyan-300">{loading ? "—" : `${maturity}%`}</span></div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500" style={{ width: `${maturity}%` }} /></div>
          <p className="mt-5 text-sm leading-6 text-slate-400">A maturidade cresce quando grafo, memória, recomendações, simulações, lançamentos e produtos de dados começam a operar com dados reais.</p>
        </article>
        <article className="atlas-panel p-6">
          <p className="atlas-eyebrow">Developer-first platform</p>
          <h2 className="mt-2 text-xl font-bold">Integração sem reconstruir o núcleo</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">APIs governadas, eventos versionados, contratos de dados, idempotência e isolamento multiempresa permitem conectar ERPs, portais, construtoras, bancos, Meta, WhatsApp e parceiros.</p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {capabilities.map(([title, description], index) => (
          <article key={title} className="atlas-panel p-6">
            <span className="text-xs font-semibold text-cyan-300">0{index + 1}</span>
            <h2 className="mt-3 font-bold text-white">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
