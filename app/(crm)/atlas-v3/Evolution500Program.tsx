"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { evolution1000Phases, evolution1000Summary, evolution1000Waves, type EvolutionWave } from "@/lib/atlas/evolution-500";

const pillars: Array<"todos" | EvolutionWave["pillar"]> = ["todos", "experiência", "operação", "inteligência", "plataforma", "homologação"];

export function Evolution500Program() {
  const [query, setQuery] = useState("");
  const [pillar, setPillar] = useState<(typeof pillars)[number]>("todos");
  const [selectedWaveId, setSelectedWaveId] = useState(1);
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const waves = useMemo(() => evolution1000Waves.filter((wave) =>
    (pillar === "todos" || wave.pillar === pillar) && (!normalized || `${wave.name} ${wave.outcome} ${wave.pillar} ${wave.range}`.toLocaleLowerCase("pt-BR").includes(normalized))
  ), [normalized, pillar]);
  const selectedWave = evolution1000Waves.find((wave) => wave.id === selectedWaveId) || evolution1000Waves[0];
  const selectedPhases = evolution1000Phases.filter((phase) => phase.waveId === selectedWave.id);

  return (
    <section className="relative overflow-hidden rounded-[34px] border border-sky-300/15 bg-[#060b16] p-5 shadow-[0_30px_100px_rgba(0,0,0,.35)] sm:p-8" data-program="atlas-1000-phases">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="atlas-page-eyebrow">Programa de evolução contínua</p>
          <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">1.000 fases. Uma experiência cada vez mais simples.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">{evolution1000Summary.totalWaves} ondas de {evolution1000Summary.phasesPerWave} entregas, organizadas para elevar o produto sem aumentar a confusão.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Fases", evolution1000Summary.totalPhases], ["Ondas", evolution1000Summary.totalWaves], ["Concluídas", evolution1000Summary.completedPhases]].map(([label, value]) => <div key={String(label)} className="min-w-20 rounded-2xl border border-white/[.08] bg-white/[.035] p-3 backdrop-blur-xl"><strong className="block text-xl text-white">{value}</strong><span className="text-[9px] uppercase tracking-[.16em] text-slate-500">{label}</span></div>)}
        </div>
      </div>
      <div className="relative mt-6">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar IA, Kimi, navegação, leads, projetos..." className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 pr-12 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/35" />
        {query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute inset-y-0 right-0 w-12 text-slate-500 hover:text-white">×</button> : null}
      </div>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar ondas por pilar">
        {pillars.map((item) => <button key={item} type="button" onClick={() => setPillar(item)} data-active={pillar === item ? "true" : "false"} className="whitespace-nowrap rounded-full border border-white/[.08] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400 transition hover:text-white data-[active=true]:border-sky-300/35 data-[active=true]:bg-sky-300/10 data-[active=true]:text-sky-200">{item}</button>)}
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[.92fr_1.08fr]">
        <div className="grid max-h-[660px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-1">
        {waves.map((wave) => {
          const phases = evolution1000Phases.filter((phase) => phase.waveId === wave.id);
          return <button type="button" onClick={() => setSelectedWaveId(wave.id)} key={wave.id} data-selected={selectedWave.id === wave.id ? "true" : "false"} className="group rounded-2xl border border-white/[.07] bg-white/[.02] p-4 text-left transition hover:border-sky-300/20 hover:bg-white/[.035] data-[selected=true]:border-sky-300/30 data-[selected=true]:bg-sky-300/[.07]">
            <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[.15em] text-sky-300">Onda {String(wave.id).padStart(2, "0")} · {wave.range}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase text-slate-500">{wave.pillar}</span></div>
            <h3 className="mt-3 font-semibold text-white group-hover:text-sky-100">{wave.name}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">{wave.outcome}</p>
            <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500"><span>{phases.length} fases planejadas</span><span className="text-sky-300">Ver detalhes →</span></div>
          </button>;
        })}
        </div>
        <article className="sticky top-5 self-start rounded-[28px] border border-white/[.08] bg-gradient-to-br from-white/[.055] to-white/[.015] p-5 backdrop-blur-xl sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-300">Onda {String(selectedWave.id).padStart(2, "0")} · fases {selectedWave.range}</span><span className="rounded-full border border-white/10 px-3 py-1 text-[9px] uppercase tracking-[.12em] text-slate-400">{selectedWave.pillar}</span></div>
          <h3 className="mt-5 text-2xl font-semibold tracking-[-.03em] text-white sm:text-3xl">{selectedWave.name}</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">{selectedWave.outcome}</p>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {selectedPhases.map((phase) => <div key={phase.id} data-complete={phase.status === "concluída" ? "true" : "false"} className="flex gap-3 rounded-xl border border-white/[.06] bg-black/10 p-3 data-[complete=true]:border-emerald-300/20 data-[complete=true]:bg-emerald-300/[.055]"><span className={`font-mono text-[10px] ${phase.status === "concluída" ? "text-emerald-300" : "text-sky-300"}`}>{phase.status === "concluída" ? "✓" : String(phase.id).padStart(3, "0")}</span><span className="text-xs leading-5 text-slate-300">{phase.title.split(" · ")[1]}</span></div>)}
          </div>
          <Link href={selectedWave.href} className="atlas-button-primary mt-6 w-full justify-center">Abrir módulo relacionado →</Link>
        </article>
      </div>
      {!waves.length ? <div className="mt-5 rounded-2xl border border-white/[.07] p-6 text-center text-sm text-slate-400">Nenhuma onda corresponde à busca.</div> : null}
      <p className="mt-5 text-[11px] text-slate-500">Regra: {evolution1000Summary.executionRule}</p>
    </section>
  );
}
