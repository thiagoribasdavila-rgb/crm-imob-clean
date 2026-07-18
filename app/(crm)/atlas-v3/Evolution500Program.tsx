"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { evolution500Phases, evolution500Summary, evolution500Waves } from "@/lib/atlas/evolution-500";

export function Evolution500Program() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const waves = useMemo(() => evolution500Waves.filter((wave) =>
    !normalized || `${wave.name} ${wave.outcome} ${wave.pillar} ${wave.range}`.toLocaleLowerCase("pt-BR").includes(normalized)
  ), [normalized]);

  return (
    <section className="rounded-[30px] border border-sky-400/10 bg-gradient-to-br from-sky-500/[.09] via-slate-950 to-violet-500/[.08] p-5 sm:p-7" data-program="atlas-500-phases">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="atlas-page-eyebrow">Programa de evolução contínua</p>
          <h2 className="mt-2 text-2xl font-semibold text-white sm:text-4xl">500 fases, organizadas para reduzir complexidade.</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">{evolution500Summary.totalWaves} ondas de {evolution500Summary.phasesPerWave} entregas. Nenhuma fase é aprovada apenas por existir visualmente.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Fases", evolution500Summary.totalPhases], ["Ondas", evolution500Summary.totalWaves], ["Ativas", 0]].map(([label, value]) => <div key={String(label)} className="min-w-20 rounded-2xl border border-white/[.07] bg-white/[.025] p-3"><strong className="block text-lg text-white">{value}</strong><span className="text-[10px] uppercase tracking-[.12em] text-slate-500">{label}</span></div>)}
        </div>
      </div>
      <div className="relative mt-6">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar IA, Kimi, navegação, leads, projetos..." className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 pr-12 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/35" />
        {query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute inset-y-0 right-0 w-12 text-slate-500 hover:text-white">×</button> : null}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {waves.map((wave) => {
          const phases = evolution500Phases.filter((phase) => phase.waveId === wave.id);
          return <Link href={wave.href} key={wave.id} className="group rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:-translate-y-0.5 hover:border-sky-300/25 hover:bg-sky-400/[.04]">
            <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[.15em] text-sky-300">Onda {String(wave.id).padStart(2, "0")} · {wave.range}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase text-slate-500">{wave.pillar}</span></div>
            <h3 className="mt-3 font-semibold text-white group-hover:text-sky-100">{wave.name}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">{wave.outcome}</p>
            <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500"><span>{phases.length} fases planejadas</span><span className="text-sky-300">Abrir módulo →</span></div>
          </Link>;
        })}
      </div>
      {!waves.length ? <div className="mt-5 rounded-2xl border border-white/[.07] p-6 text-center text-sm text-slate-400">Nenhuma onda corresponde à busca.</div> : null}
      <p className="mt-5 text-[11px] text-slate-500">Regra: {evolution500Summary.executionRule}</p>
    </section>
  );
}
